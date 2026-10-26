# Bundled PDF export fonts

Translated PDF blocks keep the template's font whenever possible. When the
template font cannot render the translated text, the exporter redraws the
block with one of these bundled fonts:

- `wqy-microhei.ttf` — WenQuanYi Micro Hei (face 0 extracted from the
  upstream `wqy-microhei.ttc`). Covers CJK, Latin, Vietnamese, kana and
  hangul.
  - Upstream: https://github.com/anthonyfok/fonts-wqy-microhei
  - Copyright: 2008-2009 The WenQuanYi Project Board of Trustees, Qianqian Fang,
    mozbug; based on the Google Droid font family (2006-2008 Google Corp.,
    Steve Matteson, Ascender Corp.).
  - License: dual `Apache-2.0` / `GPL-3+ with Font exception`; Hyperlocalise
    uses it under the Apache License 2.0 (see `LICENSE_Apache2.txt`).
  - Extracted unchanged from the upstream collection with
    `fontTools.ttLib.TTFont("wqy-microhei.ttc", fontNumber=0)`.
- `NotoSansThai.ttf`, `NotoSansLao.ttf` — Noto Sans Thai and Noto Sans Lao
  (variable sources, used at the default Regular instance). Cover Thai, Lao
  and Latin, so mixed blocks work with a single font.
  - Upstream: https://github.com/google/fonts (`ofl/notosansthai`,
    `ofl/notosanslao`)
  - Designer: Google. License: SIL Open Font License 1.1 (see `OFL.txt`).

All three load at export time via `go:embed` + PDFium `FPDFText_LoadFont`
(TrueType, CID), which embeds the font so any PDF viewer renders real
glyphs. Thai and Lao round-trip through this path exactly; CJK does too,
except re-extracting 不 (U+4E0D) can return its compatibility twin 不
(U+F905) — a PDFium ToUnicode artifact that does not affect rendering.

## Font selection strategy (`../pdf_font.go`)

The font is decided per block from the translated text, not from the target
locale:

1. **Shaping gate** (`requiresPDFShaping`): Arabic, Hebrew, Indic, Khmer,
   Myanmar, Sinhala, Thaana and Syriac are rejected with
   `ErrPDFScriptUnsupported`. They need GSUB stacking, joining or bidi that
   PDFium cannot perform, and `FPDFText_SetText` takes text rather than glyph
   IDs, so Go-side shaping cannot feed this API either.
2. **Template reuse** (`pdfOriginalFontCoversText`): when the template's own
   (embedded) font covers every glyph of the translated text, the block is
   updated in place and keeps its look. Non-embedded fonts are never trusted
   here because `FPDFFont_GetFontData` returns substitution data for them.
3. **WinAnsi** (`pdfTextIsWinAnsi`): text encodable in the PDF standard-14
   fonts keeps the previous Helvetica behavior.
4. **Bundled fallback** (`pdfEmbeddedFontForText`): the first bundled font
   covering the whole text, in Micro Hei / Thai / Lao order so mixed blocks
   land on one font when possible.
5. **Reject**: anything left returns `ErrPDFScriptUnsupported` (surfaced as
   HTTP 422 `pdf_script_unsupported`) instead of writing tofu.

Fonts load once per document on first use (`pdfDocFonts`) and close with it:
loading the 4.6 MiB CJK font per block exhausts the PDFium wasm memory
budget on multi-block documents and duplicates the font stream in the
output. Latin-only exports never load the bundled fonts.

## Wrapping (`../pdf_parser.go`)

Line capacity is measured in half-width units (Latin ≈ 0.5em, CJK/fullwidth
≈ 1em) and spaceless runs (Chinese, Thai) break mid-word, keeping closing
punctuation (including Thai ๆ and ฯ) off line starts. Scripts that need
shaping stay rejected rather than wrapped.
