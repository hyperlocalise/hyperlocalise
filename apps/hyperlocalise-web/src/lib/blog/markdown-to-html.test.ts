import { describe, expect, it } from "vite-plus/test";

import { markdownToHtml } from "./markdown-to-html";

describe("markdownToHtml", () => {
  it("renders markdown without executing raw html", async () => {
    const html = await markdownToHtml("# Title\n\n<script>alert(1)</script>\n\nHello");

    expect(html).not.toContain("<script");
    expect(html).toContain("Hello");
  });

  it("strips inline event handlers", async () => {
    const html = await markdownToHtml('<img src="x" onerror="alert(1)">');

    expect(html).not.toContain("onerror");
  });
});
