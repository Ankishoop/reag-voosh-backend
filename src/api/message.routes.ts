import { Router, type Request, type Response } from "express";
import redis from "../redis/client";
import { callGemini } from "../services/gemini-client";
import { embedText } from "../services/embeddings";
import { retrieveTopK } from "../services/vector-store";
import type { ChatMessage } from "../utils/types";

const router: Router = Router();

/**
 * Simple REST alternative to WS: send a message, get full response
 * Body: { sessionId, text }
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { sessionId, text } = req.body as { sessionId: string; text: string };

  if (!sessionId || !text) {
    res.status(400).json({ error: "sessionId & text required" });
    return;
  }

  // store user message
  const userMsg: ChatMessage = {
    role: "user",
    content: text,
    ts: new Date().toISOString(),
  };
  await redis.rpush(`session:${sessionId}:messages`, JSON.stringify(userMsg));
  await redis.expire(`session:${sessionId}:messages`, 60 * 60 * 24 * 7);

  // Embedding + retrieval
  const embedding = await embedText(text);
  const passages = await retrieveTopK(embedding, 4);

  // De-duplicate passages by URL or title to avoid repetition
  const seen = new Set<string>();
  const deduped = passages.filter((p) => {
    const key = (p.payload?.url || p.payload?.title || "").toLowerCase();
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Structured prompt for concise bullet-point summaries
  const promptParts = [
    `You are NewsGuide, a precise news assistant. Answer ONLY using the provided passages.`,
    `Goal: Summarize the most relevant items for the user in clear, non-repetitive bullet points. De-duplicate items that share the same title or URL.`,
    `Output format (Markdown):\n- Bold concise title (include source in parentheses)\n- One short sentence summary\n- Include a source link if available\nReturn 3–4 bullets. If the passages don't contain enough signal, say that briefly and suggest a more specific follow-up. Do NOT repeat the same item.`,
    `Passages (de-duplicated):\n${deduped
      .map((p, i) => {
        const title = p.payload?.title ?? "";
        const body = p.payload?.text ?? p.payload?.content ?? "";
        return `[#${i + 1}] ${title}\n${body}`;
      })
      .join("\n\n")}`,
    `User question: ${text}`,
  ];

  const finalPrompt = promptParts.join("\n\n");
  console.log("🚀 ~ finalPrompt:", finalPrompt);

  // Call LLM (Gemini)
  const answer = await callGemini(finalPrompt);

  const botMsg: ChatMessage = {
    role: "bot",
    content: answer,
    ts: new Date().toISOString(),
  };
  await redis.rpush(`session:${sessionId}:messages`, JSON.stringify(botMsg));

  res.json({ answer, passages });
});

export default router;
