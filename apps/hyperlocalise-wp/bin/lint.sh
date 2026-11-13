#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

status=0
while IFS= read -r -d '' file; do
    if ! output="$(php -l "$file" 2>&1)"; then
        echo "$output"
        status=1
    fi
done < <(find . \( -path ./vendor -o -path ./build \) -prune -o -name '*.php' -print0)

if [ "$status" -eq 0 ]; then
    echo "No syntax errors found."
fi

exit "$status"
