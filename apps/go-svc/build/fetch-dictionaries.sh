#!/usr/bin/env bash
# Stages the approved Hunspell dictionaries and licence evidence.
# DICTIONARIES.md is the source of truth for supported locales and files.
#
# Usage: fetch-dictionaries.sh <repo-root> <dict-staging-dir> <licence-staging-dir>
set -euo pipefail

REPO_ROOT="${1:?repo root required}"
STAGE_DICT="${2:?dictionary staging dir required}"
STAGE_LICENSE="${3:?licence staging dir required}"
MANIFEST="${REPO_ROOT}/internal/i18n/spellcheck/DICTIONARIES.md"

# Commit pins select the upstream snapshots; checksums verify downloaded content.
LIBREOFFICE_COMMIT="32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4"
LIBREOFFICE_SHA256="cbd790eca560de5e8ec8bd64117a00dfd0bc06b091c8f52d23e44ea00d3e8461"
HUNSPELL_MS_COMMIT="d8b98cfc76ff54d620d5acd068704f86d8314208"
HUNSPELL_MS_SHA256="1929c3f0e8b36042b70ea035d4c5714ef2a07c29ab9728fd70b62e72f4102340"

if [ ! -f "$MANIFEST" ]; then
    echo "fetch-dictionaries: manifest not found at $MANIFEST" >&2
    exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$STAGE_DICT" "$STAGE_LICENSE"

fetch_and_verify() {
    local url="$1" sha="$2" dest="$3"
    curl -fsSL -o "$dest" "$url"
    echo "${sha}  ${dest}" | sha256sum -c -
}

echo "fetch-dictionaries: downloading LibreOffice/dictionaries@${LIBREOFFICE_COMMIT}"
fetch_and_verify \
    "https://github.com/LibreOffice/dictionaries/archive/${LIBREOFFICE_COMMIT}.tar.gz" \
    "$LIBREOFFICE_SHA256" \
    "$WORK/libreoffice.tar.gz"
tar -xzf "$WORK/libreoffice.tar.gz" -C "$WORK"
LIBRE_ROOT="$WORK/dictionaries-${LIBREOFFICE_COMMIT}"

echo "fetch-dictionaries: downloading syafiqhadzir/hunspell-ms@${HUNSPELL_MS_COMMIT}"
fetch_and_verify \
    "https://github.com/syafiqhadzir/hunspell-ms/archive/${HUNSPELL_MS_COMMIT}.tar.gz" \
    "$HUNSPELL_MS_SHA256" \
    "$WORK/hunspell-ms.tar.gz"
tar -xzf "$WORK/hunspell-ms.tar.gz" -C "$WORK"
MS_ROOT="$WORK/hunspell-ms-${HUNSPELL_MS_COMMIT}"

# Parse the supported-locales table directly to avoid a duplicate manifest.
rows="$(awk -v libre_commit="$LIBREOFFICE_COMMIT" -v ms_commit="$HUNSPELL_MS_COMMIT" '
    BEGIN { FS = "|" }
    /^## Supported locales/ { intable = 1; next }
    intable && /^## / { intable = 0 }
    intable && /^\| `/ {
        bcp47 = $2; aff = $3; dic = $4; pinned = $6; evidence = $8
        gsub(/^[ \t]+|[ \t]+$/, "", bcp47); gsub(/`/, "", bcp47)
        gsub(/^[ \t]+|[ \t]+$/, "", aff);   gsub(/`/, "", aff)
        gsub(/^[ \t]+|[ \t]+$/, "", dic);   gsub(/`/, "", dic)
        gsub(/^[ \t]+|[ \t]+$/, "", evidence); gsub(/`/, "", evidence)
        if (pinned ~ ms_commit)         repo = "hunspell-ms"
        else if (pinned ~ libre_commit) repo = "libreoffice"
        else                            repo = "unknown"
        print bcp47 "\t" aff "\t" dic "\t" evidence "\t" repo
    }
' "$MANIFEST")"

if [ -z "$rows" ]; then
    echo "fetch-dictionaries: no locale rows parsed from $MANIFEST; manifest format changed?" >&2
    exit 1
fi

# Ensure partial manifest parsing cannot silently omit locales.
declared_count="$(grep -m1 -oE '^## Supported locales \([0-9]+\)' "$MANIFEST" | grep -oE '[0-9]+')"
parsed_count=$(($(wc -l <<<"$rows")))
if [ -z "$declared_count" ]; then
    echo "fetch-dictionaries: could not read declared locale count from '## Supported locales (N)' heading; manifest format changed?" >&2
    exit 1
fi
if [ "$parsed_count" -ne "$declared_count" ]; then
    echo "fetch-dictionaries: parsed ${parsed_count} row(s) but manifest heading declares ${declared_count}; manifest format changed?" >&2
    exit 1
fi

missing=0

while IFS=$'\t' read -r bcp47 aff dic evidence_csv repo; do
    case "$repo" in
        hunspell-ms) root="$MS_ROOT" ;;
        libreoffice) root="$LIBRE_ROOT" ;;
        *)
            echo "fetch-dictionaries: unknown repo '$repo' for $bcp47" >&2
            missing=$((missing + 1))
            continue
            ;;
    esac

    aff_src="$(find "$root" -type f -name "$aff")"
    dic_src="$(find "$root" -type f -name "$dic")"

    if [ -z "$aff_src" ] || [ "$(wc -l <<<"$aff_src")" -ne 1 ]; then
        echo "fetch-dictionaries: expected exactly one '$aff' under $root for $bcp47, found: ${aff_src:-none}" >&2
        missing=$((missing + 1))
        continue
    fi
    if [ -z "$dic_src" ] || [ "$(wc -l <<<"$dic_src")" -ne 1 ]; then
        echo "fetch-dictionaries: expected exactly one '$dic' under $root for $bcp47, found: ${dic_src:-none}" >&2
        missing=$((missing + 1))
        continue
    fi

    cp "$aff_src" "$STAGE_DICT/$aff"
    cp "$dic_src" "$STAGE_DICT/$dic"

    # Hunspell reads the first .dic line as the word count and loads an empty
    # word list when it cannot parse one, which silently flags every word in
    # that locale. ms_MY ships "#30975"; drop a leading '#' when the rest is a
    # bare integer, then require a numeric header so a future dictionary with a
    # different malformed count fails the build instead of shipping empty.
    header="$(head -n1 "$STAGE_DICT/$dic" | sed -e '1s/^\xEF\xBB\xBF//' | tr -d '\r')"
    if [[ "$header" =~ ^#([0-9]+)$ ]]; then
        echo "fetch-dictionaries: normalizing '$dic' word-count header '$header' -> '${BASH_REMATCH[1]}'"
        sed -i '1s/^\(\xEF\xBB\xBF\)\{0,1\}#/\1/' "$STAGE_DICT/$dic"
        header="${BASH_REMATCH[1]}"
    fi
    if ! [[ "$header" =~ ^[0-9]+$ ]]; then
        echo "fetch-dictionaries: '$dic' has a non-numeric word-count header '$header'; Hunspell would load zero words for $bcp47" >&2
        missing=$((missing + 1))
        continue
    fi

    license_dir="$STAGE_LICENSE/$bcp47"
    mkdir -p "$license_dir"
    IFS=',' read -ra evidence_files <<<"$evidence_csv"
    for raw in "${evidence_files[@]}"; do
        # Strip parenthetical manifest notes from licence evidence paths.
        ev="$(sed -E 's/\([^)]*\)//g' <<<"$raw" | xargs)"
        ev_src="$root/$ev"
        if [ ! -f "$ev_src" ]; then
            echo "fetch-dictionaries: evidence file '$ev' not found at $ev_src for $bcp47" >&2
            missing=$((missing + 1))
            continue
        fi
        cp "$ev_src" "$license_dir/$(basename "$ev")"
    done
done <<<"$rows"

echo "fetch-dictionaries: staged ${parsed_count} locale(s) from manifest"

if [ "$missing" -gt 0 ]; then
    echo "fetch-dictionaries: FAILED - ${missing} manifest-listed file(s) could not be staged" >&2
    exit 1
fi
