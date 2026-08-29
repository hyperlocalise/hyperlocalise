#!/usr/bin/env bash
# Exercises fetch-dictionaries.sh --normalize-header against the same cases
# as parseDicWordCount in apps/go-svc/internal/hunspell/encoding.go.
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/fetch-dictionaries.sh"
fail=0

assert_header() {
    local name="$1" input="$2" want="$3"
    local dir file got
    dir="$(mktemp -d)"
    file="$dir/test.dic"
    printf '%s' "$input" >"$file"
    if ! bash "$SCRIPT" --normalize-header "$file" >/dev/null; then
        echo "FAIL $name: normalize rejected a parseable header"
        fail=$((fail + 1))
        rm -rf "$dir"
        return
    fi
    got="$(head -n1 "$file" | sed -e '1s/^\xEF\xBB\xBF//' | tr -d '\r')"
    if [ "$got" != "$want" ]; then
        echo "FAIL $name: header='$got' want='$want'"
        fail=$((fail + 1))
    else
        echo "ok   $name"
    fi
    rm -rf "$dir"
}

assert_rejects() {
    local name="$1" input="$2"
    local dir file
    dir="$(mktemp -d)"
    file="$dir/test.dic"
    printf '%s' "$input" >"$file"
    if bash "$SCRIPT" --normalize-header "$file" >/dev/null 2>&1; then
        echo "FAIL $name: expected reject"
        fail=$((fail + 1))
    else
        echo "ok   $name"
    fi
    rm -rf "$dir"
}

assert_header already-numeric $'2\nhello\n' 2
assert_header hash-prefix $'#2\nhello\n' 2
assert_header hash-space $'# 30975\nhello\n' 30975
assert_header trailing-comment $'12 extra\nhello\n' 12
assert_rejects non-numeric $'notanumber\nhello\n'
assert_rejects hash-words $'#words\nhello\n'

# BOM + '#2' must keep the BOM and rewrite the count.
bom_dir="$(mktemp -d)"
printf '\xEF\xBB\xBF#2\nhello\n' >"$bom_dir/test.dic"
bash "$SCRIPT" --normalize-header "$bom_dir/test.dic" >/dev/null
if [ "$(od -An -tx1 -N3 "$bom_dir/test.dic" | tr -d ' \n')" != "efbbbf" ]; then
    echo "FAIL bom-kept: missing UTF-8 BOM"
    fail=$((fail + 1))
else
    got="$(tail -c +4 "$bom_dir/test.dic" | head -n1 | tr -d '\r')"
    if [ "$got" != "2" ]; then
        echo "FAIL bom-kept: header='$got' want='2'"
        fail=$((fail + 1))
    else
        echo "ok   bom-kept"
    fi
fi
rm -rf "$bom_dir"

echo
if [ "$fail" -ne 0 ]; then
    echo "${fail} failed"
    exit 1
fi
echo "all passed"
