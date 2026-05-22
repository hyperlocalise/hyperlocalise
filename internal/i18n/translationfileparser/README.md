# translationfileparser

`translationfileparser` provides a strategy-based parser layer for local translation files.

## Supported formats

- `.json` via `JSONParser`
- `.jsonc` via `JSONCParser`
- `.yaml` / `.yml` via `YAMLParser`
- `.js` / `.jsx` / `.mjs` / `.cjs` / `.ts` / `.tsx` / `.mts` / `.cts` via `JSTSLocaleModuleParser`
- `.arb` via `ARBParser` (Flutter Application Resource Bundle)
- `.xlf` / `.xliff` via `XLIFFParser` (XLIFF 1.2 and 2.x)
- `.po` via `POFileParser` (GNU gettext)
- `.html` via `HTMLParser`
- `.liquid` via `LiquidParser`
- `.md` / `.mdx` via `MarkdownParser`
- `.strings` via `AppleStringsParser` (Apple/Xcode strings files)
- `.stringsdict` via `AppleStringsdictParser` (Apple/Xcode plural dictionaries)
- `.xcstrings` via `XCStringsParser` (Apple/Xcode string catalogs)
- `.csv` via `CSVParser` (key/value and per-locale column layouts)
- `.ftl` via `FluentParser` (Mozilla Fluent messages and attributes)
- `.xml` via `AndroidXMLResourcesParser` for Android `**/res/values*/strings.xml` files
- `.xml` / `.resx` via `GenericXMLParser` (non-Android generic XML locale files)
- `.properties` via `JavaPropertiesParser` (Java resource bundles)

## Strategy API

- `NewDefaultStrategy()` returns a strategy pre-registered with JSON, JSONC, YAML/YML, JS/TS locale module, XLIFF, PO, Apple strings/catalog, Markdown/MDX, CSV, Liquid, HTML, ARB, Fluent, Android XML strings, generic XML/RESX, and Java properties parsers.
- `Register(ext, parser)` allows adding/replacing parser implementations by extension.
- `Parse(path, content)` resolves parser by extension and returns `map[string]string`.

## Parser behavior

### JSON

- Accepts object-shaped JSON.
- Nested objects are flattened with dotted keys.
  - Example: `{ "home": { "title": "Accueil" } }` -> `home.title=Accueil`
- Non-string leaf values are rejected.

### JSONC

- Accepts JSON with `//` and `/* ... */` comments plus trailing commas.
- Produces the same flattened dotted-key output shape as the JSON parser.
- Non-string leaf values are rejected.

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

### HTML

- Extracts text content from elements bounded by open/close tags (e.g. `<p>`, `<h1>`–`<h6>`, `<li>`, `<td>`, `<button>`, etc.).
- Keys are stable SHA-256 hashes of the segment source: `html.a1b2c3d4e5f6g7h8`.
- Inline tags within a translatable segment (`<strong>`, `<em>`, `<a>`, `<span>`, etc.) are replaced with sentinel placeholders so the LLM translates clean prose; placeholders are restored on marshal.
- `<script>`, `<style>`, and `<head>` content is never extracted.
- HTML comments and whitespace-only text nodes are emitted verbatim.
- HTML entities (`&amp;`, `&lt;`, `&#39;`, etc.) are preserved as-is through the translation round-trip.
- `MarshalHTML(template, values)` reconstructs the file using the source template as the structural scaffold, substituting translated values and restoring all inline-tag placeholders.

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

### Apple Strings (`.strings`)

- Parses `"key" = "value";` entries into `map[string]string`.
- Ignores line comments (`// ...`) and block comments (`/* ... */`).
- Decodes escaped sequences (`\n`, `\r`, `\t`, `\"`, `\\`) and unicode escapes (`\u`, `\Uhhhh`, surrogate pairs).
- Supports multiline quoted value content.
- `MarshalAppleStrings(template, values)` preserves template layout/comments/spacing and replaces only value literals.

### Apple Stringsdict (`.stringsdict`)

- Parses plist/XML dictionaries and flattens `<string>` leaves to dotted keys.
  - Example: `item_count.items.one=%d item`
- Treats `NSString*` fields such as `NSStringLocalizedFormatKey` and `NSStringFormatSpecTypeKey` as structural metadata, not translatable content.
- Validates that every `%#@token@` in `NSStringLocalizedFormatKey` matches a sibling substitution dictionary key.
- Preserves plural category keys (`zero`, `one`, `two`, `few`, `many`, `other`) as part of flattened key paths.
- `MarshalAppleStringsdict(template, values)` preserves plist/XML layout and replaces only `<string>` text values.

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

### Generic XML (`.xml`, `.resx`)

- Parses non-Android XML locale files with text-only leaf entries.
- Keyed leaves use `key`, `id`, or `name` attributes.
  - Example: `<message key="checkout.cta">Checkout now</message>` -> `checkout.cta=Checkout now`
- Nested leaves without key attributes use dotted element paths.
  - Example: `<home><title>Welcome</title></home>` -> `home.title=Welcome`
- `.resx`-style entries are supported.
  - Example: `<data name="home.title"><value>Welcome</value></data>` -> `home.title=Welcome`
- Comments, attributes, and metadata elements such as `<metadata>`, `<comment>`, and `<resheader>` are preserved.
- Android `<resources>`, XLIFF `<xliff>`, plist `<plist>`, and mixed-content XML values are rejected with clear errors rather than rewritten as generic XML.
- CDATA values can be parsed, but changed translations are written back as escaped XML text rather than preserving the CDATA wrapper.
- `MarshalGenericXML(template, values)` preserves the template structure and replaces only supported text leaf content.
- `MarshalGenericXMLWithTargetLocale(template, values, sourceLocale, targetLocale)` also rewrites root-element locale attributes (`xml:lang`, `lang`, `locale`, `language`, `code`) whose values match `sourceLocale`, adapting the original separator style (for example `en_US` -> `vi_VN`, `en` -> `vi`).
- XML marshal values must be decoded plain text, not pre-escaped XML; the serializer escapes translated text and attributes during writeback.
- Surrounding whitespace inside text-only leaf values is treated as part of the source value and replacement range, so translation providers that trim values may normalize that formatting.

### Java Properties (`.properties`)

- Parses Java-style key/value entries separated by `=`, `:`, or unescaped whitespace.
- Supports escaped keys and values, `\t`, `\n`, `\r`, `\f`, escaped separators, `\uXXXX` unicode escapes, and logical line continuations.
- Ignores blank lines and preserves `#` / `!` comments during marshal. Adjacent leading comments are returned as entry context by `ParseWithContext`.
- `MarshalJavaProperties(template, values)` preserves key order, comments, separators, and spacing while replacing value literals. New keys are appended in sorted order.
- Writeback normalizes translated values to single-line escaped values.
- Duplicate keys, malformed unicode escapes, invalid UTF-8 input, and dangling continuations return explicit parse errors.

## Minimal usage

```go
strategy := translationfileparser.NewDefaultStrategy()

values, err := strategy.Parse("lang/fr.xliff", content)
if err != nil {
    return err
}

fmt.Println(values["checkout.submit"])
```
