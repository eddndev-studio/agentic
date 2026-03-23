import { describe, it, expect, vi } from "vitest";

// Mock the postgres service so importing chat-context.service doesn't try to connect
vi.mock("./postgres.service", () => ({ prisma: {} }));

import { formatContextMessage } from "./chat-context.service";

/** Helper to create a ContextMessage-like object for tests. */
function msg(overrides: {
    type: string;
    content?: string | null;
    fromMe?: boolean;
    metadata?: any;
}): { content: string | null; type: string; fromMe: boolean; createdAt: Date; metadata: any } {
    return {
        content: overrides.content ?? null,
        type: overrides.type,
        fromMe: overrides.fromMe ?? false,
        createdAt: new Date("2026-03-23T14:30:00Z"),
        metadata: overrides.metadata ?? {},
    };
}

describe("formatContextMessage", () => {
    it("formats a TEXT message from client", () => {
        const result = formatContextMessage(msg({ type: "TEXT", content: "Hola, necesito ayuda" }));
        expect(result).toContain("Cliente");
        expect(result).toContain("Hola, necesito ayuda");
    });

    it("formats a TEXT message from bot", () => {
        const result = formatContextMessage(msg({ type: "TEXT", content: "Bienvenido", fromMe: true }));
        expect(result).toContain("Bot");
        expect(result).toContain("Bienvenido");
    });

    it("formats empty TEXT message as [mensaje vacio]", () => {
        const result = formatContextMessage(msg({ type: "TEXT", content: null }));
        expect(result).toContain("[mensaje vacío]");
    });

    // ── IMAGE ─────────────────────────────────────────────────────────────────

    it("formats IMAGE with description and caption", () => {
        const result = formatContextMessage(
            msg({
                type: "IMAGE",
                content: "Check this out",
                metadata: { mediaDescription: "A sunset photo" },
            })
        );
        expect(result).toContain("[Imagen: A sunset photo] Check this out");
    });

    it("formats IMAGE with description only", () => {
        const result = formatContextMessage(
            msg({
                type: "IMAGE",
                metadata: { mediaDescription: "Product catalog" },
            })
        );
        expect(result).toContain("[Imagen: Product catalog]");
    });

    it("formats IMAGE with caption only", () => {
        const result = formatContextMessage(msg({ type: "IMAGE", content: "My photo" }));
        expect(result).toContain("[Imagen adjunta] My photo");
    });

    it("formats IMAGE with no caption or description", () => {
        const result = formatContextMessage(msg({ type: "IMAGE" }));
        expect(result).toContain("[Imagen adjunta]");
    });

    // ── AUDIO ─────────────────────────────────────────────────────────────────

    it("formats AUDIO with transcription description", () => {
        const result = formatContextMessage(
            msg({
                type: "AUDIO",
                metadata: { mediaDescription: "Customer asks about pricing" },
            })
        );
        expect(result).toContain("[Audio: Customer asks about pricing]");
    });

    it("formats AUDIO without description", () => {
        const result = formatContextMessage(msg({ type: "AUDIO" }));
        expect(result).toContain("[Audio recibido]");
    });

    // ── STICKER ───────────────────────────────────────────────────────────────

    it("formats STICKER message", () => {
        const result = formatContextMessage(msg({ type: "STICKER" }));
        expect(result).toContain("[Sticker]");
    });

    // ── REACTION ──────────────────────────────────────────────────────────────

    it("formats REACTION with emoji", () => {
        const result = formatContextMessage(msg({ type: "REACTION", content: "👍" }));
        expect(result).toContain("[Reacción: 👍]");
    });

    it("formats REACTION removal (empty content)", () => {
        const result = formatContextMessage(msg({ type: "REACTION", content: null }));
        expect(result).toContain("[Quitó reacción]");
    });

    // ── LOCATION ──────────────────────────────────────────────────────────────

    it("formats LOCATION message", () => {
        const result = formatContextMessage(msg({ type: "LOCATION" }));
        expect(result).toContain("[Ubicación compartida]");
    });

    // ── VIDEO ─────────────────────────────────────────────────────────────────

    it("formats VIDEO with caption", () => {
        const result = formatContextMessage(msg({ type: "VIDEO", content: "Look at this" }));
        expect(result).toContain("[Video adjunto] Look at this");
    });

    it("formats VIDEO without caption", () => {
        const result = formatContextMessage(msg({ type: "VIDEO" }));
        expect(result).toContain("[Video adjunto]");
    });

    // ── DOCUMENT ──────────────────────────────────────────────────────────────

    it("formats DOCUMENT with description", () => {
        const result = formatContextMessage(
            msg({ type: "DOCUMENT", metadata: { mediaDescription: "Invoice PDF" } })
        );
        expect(result).toContain("[Documento: Invoice PDF]");
    });

    it("formats DOCUMENT with caption", () => {
        const result = formatContextMessage(msg({ type: "DOCUMENT", content: "Contract v2" }));
        expect(result).toContain("[Documento] Contract v2");
    });

    it("formats DOCUMENT without description or caption", () => {
        const result = formatContextMessage(msg({ type: "DOCUMENT" }));
        expect(result).toContain("[Documento adjunto]");
    });

    // ── PTT (push-to-talk voice note) ─────────────────────────────────────────

    it("formats PTT with description", () => {
        const result = formatContextMessage(
            msg({ type: "PTT", metadata: { mediaDescription: "Asks about delivery" } })
        );
        expect(result).toContain("[Nota de voz: Asks about delivery]");
    });

    it("formats PTT without description", () => {
        const result = formatContextMessage(msg({ type: "PTT" }));
        expect(result).toContain("[Nota de voz]");
    });

    // ── CONTACT ───────────────────────────────────────────────────────────────

    it("formats CONTACT with name", () => {
        const result = formatContextMessage(msg({ type: "CONTACT", content: "Juan Perez" }));
        expect(result).toContain("[Contacto: Juan Perez]");
    });

    it("formats CONTACT without name", () => {
        const result = formatContextMessage(msg({ type: "CONTACT" }));
        expect(result).toContain("[Contacto compartido]");
    });

    // ── POLL ──────────────────────────────────────────────────────────────────

    it("formats POLL with question", () => {
        const result = formatContextMessage(msg({ type: "POLL", content: "Favorite color?" }));
        expect(result).toContain("[Encuesta: Favorite color?]");
    });

    it("formats POLL without question", () => {
        const result = formatContextMessage(msg({ type: "POLL" }));
        expect(result).toContain("[Encuesta]");
    });

    // ── Unknown type ──────────────────────────────────────────────────────────

    it("formats unknown type with content", () => {
        const result = formatContextMessage(msg({ type: "EPHEMERAL", content: "Temp msg" }));
        expect(result).toContain("Temp msg");
    });

    it("formats unknown type without content", () => {
        const result = formatContextMessage(msg({ type: "EPHEMERAL" }));
        expect(result).toContain("[ephemeral]");
    });

    // ── Timestamp format ──────────────────────────────────────────────────────

    it("includes time in HH:MM format", () => {
        const result = formatContextMessage(msg({ type: "TEXT", content: "test" }));
        // The output should contain a time pattern like [HH:MM ...]
        expect(result).toMatch(/\[\d{2}:\d{2}/);
    });
});
