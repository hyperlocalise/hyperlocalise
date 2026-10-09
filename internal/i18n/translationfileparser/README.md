# translationfileparser

`translationfileparser` provides a strategy-based parser layer for local translation files.

## Supported formats

- `.json` via `JSONParser`
- `.jsonc` via `JSONCParser`
- `.yaml` / `.yml` via `YAMLParser`
- `.js` / `.jsx` / `.mjs` / `.cjs` / `.ts` / `.tsx` / `.mts` / `.cts` via `JSTSLocaleModuleParser`
- `.ts` Qt Linguist catalogs via `TSFileParser` content detection and `QtLinguistParser`
- `.arb` via `ARBParser` (Flutter Application Resource Bundle)
- `.xlf` / `.xliff` via `XLIFFParser` (XLIFF 1.2 and 2.x)
- `.po` via `POFileParser` (GNU gettext)
- `.html` via `HTMLParser`
- `.liquid` via `LiquidParser`
- `.md` / `.mdx` via `MarkdownParser`
- `.adoc` / `.asciidoc` / `.asc` via `AsciiDocParser`
- `.strings` via `AppleStringsParser` (Apple/Xcode strings files)
- `.stringsdict` via `AppleStringsdictParser` (Apple/Xcode plural dictionaries)
- `.xcstrings` via `XCStringsParser` (Apple/Xcode string catalogs)
- `.csv` via `CSVParser` (key/value and per-locale column layouts)
- `.tsv` via `CSVParser` with a tab delimiter
- `.toml` via `TOMLParser` (string leaves in tables, inline tables, and string arrays)
- `.php` via `PHPArrayParser` (static PHP locale arrays)
- `.ftl` via `FluentParser` (Mozilla Fluent messages and attributes)
- `.xml` via `AndroidXMLResourcesParser` for Android `**/res/values*/strings.xml` files
- `.xml` / `.resx` / `.resw` via `GenericXMLParser` (non-Android generic XML locale files)
- `.properties` via `JavaPropertiesParser` (Java resource bundles)
- `.ini` via `INIParser` (Windows-style INI localization files)
- `.srt` / `.vtt` / `.sbv` via `SubtitleParser` (SubRip, WebVTT, and YouTube SBV subtitle cues)
- `.svg` via `SVGParser` (`text`, `tspan`, `textPath`, `title`, and `desc`)
- `.json` Lottie animations via `JSONParser` content detection (editable text layers only)
- `.lottie` via `DotLottieParser` (dotLottie zip archives)

## Strategy API

- `NewDefaultStrategy()` returns a strategy pre-registered with JSON, JSONC, YAML/YML, JS/TS locale module, Qt Linguist TS, XLIFF, PO, Apple strings/catalog, Markdown/MDX, AsciiDoc, CSV, TSV, TOML, Liquid, HTML, ARB, PHP array, Fluent, Android XML strings, generic XML/RESX/RESW, Java properties, INI, SubRip/WebVTT/SBV subtitle, and SVG text parsers.
- `Register(ext, parser)` allows adding/replacing parser implementations by extension.
- `Parse(path, content)` resolves parser by extension and returns `map[string]string`.

## Parser behavior

### JSON

- Accepts object-shaped JSON.
- Nested objects are flattened with dotted keys.
  - Example: `{ "home": { "title": "Accueil" } }` -> `home.title=Accueil`
- Non-string leaf values are rejected.

### Lottie (`.json`)

- `JSONParser` routes documents whose root has `v` (string), `fr`, `ip`, `op` (numbers), and a `layers` array to the Lottie extractor.
- Extracts text layers (`ty: 5`) from root `layers` and precomposition `assets[].layers`, one entry per text keyframe.
  - Example: `layers[1].t.d.k[0].s.t=Save more\rtoday`
- Blank text, shape layers, and text converted to shapes are skipped.
- `ParseWithContext` returns the layer name, precomposition ID, and keyframe frame (when a layer has several keyframes) as entry context.
- `MarshalLottie(template, values)` replaces only the text string literals, so formatting, number precision, and key order are preserved byte-for-byte. Unknown keys are ignored.

### dotLottie (`.lottie`)

- `DotLottieParser` opens the zip archive and extracts text from every Lottie animation under `animations/` (v1) or `a/` (v2).
- Keys are prefixed with the entry path: `a/promo.json#layers[1].t.d.k[0].s.t`.
- `MarshalDotLottie(template, values)` rebuilds the archive, rewriting only animations with changed text. Other entries (manifest, images, themes, state machines) are copied without recompression, and entry order, compression method, and timestamps are preserved.
- Theme and slot overrides are not extracted. Animation entries larger than 64 MiB decompressed are rejected.

### JSONC

- Accepts JSON with `//` and `/* ... */` comments plus trailing commas.
- Produces the same flattened dotted-key output shape as the JSON parser.
- Non-string leaf values are rejected.

### Qt Linguist (`.ts`)

- `TSFileParser` routes `.ts` files with a Qt `<TS>` root to `QtLinguistParser`. Other `.ts` files stay on `JSTSLocaleModuleParser`.
- Keys are `context|source`. A disambiguation `<comment>` appends `|comment`. An explicit message `id` wins. Messages directly under `<TS>` use `unknown` as the context name unless they have an `id`.
- Numerus forms flatten to `key::numerus.N`. Empty unfinished translations fall back to `<source>`.
- `type="obsolete"` and `type="vanished"` messages are skipped.
- `ParseWithContext` returns `<extracomment>`, `<comment>`, and `<location filename line>` as entry context.
- `MarshalQtLinguist(template, values, sourceLocale, targetLocale)` updates `<translation>` text, writes numerus forms, clears `type="unfinished"`, and sets `language` / `sourcelanguage` using Qt underscore locales. `MarshalQtLinguistStaged` additionally takes the keys staged in the current run; unstaged messages whose value is only the source fallback keep their existing `<translation>` and `type="unfinished"`. Rich text is written as escaped character data. Only `<byte>` children are preserved as XML.

### JS/TS Locale Modules

- Accepts static locale modules shaped as `export default { ... }`, `export const messages = { ... }`, `module.exports = { ... }`, or `const messages = { ... }; export default messages`.
- Nested object keys are flattened with dotted keys; string arrays use bracket indexes.
  - Example: `export default { home: { title: "Welcome" } }` -> `home.title=Welcome`
- Strict FormatJS-style objects are supported when each top-level key has a static `defaultMessage`; `description` is returned as entry context and preserved as metadata.
- Comments, imports, export syntax, `as const`, and unrelated module text are preserved during marshal because only string literal value spans are replaced.
- Dynamic values, computed keys, spread properties, multiple exported locale objects, and template literals with `${...}` interpolation are rejected.

### YAML/YML

- Accepts mapping-shaped YAML locale files.
- Nested mappings are flattened with dotted keys, and sequences are flattened with `[index]` keys.
  - Example: `home: { title: Accueil }` -> `home.title=Accueil`
  - Example: `steps: [One, Two]` -> `steps[0]=One`, `steps[1]=Two`
- ICU plural/select messages and placeholders are treated as ordinary string values.
- Mapping keys cannot contain `.`, `[`, or `]` because those characters are reserved for flattened dotted/index paths.
- Non-string scalar leaves such as numbers, booleans, nulls, timestamps, anchors, and aliases are rejected with clear errors.
- `MarshalYAML(template, values)` rewrites only existing string leaves. It preserves key order and comments carried by `yaml.v3` nodes where possible, but YAML formatting and scalar style may be normalized during writeback.

### ARB

- Accepts object-shaped ARB JSON (Flutter resource bundles).
- Only top-level non-metadata keys are treated as translatable message entries.
- Keys prefixed with `@` (for example `@hello`, `@@locale`) are treated as metadata and excluded from translation parsing.
- `MarshalARB(template, sourceTemplate, values, targetLocale)` preserves target-template metadata and ordering, carries source `@key` metadata forward for newly appended message keys, and normalizes `@@locale` to `targetLocale`.

### XLIFF

- Reads keys from `id` first, then `name`, then `resname`.
- Supports `<trans-unit>` (1.2) and `<unit>` (2.x).
- Uses `<target>` when present, falls back to `<source>` when target is empty.

### PO

- Reads `msgid` -> `msgstr` mappings.
- Supports multiline quoted continuations.
- For plural forms, uses `msgstr[0]` as the mapped value.
- Skips header entry (`msgid ""`).
- Ignores comments and `msgctxt` for now.
- Unreal Engine rich-text tags in `msgstr` (`<Style>text</>`, `<{name}>text</>`, and self-closing decorators such as `<img id="Health"/>`) become `\x1eHLUEPH_…\x1f` placeholders during parse. `MarshalPOFile` restores the original markup. Named HTML closes, unclosed openings, and prose in angle brackets stay ordinary text. See `docs/cli/reference/formats/gettext.mdx`.

### HTML

- Extracts text content from elements bounded by open/close tags (e.g. `<p>`, `<h1>`–`<h6>`, `<li>`, `<td>`, `<button>`, etc.).
- Keys are dotted tag paths, like markdown slot keys: `html.body.h1`, `html.p`, `html.p.strong`, `html.p.strong.2`, `html.body.img.alt`.
- Inline tags (`<strong>`, `<em>`, `<a>`, `<span>`, etc.) join the path and flush the current text node. Markup is a literal between segments. `MarshalHTML` writes those literals back around the translated text.
- `<script>`, `<style>`, `<pre>`, and `<head>` content is never extracted, including `<title>`.
- HTML comments and whitespace-only text nodes are emitted verbatim.
- HTML entities (`&amp;`, `&lt;`, `&#39;`, etc.) are preserved as-is through the translation round-trip.
- `MarshalHTML(template, values)` reconstructs the file using the source template as the structural scaffold and substituting translated text nodes. Legacy hashed keys (`html.<16 hex>`) are accepted on writeback.

### Liquid

- Extracts hardcoded visible template text from `.liquid` files using stable `liquid.*` segment keys.
- Protects Liquid output delimiters (`{{ ... }}`) as internal placeholders while translating surrounding text.
- Treats standalone Liquid tags (`{% ... %}`) as template boundaries; tags inside HTML attributes are protected inline and restored verbatim.
- Preserves Shopify locale-key calls such as `{{ 'header.title' | t }}` as template structure; keys are not translated as source text.
- Skips `{% raw %}`, `{% comment %}`, `{% schema %}`, `{% javascript %}`, and `{% stylesheet %}` blocks verbatim.
- `MarshalLiquid(template, values)` reconstructs the file using the source template as the structural scaffold, substituting translated values and restoring Liquid syntax placeholders.

### Markdown

- Extracts stable sequential keys (`md.0001`, `md.0002`, ...).
- Preserves frontmatter blocks (`---`) unchanged.
- Preserves fenced code blocks (``` and ~~~) unchanged.
- Preserves Markdown syntax tokens and link destinations while extracting text segments.

### AsciiDoc

- Extracts structural keys (`adoc.title`, `adoc.heading`, `adoc.paragraph`, ...).
- Translates document titles, headings, paragraphs, list items, description lists, table cells, admonitions, and block titles.
- Preserves YAML front matter, comments, attribute definitions, block macros, preprocessor directives, and verbatim blocks.
- Protects inline code, links, cross references, attribute references, bare URLs, anchors, passthroughs, and issue references as placeholders.
- Writes translated paragraphs as a single line.

### Apple Strings (`.strings`)

- Parses `"key" = "value";` entries into `map[string]string`.
- Ignores line comments (`// ...`) and block comments (`/* ... */`).
- Decodes escaped sequences (`\n`, `\r`, `\t`, `\"`, `\\`) and unicode escapes (`\u`, `\Uhhhh`, surrogate pairs).
- Supports multiline quoted value content.
- Extracts optional max-length limits from leading entry comments using `hl:max-length=`, `max.length:`, `max length:`, or `character limit:` conventions.
- `MarshalAppleStrings(template, values)` preserves template layout/comments/spacing and replaces only value literals.

### Apple Stringsdict (`.stringsdict`)

- Parses plist/XML dictionaries and flattens `<string>` leaves to dotted keys.
  - Example: `item_count.items.one=%d item`
- Treats `NSString*` fields such as `NSStringLocalizedFormatKey` and `NSStringFormatSpecTypeKey` as structural metadata, not translatable content.
- Validates that every `%#@token@` in `NSStringLocalizedFormatKey` matches a sibling substitution dictionary key.
- Preserves plural category keys (`zero`, `one`, `two`, `few`, `many`, `other`) as part of flattened key paths.
- `MarshalAppleStringsdict(template, values)` preserves plist/XML layout and replaces only `<string>` text values.

### PHP Array Locales (`.php`)

- Parses PHP files that begin with `<?php` and return one static array literal.
- Supports short arrays (`return [ ... ];`) and legacy arrays (`return array(...);`).
- Requires quoted string keys and string-literal values; nested arrays are flattened with dotted keys.
  - Example: `['auth' => ['failed' => 'Invalid']]` -> `auth.failed=Invalid`
- PHP keywords such as `return` and `array` are matched case-insensitively.
- Double-quoted PHP string escapes are decoded, including byte truncation for octal escapes above `\377`.
- Preserves comments, whitespace, key order, quote style, and array syntax on marshal by replacing only existing string value literals.
- Supports plural/select-style variants represented as nested keys such as `items.one` and `items.other`.
- Rejects executable or dynamic PHP constructs, including variables, function calls, constants, `declare(...)`, and double-quoted interpolation.

### Fluent (`.ftl`)

- Parses top-level message values into message IDs.
- Parses message attributes into dotted keys.
  - Example: `brand =` with `.title = Hyperlocalise` becomes `brand.title=Hyperlocalise`.
- Multiline values and select/plural patterns are kept as a single translation value for the message or attribute.
- Comments, blank lines, ordering, and unsupported metadata are preserved by `MarshalFluent(template, values)` because only parsed value spans are replaced.
- Term definitions (`-brand = ...`) and term references are rejected with clear errors; they are not rewritten by the parser.
- Newly appended message keys are written in sorted order. New attributes can be appended only when their parent message is not already present in the template.

### Apple String Catalogs (`.xcstrings`)

- Parses JSON string catalogs with top-level `sourceLanguage`, `strings`, and `version` fields.
- Reads source values from `strings[*].localizations[sourceLanguage]` when available.
- Falls back to the catalog key for simple source-only entries without a source localization.
- Flattens variation and substitution leaves using stable `::` paths.
  - Examples: `item_count::plural.one`, `search_label::device.mac`, `count_label::substitution.total::plural.other`.
- Extracts optional max-length limits from entry-level `maxLength` / `characterLimit` JSON fields or from the entry `comment` using the same comment conventions as `.strings`.
- Preserves comments, extraction state, string-unit state, substitutions metadata, and unrelated JSON fields on marshal.
- `MarshalXCStrings(template, sourceTemplate, values, sourceLocale, targetLocale)` writes translated values under `localizations[targetLocale]` and emits deterministic, pretty-printed JSON.
- Original whitespace and object ordering are normalized during writeback.
- Variant and substitution entries without a source-language localization are rejected so the parser does not guess source text.

### Android XML Strings (`.xml`)

- Applies only to Android string resource paths matching `**/res/values*/strings.xml`.
- Parses `<string name="...">` values by resource name.
- Parses `<plurals name="..."><item quantity="...">` values as `name.quantity`.
- Skips resources marked `translatable="false"`.
- Preserves comments, resource attributes such as `formatted`, namespace declarations, and unrelated whitespace when marshalling.
- Preserves Android printf placeholders such as `%1$s` and `%d` as normal resource text.
- Rejects unsupported translatable resource constructs such as `<string-array>` with clear errors.
- `MarshalAndroidXMLResources(template, values)` preserves the source or target template layout and replaces only supported resource value bodies.

### Generic XML (`.xml`, `.resx`, `.resw`)

- Parses non-Android XML locale files with text-only leaf entries.
- Keyed leaves use `key`, `id`, or `name` attributes.
  - Example: `<message key="checkout.cta">Checkout now</message>` -> `checkout.cta=Checkout now`
- Nested leaves without key attributes use dotted element paths.
  - Example: `<home><title>Welcome</title></home>` -> `home.title=Welcome`
- `.resx` and `.resw` entries are supported.
  - Example: `<data name="home.title"><value>Welcome</value></data>` -> `home.title=Welcome`
- Comments, attributes, and metadata elements such as `<metadata>`, `<comment>`, and `<resheader>` are preserved.
- Android `<resources>`, XLIFF `<xliff>`, plist `<plist>`, and mixed-content XML values are rejected with clear errors rather than rewritten as generic XML.
- CDATA values can be parsed, but changed translations are written back as escaped XML text rather than preserving the CDATA wrapper.
- `MarshalGenericXML(template, values)` preserves the template structure and replaces only supported text leaf content.
- `MarshalGenericXMLWithTargetLocale(template, values, sourceLocale, targetLocale)` also rewrites root-element locale attributes (`xml:lang`, `lang`, `locale`, `language`, `code`) whose values match `sourceLocale`, adapting the original separator style (for example `en_US` -> `vi_VN`, `en` -> `vi`).
- XML marshal values must be decoded plain text, not pre-escaped XML; the serializer escapes translated text and attributes during writeback.
- Surrounding whitespace inside text-only leaf values is treated as part of the source value and replacement range, so translation providers that trim values may normalize that formatting.

### INI (`.ini`)

- Parses Windows-style INI files with optional `[section]` headers and `key=value` or `key:value` entries.
- Sectioned keys flatten as `section.key`. Keys before the first section stay unprefixed.
- Supports `;` and `#` comments, inline comments after whitespace, and single- or double-quoted values with `\n`, `\t`, `\r`, and quote escapes.
- Adjacent leading comments are returned as entry context by `ParseWithContext`.
- `MarshalINI(template, values)` preserves section order, comments, separators, and spacing while replacing value literals. New keys append to the matching section; unknown sections are created at the end of the file in sorted order. New unsectioned keys insert before the first section and any comments that belong to it.
- Duplicate flattened keys, empty section names, unclosed quotes or headers, missing separators, and invalid UTF-8 return explicit parse errors.

### Java Properties (`.properties`)

- Parses Java-style key/value entries separated by `=`, `:`, or unescaped whitespace.
- Supports escaped keys and values, `\t`, `\n`, `\r`, `\f`, escaped separators, `\uXXXX` unicode escapes, and logical line continuations.
- Ignores blank lines and preserves `#` / `!` comments during marshal. Adjacent leading comments are returned as entry context by `ParseWithContext`.
- `MarshalJavaProperties(template, values)` preserves key order, comments, separators, and spacing while replacing value literals. New keys are appended in sorted order.
- Writeback normalizes translated values to single-line escaped values.
- Duplicate keys, malformed unicode escapes, invalid UTF-8 input, and dangling continuations return explicit parse errors.

### TOML (`.toml`)

- Parses string assignments from tables, inline tables, and string arrays. Nested tables flatten as dotted keys; string arrays use `[index]` keys.
- Non-string scalars are skipped. Array-of-tables (`[[name]]`) and duplicate flattened keys return parse errors.
- `MarshalTOML(template, values)` replaces existing string literals in place and appends new dotted keys in sorted order.

### TSV (`.tsv`)

- Same layouts as CSV, using a tab delimiter: `key`/`value` columns or per-locale columns.
- `ParseTSVLocale` and `TSVHasLocaleColumn` select a locale column when present.

### SVG (`.svg`)

- Extracts character data from `text`, `tspan`, `textPath`, `title`, and `desc` into sequential keys such as `svg.0001`.
- Skips `style`, `script`, and `metadata` content. Geometry and attributes stay in the file.
- `MarshalSVG(template, values)` replaces extracted spans and HTML-escapes translations. Extra keys are ignored.

### Subtitles (`.srt`, `.vtt`, `.sbv`)

- Parses SubRip (`.srt`), WebVTT (`.vtt`), and YouTube SBV (`.sbv`) cues into sequential keys such as `srt.0001`, `vtt.0001`, and `sbv.0001`.
- Cue numbers, timestamps, positioning, and WebVTT cue settings stay in the file structure and are not translated.
- Cue payload text is the translation unit. Multiline cues become a single value joined with `\n`.
- `ParseWithContext` returns the timestamp line as entry context, including a non-numeric WebVTT cue identifier when present.
- WebVTT `WEBVTT` headers, `NOTE`, `STYLE`, and `REGION` blocks are preserved verbatim.
- WebVTT cue timestamps accept an hours field with two or more digits (for example `100:00:00.000`).
- `MarshalSubtitles(template, values, kind)` replaces cue text in place. Extra translation keys are ignored so cue counts stay aligned with the template. Blank lines inside translated cue text are dropped so they cannot split cues.
- `SubtitleCueStructureEqual` compares cue identifiers and timings so writeback can reject stale targets that happen to have the same cue count.

## Minimal usage

```go
strategy := translationfileparser.NewDefaultStrategy()

values, err := strategy.Parse("lang/fr.xliff", content)
if err != nil {
    return err
}

fmt.Println(values["checkout.submit"])
```
