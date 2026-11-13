<?php

namespace Hyperlocalise\WordPress\Multilingual;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Uses Polylang's public function API:
 * https://polylang.pro/doc/function-reference/
 */
final class PolylangAdapter implements Adapter
{
    public function id(): string
    {
        return 'polylang';
    }

    public function label(): string
    {
        return 'Polylang';
    }

    public function is_available(): bool
    {
        return function_exists('pll_languages_list')
            && function_exists('pll_get_post')
            && function_exists('pll_save_post_translations');
    }

    public function languages(): array
    {
        $slugs = pll_languages_list(['fields' => 'slug']);
        $locales = pll_languages_list(['fields' => 'locale']);
        $names = pll_languages_list(['fields' => 'name']);
        if (!is_array($slugs)) {
            return [];
        }

        $languages = [];
        foreach (array_values($slugs) as $index => $slug) {
            $slug = (string) $slug;
            $languages[$slug] = [
                'code' => $slug,
                'locale' => (string) ($locales[$index] ?? $slug),
                'name' => (string) ($names[$index] ?? $slug),
            ];
        }
        return $languages;
    }

    public function default_language(): string
    {
        return (string) pll_default_language('slug');
    }

    public function post_language(int $post_id): ?string
    {
        $language = pll_get_post_language($post_id, 'slug');
        return is_string($language) && $language !== '' ? $language : null;
    }

    public function translation_id(int $post_id, string $language): ?int
    {
        $translated = (int) pll_get_post($post_id, $language);
        return $translated > 0 && $translated !== $post_id ? $translated : null;
    }

    public function assign_translation(int $source_id, int $translation_id, string $language): void
    {
        pll_set_post_language($translation_id, $language);

        $translations = pll_get_post_translations($source_id);
        $source_language = $this->post_language($source_id);
        if ($source_language !== null) {
            $translations[$source_language] = $source_id;
        }
        $translations[$language] = $translation_id;

        pll_save_post_translations($translations);
    }
}
