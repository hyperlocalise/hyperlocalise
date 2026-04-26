import { describe, expect, it } from "vite-plus/test";

import { toBase64AttachmentContent } from "./attachments";

describe("toBase64AttachmentContent", () => {
  it("encodes binary attachment content for Resend", () => {
    expect(toBase64AttachmentContent(Buffer.from("translated content"))).toBe(
      "dHJhbnNsYXRlZCBjb250ZW50",
    );
  });
});
