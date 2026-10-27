#!/usr/bin/env bash
# Builds build/hyperlocalise-{version}.zip for upload to WordPress or WordPress.org.
# Pass the expected version (for example from a release tag) to fail when files disagree.
set -euo pipefail

cd "$(dirname "$0")/.."

SLUG="hyperlocalise"
EXPECTED_VERSION="${1:-}"

header_version="$(sed -n 's/^ \* Version:[[:space:]]*//p' hyperlocalise.php | head -n 1)"
constant_version="$(sed -n "s/^define('HYPERLOCALISE_VERSION', '\(.*\)');/\1/p" hyperlocalise.php)"
stable_tag="$(sed -n 's/^Stable tag:[[:space:]]*//p' readme.txt)"

if [ -z "$header_version" ] || [ "$header_version" != "$constant_version" ] || [ "$header_version" != "$stable_tag" ]; then
    echo "Version mismatch: header=$header_version constant=$constant_version readme=$stable_tag" >&2
    exit 1
fi

if [ -n "$EXPECTED_VERSION" ] && [ "$EXPECTED_VERSION" != "$header_version" ]; then
    echo "Expected version $EXPECTED_VERSION but the plugin declares $header_version" >&2
    exit 1
fi

rm -rf build
mkdir -p "build/$SLUG"
rsync -a --exclude-from=.distignore ./ "build/$SLUG/"

zip_path="build/$SLUG-$header_version.zip"
(cd build && zip -qr "$SLUG-$header_version.zip" "$SLUG")

echo "Built $zip_path"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
    {
        echo "version=$header_version"
        echo "zip-path=apps/hyperlocalise-wp/$zip_path"
        echo "build-dir=apps/hyperlocalise-wp/build/$SLUG"
    } >> "$GITHUB_OUTPUT"
fi
