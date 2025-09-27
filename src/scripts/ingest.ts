import axios from "axios";
import { QdrantClient } from "@qdrant/js-client-rest";
import Parser from "rss-parser";
import { randomUUID } from "crypto";
import { embedText } from "../services/embeddings";
import dotenv from "dotenv";

dotenv.config();

const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION = process.env.QDRANT_COLLECTION || "news_articles";

const client = new QdrantClient({
    url: QDRANT_URL,
    ...(QDRANT_API_KEY && { apiKey: QDRANT_API_KEY })
});
const parser = new Parser();

// News RSS feeds
const FEEDS = [
    "https://hnrss.org/frontpage",
    "https://www.theguardian.com/world/rss",
    "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    "https://feeds.bbci.co.uk/news/rss.xml",
    "https://feeds.reuters.com/reuters/topNews"
];

interface Article {
    title: string;
    content: string;
    url: string | undefined;
    pubDate: string | undefined;
    source: string;
}

async function fetchArticles(): Promise<Article[]> {
    const articles: Article[] = [];

    for (const feedUrl of FEEDS) {
        try {
            console.log(`Fetching from: ${feedUrl}`);
            const feed = await parser.parseURL(feedUrl);

            for (const item of feed.items.slice(0, 10)) { // Limit to 10 per feed
                if (item.title && (item.contentSnippet || item.content)) {
                    articles.push({
                        title: item.title,
                        content: item.contentSnippet || item.content || item.title,
                        url: item.link,
                        pubDate: item.pubDate,
                        source: feed.title || 'Unknown'
                    });
                }
            }
        } catch (err) {
            console.warn(`Failed to fetch feed ${feedUrl}:`, err instanceof Error ? err.message : String(err));
        }
    }

    return articles;
}

async function ensureCollection() {
    try {
        // Check if collection exists
        const collections = await client.getCollections();
        const exists = collections.collections.some(col => col.name === COLLECTION);

        if (exists) {
            console.log(`Collection ${COLLECTION} already exists`);
            return;
        }

        // Create collection
        await client.createCollection(COLLECTION, {
            vectors: {
                size: 768, // Jina embeddings v2 size
                distance: "Cosine"
            }
        });
        console.log(`✅ Created Qdrant collection ${COLLECTION}`);
    } catch (error) {
        console.error("Error ensuring collection:", error);
        throw error;
    }
}

async function ingest() {
    try {
        console.log("🚀 Starting news ingestion...");

        await ensureCollection();
        const articles = await fetchArticles();
        console.log(`📰 Fetched ${articles.length} articles`);

        if (articles.length === 0) {
            console.log("❌ No articles found");
            return;
        }

        const points = [];
        for (let i = 0; i < articles.length; i++) {
            const article = articles[i];
            if (!article) continue;

            const { title, content, url, pubDate, source } = article;

            console.log(`Processing: ${title.slice(0, 50)}...`);

            const embedding = await embedText(`${title} ${content}`);
            points.push({
                id: randomUUID(),
                vector: embedding,
                payload: {
                    title,
                    text: content,
                    url: url || '',
                    pubDate: pubDate || '',
                    source
                }
            });
        }

        await client.upsert(COLLECTION, { points });
        console.log(`✅ Successfully ingested ${points.length} articles`);

    } catch (error) {
        console.error("❌ Ingestion error:", error);
        process.exit(1);
    }
}

export { ingest };

// Run if called directly via ts-node / node
if (require.main === module) {
    void ingest();
}
