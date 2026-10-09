# Native HTML CAT file view and tag-path keys

## Status

Accepted. Implemented on the HTML CAT File view branch.

## Context

Native HTML uploads extracted keys but CAT treated the file as an empty string
queue when ingest was still running or had failed. Keys were content hashes
(`html.143b270a32602d41`). Inline tags were folded into one placeholdered
paragraph (`HT#` chips), so `<p>This page tests <strong>tables</strong>…</p>`
was a single segment.

Translators need the stored page in File view, and keys that name the tag path
the way markdown names slots. The pinned sandbox CLI (`hl` 1.13.3) still hashes
HTML, so live ingest and translation cannot wait on a CLI release.

## Decision

### Editor

Native `.html` / `.htm` files keep a key-based queue. File view shows the stored
page (preview and code). It is not the markdown document editor. Crowdin HTML
stays segment-only.

CAT and the files page show latest source ingest state so extracting or failed
ingest is visible.

### Keys

Keys are dotted tag paths. The root `html` element is omitted. The first
occurrence of a path has no suffix; later siblings use `.2`, `.3`, and so on.

Inline tags join the path. Tags stay as literals between text nodes:

```html
<p>This page tests <strong>tables</strong>, <strong>bullet lists</strong>, numbered lists, and basic HTML styling.</p>
```

| Key | Text |
| --- | --- |
| `html.p` | `This page tests ` |
| `html.p.strong` | `tables` |
| `html.p.strong.2` | `bullet lists` |
| `html.p.2` | `, numbered lists, and basic HTML styling.` |

Punctuation-only text is not a segment. Nested inline tags stack
(`html.p.em.strong`). `img` alt is `html.body.img.alt`.

`head`, `script`, `style`, and `pre` are not extracted, including `<title>`.

### Ingest and writeback

Platform ingest rewrites sandbox `hl entries` through an in-process extractor
so new uploads persist path keys without a CLI bump. CAT remaps leftover hashed
keys for display when the stored source is available. Marshal accepts legacy
hashed values.

File translation still runs sandbox `hl run`. After a successful run, collect
reads the written HTML and matches path keys. It does not use lock hashes.

Liquid templates still fold inline HTML into placeholders. Their segment hashes
stay stable.

Re-upload a file that already stored hashed keys. Re-extract later is not
enough for ingest to persist the new shape.

## Consequences

- New native HTML uploads show `html.body.h1`, `html.p.strong`, table and list
  paths in the queue.
- Agent and UI file translation persist those same keys after `hl run`.
- Older hashed keys remain until the source file is uploaded again.
- A later CLI release that emits path keys can drop the in-process rewrite.
