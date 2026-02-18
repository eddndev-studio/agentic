import type { AIProvider } from "./types";
import { OpenAIProvider } from "./openai.provider";
import { GeminiProvider } from "./gemini.provider";

export type { AIProvider, AIMessage, AIToolCall, AIToolDefinition, AICompletionRequest, AICompletionResponse } from "./types";

const providerCache = new Map<string, AIProvider>();

export function getAIProvider(provider: "OPENAI" | "GEMINI", apiKey?: string): AIProvider {
    const key = apiKey
        ?? (provider === "OPENAI" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY)
        ?? "";

    const cacheKey = `${provider}:${key.slice(-8)}`;

    if (providerCache.has(cacheKey)) {
        return providerCache.get(cacheKey)!;
    }

    let instance: AIProvider;
    switch (provider) {
        case "OPENAI":
            instance = new OpenAIProvider(key);
            break;
        case "GEMINI":
            instance = new GeminiProvider(key);
            break;
        default:
            throw new Error(`Unsupported AI provider: ${provider}`);
    }

    providerCache.set(cacheKey, instance);
    return instance;
}
