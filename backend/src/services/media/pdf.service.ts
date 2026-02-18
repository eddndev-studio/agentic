import * as fs from "fs";

// @ts-ignore - pdf-parse lacks type declarations
declare function pdfParse(buffer: Buffer): Promise<{ text: string }>;

export class PDFService {
    /**
     * Extract text content from a PDF file.
     * @param pdfSource - File path or URL to the PDF
     */
    static async extractText(pdfSource: string): Promise<string> {
        let buffer: Buffer;

        if (pdfSource.startsWith("http://") || pdfSource.startsWith("https://")) {
            const res = await fetch(pdfSource);
            if (!res.ok) throw new Error(`Failed to download PDF: ${res.status}`);
            buffer = Buffer.from(await res.arrayBuffer());
        } else {
            buffer = fs.readFileSync(pdfSource) as Buffer;
        }

        try {
            // @ts-ignore - dynamic import of pdf-parse
            const pdfParse = (await import("pdf-parse")).default;
            const data = await pdfParse(buffer);
            return data.text || "Unable to extract text from PDF.";
        } catch (error: any) {
            console.error("[PDFService] Error parsing PDF:", error);
            return "Failed to parse PDF document.";
        }
    }
}
