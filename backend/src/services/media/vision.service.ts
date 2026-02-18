import * as fs from "fs";

export class VisionService {
    /**
     * Analyze an image using AI vision capabilities.
     * @param imageSource - File path or URL to the image
     * @param prompt - Optional prompt for analysis
     * @param provider - OPENAI or GEMINI
     */
    static async analyze(
        imageSource: string,
        prompt = "Describe this image in detail.",
        provider: "OPENAI" | "GEMINI" = "GEMINI"
    ): Promise<string> {
        if (provider === "OPENAI") {
            return this.analyzeWithOpenAI(imageSource, prompt);
        }
        return this.analyzeWithGemini(imageSource, prompt);
    }

    private static async analyzeWithOpenAI(imageSource: string, prompt: string): Promise<string> {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error("OPENAI_API_KEY is required for image analysis");

        let imageContent: any;

        if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
            imageContent = { type: "image_url", image_url: { url: imageSource } };
        } else {
            const buffer = fs.readFileSync(imageSource);
            const base64 = buffer.toString("base64");
            const mimeType = imageSource.endsWith(".png") ? "image/png" : "image/jpeg";
            imageContent = {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64}` },
            };
        }

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        imageContent,
                    ],
                }],
                max_tokens: 500,
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`OpenAI Vision API error (${res.status}): ${err}`);
        }

        const data = await res.json() as any;
        return data.choices?.[0]?.message?.content ?? "Unable to analyze image.";
    }

    private static async analyzeWithGemini(imageSource: string, prompt: string): Promise<string> {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY is required for image analysis");

        let inlineData: { mimeType: string; data: string };

        if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
            const res = await fetch(imageSource);
            if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
            const buffer = Buffer.from(await res.arrayBuffer());
            const mimeType = res.headers.get("content-type") || "image/jpeg";
            inlineData = { mimeType, data: buffer.toString("base64") };
        } else {
            const buffer = fs.readFileSync(imageSource);
            const mimeType = imageSource.endsWith(".png") ? "image/png" : "image/jpeg";
            inlineData = { mimeType, data: buffer.toString("base64") };
        }

        const model = "gemini-3-flash-preview";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inlineData },
                    ],
                }],
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Gemini Vision API error (${res.status}): ${err}`);
        }

        const data = await res.json() as any;
        return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "Unable to analyze image.";
    }
}
