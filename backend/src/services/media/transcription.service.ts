import * as fs from "fs";
import * as path from "path";

export class TranscriptionService {
    /**
     * Transcribe audio using OpenAI Whisper API.
     * @param audioSource - File path or URL to the audio file
     */
    static async transcribe(audioSource: string): Promise<string> {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error("OPENAI_API_KEY is required for audio transcription");
        }

        const formData = new FormData();
        formData.append("model", "whisper-1");

        if (audioSource.startsWith("http://") || audioSource.startsWith("https://")) {
            // Download the file first
            const res = await fetch(audioSource);
            if (!res.ok) throw new Error(`Failed to download audio: ${res.status}`);
            const blob = await res.blob();
            formData.append("file", blob, "audio.ogg");
        } else {
            // Local file
            const buffer = fs.readFileSync(audioSource);
            const blob = new Blob([buffer], { type: "audio/ogg" });
            const ext = path.extname(audioSource) || ".ogg";
            formData.append("file", blob, `audio${ext}`);
        }

        const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Whisper API error (${response.status}): ${err}`);
        }

        const data = await response.json() as any;
        return data.text || "";
    }
}
