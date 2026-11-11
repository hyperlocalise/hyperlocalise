<?php
/**
 * Creates Polylang languages, mock Hyperlocalise settings, and a sample post.
 * Runs in its own request because Polylang only loads its public API
 * functions once at least one language exists.
 */

require '/wordpress/wp-load.php';

$model = function_exists('PLL') && PLL() && isset(PLL()->model)
    ? PLL()->model
    : new PLL_Admin_Model(new WP_Syntex\Polylang\Options\Options());

$existing = array_map(static function ($language): string {
    return $language->slug;
}, $model->get_languages_list());

foreach ([['English', 'en', 'en_US'], ['Français', 'fr', 'fr_FR'], ['Deutsch', 'de', 'de_DE']] as $index => [$name, $slug, $locale]) {
    if (in_array($slug, $existing, true)) {
        continue;
    }
    $result = $model->add_language([
        'name' => $name,
        'slug' => $slug,
        'locale' => $locale,
        'rtl' => false,
        'term_group' => $index,
    ]);
    if (is_wp_error($result)) {
        echo 'SETUP FAILED: ' . $result->get_error_message() . "\n";
        exit(1);
    }
}

$options = get_option('polylang', []);
$options['default_lang'] = 'en';
update_option('polylang', $options);

update_option('hyperlocalise_settings', [
    'api_key' => 'hl_test_key',
    'project_id' => 'project_1',
    'post_types' => ['post', 'page'],
    'meta_keys' => '_yoast_wpseo_metadesc',
    'published_translations' => 'skip',
    'auto_apply' => true,
]);

$sample_id = wp_insert_post([
    'post_title' => 'Hello World',
    'post_excerpt' => 'Fast',
    'post_status' => 'publish',
    'post_author' => 1,
    'post_content' => wp_slash("<!-- wp:paragraph -->\n<p>Hello <strong>World</strong></p>\n<!-- /wp:paragraph -->\n\n<!-- wp:list -->\n<ul class=\"wp-block-list\"><!-- wp:list-item -->\n<li>Fast Shipping</li>\n<!-- /wp:list-item --></ul>\n<!-- /wp:list -->"),
]);
update_option('hyperlocalise_sample_post', $sample_id);
echo "SETUP OK\n";
