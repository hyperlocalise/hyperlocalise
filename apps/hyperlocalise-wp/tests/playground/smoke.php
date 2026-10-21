<?php
/**
 * End-to-end smoke test inside WordPress Playground with Polylang.
 * Hyperlocalise HTTP calls are answered by the `mock-hyperlocalise-api.php` must-use plugin.
 */

require '/wordpress/wp-load.php';

set_exception_handler(static function (Throwable $error): void {
    report('SMOKE CRASHED: ' . get_class($error) . ': ' . $error->getMessage() . "\n" . $error->getTraceAsString());
    exit(1);
});

use Hyperlocalise\WordPress\Plugin;
use Hyperlocalise\WordPress\TranslationService;

const SMOKE_OUTPUT = __DIR__ . '/smoke-output.txt';
file_put_contents(SMOKE_OUTPUT, '');

$failures = [];
function report(string $line): void
{
    echo $line . "\n";
    file_put_contents(SMOKE_OUTPUT, $line . "\n", FILE_APPEND);
}

function check(bool $condition, string $label): void
{
    global $failures;
    report(($condition ? 'PASS ' : 'FAIL ') . $label);
    if (!$condition) {
        $failures[] = $label;
    }
}

wp_set_current_user(1);

check(pll_languages_list(['fields' => 'slug']) === ['en', 'fr', 'de'], 'Polylang languages exist');

update_option('hyperlocalise_settings', [
    'api_key' => 'hl_test_key',
    'project_id' => 'project_1',
    'post_types' => ['post', 'page'],
    'meta_keys' => '_yoast_wpseo_metadesc',
    'published_translations' => 'skip',
    'auto_apply' => true,
]);


$content = "<!-- wp:paragraph -->\n<p>Hello <strong>World</strong></p>\n<!-- /wp:paragraph -->\n\n"
    . "<!-- wp:list -->\n<ul class=\"wp-block-list\"><!-- wp:list-item -->\n<li>Shipping</li>\n<!-- /wp:list-item --></ul>\n<!-- /wp:list -->\n\n"
    . "<!-- wp:code -->\n<pre class=\"wp-block-code\"><code>Hello code</code></pre>\n<!-- /wp:code -->";

$post_id = wp_insert_post(['post_title' => 'Hello World', 'post_excerpt' => 'Fast', 'post_content' => wp_slash($content), 'post_status' => 'publish'], true);
pll_set_post_language($post_id, 'en');
update_post_meta($post_id, '_yoast_wpseo_metadesc', 'Fast Shipping');

$service = Plugin::instance()->service();

$context = $service->context(get_post($post_id));
check($context['targets'] === ['fr' => 'fr-FR', 'de' => 'de-DE'], 'site languages map to project target locales');

$job = $service->send($post_id);
$uploaded = get_option(HYPERLOCALISE_MOCK_UPLOAD);
$job_request = get_option(HYPERLOCALISE_MOCK_JOB_REQUEST);
check($job['id'] === 'job_1' && $job['status'] === 'queued', 'send stores the queued job');
check($uploaded['sourcePath'] === 'wordpress/' . sanitize_title((string) wp_parse_url(home_url(), PHP_URL_HOST)) . "/post/{$post_id}.json", 'source path is per post');
check(($uploaded['segments']['title'] ?? null) === 'Hello World', 'title is a segment');
check(($uploaded['segments']['meta._yoast_wpseo_metadesc'] ?? null) === 'Fast Shipping', 'configured meta is a segment');
check(!in_array('<pre class="wp-block-code"><code>Hello code</code></pre>', $uploaded['segments'], true), 'code block is not sent');
check(($job_request['fileInput']['targetLocales'] ?? null) === ['fr-FR', 'de-DE'], 'job targets every mapped locale');
check(get_post_meta($post_id, TranslationService::STATUS_META, true) === 'queued', 'status meta is queryable');

$job = $service->refresh($post_id, true);
check($job['status'] === 'succeeded' && !empty($job['applied_at']), 'refresh auto-applies a finished job');
check(($job['results']['fr']['status'] ?? '') === 'created', 'French translation created');
check(($job['results']['de']['status'] ?? '') === 'failed', 'missing German translations are reported, not fatal');

$fr_id = (int) pll_get_post($post_id, 'fr');
$fr = get_post($fr_id);
check($fr_id > 0 && $fr->post_status === 'draft', 'translation is a linked draft');
check($fr->post_title === 'Bonjour Monde', 'title translated');
check($fr->post_excerpt === 'Rapide', 'excerpt translated');
check(strpos($fr->post_content, '<p>Bonjour <strong>Monde</strong></p>') !== false, 'paragraph translated');
check(strpos($fr->post_content, '<li>Livraison</li>') !== false, 'nested list item translated');
check(strpos($fr->post_content, '<code>Hello code</code>') !== false, 'code block left untouched');
check(count(parse_blocks($fr->post_content)) === count(parse_blocks(get_post($post_id)->post_content)), 'block structure preserved');
check(get_post_meta($fr_id, '_yoast_wpseo_metadesc', true) === 'Rapide Livraison', 'meta translated');
check(pll_get_post_language($fr_id) === 'fr', 'Polylang language set');
check((int) pll_get_post($fr_id, 'en') === $post_id, 'Polylang translation group linked');

wp_update_post(['ID' => $fr_id, 'post_title' => 'Edited by hand']);
$job = $service->apply($post_id);
check(($job['results']['fr']['status'] ?? '') === 'updated' && get_post($fr_id)->post_title === 'Bonjour Monde', 'drafts are updated on re-apply');

wp_update_post(['ID' => $fr_id, 'post_status' => 'publish', 'post_title' => 'Published by hand']);
$job = $service->apply($post_id);
check(($job['results']['fr']['status'] ?? '') === 'skipped' && get_post($fr_id)->post_title === 'Published by hand', 'published translations are kept');

try {
    $service->send($fr_id);
    check(false, 'translations cannot be sent as a source');
} catch (Hyperlocalise\WordPress\PluginError $error) {
    check($error->error_code() === 'source_locale_mismatch', 'translations cannot be sent as a source');
}

$panel = (new Hyperlocalise\WordPress\Admin\Panel($service))->render($post_id);
check(strpos($panel, 'data-hyperlocalise-action="apply"') !== false, 'panel offers applying ready translations');

$response = rest_do_request(new WP_REST_Request('POST', "/hyperlocalise/v1/posts/{$post_id}/refresh"));
check($response->get_status() === 200 && strpos((string) $response->get_data()['panel'], 'hyperlocalise-badge') !== false, 'REST refresh returns the rendered panel');

wp_set_current_user(0);
$response = rest_do_request(new WP_REST_Request('POST', "/hyperlocalise/v1/posts/{$post_id}/send"));
check($response->get_status() === 401, 'REST actions require an editor');
wp_set_current_user(1);

require_once ABSPATH . 'wp-admin/includes/admin.php';
$warnings = [];
set_error_handler(static function (int $level, string $message) use (&$warnings): bool {
    $warnings[] = $message;
    return true;
});
ob_start();
(new Hyperlocalise\WordPress\Admin\SettingsPage(new Hyperlocalise\WordPress\Settings(), $service))->render();
$settings_html = (string) ob_get_clean();
restore_error_handler();
check($warnings === [], 'settings page renders without PHP warnings' . ($warnings ? ': ' . implode('; ', $warnings) : ''));
check(strpos($settings_html, '<code>fr-FR</code>') !== false && strpos($settings_html, 'Using Polylang.') !== false, 'settings page shows the language map');

$bulk = new Hyperlocalise\WordPress\Admin\BulkActions(new Hyperlocalise\WordPress\Settings(), $service);
$redirect = $bulk->handle('edit.php', 'hyperlocalise_send', [$fr_id]);
check(strpos($redirect, 'hyperlocalise_failed=1') !== false, 'bulk send reports failures');

if ($failures !== []) {
    report('SMOKE FAILED: ' . count($failures));
    exit(1);
}
report('SMOKE OK');
