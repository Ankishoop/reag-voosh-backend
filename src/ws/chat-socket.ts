import { WebSocket } from "ws";
import type http from "http";
import redis from "../redis/client";
import type { IncomingWSMessage, OutgoingWSMessage } from "../utils/types";
import { embedText } from "../services/embeddings";
import { retrieveTopK } from "../services/vector-store";
import { callGemini } from "../services/gemini-client";

/**
 * Handles an individual ws connection.
 */
export const handleChatSocket = (ws: WebSocket, _req: http.IncomingMessage) => {
  ws.on("message", async (data) => {
    let msg: IncomingWSMessage;
    try {
      msg = JSON.parse(data.toString());
      console.log("🚀 ~ handleChatSocket ~ msg:", msg);
    } catch (err) {
      const out: OutgoingWSMessage = { type: "error", message: "invalid_json" };
      ws.send(JSON.stringify(out));
      return;
    }

    if (msg.type === "init") {
      const out: OutgoingWSMessage = {
        type: "ack",
        ...(msg.sessionId && { sessionId: msg.sessionId }),
      };
      ws.send(JSON.stringify(out));
      return;
    }

    if (msg.type === "user_message") {
      const { sessionId, text } = msg;
      if (!sessionId || !text) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "sessionId and text required",
          })
        );
        return;
      }

      // persist user message
      await redis.rpush(
        `session:${sessionId}:messages`,
        JSON.stringify({
          role: "user",
          content: text,
          ts: new Date().toISOString(),
        })
      );
      await redis.expire(`session:${sessionId}:messages`, 60 * 60 * 24 * 7);

      try {
        // 1) embed + retrieve
        const embedding = await embedText(text);
        console.log("🚀 ~ handleChatSocket ~ embedding:", embedding);
        const passages = await retrieveTopK(embedding, 6);

        // 2) build prompt
        // De-duplicate by URL/title
        const seen = new Set<string>();
        const deduped = passages.filter((p) => {
          const key = (p.payload?.url || p.payload?.title || "").toLowerCase();
          if (!key) return true;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const promptSections = [
          `You are NewsGuide, a precise news assistant.`,
          `Answer ONLY from the provided passages below.`,
          `Format strictly as 5–10 clear Markdown bullet points, each on its own line.`,
          `Rules: 
   - Each bullet: Title (Source) — one-sentence summary.    
   - Avoid repetition (deduplicate by title or URL).  
   - Do not add extra commentary or text outside the bullets.`,
          `\n${deduped
            .map((p, i) => {
              const title = p.payload?.title ?? "";
              const body = p.payload?.text ?? p.payload?.content ?? "";
              const source = p.payload?.source ?? "Unknown Source";

              return ` ${title} — ${source}\n${body}`;
            })
            .join("\n\n")}`,
          `User question: ${text}`,
        ];

        const prompt = promptSections.join("\n\n");

        // 3) call Gemini (single-shot; optionally streaming provider could be used)

        const answer = await callGemini(prompt);
        console.log("🚀 ~ handleChatSocket ~ answer:", answer);

        // stream back as one chunk, but we send a bot_chunk then bot_message
        ws.send(
          JSON.stringify({ type: "bot_chunk", chunk: answer, done: true })
        );

        // send a final bot_message so frontend can also receive it
        // ws.send(
        //   JSON.stringify({
        //     type: "bot_message",
        //     text: answer,
        //     sessionId,
        //   })
        // );

        // persist bot message
        await redis.rpush(
          `session:${sessionId}:messages`,
          JSON.stringify({
            role: "bot",
            content: answer,
            ts: new Date().toISOString(),
          })
        );
      } catch (err) {
        console.error("chatSocket error:", err);
        ws.send(JSON.stringify({ type: "error", message: "internal_error" }));
      }
    }
  });

  ws.on("close", () => {
    // connection closed
  });
};
