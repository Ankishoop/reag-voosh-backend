import { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import redis from "../redis/client";

const router: Router = Router();

// Create a new session
router.post("/", async (_req: Request, res: Response) => {
    const sessionId = randomUUID();
    const messagesKey = `session:${sessionId}:messages`;
    const metaKey = `session:${sessionId}:meta`;

    await redis.del(messagesKey);
    await redis.hset(metaKey, { createdAt: new Date().toISOString(), lastActiveAt: new Date().toISOString() });
    // TTL: 7 days
    await redis.expire(messagesKey, 60 * 60 * 24 * 7);
    await redis.expire(metaKey, 60 * 60 * 24 * 7);

    res.json({ sessionId });
});

// Get session history (returns array of messages)
router.get("/:id/history", async (req: Request, res: Response) => {
    const { id } = req.params;
    const key = `session:${id}:messages`;
    const raw = await redis.lrange(key, 0, -1); // stored as JSON strings
    const messages = raw.map((r) => {
        try {
            return JSON.parse(r);
        } catch {
            return null;
        }
    }).filter(Boolean);
    res.json({ messages });
});

// Reset session
router.post("/:id/reset", async (req: Request, res: Response) => {
    const { id } = req.params;
    await redis.del(`session:${id}:messages`);
    await redis.hset(`session:${id}:meta`, { lastActiveAt: new Date().toISOString() });
    res.json({ cleared: true });
});

export default router;
