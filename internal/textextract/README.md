# Text extraction

`Extractor` turns an uploaded document into normalized UTF-8 text for indexing.
It detects the format from content signatures; filenames and declared MIME
types only distinguish Markdown from plain text, so a renamed binary is never
indexed as text.

| Format | Detection | Method |
| --- | --- | --- |
| Markdown, plain text | valid UTF-8 text | passed through |
| PDF | `%PDF-` header | text layer; vision fallback when scanned |
| DOCX | zip containing `word/document.xml` | body paragraphs |
| PNG, JPEG, GIF, WebP | image signature | vision |

A PDF averaging fewer than 16 letters or digits per page is treated as scanned.
Vision is optional: without a `Recognizer`, images and scanned PDFs return
`ErrNoText`. `OpenAIRecognizer` targets any OpenAI-compatible chat completions
API, including Vercel AI Gateway; the configured model must accept image and PDF
file input. The package reads no environment variables.

Input is untrusted. `Options` bounds upload size, PDF page count and output
runes (`Result.Truncated` reports truncation). DOCX decompression is bounded to
prevent zip bombs, and PDF parser panics are converted to `ErrMalformed`.
Output defaults to 50,000 runes, the canonical guideline content limit.

Extraction is deterministic for native formats but not for vision. Persist the
result with the document revision and index the stored text, rather than
re-extracting during index rebuilds.
