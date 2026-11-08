#!/usr/bin/env bash
# Draft PR Vitest selection: git diff test files + importers, not vitest --changed
# (hub modules such as managed-model-ids.ts fan out to most of the suite).
set -euo pipefail

if [ -z "${VITEST_CHANGED_SINCE:-}" ]; then
  echo "VITEST_CHANGED_SINCE is required" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

mapfile -t TEST_FILES < <(
  {
    git diff --name-only "${VITEST_CHANGED_SINCE}"...HEAD -- 'apps/hyperlocalise-web/src/**/*.test.ts' 'apps/hyperlocalise-web/src/**/*.test.tsx'
    while IFS= read -r rel; do
      rel="${rel#apps/hyperlocalise-web/}"
      if [[ "$rel" == *.ts && "$rel" != *.test.ts ]]; then
        printf '%s\n' "${rel%.ts}.test.ts"
      elif [[ "$rel" == *.tsx && "$rel" != *.test.tsx ]]; then
        printf '%s\n' "${rel%.tsx}.test.tsx"
      fi
    done < <(
      git diff --name-only "${VITEST_CHANGED_SINCE}"...HEAD -- 'apps/hyperlocalise-web/src/**/*.ts' 'apps/hyperlocalise-web/src/**/*.tsx' |
        grep -Ev '\.(test|stories)\.'
    )
    while IFS= read -r rel; do
      rel="${rel#apps/hyperlocalise-web/}"
      rel="${rel%.*}"
      git grep -l "${rel#src/}" src -- '*.test.ts' '*.test.tsx' || true
    done < <(
      git diff --name-only "${VITEST_CHANGED_SINCE}"...HEAD -- 'apps/hyperlocalise-web/src/**/*.ts' 'apps/hyperlocalise-web/src/**/*.tsx' |
        grep -Ev '\.(test|stories)\.'
    )
  } | sed 's|^apps/hyperlocalise-web/||' | while IFS= read -r file; do
    if [ -f "$file" ]; then
      printf '%s\n' "$file"
    fi
  done | sort -u
)

if [ "${#TEST_FILES[@]}" -gt 0 ]; then
  echo "Running ${#TEST_FILES[@]} test file(s) from the PR diff"
  exec vp test "${TEST_FILES[@]}"
fi

echo "No test files in diff; falling back to vitest --changed"
exec vp test --changed "${VITEST_CHANGED_SINCE}" --passWithNoTests
