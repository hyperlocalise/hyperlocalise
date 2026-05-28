# [BUG] Line limit is applied after reading the entire file

**File:** [`apps/hyperlocalise-web/src/lib/agent-runtime/tools/workspace/read.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agent-runtime/tools/workspace/read.ts#L16-L66) (lines 16, 17, 44, 51, 52, 54, 66)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-resource-exhaustion`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The tool reads the complete file into memory before splitting lines and applying `offset`/`limit`. The schema also does not cap `limit`. A large repository file or binary can consume sandbox output, application memory, and agent context budget even when the caller requested only a small line range.

## Recommendation

Enforce a maximum byte count before reading or streaming file content, cap `limit`, reject likely binary files, and use a bounded line-range reader instead of `cat`ing the whole file.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
