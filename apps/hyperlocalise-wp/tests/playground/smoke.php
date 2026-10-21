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

// Editors can edit books but creating them needs a capability nobody has.
register_post_type('hl_book', [
    'public' => true,
    'show_in_rest' => true,
    'capability_type' => 'post',
    'map_meta_cap' => true,
    'capabilities' => ['create_posts' => 'create_hl_books'],
]);

update_option('hyperlocalise_settings', [
    'api_key' => 'hl_test_key',
    'project_id' => 'project_1',
    'post_types' => ['post', 'page', 'hl_book'],
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
check($uploaded['sourcePath'] === 'wordpress/' . TranslationService::site_key() . "/post/{$post_id}.json", 'source path is per post');
check(($uploaded['segments']['title'] ?? null) === 'Hello World', 'title is a segment');
check(($uploaded['segments']['meta._yoast_wpseo_metadesc'] ?? null) === 'Fast Shipping', 'configured meta is a segment');
check(!in_array('<pre class="wp-block-code"><code>Hello code</code></pre>', $uploaded['segments'], true), 'code block is not sent');
check(($job_request['fileInput']['targetLocales'] ?? null) === ['fr-FR', 'de-DE'], 'job targets every mapped locale');
check(get_post_meta($post_id, TranslationService::STATUS_META, true) === 'queued', 'status meta is queryable');
check((int) get_post_meta($post_id, TranslationService::CHECKED_META, true) === (int) $job['checked_at'], 'last check time is queryable');

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

$job = $service->apply($post_id);
check(($job['results']['fr']['status'] ?? '') === 'updated' && get_post($fr_id)->post_title === 'Bonjour Monde', 'untouched drafts are updated on re-apply');

wp_update_post(['ID' => $fr_id, 'post_title' => 'Edited by hand']);
$job = $service->apply($post_id);
check(($job['results']['fr']['status'] ?? '') === 'skipped' && get_post($fr_id)->post_title === 'Edited by hand', 'hand-edited drafts are kept on re-apply');

wp_update_post(['ID' => $fr_id, 'post_status' => 'publish', 'post_title' => 'Published by hand']);
$job = $service->apply($post_id);
check(($job['results']['fr']['status'] ?? '') === 'skipped' && get_post($fr_id)->post_title === 'Published by hand', 'published translations are kept');

$original_content = get_post($post_id)->post_content;
$service->send($post_id);
wp_update_post(['ID' => $post_id, 'post_content' => wp_slash("<!-- wp:paragraph -->\n<p>Inserted first</p>\n<!-- /wp:paragraph -->\n\n" . $original_content)]);
try {
    $service->refresh($post_id, true);
    check(false, 'auto-apply rejects a job whose source changed');
} catch (Hyperlocalise\WordPress\PluginError $error) {
    check($error->error_code() === 'source_changed', 'auto-apply rejects a job whose source changed');
}
$job = $service->job($post_id);
check($job['status'] === 'succeeded' && empty($job['applied_at']), 'stale job is left unapplied');
$panel = (new Hyperlocalise\WordPress\Admin\Panel($service))->render($post_id);
check(strpos($panel, 'data-hyperlocalise-action="apply"') === false && strpos($panel, 'changed since it was sent') !== false, 'panel asks for a resend instead of applying a stale job');
$response = rest_do_request(new WP_REST_Request('POST', "/hyperlocalise/v1/posts/{$post_id}/apply"));
check($response->get_status() === 400 && ($response->get_data()['error'] ?? '') === 'source_changed', 'REST apply rejects a stale job');
wp_update_post(['ID' => $post_id, 'post_content' => wp_slash($original_content)]);

$book_id = wp_insert_post(['post_type' => 'hl_book', 'post_title' => 'Hello book', 'post_status' => 'draft'], true);
check(current_user_can('edit_post', $book_id) && !TranslationService::can_create_translations('hl_book'), 'editor can edit books but not create them');
$response = rest_do_request(new WP_REST_Request('POST', "/hyperlocalise/v1/posts/{$book_id}/apply"));
check($response->get_status() === 403, 'REST apply requires create_posts');
$response = rest_do_request(new WP_REST_Request('POST', "/hyperlocalise/v1/posts/{$book_id}/send"));
check($response->get_status() === 403, 'REST send requires create_posts');
$response = rest_do_request(new WP_REST_Request('GET', "/hyperlocalise/v1/posts/{$book_id}/panel"));
check($response->get_status() === 200, 'panel stays readable without create_posts');
$redirect = (new Hyperlocalise\WordPress\Admin\BulkActions(new Hyperlocalise\WordPress\Settings(), $service))->handle('edit.php', 'hyperlocalise_send', [$book_id]);
check(strpos($redirect, 'hyperlocalise_skipped=1') !== false && strpos($redirect, 'hyperlocalise_sent=0') !== false, 'bulk send skips posts the user cannot create translations for');

$cron = new Hyperlocalise\WordPress\Cron($service, new Hyperlocalise\WordPress\Settings());
$pending_ids = [];
foreach ([300, 100, 200] as $checked_at) {
    $pending_id = wp_insert_post(['post_title' => "Pending {$checked_at}", 'post_status' => 'draft'], true);
    update_post_meta($pending_id, TranslationService::JOB_META, ['id' => 'job_unknown', 'status' => 'running', 'checked_at' => $checked_at]);
    update_post_meta($pending_id, TranslationService::STATUS_META, 'running');
    update_post_meta($pending_id, TranslationService::CHECKED_META, $checked_at);
    $pending_ids[$checked_at] = $pending_id;
}
$batch_order = static function () use ($cron, $pending_ids): array {
    return array_values(array_intersect($cron->pending_post_ids(), $pending_ids));
};
check($batch_order() === [$pending_ids[100], $pending_ids[200], $pending_ids[300]], 'cron batch starts with the least recently checked job');
try {
    $service->refresh($pending_ids[100]);
} catch (Hyperlocalise\WordPress\PluginError $error) {
    // The mock does not know job_unknown.
}
check($batch_order() === [$pending_ids[200], $pending_ids[300], $pending_ids[100]], 'a failed status check moves the job to the back of the batch');
foreach ($pending_ids as $pending_id) {
    wp_delete_post($pending_id, true);
}

remove_filter('cron_schedules', [Hyperlocalise\WordPress\Cron::class, 'add_schedule']);
wp_clear_scheduled_hook(Hyperlocalise\WordPress\Cron::HOOK);
Hyperlocalise\WordPress\Cron::activate();
check(wp_get_schedule(Hyperlocalise\WordPress\Cron::HOOK) === Hyperlocalise\WordPress\Cron::SCHEDULE, 'activation schedules polling before plugins_loaded registers the interval');

$subsite_home = static function (): string {
    return 'https://example.test/fr/shop/';
};
add_filter('home_url', $subsite_home);
check(TranslationService::site_key() === 'example-test-fr-shop', 'source paths include the subdirectory site path');
remove_filter('home_url', $subsite_home);

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

global $wpdb;
$lock_name = 'hyperlocalise_apply_lock_' . $post_id;
$wpdb->insert($wpdb->options, ['option_name' => $lock_name, 'option_value' => (string) time(), 'autoload' => 'no']);
try {
    $service->apply($post_id);
    check(false, 'a second apply waits for the running one');
} catch (Hyperlocalise\WordPress\PluginError $error) {
    check($error->error_code() === 'apply_in_progress', 'a second apply waits for the running one');
}
$wpdb->update($wpdb->options, ['option_value' => (string) (time() - HOUR_IN_SECONDS)], ['option_name' => $lock_name]);
$service->apply($post_id);
check($wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->options} WHERE option_name = %s", $lock_name)) === '0', 'an abandoned lock is taken over and released');

$job = $service->job($post_id);
update_post_meta($post_id, TranslationService::JOB_META, array_merge($job, ['id' => 'job_review', 'status' => 'running', 'applied_at' => null]));
$job = $service->refresh($post_id, true);
check($job['status'] === 'waiting_for_review' && empty($job['applied_at']), 'cron does not auto-apply translations waiting for review');
$panel = (new Hyperlocalise\WordPress\Admin\Panel($service))->render($post_id);
check(strpos($panel, 'waiting for review') !== false && strpos($panel, 'data-hyperlocalise-action="apply"') !== false, 'panel warns before saving unreviewed translations');

update_post_meta($post_id, TranslationService::JOB_META, array_merge($job, ['status' => 'running', 'site' => 'production-example-com']));
update_post_meta($post_id, TranslationService::STATUS_META, 'running');
try {
    $service->refresh($post_id, true);
    check(false, 'jobs copied from another site are not polled');
} catch (Hyperlocalise\WordPress\PluginError $error) {
    check($error->error_code() === 'other_site', 'jobs copied from another site are not polled');
}
check(get_post_meta($post_id, TranslationService::STATUS_META, true) === TranslationService::STATUS_DETACHED && !in_array($post_id, $cron->pending_post_ids(), true), 'copied jobs leave the cron batch');

check(TranslationService::review_translations(['title' => 'Hello'], ['title' => 'Hello'])['translations'] === [], 'download fallbacks to source text count as untranslated');

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
