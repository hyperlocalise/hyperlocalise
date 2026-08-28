#!/usr/bin/env bash
# Smoke-test the Hunspell layer of the sandbox image.
#
#   docker run --rm -v "$PWD/apps/sandbox-image/verify-hunspell.sh:/verify.sh:ro" \
#     hyperlocalise-sandbox:local bash /verify.sh
#
# Checks, for every locale in internal/i18n/spellcheck/DICTIONARIES.md:
#   1. the .aff/.dic pair is readable by the sandbox user,
#   2. Hunspell reports the pair under "LOADED DICTIONARY",
#   3. the word list is non-empty (a real word is accepted and nonsense is not),
# where step 3 uses words sampled from the dictionary itself so the check works
# for Latin, Devanagari and Hangul alike.
set -uo pipefail

DICT_DIR="${DICT_DIR:-/usr/share/hunspell}"

# BCP 47 -> dictionary basename, mirroring internal/i18n/spellcheck/registry.go.
LOCALES="
de-DE:de_DE_frami
en-AU:en_AU
en-GB:en_GB
en-US:en_US
es-AR:es_AR
es-ES:es_ES
es-MX:es_MX
fr-FR:fr
hi-IN:hi_IN
id-ID:id_ID
it-IT:it_IT
ko-KR:ko_KR
ms-MY:ms_MY
nl-NL:nl_NL
pl-PL:pl_PL
pt-BR:pt_BR
pt-PT:pt_PT
sv-SE:sv_SE
tr-TR:tr_TR
vi-VN:vi_VN
"

echo "=== environment ==="
echo "user     : $(id -un) (uid $(id -u))"
echo "hunspell : $(hunspell -vv 2>&1 | head -n1)"
echo "DICPATH  : ${DICPATH:-<unset>}"
echo "dict dir : ${DICT_DIR}"

echo
printf '%-8s %-16s %-10s %-8s %-9s %s\n' LOCALE DICTIONARY ENCODING STEMS LOADED "WORD LIST"

pass=0
fail=0
for entry in $LOCALES; do
    bcp47="${entry%%:*}"
    dict="${entry##*:}"
    aff="${DICT_DIR}/${dict}.aff"
    dic="${DICT_DIR}/${dict}.dic"

    if [ ! -r "$aff" ] || [ ! -r "$dic" ]; then
        printf '%-8s %-16s %s\n' "$bcp47" "$dict" "FAIL: .aff/.dic not readable"
        fail=$((fail + 1))
        continue
    fi

    encoding="$(sed -e '1s/^\xEF\xBB\xBF//' "$aff" | grep -m1 -a '^SET' | tr -d '\r' | awk '{print $2}')"
    header="$(head -n1 "$dic" | sed -e '1s/^\xEF\xBB\xBF//' | tr -d '\r')"

    if hunspell -d "$dict" -D </dev/null 2>&1 | sed -n '/LOADED DICTIONARY/,$p' | grep -qF "$aff"; then
        loaded="yes"
    else
        loaded="NO"
    fi

    # A word taken from the dictionary must be accepted, and a same-script
    # nonsense word must be flagged. An empty word list -- Hunspell's silent
    # failure mode when it cannot parse the .dic header -- fails both.
    #
    # Strip affix flags and morphology, keep stems of at least five characters
    # so the nonsense word below cannot be a real word, and let Hunspell pick
    # the first stem it accepts (bare stems may require an affix).
    sample="$(awk 'NR > 1 {
            sub(/\/.*$/, ""); sub(/\t.*$/, "");
            gsub(/^[ \t]+|[ \t]+$/, "");
            if ($0 != "" && $0 !~ /[ 0-9._-]/) print
        }' "$dic" \
        | grep -E '^.{5,}$' \
        | hunspell -i UTF-8 -d "$dict" -G 2>/dev/null \
        | head -n1)"

    if [ -z "$sample" ]; then
        wordlist="FAIL: empty word list"
    else
        # Repeat the final character; bash string ops are character-based under
        # a UTF-8 locale, so this stays in-script for Hangul and Devanagari.
        last="${sample: -1}"
        nonsense="${sample}${last}${last}${last}${last}"
        if [ -n "$(printf '%s\n' "$nonsense" | hunspell -i UTF-8 -d "$dict" -l 2>/dev/null)" ]; then
            wordlist="ok (accepts ${sample}, flags ${nonsense})"
        else
            wordlist="FAIL: accepts ${nonsense}"
        fi
    fi

    printf '%-8s %-16s %-10s %-8s %-9s %s\n' \
        "$bcp47" "$dict" "$encoding" "$header" "$loaded" "$wordlist"

    case "${loaded}|${wordlist}" in
        yes\|ok*) pass=$((pass + 1)) ;;
        *) fail=$((fail + 1)) ;;
    esac
done

echo
echo "=== licence evidence ==="
echo "locales with licence files : $(find /usr/share/doc/hunspell-dictionaries -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)"
echo "licence files total        : $(find /usr/share/doc/hunspell-dictionaries -type f 2>/dev/null | wc -l)"

echo
echo "=== result: ${pass} locale(s) verified, ${fail} failed ==="
[ "$fail" -eq 0 ]
