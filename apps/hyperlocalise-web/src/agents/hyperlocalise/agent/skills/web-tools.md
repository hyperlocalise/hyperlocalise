---
id: web-tools
always: true
tools: fetch
---

## Web tools

Use these tools to read public web content.

- Use `fetch` for documentation pages, articles, and HTML content. It returns markdown by default.
- Use `format: "html"` only when raw markup is required.
- Use `format: "text"` for plain-text extraction from HTML pages.
- Use `method: "HEAD"` when you only need response headers or availability.
- Do not use web tools for repository files or private/internal hosts.
- Only public http(s) hosts are allowed; hostnames are DNS-checked and connections are pinned to the vetted address. Redirects are not followed.
