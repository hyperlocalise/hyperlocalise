<?php

namespace Hyperlocalise\WordPress\Multilingual;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Uses WPML's documented hooks:
 * https://wpml.org/documentation/support/wpml-coding-api/wpml-hooks-reference/
 */
final class WpmlAdapter implements Adapter
{
    public function id(): string
    {
        return 'wpml';
    }

    public function label(): string
    {
        return 'WPML';
    }

    public function is_available(): bool
    {
        return defined('ICL_SITEPRESS_VERSION') && has_filter('wpml_active_languages');
    }

    public function languages(): array
    {
        $active = apply_filters('wpml_active_languages', null, ['skip_missing' => 0]);
        if (!is_array($active)) {
            return [];
        }

        $languages = [];
        foreach ($active as $code => $language) {
            if (!is_array($language)) {
                continue;
            }
            $code = (string) ($language['code'] ?? $code);
            $languages[$code] = [
                'code' => $code,
                'locale' => (string) ($language['default_locale'] ?? $code),
                'name' => (string) ($language['translated_name'] ?? $language['native_name'] ?? $code),
            ];
        }
        return $languages;
    }

    public function default_language(): string
    {
        return (string) apply_filters('wpml_default_language', null);
    }

    public function post_language(int $post_id): ?string
    {
        $details = apply_filters('wpml_element_language_details', null, [
            'element_id' => $post_id,
            'element_type' => $this->element_type($post_id),
        ]);
        $code = is_object($details) && isset($details->language_code) ? (string) $details->language_code : '';
        return $code !== '' ? $code : null;
    }

    public function translation_id(int $post_id, string $language): ?int
    {
        $post_type = (string) get_post_type($post_id);
        $translated = (int) apply_filters('wpml_object_id', $post_id, $post_type, false, $language);
        return $translated > 0 && $translated !== $post_id ? $translated : null;
    }

    public function assign_translation(int $source_id, int $translation_id, string $language): void
    {
        $element_type = $this->element_type($source_id);
        $trid = apply_filters('wpml_element_trid', null, $source_id, $element_type);

        do_action('wpml_set_element_language_details', [
            'element_id' => $translation_id,
            'element_type' => $element_type,
            'trid' => $trid,
            'language_code' => $language,
            'source_language_code' => $this->post_language($source_id),
        ]);
    }

    private function element_type(int $post_id): string
    {
        return apply_filters('wpml_element_type', (string) get_post_type($post_id));
    }
}
