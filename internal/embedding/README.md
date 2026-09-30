# Embedding

`Client` turns text, PNG/JPEG images, and PDFs into a 1536-dimension vector
through Vercel AI Gateway (`google/gemini-embedding-2`). Model ID and
dimensions are package constants so every caller writes the same vector space.

| Input | Request |
| --- | --- |
| Query text | `input` with `task: search result \| query: …` |
| Document text | `input` with `title: … \| text: …` |
| Text plus PNG, JPEG, or PDF | prefixed `input` plus `inlineData` |
| PNG, JPEG, or PDF only | placeholder `input` plus `inlineData` |

The package reads no environment variables. Callers pass an API key and
optional base URL. Office formats are unsupported. Gemini Embedding 2 accepts
at most one PDF of six pages; the provider rejects larger documents.

Guideline retrieval uses turbopuffer native embeddings with the same model and
dimensions. Keep this client for PNG, JPEG, and PDF inputs that native
embeddings do not yet handle. Keep `internal/textextract` where the product
still needs plain text.
