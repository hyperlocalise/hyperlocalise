# Bundled PDF export font

`wqy-microhei.ttf` is WenQuanYi Micro Hei (face 0 extracted from the
upstream `wqy-microhei.ttc`), used to render translated PDF text for
locales whose glyphs are missing from the PDF standard-14 fonts
(Chinese, Japanese, Korean, Vietnamese).

- Upstream: https://github.com/anthonyfok/fonts-wqy-microhei
- Copyright: 2008-2009 The WenQuanYi Project Board of Trustees, Qianqian Fang,
  mozbug; based on the Google Droid font family (2006-2008 Google Corp.,
  Steve Matteson, Ascender Corp.).
- License: dual `Apache-2.0` / `GPL-3+ with Font exception`; Hyperlocalise
  uses it under the Apache License 2.0 (see `LICENSE_Apache2.txt`).
- The file is extracted unchanged from the upstream collection with
  `fontTools.ttLib.TTFont("wqy-microhei.ttc", fontNumber=0)` and loaded at
  export time via `go:embed` + PDFium `FPDFText_LoadFont` (TrueType, CID).

## Font selection strategy (`../pdf_font.go`)

Translated PDF blocks keep the template's original font whenever possible
and fall back to this embedded font only when needed:

1. **Locale routing** (`pdfLocaleNeedsEmbeddedFont`): `zh*`, `ja*`, `ko*`,
   `vi*` and `yue*` translations need the embedded font because the PDF
   standard-14 fonts (WinAnsi) contain no CJK glyphs and miss Vietnamese
   letters such as đ, ơ and ư. All other locales keep the previous
   Helvetica behavior.
2. **Per-block reuse** (`pdfOriginalFontCoversText`): for a single-span
   block the exporter checks the template font's own cmap (via
   `FPDFFont_GetFontData` + `pdfFontDataCoversText`). Only fonts that are
   actually embedded are trusted — `GetFontData` returns substitution data
   for non-embedded fonts, so standard-14 fonts never pass. If the template
   font covers every glyph of the translated text, the block is updated in
   place and the template's look is preserved; otherwise the block is
   recreated with the embedded font.
3. **Single load per document**: the font is loaded once per `MarshalPDF`
   call, not once per block. Loading it per block embeds a second 4.6 MiB
   copy per block, which exhausts the PDFium wasm memory budget on
   multi-block documents and balloons the output.

## Known limitations

- **Text extraction quirk**: re-extracting text from an exported PDF can
  return 不 (U+4E0D) as its compatibility twin 不 (U+F905). The rendered
  glyph is correct; only copy-paste/text-extraction of that character is
  affected. It comes from PDFium's generated ToUnicode map for loaded CID
  fonts. Fixing it would require hand-built ToUnicode CMaps
  (`FPDFText_LoadCidType2Font`), which is disproportionate to the impact.
- **Wrapping** (`pdf_parser.go`): line capacity is measured in half-width
  units (Latin ≈ 0.5em, CJK/fullwidth ≈ 1em) and CJK runs break mid-word,
  keeping closing punctuation off line starts (basic kinsoku). Scripts that
  need shaping (Arabic, Hebrew, Indic) are still rejected with
  `ErrPDFScriptUnsupported`.
