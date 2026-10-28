# Reports faster memory matching

**Status:** Accepted

Speeds up the in-memory matching of [Reports capture rework](./2026-10-20-reports-capture-rework-design.md) without changing any score.

## Context

Reports scores every string of a task against the project's approved memory entries for each language, to put it in a match band. A task for people is analysed one language per workflow step, so each language must fit in one function run.

Two costs dominated:

- On made-up English, each string counted shared character bigrams for about 85% of all entries, since common pairs ("e ", "th") are in most sentences. Only about half of those are between half and twice the string's length, the only ones that can reach the lowest band. This cost grew in step with the memory.
- On long strings, the edit distance over the 64 candidates, each a full table, took most of the time instead: about two thirds against 20,000 paragraphs.

Locally, a proofread task of 2,000 strings into one language, against 303,844 entries, took 156 s to analyse.

## Decision

- Entries are numbered in length order, so each bigram's list of entry ids is in length order too. A string binary-searches each list to the entries of a comparable length, and counts shared bigrams in a typed array reused across strings.
- Candidates are compared in order of the highest score their difference in length allows. A candidate whose cap is no higher than the best score so far is skipped. A shared start and end are dropped before the edit distance, and the table stops once a row's lowest value can no longer beat the best.
- The index keeps the same lists as before, with no copies, so it needs no more memory, either kept or while it is built.
- Every score stays the same, so `algorithm_version` does not change and no analysis is redone. A test checks the index and the scan against the matching rules written out plainly, on seeded random memories.

## Alternatives considered

- **Each bigram's ids in a typed array:** no faster. While the index was built it needed up to twice the memory, enough to fail on made-up Chinese text with very many distinct pairs where the plain lists fit.
- **Keeping short entries' distinct characters for short strings:** took about a third less time on large Japanese memories, but it adds memory and code to save under a second per language. Joined into one string, they also changed scores for text with lone surrogates.
- **A minimum match of 70%** (the Trados default) would allow stronger filters, but it changes what Reports counts.
- **A bit-parallel edit distance** (Myers) would speed up long segments, now the slowest case (below). It needs about 80 lines that must work on code points, and is not part of this change.

## Consequences

Milliseconds per string, before and after, median of three runs on a Mac:

| Memory | Before | After |
|---|---|---|
| The app's English UI strings (15,027) | 2.98 | 0.30 |
| The repo's docs lines (13,883) | 4.23 | 0.56 |
| The app's Japanese UI strings (6,803) | 0.36 | 0.07 |
| Made-up English (190,299) | 31.8 | 2.13 |
| Made-up English (567,827, two slices) | 110 | 8.2 |
| Made-up Japanese (293,247) | 3.48 | 1.25 |
| Made-up Chinese with very many distinct pairs (299,924) | 5.5 | 4.9 |
| Made-up paragraphs (100,000) | 205 | 13.8 |
| Made-up sections of 600 to 1,700 characters, nothing close (20,000) | 723 | 268 |

- Made-up text follows the word or character frequencies and lengths of the app's strings and docs.
- The task above takes 15 s instead of 156 s, with the same score for every string.
- Building the index takes as long as before and keeps about as much memory: 139 MB instead of 151 MB for 283,844 made-up English entries.
- Long segments with nothing close in the memory stay slow, since the edit distance grows with the square of their length. Sections of 1,000 to 3,500 characters take about 1 s per string (2.7 s before), so a language of 2,000 such strings still cannot finish in one function run.
- The cost per string still grows with the memory, more slowly.
