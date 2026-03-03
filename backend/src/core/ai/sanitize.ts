/**
 * Strip internal markers that WE inject into the conversation context.
 * These are deterministic patterns under our control — not an attempt
 * to catch arbitrary LLM hallucinations.
 */

const OUR_MARKERS: RegExp[] = [
    /\[msg:[A-Fa-f0-9]+\]\s*/g,        // Message ID prefixes we add for reply_to_message
    /\[Automatización:[^\]]*\]\s*/g,    // Automation trigger markers
];

export function sanitizeOutgoing(text: string): string {
    let cleaned = text;
    for (const pat of OUR_MARKERS) {
        cleaned = cleaned.replace(new RegExp(pat.source, pat.flags), "");
    }
    return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}
