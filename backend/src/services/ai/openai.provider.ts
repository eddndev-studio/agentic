import type { AIProvider, AICompletionRequest, AICompletionResponse, AIMessage, AIToolDefinition } from "./types";

export class OpenAIProvider implements AIProvider {
    private apiKey: string;
    private baseUrl: string;

    constructor(apiKey: string, baseUrl = "https://api.openai.com/v1") {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }

    async chat(request: AICompletionRequest): Promise<AICompletionResponse> {
        const body: any = {
            model: request.model,
            messages: this.formatMessages(request.messages),
            temperature: request.temperature ?? 0.7,
        };

        if (request.tools && request.tools.length > 0) {
            body.tools = this.formatTools(request.tools);
        }

        const res = await fetch(`${this.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(60_000),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`OpenAI API error (${res.status}): ${err}`);
        }

        const data = await res.json() as any;
        const choice = data.choices?.[0];
        const message = choice?.message;

        return {
            content: message?.content ?? null,
            toolCalls: (message?.tool_calls ?? []).map((tc: any) => ({
                id: tc.id,
                name: tc.function.name,
                arguments: JSON.parse(tc.function.arguments || "{}"),
            })),
            usage: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens,
            } : undefined,
        };
    }

    private formatMessages(messages: AIMessage[]): any[] {
        return messages.map((msg) => {
            if (msg.role === "assistant" && msg.toolCalls?.length) {
                return {
                    role: "assistant",
                    content: msg.content ?? null,
                    tool_calls: msg.toolCalls.map((tc) => ({
                        id: tc.id,
                        type: "function",
                        function: {
                            name: tc.name,
                            arguments: JSON.stringify(tc.arguments),
                        },
                    })),
                };
            }

            if (msg.role === "tool") {
                return {
                    role: "tool",
                    tool_call_id: msg.toolCallId,
                    content: msg.content ?? "",
                };
            }

            return {
                role: msg.role,
                content: msg.content ?? "",
            };
        });
    }

    private formatTools(tools: AIToolDefinition[]): any[] {
        return tools.map((t) => ({
            type: "function",
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters || { type: "object", properties: {} },
            },
        }));
    }
}
