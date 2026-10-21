# Hyperlocalise for WordPress

A WordPress plugin that sends posts and pages to Hyperlocalise for translation and saves the results as translations in **WPML** or **Polylang**.

Hyperlocalise does not store languages or translation relationships itself. The site's multilingual plugin keeps owning URLs, language switchers, hreflang, menus, and SEO. This plugin only reads and writes content through that plugin's public API.

## How it works

1. An editor selects **Send for translation** in the Hyperlocalise box on the post screen, or the **Send to Hyperlocalise** bulk action on the posts list.
2. The plugin builds one flat JSON source file per post and uploads it to the project with `POST /api/v1/files`. The file is stored at `wordpress/{site-host}/{post-type}/{post-id}.json`.
3. It creates a file job with `POST /api/v1/jobs`. The job targets every site language that maps to a project target locale.
4. WP-Cron checks running jobs every five minutes through `GET https://api.hyperlocalise.com/v1/jobs/{id}/status`. Editors can also select **Check status**.
5. When the job is ready, the plugin downloads each locale with `GET /api/v1/projects/{id}/translations/download`. It writes the result into the multilingual plugin's translation of the post.

Write-back rules:

- New translations are created as **drafts** and linked to the source post.
- Existing draft or pending translations are updated.
- Published translations are kept unchanged unless **Overwrite published translations** is enabled.
- The featured image and page template are copied when a translation is created.

### What gets translated

| Source | Segment key |
| --- | --- |
| Title | `title` |
| Excerpt | `excerpt` |
| Block content, per text fragment of each block, split on blank lines | `content.{block-path}.{part}.{chunk}` |
| Configured custom fields with string values | `meta.{meta_key}` |

Block comments and attributes are never sent. A block's inner HTML is sent with its inline markup, such as `<strong>` and links. Code, embed, and shortcode blocks are skipped. Classic-editor content is split into paragraphs on blank lines.

## Requirements

- WordPress 6.2 or later, PHP 7.4 or later
- WPML or Polylang, with languages configured
- A native Hyperlocalise project. TMS-backed projects are not supported yet.
- A Hyperlocalise **personal access token** with `files:read`, `files:write`, `jobs:read`, and `jobs:write`. Job reads and project discovery use the public API host, which accepts personal access tokens.

## Setup

1. Copy `apps/hyperlocalise-wp` to `wp-content/plugins/hyperlocalise` and activate **Hyperlocalise**.
2. Open **Settings → Hyperlocalise**.
3. Paste the personal access token, or define it in `wp-config.php`:

    ```php
    define('HYPERLOCALISE_API_KEY', 'hl_...');
    ```

4. Choose the project. The **Languages** table shows how each site language maps to a project locale.
5. If a site language does not map automatically, add an override such as `pt = pt-BR`.

Language matching tries, in order:

1. An explicit override.
2. The WordPress locale (`fr_FR` matches `fr-FR`).
3. The language code.
4. A unique project locale with the same base language.

The language whose locale matches the project source locale is the source. Only posts in that language can be sent.

## Extending

| Hook | Type | Use |
| --- | --- | --- |
| `hyperlocalise_translatable_meta_keys` | filter | Add or remove custom field keys at runtime |
| `hyperlocalise_skipped_blocks` | filter | Block names whose content is never sent |
| `hyperlocalise_source_segments` | filter | Add or change segments for a post, for example page-builder data |
| `hyperlocalise_source_path` | filter | Change the Hyperlocalise source path for a post |
| `hyperlocalise_multilingual_adapters` | filter | Register another multilingual plugin by implementing `Hyperlocalise\WordPress\Multilingual\Adapter` |
| `hyperlocalise_translation_saved` | action | Runs after a translation is saved. Use it to copy translated values into custom storage. |

## Known limitations

- Block attributes are not translated. This covers image `alt` text and button text that a block stores only in attributes.
- Taxonomies, menus, and theme strings are not translated. Use the multilingual plugin's own sync settings for those.
- The bulk action sends at most 20 posts per request.
- WPML support uses WPML's documented hooks. The Playground smoke test covers it only through Polylang, because WPML is commercial.

## Development

```sh
cd apps/hyperlocalise-wp
composer install
composer lint      # php -l on every file
composer analyse   # PHPStan level 6 with WordPress stubs
composer test      # unit tests for segmentation and locale matching
composer build     # build/hyperlocalise-{version}.zip, without dev files
```

CI (`.github/workflows/wordpress-plugin.yml`) runs on pull requests that touch this folder:

- Lint and unit tests on PHP 7.4 and 8.4.
- PHPStan.
- The Playground smoke test (skipped on draft pull requests).
- A build of the installable zip, uploaded as a workflow artifact.

### End-to-end smoke test

The smoke test runs WordPress with Polylang in [WordPress Playground](https://wordpress.github.io/wordpress-playground/). A must-use plugin (`tests/playground/mock-hyperlocalise-api.php`) answers Hyperlocalise API requests.

```sh
npx @wp-playground/cli@latest run-blueprint \
  --blueprint=tests/playground/smoke.blueprint.json \
  --mount=.:/wordpress/wp-content/plugins/hyperlocalise-wp
cat tests/playground/smoke-output.txt
```

To try the plugin by hand against the same mock:

```sh
npx @wp-playground/cli@latest server \
  --blueprint=tests/playground/blueprint.json \
  --mount=.:/wordpress/wp-content/plugins/hyperlocalise-wp
```

The mock accepts the token `hl_test_key` and project `project_1`. It returns French translations that swap a few English words and has no German translations. Sign in with `admin` / `password`.

## Releasing

1. Bump the version in three places: the `Version:` header and `HYPERLOCALISE_VERSION` in `hyperlocalise.php`, and `Stable tag:` in `readme.txt`. Add a changelog entry to `readme.txt`.
2. Merge, then push a tag such as `wordpress-plugin-v0.2.0`.
3. `.github/workflows/wordpress-plugin-release.yml` tests the plugin and builds the zip. It fails if the tag and the files disagree. It then publishes a GitHub release with `hyperlocalise-{version}.zip` attached.
4. When the `WORDPRESS_ORG_DEPLOY` repository variable is `true`, the same workflow commits the build to the WordPress.org SVN repository. That requires the `WORDPRESS_ORG_SVN_USERNAME` and `WORDPRESS_ORG_SVN_PASSWORD` secrets. Directory banners and icons go in `.wordpress-org/`.

The first WordPress.org submission is manual: upload the zip at [wordpress.org/plugins/developers/add](https://wordpress.org/plugins/developers/add/) and wait for review. Enable the SVN deploy after the `hyperlocalise` slug is approved.

## License

GPL-2.0-or-later, as required for plugins distributed through WordPress.org. See [`LICENSE`](./LICENSE).
