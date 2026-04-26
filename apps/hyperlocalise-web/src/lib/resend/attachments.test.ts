import { describe, expect, it } from "vite-plus/test";

import { inferAttachmentContentType, toBase64AttachmentContent } from "./attachments";

describe("toBase64AttachmentContent", () => {
  it("encodes binary attachment content for Resend", () => {
    expect(toBase64AttachmentContent(Buffer.from("translated content"))).toBe(
      "dHJhbnNsYXRlZCBjb250ZW50",
    );
  });
});

describe("inferAttachmentContentType", () => {
  it("marks JSON translation outputs as UTF-8 JSON", () => {
    expect(inferAttachmentContentType("en-US-vi.json")).toBe("application/json; charset=utf-8");
  });

  it("marks supported text translation outputs with explicit UTF-8 content types", () => {
    expect(inferAttachmentContentType("messages.csv")).toBe("text/csv; charset=utf-8");
    expect(inferAttachmentContentType("guide.mdx")).toBe("text/markdown; charset=utf-8");
    expect(inferAttachmentContentType("Localizable.strings")).toBe("text/plain; charset=utf-8");
    expect(inferAttachmentContentType("messages.xliff")).toBe(
      "application/x-xliff+xml; charset=utf-8",
    );
  });

  it("falls back to octet-stream for unknown or extensionless files", () => {
    expect(inferAttachmentContentType("README")).toBe("application/octet-stream");
    expect(inferAttachmentContentType("bundle.bin")).toBe("application/octet-stream");
  });
});
