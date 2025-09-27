export type ChatMessage = {
    role: "user" | "bot";
    content: string;
    ts?: string; // ISO timestamp
};

export type IncomingWSMessage =
    | { type: "init"; sessionId?: string }
    | { type: "user_message"; sessionId: string; text: string };

export type OutgoingWSMessage =
    | { type: "ack"; sessionId?: string }
    | { type: "bot_chunk"; chunk: string; done?: boolean }
    | { type: "bot_message"; text: string }
    | { type: "error"; message: string };
