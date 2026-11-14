import { describe, expect, it } from "vitest";
import { detectImageMime } from "../src/telegram/api";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(12).fill(0)]);

describe("detectImageMime", () => {
  it("sniffs the image type from magic bytes, ignoring a generic content type", () => {
    expect(detectImageMime(bytes(0xff, 0xd8, 0xff, 0xe0), "application/octet-stream", "photos/a.jpg")).toBe("image/jpeg");
    expect(detectImageMime(bytes(0x89, 0x50, 0x4e, 0x47), "application/octet-stream", "documents/a")).toBe("image/png");
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectImageMime(webp, null, "x")).toBe("image/webp");
  });

  it("falls back to an image content type, then the file extension", () => {
    expect(detectImageMime(bytes(1), "image/heic; charset=binary", "x")).toBe("image/heic");
    expect(detectImageMime(bytes(1), "application/octet-stream", "documents/a.PNG")).toBe("image/png");
    expect(detectImageMime(bytes(1), "application/octet-stream", "documents/a")).toBe("image/jpeg");
  });
});
