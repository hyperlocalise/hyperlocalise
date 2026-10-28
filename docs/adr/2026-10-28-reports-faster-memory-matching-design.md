# Reports faster memory matching

**Status:** Accepted

Speeds up the in-memory matching of [Reports capture rework](./2026-10-20-reports-capture-rework-design.md) without changing any score.

## Context

Reports scores every string of a task against the project's approved memory entries for each language, to put it in a match band. A task for people is analysed one language per workflow step, and a step has about 800 seconds.

The cost per string grew in step with the memory:

- Each string counted shared character bigrams for about 85% of all entries, since common pairs ("e ", "th") are in most sentences. Only about half of those are between half and twice the string's length, the only ones that can reach the lowest band.
- On long strings (paragraphs) most of the time went to edit distance over the 64 candidates, each a full table.

Locally, a proofread task of 2,000 strings into one language, against 303,844 entries, took 156 s to analyse.

## Decision

- Entries are numbered in length order. Each bigram's entry ids are a typed array in that order, so a string binary-searches each list to the entries of a comparable length. Shared bigrams are counted in a typed array reused across strings.
- Short entries keep their distinct characters, for the shared-character ranking of short strings.
- Candidates are compared in order of the highest score their difference in length allows. A candidate whose cap is no higher than the best score so far is skipped. A shared start and end are dropped before the edit distance. The table stops once a row's lowest value is above the largest distance that would still beat the best.
- Every score stays the same, so `algorithm_version` does not change and no analysis is redone. A test checks the index and the scan against the matching rules written out plainly, on seeded random memories.

## Consequences

Milliseconds per string, before and after, on a Mac:

| Memory | Before | After |
|---|---|---|
| The app's English UI strings (15,027) | 3.05 | 0.31 |
| The repo's docs lines (13,883) | 4.33 | 0.56 |
| The app's Japanese UI strings (6,803) | 0.36 | 0.06 |
| Made-up English (190,299) | 32.4 | 2.25 |
| Made-up English (567,827, two slices) | 111 | 8.5 |
| Made-up Japanese (293,247) | 3.54 | 0.79 |
| Made-up paragraphs (100,000) | 205 | 13.8 |

- Made-up text follows the word or character frequencies and lengths of the app's strings and docs.
- The task above takes 16 s instead of 156 s, with the same score for every string.
- Building the index takes as long as before, and its heap is about a fifth (67 MB instead of 301 MB for 567,827 entries).
- The cost per string still grows with the memory, more slowly. A minimum match of 70% (the Trados default) would allow stronger filters, but it changes what Reports counts.
