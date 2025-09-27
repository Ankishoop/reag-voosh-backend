import "dotenv/config";
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import cors from "cors";
import sessionRouter from "./api/session.routes";
import messageRouter from "./api/message.routes";
import { handleChatSocket } from "./ws/chat-socket";
import { isCollectionReady } from "./services/vector-store";

const PORT = Number(process.env.PORT || 3000);
const app = express();

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3001",
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Health check with service status
app.get("/health", async (_req, res) => {
    const vectorStoreReady = await isCollectionReady();
    res.json({
        status: "ok",
        services: {
            vectorStore: vectorStoreReady ? "ready" : "not ready"
        }
    });
});

// Mount routes
app.use("/session", sessionRouter);
app.use("/message", messageRouter);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
});

const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
    handleChatSocket(ws, req);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        process.exit(0);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Backend listening at http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
