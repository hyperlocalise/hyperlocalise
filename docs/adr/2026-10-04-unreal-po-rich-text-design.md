# Unreal Engine rich text in gettext PO files

## Decision

Treat Unreal Engine rich-text markup in gettext `.po` values as internal placeholders.

Unreal style tags close with nameless `</>`. The CAT ICU parser expects a named close tag, so a string such as `<Highlight>Ready</>` fails as a tag pair. On parse, the PO parser replaces recognized Unreal tags with `\x1eHLUEPH_…\x1f` sentinels. Translators see each tag as a unit. `{ItemName}` and other ICU placeholders inside tag content stay separate. `MarshalPOFile` restores the original markup from the source `msgid` and `msgstr`.

Recognized markup:

- Style pairs: `<RowName>text</>`, including dotted names such as `Font.Emph` and placeholder names such as `<{string}>`.
- Attributes written as `name="value"` with a leading space and double quotes.
- Self-closing decorators such as `<img id="Health"/>`.
- A lone `</>` with no opening tag.

Leave ordinary named HTML closes, unclosed openings, and prose in angle brackets unchanged. Convert at most 1000 tags per entry.

## Consequences

- Source-language `.po` files should keep populated `msgstr` values, as they already must for generation.
- Re-importing a file after this change produces new source hashes for strings that contain Unreal tags.
- Writeback stays byte-identical for unrecognized angle-bracket text.
