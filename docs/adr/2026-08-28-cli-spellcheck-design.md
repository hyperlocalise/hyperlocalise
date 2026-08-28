# CLI spell check

## Date

2026-08-28

## Context

`go-svc` spell checks segments with Hunspell through a CGO wrapper
(`apps/go-svc/internal/hunspell`), behind the `cgo_hunspell` build tag. The
shared package `internal/i18n/spellcheck` already contributes everything except
the dictionary lookup itself: tokenization, markup and ICU stripping, entity
decoding, and the locale-to-dictionary registry from
[`DICTIONARIES.md`](../../internal/i18n/spellcheck/DICTIONARIES.md). All of it
is CGO-free.

`hl check` has nine check types and no spelling check. Adding one means giving
the CLI a dictionary lookup, and the CLI has constraints `go-svc` does not:

- `.goreleaser.yml` builds with `CGO_ENABLED=0` and cross-compiles
  darwin/linux × amd64/arm64 from one host.
- `hl check` reads local files only. It is expected to work offline and in CI
  without credentials.
- Release archives are single static binaries. The pinned dictionary set is
  **84 MB** for 20 locales.

Now that the sandbox image ships `hunspell` and the pinned dictionaries, the
question is how the CLI should reach them.

## Decision

Shell out to the `hunspell` binary in pipe mode (`-a`), behind the same
provider seam `go-svc` uses, and skip the spelling check when the binary or a
dictionary is unavailable.

| Concern | Choice |
|---------|--------|
| Lookup | `hunspell -a -i UTF-8 -d <dict>`, one long-lived process per locale |
| Words | `spellcheck.Tokenize`, de-duplicated before checking |
| Locale to dictionary | `spellcheck.LoadRegistry().Resolve` |
| Dictionary location | `DICPATH`, else `/usr/share/hunspell`, else a `--dict-dir` flag |
| Binary missing | Skip `spelling`, report it as skipped, exit 0 |
| Suggestions | Cap at 5, matching `maxSuggestions` in the CGO wrapper |

De-duplication is not an optimization detail; it is what makes this viable. See
[Cost](#cost).

### Why not the alternatives

**Link libhunspell into the CLI (`cgo_hunspell`).** Rejected. It forces
`CGO_ENABLED=1`, so the release matrix needs a cross toolchain and per-platform
libhunspell for four targets, `go install` stops working, and every user needs
libhunspell present. The CLI would gain a system dependency that only a
minority of runs use.

**Call `go-svc` over HTTP.** Rejected. `hl check` is offline and
credential-free today. Routing one check through a network service adds auth,
latency, and an availability dependency to a command that runs in pre-commit
hooks and CI, and it would send source content off the machine.

**Reimplement Hunspell in Go.** Rejected. Affix compression, compounding, and
suggestion ranking are the hard parts, and no maintained Go implementation
covers them. Results would diverge from `go-svc`, so the same segment could
pass in the CAT editor and fail in CI.

**Embed dictionaries in the binary.** Rejected. 84 MB against release archives
currently a few MB. Dictionaries belong on disk, fetched by manifest.

## Cost

Measured with Hunspell 1.7.2 against the pinned dictionaries, driving pipe mode
from a `CGO_ENABLED=0` Go binary:

| Workload | Cost per word |
|----------|---------------|
| Correctly spelled word | ~2–3 µs (over 300,000 words/sec) |
| Misspelled word, suggestions generated | ~5.7 ms (~175 words/sec) |

Generating suggestions costs more than three orders of magnitude a plain
lookup, and dominates everything else. The fixed cost of starting a checker is
the other term, and it scales with dictionary size:

| Dictionary | Spawn + load + first word |
|------------|---------------------------|
| `en_US` (50k stems) | 29 ms |
| `de_DE_frami` (258k stems) | 56 ms |
| `pl_PL` (349k stems) | 152 ms |
| `pt_BR` (312k stems) | 274 ms |

Three consequences:

- **De-duplicate before checking.** Hunspell does not cache suggestions, so a
  product name repeated 400 times costs 400 suggestion computations. `go-svc`
  already does this in `uniqueWords`; the CLI must too. On a repeated corpus
  de-duplication took a 13,200-word check from 6.6 s to 36 ms.
- **Reuse one process per locale across all files.** At 274 ms for `pt_BR`, a
  subprocess per file or per segment would cost more than the checking. Start
  each locale's checker lazily on first use and keep it for the run.
- **Do not micro-optimize the transport.** Pipelining writes ahead of reads
  measured the same as lock-step (1,980 vs 2,000 words/sec), because the cost
  is inside Hunspell, not the pipe.

If suggestions ever become the bottleneck on a real repository, the next step is
a detection pass with `hunspell -l` (no suggestions) and a second `-a` pass over
only the flagged, de-duplicated words — not a different lookup engine.

## Encoding

Four pinned dictionaries declare legacy 8-bit encodings: `de_DE_frami` and
`id_ID` and `ms_MY` (ISO8859-1), `pl_PL` (ISO8859-2). The `hunspell` binary
reads `SET` and transcodes internally, so with `-i UTF-8` the CLI sends and
receives UTF-8 and needs no transcoding layer. Verified against non-ASCII input
for each: `Straße`, `Grüße`, `Fußgängerübergang` accepted and `Strasze` flagged
for `de-DE`; `żółć`, `wąż`, `źdźbło` accepted for `pl-PL`.

This is a real simplification over the CGO path, which must transcode itself
because it passes Go strings to the C API (`apps/go-svc/internal/hunspell/encoding.go`).

## Pipe protocol

Pipe mode is line-oriented and needs care:

- Skip the version banner on the first line of output.
- Prefix every input line with `^` so a word starting with `*`, `&`, `@`, `#`,
  `~`, `+`, or `-` is not read as a command.
- One result block per input line, terminated by a blank line. `*` and `+` mean
  accepted; `&` carries suggestions after `: `; `#` means rejected with none.
- Hunspell applies its own tokenizer, so a single input word can produce
  several result lines. Treat the word as misspelled if any line rejects it.

## Availability

| Environment | Hunspell | Dictionaries |
|-------------|----------|--------------|
| Sandbox image (`hyperlocalise-sandbox`) | baked in | `/usr/share/hunspell`, `DICPATH` set |
| Managed image + bootstrap | not installed | absent |
| Developer machine | `apt install hunspell` / `brew install hunspell` | opt-in fetch |
| CI | runner-dependent | opt-in fetch |

Only the sandbox image is ready today. Everywhere else the spelling check must
skip rather than fail, mirroring the existing API contract where `go-svc`
reports `spelling` in `skippedModes` (`ErrSpellCheckUnavailable`). A check that
silently downgrades is acceptable; one that fails CI because a machine lacks a
system package is not.

For developer machines, dictionaries should be fetched on demand into a cache
directory (`~/.cache/hyperlocalise/hunspell`) from the same manifest and pinned
commits `fetch-dictionaries.sh` uses, so CLI and service results match. Baking
84 MB into the release archive is not an option.

## Shape

Mirror the `go-svc` seam rather than inventing a second one:

```
internal/i18n/spellcheck/    tokenizer, registry, markup   (shared, exists)
  hunspellexec/              pipe-mode driver              (new, CGO-free)
apps/cli/cmd/check.go        "spelling" check type         (new)
```

`hunspellexec` is a sibling of the CGO wrapper, not a replacement: `go-svc`
keeps linking libhunspell, where a long-lived server amortizes dictionary loads
and avoids a subprocess per request. The CLI gets the subprocess driver. Both
resolve dictionaries through the same registry, so a locale supported in one is
supported in the other.

The check reports `spelling` findings at **warning** severity, alongside
`orphaned_key` and `same_as_source`. Spell checking translated marketing copy
produces false positives on brand names and technical terms, so it must not
fail CI by default. It is also not fixable by `--fix`: retranslating a segment
because a product name is not in a dictionary would corrupt correct
translations.

## Out of scope

- Implementing the check; this ADR settles the approach.
- A custom or per-project word list. Needed before this is pleasant on real
  repositories, but it is a separate design.
- Grammar checking, and the locales `DICTIONARIES.md` lists as unsupported
  (`ja-JP`, `zh-CN`, `zh-TW`, `th-TH`, `en-SG`, `fr-CA`, `tl-PH`).
- Installing Hunspell during sandbox bootstrap for the managed image.
