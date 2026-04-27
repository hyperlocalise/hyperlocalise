# Story 1.1 Simplified: Bootstrap Liquid Parser Skeleton

## What this story is

This is the first implementation slice for adding Shopify Liquid support to Hyperlocalise.

The goal is not to parse real Liquid translation keys yet. The goal is only to add the basic wiring so the codebase knows a `LiquidParser` exists and can route `.liquid` files to it.

## Why this matters

Hyperlocalise already knows how to parse other file types such as `.json`, `.arb`, and `.html`.

Shopify themes use `.liquid` files. Before we can extract translation keys like:

```liquid
{{ 'header.navigation.home' | t }}
```

we first need a parser type that fits the existing parser system.

This story gives us that foundation.

## What we are building in this story

We are doing four small things:

1. Add the approved Go dependency:
   - `github.com/osteele/liquid@v1.6.0`
2. Create a new parser type:
   - `internal/i18n/translationfileparser/liquid_parser.go`
3. Register `.liquid` in the parser strategy:
   - `NewDefaultStrategy()` should route `.liquid` files to `LiquidParser{}`
4. Add narrow tests to prove the wiring works

## What we are not building yet

This story does **not** implement the real Liquid feature yet.

Not in scope:
- extracting static translation keys
- handling chained filters
- skipping `{% comment %}` or `{% raw %}`
- dynamic-key diagnostics
- panic recovery
- coverage reports
- `check_diagnostics.go`
- user-facing docs for the feature

Those belong to later stories in Epic 1 and beyond.

## Plain-English explanation of the main pieces

### `Strategy`

File: `internal/i18n/translationfileparser/strategy.go`

This is the dispatcher. It looks at a file extension and picks the correct parser.

Example:
- `.json` -> `JSONParser{}`
- `.arb` -> `ARBParser{}`
- `.html` -> `HTMLParser{}`

After this story:
- `.liquid` -> `LiquidParser{}`

### `Parser`

This is the basic parser interface:

```go
type Parser interface {
    Parse(content []byte) (map[string]string, error)
}
```

Any parser must accept file content and return extracted translation entries.

### `ContextParser`

This is the optional richer parser interface:

```go
type ContextParser interface {
    ParseWithContext(content []byte) (map[string]string, map[string]string, error)
}
```

It can return:
- extracted entries
- extra context per entry

For this story, we are **not** adding real context yet.

### `LiquidParser`

This is the new parser type we are introducing.

It should:
- be a stateless `struct{}`
- implement `Parse`
- implement `ParseWithContext`
- follow the same shape as existing parsers

## Important implementation constraints

- Keep `LiquidParser` stateless: `type LiquidParser struct{}`
- Do not change the `Parser` or `ContextParser` interfaces
- `Parse` should delegate to `ParseWithContext`
- `ParseWithContext` should stay minimal for now
- For the no-context case, return `nil` for the context map
- Do not silently upgrade the Liquid dependency beyond `v1.6.0`
- Do not introduce `DiagnosticParser` yet
- Preserve behavior for all existing parsers

## One subtle but important point

The current parser interface only receives:

```go
content []byte
```

That means the parser itself does **not** know the source file path.

So this story must **not** promise file-path-aware or line-aware context yet. That was explicitly deferred during validation.

## Files this story should touch

New files:
- `internal/i18n/translationfileparser/liquid_parser.go`
- `internal/i18n/translationfileparser/liquid_parser_test.go`

Modified files:
- `internal/i18n/translationfileparser/strategy.go`
- `internal/i18n/translationfileparser/strategy_test.go`
- `go.mod`
- `go.sum`

## Testing expectations

Keep tests narrow and practical:

- prove `LiquidParser` satisfies the expected interfaces
- prove `.liquid` is registered in `NewDefaultStrategy()`
- prove existing parser tests still pass
- add a small capability check, or at least record a concrete note, confirming the `osteele/liquid` package looks usable for later filter-chain work

## How we know this story is done

This story is done when:

- the repo builds with `github.com/osteele/liquid@v1.6.0`
- `LiquidParser` exists and compiles
- `.liquid` files resolve through the strategy
- tests cover the bootstrap wiring
- `make fmt`, `make lint`, and `make test` all pass

## Short implementation checklist

- add dependency
- add `LiquidParser`
- keep parsing behavior intentionally minimal
- register `.liquid`
- add narrow tests
- run repo validation commands

## Bottom line

This story is foundation work.

We are teaching Hyperlocalise to recognize Liquid as a supported parser type, but we are not yet teaching it how to actually extract Shopify translation keys. That comes next.
