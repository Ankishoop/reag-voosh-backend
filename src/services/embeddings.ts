import axios from "axios";
import axiosRetry from "axios-retry";

// Configure axios with retry logic
axiosRetry(axios, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
        return axiosRetry.isNetworkError(error) || Boolean(error.response?.status && error.response.status >= 500);
    }
});

/**
 * embedText - Jina AI embeddings integration
 * Returns a 768-dimensional vector for the input text
 */
export async function embedText(text: string): Promise<number[]> {
    const url = process.env.EMBEDDINGS_API_URL;
    const key = process.env.EMBEDDINGS_API_KEY;
    const provider = (process.env.EMBEDDINGS_PROVIDER || "").toLowerCase();
    const silentFallback = (process.env.EMBEDDINGS_SILENT_FALLBACK || "true").toLowerCase() === "true";

    // Consider placeholders as "not configured"
    const looksLikePlaceholder = (value?: string) =>
        !value || /example/.test(value) || /^your[_-]/i.test(value);

    const useMock = provider === "mock" || looksLikePlaceholder(url) || looksLikePlaceholder(key);

    if (useMock) {
        maybeLogOnce(
            silentFallback,
            "Embeddings not configured, using local fallback (set EMBEDDINGS_PROVIDER=mock to silence)."
        );
        return generateFallbackEmbedding(text);
    }

    try {
        const response = await axios.post(url!, {
            input: [text],
            model: "jina-embeddings-v2-base-en"
        }, {
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        if (response.data?.data?.[0]?.embedding) {
            console.log("Embeddings::", response.data?.data?.[0]?.embedding)
            return response.data.data[0].embedding;
        }

        throw new Error("Unexpected response format from embeddings API");
    } catch (error: unknown) {
        const message = formatAxiosError(error);
        maybeLogOnce(silentFallback, `Embeddings API error: ${message}. Falling back to local embeddings.`);
        return generateFallbackEmbedding(text);
    }
}

/**
 * Generate a deterministic pseudo-embedding for development
 */
function generateFallbackEmbedding(text: string): number[] {
    const vector: number[] = new Array(768).fill(0);
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        const index = i % 768;
        vector[index] = (vector[index]! + charCode) % 1000;
    }
    return vector.map(n => (n / 1000) - 0.5); // Normalize to [-0.5, 0.5]
}

// Utilities
let hasLoggedConfigWarning = false;
function maybeLogOnce(silent: boolean, message: string) {
    if (silent) return;
    if (!hasLoggedConfigWarning) {
        console.warn(message);
        hasLoggedConfigWarning = true;
    }
}

function formatAxiosError(error: unknown): string {
    if (typeof error === 'string') return error;
    const anyErr = error as any;
    const code = anyErr?.code || anyErr?.response?.status;
    const statusText = anyErr?.response?.statusText;
    const url = anyErr?.config?.url;
    const msg = anyErr?.message || 'Unknown error';
    return [code && `code=${code}`, statusText, url, msg].filter(Boolean).join(" ");
}
