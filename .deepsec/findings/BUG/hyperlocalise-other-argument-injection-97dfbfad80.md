# [BUG] Dash-prefixed glob prefixes are interpreted as find expressions

**File:** [`apps/hyperlocalise-web/src/lib/agent-runtime/tools/workspace/glob.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agent-runtime/tools/workspace/glob.ts#L20-L89) (lines 20, 30, 56, 64, 76, 89)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-argument-injection`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

A literal directory prefix from `pattern` becomes the first `find` argument. If that prefix starts with `-`, `find` can parse it as an expression/action rather than a path. For example, a pattern shaped like `-delete/*` can turn a read-only glob request into a destructive `find` action against the sandbox working tree.

## Recommendation

Reject dash-prefixed path components or force user-derived paths to be unambiguously paths, for example by prefixing validated relative paths with `./` and using a glob library instead of exposing raw `find` expression parsing.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
