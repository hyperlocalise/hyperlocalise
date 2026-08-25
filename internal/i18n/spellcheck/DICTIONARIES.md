# Hunspell dictionary manifest

This is the reproducible source-of-truth mapping between the initial
spell-check locale set and the exact Hunspell dictionary files backing each
supported locale. It records *what* dictionary a locale maps to and *why*
that mapping is trusted (source, pinned version, licence, evidence).

## Policy

- A locale is supported in the initial release only when it has an explicit,
  exact, reproducible Hunspell dictionary mapping suitable for the current
  spell-check architecture.
- Dictionary filenames are never derived from the BCP 47 tag (e.g. by
  replacing `-` with `_`); every filename below was verified against the
  actual upstream repository listing.
- No locale fallbacks in the initial release. A locale without an exact
  mapping is unsupported rather than silently pointed at a different
  regional variant or a generic/base-language dictionary.
- Unsupported locales have no dictionary mapping at all.

## Supported locales (20)

All LibreOffice-sourced rows are pinned to
[`LibreOffice/dictionaries`](https://github.com/LibreOffice/dictionaries)
commit `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4`.

| BCP 47 | `.aff` | `.dic` | Source | Pinned version/commit | Licence | Evidence |
|---|---|---|---|---|---|---|
| `de-DE` | `de_DE_frami.aff` | `de_DE_frami.dic` | [LibreOffice/dictionaries `de/`](https://github.com/LibreOffice/dictionaries/tree/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/de) | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | GPL v2 or v3 (igerman98, Björn Jacke) | `de/README_de_DE_frami.txt`, `de/COPYING_GPLv2`, `de/COPYING_GPLv3` |
| `en-AU` | `en_AU.aff` | `en_AU.dic` | [LibreOffice/dictionaries `en/`](https://github.com/LibreOffice/dictionaries/tree/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/en) | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | SCOWL (Kevin Atkinson, permissive) + Ispell-derived affixes | `en/README_en_AU.txt` |
| `en-GB` | `en_GB.aff` | `en_GB.dic` | same `en/` folder | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | LGPL (Kevin Atkinson original; Andrew Brown / David Bartlett affixes) | `en/README_en_GB.txt` |
| `en-US` | `en_US.aff` | `en_US.dic` | same `en/` folder | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | SCOWL (Kevin Atkinson, permissive) + Ispell-derived affixes | `en/README_en_US.txt` |
| `es-AR` | `es_AR.aff` | `es_AR.dic` | [LibreOffice/dictionaries `es/`](https://github.com/LibreOffice/dictionaries/tree/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/es) | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | GPLv3 / LGPLv3 / MPL1.1 (triple-licensed) | `es/LICENSE.md` |
| `es-ES` | `es_ES.aff` | `es_ES.dic` | same `es/` folder | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | GPLv3 / LGPLv3 / MPL1.1 (triple-licensed) | `es/LICENSE.md` |
| `es-MX` | `es_MX.aff` | `es_MX.dic` | same `es/` folder | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | GPLv3 / LGPLv3 / MPL1.1 (triple-licensed) | `es/LICENSE.md` |
| `fr-FR` | `fr.aff` | `fr.dic` | [LibreOffice/dictionaries `fr_FR/dictionaries/`](https://github.com/LibreOffice/dictionaries/tree/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/fr_FR/dictionaries) | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | MPL 2.0 (Grammalecte, Olivier R., v7.7) | `fr_FR/dictionaries/README_dict_fr.txt` |
| `hi-IN` | `hi_IN.aff` | `hi_IN.dic` | [LibreOffice/dictionaries `hi_IN/`](https://github.com/LibreOffice/dictionaries/tree/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/hi_IN) | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | GPL v2 or later (GNU Aspell Hindi Word List, 2005) | `hi_IN/Copyright` |
| `id-ID` | `id_ID.aff` | `id_ID.dic` | [LibreOffice/dictionaries `id/`](https://github.com/LibreOffice/dictionaries/tree/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/id) | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | LGPL-3.0-only (hunspell-id, shuLhan) | `id/README-dict.adoc` |
| `it-IT` | `it_IT.aff` | `it_IT.dic` | [LibreOffice/dictionaries `it_IT/`](https://github.com/LibreOffice/dictionaries/tree/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/it_IT) | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | GPLv3 (LibreItalia, v5.1.1) | `it_IT/README_it_IT.txt` |
| `ko-KR` | `ko_KR.aff` | `ko_KR.dic` | [LibreOffice/dictionaries `ko_KR/`](https://github.com/LibreOffice/dictionaries/tree/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/ko_KR) | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | GPL-3.0 (upstream: [spellcheck-ko/hunspell-dict-ko](https://github.com/spellcheck-ko/hunspell-dict-ko)) | `ko_KR/README_ko_KR.txt` |
| `ms-MY` | `ms_MY.aff` | `ms_MY.dic` | [syafiqhadzir/hunspell-ms](https://github.com/syafiqhadzir/hunspell-ms) | tag `v2.01e`, commit `d8b98cfc76ff54d620d5acd068704f86d8314208` | LGPL-3.0-only | `LICENSE-dict` (manually verified per HL-596) |
| `nl-NL` | `nl_NL.aff` | `nl_NL.dic` | [LibreOffice/dictionaries `nl_NL/`](https://github.com/LibreOffice/dictionaries/tree/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/nl_NL) (upstream: [OpenTaal/opentaal-hunspell](https://github.com/OpenTaal/opentaal-hunspell)) | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | Revised BSD (3-clause) and/or CC BY 3.0, user's choice | `nl_NL/LICENSE.txt` |
| `pl-PL` | `pl_PL.aff` | `pl_PL.dic` | [LibreOffice/dictionaries `pl_PL/`](https://github.com/LibreOffice/dictionaries/tree/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/pl_PL) | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | GPL2 / LGPL2.1 / MPL1.1 / Apache2.0 / CC BY 4.0 (multi-licensed, sjp.pl) | `pl_PL/README_pl_PL.txt` |
| `pt-BR` | `pt_BR.aff` | `pt_BR.dic` | [LibreOffice/dictionaries `pt_BR/`](https://github.com/LibreOffice/dictionaries/tree/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/pt_BR) | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | LGPLv3 + MPL (VERO project, Raimundo Moura) | `pt_BR/README_pt_BR.txt` |
| `pt-PT` | `pt_PT.aff` | `pt_PT.dic` | [LibreOffice/dictionaries `pt_PT/`](https://github.com/LibreOffice/dictionaries/tree/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/pt_PT) | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | GPL and BSD (dual, Universidade do Minho) | `pt_PT/LICENSES.txt` |
| `sv-SE` | `sv_SE.aff` | `sv_SE.dic` | [LibreOffice/dictionaries `sv_SE/dictionaries/`](https://github.com/LibreOffice/dictionaries/tree/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/sv_SE/dictionaries) | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | LGPLv3 | `sv_SE/LICENSE_sv_SE.txt` |
| `tr-TR` | `tr_TR.aff` | `tr_TR.dic` | [LibreOffice/dictionaries `tr_TR/`](https://github.com/LibreOffice/dictionaries/tree/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/tr_TR) | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | MPL 2.0 | `tr_TR/LICENSE` |
| `vi-VN` | `vi_VN.aff` | `vi_VN.dic` | [LibreOffice/dictionaries `vi/`](https://github.com/LibreOffice/dictionaries/tree/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/vi) | `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | GPLv2 | `vi/LICENSES-en.txt` |

### Notable non-obvious filenames

Two mappings deliberately do not follow a `locale.replace('-', '_') + '.aff'`
pattern; verify against this table:

- `de-DE` → `de_DE_frami.aff` / `de_DE_frami.dic` (not `de_DE.aff`).
- `fr-FR` → `fr.aff` / `fr.dic` (not `fr_FR.aff`), located under the nested
  `fr_FR/dictionaries/` path.
- `sv-SE` → `sv_SE.aff` / `sv_SE.dic` are also nested, under
  `sv_SE/dictionaries/`, alongside an unrelated `sv_FI.aff`/`sv_FI.dic` pair
  that is not part of this manifest.

## Unsupported for the initial release (7)

These locales have **no** dictionary mapping.

| Locale | Reason |
|---|---|
| `en-SG` | No exact `en-SG` dictionary exists from any authoritative source. Per policy, this is not silently mapped to `en-GB` or any other variant. |
| `fr-CA` | No exact `fr-CA` dictionary exists from any authoritative source. Per policy, this is not silently mapped to `fr-FR` or generic French. |
| `ja-JP` | No suitable general-purpose Hunspell dictionary exists; Japanese has no whitespace word boundaries and Hunspell's own maintainers consider the architecture unsuited to it ([hunspell/hunspell#502](https://github.com/hunspell/hunspell/issues/502)). |
| `zh-CN` | No suitable general-purpose Hunspell dictionary exists, for the same word-boundary reason as `ja-JP`. |
| `zh-TW` | No suitable general-purpose Hunspell dictionary exists, for the same word-boundary reason as `ja-JP`. |
| `th-TH` | A dictionary exists (`th_TH.aff`/`th_TH.dic`, LibreOffice `th_TH/`), but correct checking requires a word-segmentation step (Thai has no inter-word spaces) that the current spell-check architecture does not provide. |
| `tl-PH` | Only a legacy 2005 dictionary was identified (via the original OpenOffice.org contrib archive), with no acceptable current, reproducible, git-hosted upstream source. |

Future fallback support for `en-SG` and `fr-CA` (or a segmentation step for
`th-TH`) may be considered in a later release.

## API behavior for unsupported locales

When spelling is requested for a locale with no dictionary mapping, spelling
is not executed for that request, and `spelling` is reported in the
response's `skippedModes` list. This is a description of the intended
contract, not new behavior implemented by this change: the API contract for
an unavailable spell-check capability already reports `spelling` in
`skippedModes` (see `ErrSpellCheckUnavailable` handling in
[`apps/go-svc/handler.go`](../../../apps/go-svc/handler.go) and
[`apps/go-svc/spellcheck.go`](../../../apps/go-svc/spellcheck.go)).
