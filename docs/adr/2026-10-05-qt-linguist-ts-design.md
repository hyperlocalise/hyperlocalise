# Qt Linguist `.ts` support

## Decision

Add Qt Linguist TS catalogs as a first-class locale format in the shared Go parser, CLI writeback, and native Platform uploads.

`.ts` is already used for JavaScript/TypeScript locale modules. Detection is content-based, not a new extension:

- A `.ts` file whose root is Qt `<TS>` (optional XML declaration and `<!DOCTYPE TS>`) uses `QtLinguistParser`.
- Any other `.ts` file keeps `JSTSLocaleModuleParser`.

Keys are `context|source`, or `context|source|comment` when a disambiguation `<comment>` is present. An explicit message `id` wins. Numerus forms use `::numerus.N`. Obsolete and vanished translations are skipped.

Platform maps `.ts` uploads to format id `qt-ts`. CLI still sniffs content, so existing TypeScript locale-module buckets keep working.

## Consequences

- Platform file pickers accept `.ts` as Qt Linguist, not as TypeScript locale modules.
- `hl run` / `hl entries` reconstruct TS XML through `MarshalQtLinguist`, including `language` / `sourcelanguage` and clearing `type="unfinished"` when a value is written.
- SRX stays enabled for `.ts` paths so TypeScript locale modules are unchanged. Qt `%1` / `%n` / `%L1` / `%Ln` placeholders skip sentence splitting and participate in placeholder-parity checks.
- Messages may appear under `<context>` or directly under `<TS>`. Rich text is written as escaped character data. Only `<byte>` children are preserved as XML.
