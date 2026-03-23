import { describe, it, expect } from "vitest";
import {
    safeParseMessageMetadata,
    safeParseStepMetadata,
    safeParseToolActionConfig,
    safeParseNotificationChannels,
} from "./schemas";

// ─── safeParseMessageMetadata ─────────────────────────────────────────────────

describe("safeParseMessageMetadata", () => {
    it("parses valid metadata with all fields", () => {
        const input = {
            mediaUrl: "https://cdn.example.com/img.png",
            mediaDescription: "A cat photo",
            animated: false,
            latitude: 19.4326,
            longitude: -99.1332,
        };
        const result = safeParseMessageMetadata(input);
        expect(result.mediaUrl).toBe("https://cdn.example.com/img.png");
        expect(result.mediaDescription).toBe("A cat photo");
        expect(result.animated).toBe(false);
        expect(result.latitude).toBe(19.4326);
        expect(result.longitude).toBe(-99.1332);
    });

    it("parses valid metadata with reactedTo", () => {
        const input = { reactedTo: { id: "msg-123", fromMe: true } };
        const result = safeParseMessageMetadata(input);
        expect(result.reactedTo).toEqual({ id: "msg-123", fromMe: true });
    });

    it("returns empty object for null", () => {
        expect(safeParseMessageMetadata(null)).toEqual({});
    });

    it("returns empty object for undefined", () => {
        expect(safeParseMessageMetadata(undefined)).toEqual({});
    });

    it("returns empty object for invalid data (string)", () => {
        expect(safeParseMessageMetadata("not an object")).toEqual({});
    });

    it("preserves extra fields via passthrough", () => {
        const input = { mediaUrl: "https://example.com/img.png", customField: "value" };
        const result = safeParseMessageMetadata(input);
        expect((result as any).customField).toBe("value");
    });

    it("returns empty object for empty object input", () => {
        const result = safeParseMessageMetadata({});
        expect(result).toEqual({});
    });

    it("parses options array (polls)", () => {
        const input = { options: ["Option A", "Option B", "Option C"] };
        const result = safeParseMessageMetadata(input);
        expect(result.options).toEqual(["Option A", "Option B", "Option C"]);
    });
});

// ─── safeParseStepMetadata ────────────────────────────────────────────────────

describe("safeParseStepMetadata", () => {
    it("parses metadata with linkPreview", () => {
        const input = { linkPreview: true };
        const result = safeParseStepMetadata(input);
        expect(result.linkPreview).toBe(true);
    });

    it("parses metadata with toolName", () => {
        const input = { toolName: "searchProducts", toolArgs: { query: "shoes" } };
        const result = safeParseStepMetadata(input);
        expect(result.toolName).toBe("searchProducts");
        expect(result.toolArgs).toEqual({ query: "shoes" });
    });

    it("parses metadata with branches", () => {
        const branches = [
            { startTime: "09:00", endTime: "17:00", type: "TEXT", content: "Open" },
            { startTime: "17:00", endTime: "09:00", type: "TEXT", content: "Closed" },
        ];
        const result = safeParseStepMetadata({ branches });
        expect(result.branches).toHaveLength(2);
        expect(result.branches![0].startTime).toBe("09:00");
        expect(result.branches![1].content).toBe("Closed");
    });

    it("parses metadata with fallback", () => {
        const input = { fallback: { type: "TEXT", content: "Fallback message" } };
        const result = safeParseStepMetadata(input);
        expect(result.fallback).toEqual({ type: "TEXT", content: "Fallback message" });
    });

    it("parses metadata with position", () => {
        const input = { position: { x: 100, y: 200 } };
        const result = safeParseStepMetadata(input);
        expect(result.position).toEqual({ x: 100, y: 200 });
    });

    it("returns empty object for null", () => {
        expect(safeParseStepMetadata(null)).toEqual({});
    });

    it("returns empty object for undefined", () => {
        expect(safeParseStepMetadata(undefined)).toEqual({});
    });
});

// ─── safeParseToolActionConfig ────────────────────────────────────────────────

describe("safeParseToolActionConfig", () => {
    it("parses config with flowId", () => {
        const input = { flowId: "flow-abc-123" };
        const result = safeParseToolActionConfig(input);
        expect(result.flowId).toBe("flow-abc-123");
    });

    it("parses webhook config", () => {
        const input = {
            url: "https://hooks.example.com/webhook",
            method: "POST",
            headers: { Authorization: "Bearer token123" },
        };
        const result = safeParseToolActionConfig(input);
        expect(result.url).toBe("https://hooks.example.com/webhook");
        expect(result.method).toBe("POST");
        expect(result.headers).toEqual({ Authorization: "Bearer token123" });
    });

    it("parses config with builtinName", () => {
        const input = { builtinName: "searchDatabase" };
        const result = safeParseToolActionConfig(input);
        expect(result.builtinName).toBe("searchDatabase");
    });

    it("returns empty object for null", () => {
        expect(safeParseToolActionConfig(null)).toEqual({});
    });

    it("returns empty object for undefined", () => {
        expect(safeParseToolActionConfig(undefined)).toEqual({});
    });

    it("preserves extra fields via passthrough", () => {
        const input = { flowId: "f1", someExtra: 42 };
        const result = safeParseToolActionConfig(input);
        expect((result as any).someExtra).toBe(42);
    });
});

// ─── safeParseNotificationChannels ────────────────────────────────────────────

describe("safeParseNotificationChannels", () => {
    it("parses valid array of channels", () => {
        const input = [
            { sessionId: "sess-1", events: ["message", "connection"], labels: ["urgent"] },
            { sessionId: "sess-2", events: ["message"], labels: [] },
        ];
        const result = safeParseNotificationChannels(input);
        expect(result).toHaveLength(2);
        expect(result[0].sessionId).toBe("sess-1");
        expect(result[0].events).toEqual(["message", "connection"]);
        expect(result[1].labels).toEqual([]);
    });

    it("returns empty array for null", () => {
        expect(safeParseNotificationChannels(null)).toEqual([]);
    });

    it("returns empty array for undefined", () => {
        expect(safeParseNotificationChannels(undefined)).toEqual([]);
    });

    it("returns empty array for invalid data (string)", () => {
        expect(safeParseNotificationChannels("not an array")).toEqual([]);
    });

    it("returns empty array for invalid data (object instead of array)", () => {
        expect(safeParseNotificationChannels({ sessionId: "s1" })).toEqual([]);
    });

    it("parses empty array", () => {
        expect(safeParseNotificationChannels([])).toEqual([]);
    });

    it("returns empty array when items are missing required fields", () => {
        const input = [{ sessionId: "sess-1" }]; // missing events and labels
        expect(safeParseNotificationChannels(input)).toEqual([]);
    });
});
