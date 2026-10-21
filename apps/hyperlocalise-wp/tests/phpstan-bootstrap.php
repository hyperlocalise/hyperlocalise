<?php
// Loaded by PHPStan only. Declares plugin constants and the Polylang functions used by the adapter.

define('HYPERLOCALISE_VERSION', '0.0.0');
define('HYPERLOCALISE_PLUGIN_FILE', __FILE__);
define('HYPERLOCALISE_PLUGIN_DIR', __DIR__ . '/');
define('HYPERLOCALISE_PLUGIN_URL', 'https://example.test/');
define('ICL_SITEPRESS_VERSION', '0.0.0');

/** @return array<int, string>|false */
function pll_languages_list(array $args = []) { return []; }
/** @return string|false */
function pll_default_language(string $field = 'slug') { return ''; }
/** @return string|false */
function pll_get_post_language(int $post_id, string $field = 'slug') { return ''; }
/** @return int|false|null */
function pll_get_post(int $post_id, string $lang = '') { return 0; }
function pll_set_post_language(int $id, string $lang): void {}
/** @return array<string, int> */
function pll_get_post_translations(int $post_id): array { return []; }
/** @param array<string, int> $arr */
function pll_save_post_translations(array $arr): void {}
