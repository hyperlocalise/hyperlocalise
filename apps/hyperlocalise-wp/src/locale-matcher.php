<?php

namespace Hyperlocalise\WordPress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Maps WordPress languages (`fr` with locale `fr_FR`) to Hyperlocalise project
 * locales (`fr-FR`). An explicit override always wins, even when it does not
 * match, so a misconfigured override never silently falls back to a guess.
 */
final class LocaleMatcher
{
    /**
     * Parses `wp-code = project-locale` lines. Lines starting with `#` are ignored.
     *
     * @return array<string, string>
     */
    public static function parse_overrides(string $raw): array
    {
        $overrides = [];
        foreach (preg_split('/\R/', $raw) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) {
                continue;
            }
            [$code, $locale] = array_map('trim', explode('=', $line, 2));
            if ($code !== '' && $locale !== '') {
                $overrides[self::normalize($code)] = $locale;
            }
        }
        return $overrides;
    }

    public static function normalize(string $locale): string
    {
        return strtolower(str_replace('_', '-', trim($locale)));
    }

    /**
     * @param array<string, string> $languages WordPress language code => WordPress locale.
     * @param string[] $project_locales
     * @param array<string, string> $overrides
     * @return array<string, string|null>
     */
    public static function match(array $languages, array $project_locales, array $overrides = []): array
    {
        $matches = [];
        foreach ($languages as $code => $wp_locale) {
            $matches[(string) $code] = self::find((string) $code, $wp_locale, $project_locales, $overrides);
        }
        return $matches;
    }

    /**
     * @param string[] $project_locales
     * @param array<string, string> $overrides
     */
    public static function find(string $code, string $wp_locale, array $project_locales, array $overrides = []): ?string
    {
        $index = [];
        foreach ($project_locales as $locale) {
            $index[self::normalize($locale)] = $locale;
        }

        $override = $overrides[self::normalize($code)] ?? null;
        if ($override !== null) {
            return $index[self::normalize($override)] ?? null;
        }

        foreach ([$wp_locale, $code] as $candidate) {
            $normalized = self::normalize($candidate);
            if ($normalized !== '' && isset($index[$normalized])) {
                return $index[$normalized];
            }
        }

        $language = explode('-', self::normalize($wp_locale !== '' ? $wp_locale : $code))[0];
        if ($language === '') {
            return null;
        }
        $candidates = array_values(array_filter(
            array_keys($index),
            static function (string $locale) use ($language): bool {
                return $locale === $language || strpos($locale, $language . '-') === 0;
            }
        ));

        return count($candidates) === 1 ? $index[$candidates[0]] : null;
    }
}
