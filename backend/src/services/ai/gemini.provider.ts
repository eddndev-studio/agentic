import type { AIProvider, AICompletionRequest, AICompletionResponse, AIMessage, AIToolDefinition } from "./types";

export class GeminiProvider implements AIProvider {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async chat(request: AICompletionRequest): Promise<AICompletionResponse> {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent?key=${this.apiKey}`;

        const body: any = {
            contents: this.formatContents(request.messages),
            generationConfig: {
                temperature: request.temperature ?? 0.7,
            },
        };

        // System instruction (extract system messages)
        const systemMsg = request.messages.find((m) => m.role === "system");
        if (systemMsg?.content) {
            body.systemInstruction = {
                parts: [{ text: systemMsg.content }],
            };
        }

        if (request.tools && request.tools.length > 0) {
            body.tools = [{
                functionDeclarations: this.formatTools(request.tools),
            }];
        }

        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Gemini API error (${res.status}): ${err}`);
        }

        const data = await res.json() as any;
        const candidate = data.candidates?.[0];
        const parts = candidate?.content?.parts ?? [];

        let content: string | null = null;
        const toolCalls: AICompletionResponse["toolCalls"] = [];

        for (const part of parts) {
            if (part.text) {
                content = (content ?? "") + part.text;
            }
            if (part.functionCall) {
                toolCalls.push({
                    id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    name: part.functionCall.name,
                    arguments: part.functionCall.args ?? {},
                });
            }
        }

        const usage = data.usageMetadata;
        return {
            content,
            toolCalls,
            usage: usage ? {
                promptTokens: usage.promptTokenCount ?? 0,
                completionTokens: usage.candidatesTokenCount ?? 0,
                totalTokens: usage.totalTokenCount ?? 0,
            } : undefined,
        };
    }

    private formatContents(messages: AIMessage[]): any[] {
        const contents: any[] = [];

        for (const msg of messages) {
            // Skip system messages (handled via systemInstruction)
            if (msg.role === "system") continue;

            if (msg.role === "user") {
                contents.push({
                    role: "user",
                    parts: [{ text: msg.content ?? "" }],
                });
            } else if (msg.role === "assistant") {
                const parts: any[] = [];
                if (msg.content) {
                    parts.push({ text: msg.content });
                }
                if (msg.toolCalls?.length) {
                    for (const tc of msg.toolCalls) {
                        parts.push({
                            functionCall: {
                                name: tc.name,
                                args: tc.arguments,
                            },
                        });
                    }
                }
                if (parts.length > 0) {
                    contents.push({ role: "model", parts });
                }
            } else if (msg.role === "tool") {
                contents.push({
                    role: "function",
                    parts: [{
                        functionResponse: {
                            name: msg.name ?? "unknown",
                            response: { result: msg.content ?? "" },
                        },
                    }],
                });
            }
        }

        return contents;
    }

    private formatTools(tools: AIToolDefinition[]): any[] {
        return tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters || { type: "object", properties: {} },
        }));
    }
}
