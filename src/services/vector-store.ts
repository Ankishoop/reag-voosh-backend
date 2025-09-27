import { QdrantClient } from "@qdrant/js-client-rest";

type Hit = {
    id: string;
    score: number;
    distance: number;
    payload: Record<string, any>;
};

let client: QdrantClient | null = null;

function getQdrantClient(): QdrantClient {
    if (client) return client;

    const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
    const qdrantApiKey = process.env.QDRANT_API_KEY;

    const baseConfig: { url: string; checkCompatibility: false; apiKey?: string } = {
        url: qdrantUrl,
        checkCompatibility: false
    };
    if (qdrantApiKey) baseConfig.apiKey = qdrantApiKey;
    client = new QdrantClient(baseConfig as any);
    return client;
}

/**
 * retrieveTopK - query Qdrant with an embedding and return top-k payloads
 */
export async function retrieveTopK(embedding: number[], k = 4): Promise<Hit[]> {
    const COLLECTION = process.env.QDRANT_COLLECTION || "news_articles";
    try {
        const qdrant = getQdrantClient();
        const result = await qdrant.search(COLLECTION, {
            vector: embedding,
            limit: k,
            with_payload: true
        });
        return result.map((r: any) => ({
            id: String(r.id),
            score: r.score ?? 0,
            distance: r.score ?? 0, // Qdrant returns score as distance
            payload: r.payload ?? {}
        }));
    } catch (error) {
        console.error("Vector store search error:", error);
        return [];
    }
}

/**
 * isCollectionReady - Check if collection exists and is ready
 */
export async function isCollectionReady(): Promise<boolean> {
    try {
        const qdrant = getQdrantClient();
        const collections = await qdrant.getCollections();
        const collectionName = process.env.QDRANT_COLLECTION || "news_articles";
        return collections.collections.some(col => col.name === collectionName);
    } catch (error) {
        console.error("Error checking collection:", error);
        return false;
    }
}
