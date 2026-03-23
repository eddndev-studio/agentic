import { describe, it, expect } from "vitest";
import { isRemoteUrl } from "./helpers";

describe("isRemoteUrl", () => {
    it("returns true for http URLs", () => {
        expect(isRemoteUrl("http://example.com/file.png")).toBe(true);
    });

    it("returns true for https URLs", () => {
        expect(isRemoteUrl("https://cdn.example.com/image.jpg")).toBe(true);
    });

    it("returns false for local absolute paths", () => {
        expect(isRemoteUrl("/tmp/uploads/file.png")).toBe(false);
    });

    it("returns false for relative paths", () => {
        expect(isRemoteUrl("uploads/file.png")).toBe(false);
    });

    it("returns false for file:// protocol", () => {
        expect(isRemoteUrl("file:///home/user/file.png")).toBe(false);
    });

    it("returns false for empty string", () => {
        expect(isRemoteUrl("")).toBe(false);
    });

    it("returns false for strings containing http in the middle", () => {
        expect(isRemoteUrl("not-http://example.com")).toBe(false);
    });

    it("is case-sensitive (uppercase HTTP is not matched)", () => {
        expect(isRemoteUrl("HTTP://example.com")).toBe(false);
    });
});
