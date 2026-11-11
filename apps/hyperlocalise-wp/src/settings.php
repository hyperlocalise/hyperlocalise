<?php

namespace Hyperlocalise\WordPress;

if (!defined('ABSPATH')) {
    exit;
}

final class Settings
{
    public const OPTION = 'hyperlocalise_settings';
    public const DEFAULT_APP_URL = 'https://hyperlocalise.com';
    public const DEFAULT_API_URL = 'https://api.hyperlocalise.com';
    public const PUBLISHED_SKIP = 'skip';
    public const PUBLISHED_UPDATE = 'update';

    private const DEFAULT_META_KEYS = [
        '_yoast_wpseo_title',
        '_yoast_wpseo_metadesc',
        'rank_math_title',
        'rank_math_description',
    ];

    /** @var array<string, mixed>|null */
    private ?array $values = null;

    /**
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        return [
            'app_url' => self::DEFAULT_APP_URL,
            'api_url' => self::DEFAULT_API_URL,
            'api_key' => '',
            'project_id' => '',
            'post_types' => ['post', 'page'],
            'meta_keys' => implode("\n", self::DEFAULT_META_KEYS),
            'locale_overrides' => '',
            'published_translations' => self::PUBLISHED_SKIP,
            'auto_apply' => true,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function all(): array
    {
        if ($this->values === null) {
            $stored = get_option(self::OPTION, []);
            $this->values = array_merge(self::defaults(), is_array($stored) ? $stored : []);
        }
        return $this->values;
    }

    public function flush(): void
    {
        $this->values = null;
    }

    public function app_url(): string
    {
        return untrailingslashit((string) $this->all()['app_url']);
    }

    public function api_url(): string
    {
        return untrailingslashit((string) $this->all()['api_url']);
    }

    public function api_key(): string
    {
        if (defined('HYPERLOCALISE_API_KEY') && is_string(HYPERLOCALISE_API_KEY) && HYPERLOCALISE_API_KEY !== '') {
            return HYPERLOCALISE_API_KEY;
        }
        return trim((string) $this->all()['api_key']);
    }

    public function api_key_from_constant(): bool
    {
        return defined('HYPERLOCALISE_API_KEY') && is_string(HYPERLOCALISE_API_KEY) && HYPERLOCALISE_API_KEY !== '';
    }

    public function project_id(): string
    {
        return trim((string) $this->all()['project_id']);
    }

    /**
     * @return string[]
     */
    public function post_types(): array
    {
        $types = $this->all()['post_types'];
        return is_array($types) ? array_values(array_filter(array_map('strval', $types))) : [];
    }

    public function supports_post_type(string $post_type): bool
    {
        return in_array($post_type, $this->post_types(), true);
    }

    /**
     * @return string[]
     */
    public function meta_keys(): array
    {
        $keys = preg_split('/\R/', (string) $this->all()['meta_keys']) ?: [];
        $keys = array_values(array_unique(array_filter(array_map('trim', $keys))));
        return apply_filters('hyperlocalise_translatable_meta_keys', $keys);
    }

    /**
     * @return array<string, string>
     */
    public function locale_overrides(): array
    {
        return LocaleMatcher::parse_overrides((string) $this->all()['locale_overrides']);
    }

    public function update_published_translations(): bool
    {
        return $this->all()['published_translations'] === self::PUBLISHED_UPDATE;
    }

    public function auto_apply(): bool
    {
        return (bool) $this->all()['auto_apply'];
    }

    public function is_configured(): bool
    {
        return $this->api_key() !== '' && $this->project_id() !== '';
    }

    public function client(): ApiClient
    {
        return new ApiClient($this->app_url(), $this->api_url(), $this->api_key());
    }

    /**
     * @param mixed $input
     * @return array<string, mixed>
     */
    public function sanitize($input): array
    {
        $current = $this->all();
        $input = is_array($input) ? wp_unslash($input) : [];

        $api_key = isset($input['api_key']) ? trim((string) $input['api_key']) : '';
        if (!empty($input['clear_api_key'])) {
            $api_key = '';
        } elseif ($api_key === '') {
            $api_key = (string) $current['api_key'];
        }

        $post_types = isset($input['post_types']) && is_array($input['post_types'])
            ? array_values(array_filter(array_map('sanitize_key', $input['post_types'])))
            : [];

        $published = isset($input['published_translations']) ? (string) $input['published_translations'] : '';

        $sanitized = [
            'app_url' => $this->sanitize_url($input['app_url'] ?? '', self::DEFAULT_APP_URL, 'app_url'),
            'api_url' => $this->sanitize_url($input['api_url'] ?? '', self::DEFAULT_API_URL, 'api_url'),
            'api_key' => $api_key,
            'project_id' => sanitize_text_field((string) ($input['project_id'] ?? '')),
            'post_types' => $post_types,
            'meta_keys' => sanitize_textarea_field((string) ($input['meta_keys'] ?? '')),
            'locale_overrides' => sanitize_textarea_field((string) ($input['locale_overrides'] ?? '')),
            'published_translations' => $published === self::PUBLISHED_UPDATE
                ? self::PUBLISHED_UPDATE
                : self::PUBLISHED_SKIP,
            'auto_apply' => !empty($input['auto_apply']),
        ];

        $this->values = null;
        delete_transient(Admin\SettingsPage::PROJECTS_TRANSIENT);
        TranslationService::forget_project();

        return $sanitized;
    }

    /**
     * @param mixed $value
     */
    private function sanitize_url($value, string $fallback, string $field): string
    {
        $url = untrailingslashit(esc_url_raw(trim((string) $value)));
        if ($url === '') {
            return $fallback;
        }

        $scheme = wp_parse_url($url, PHP_URL_SCHEME);
        $host = (string) wp_parse_url($url, PHP_URL_HOST);
        $is_local = in_array($host, ['localhost', '127.0.0.1'], true) || substr($host, -6) === '.local';
        if ($scheme !== 'https' && !$is_local) {
            add_settings_error(
                self::OPTION,
                'hyperlocalise_' . $field,
                __('Hyperlocalise URLs must use HTTPS. The previous value was kept.', 'hyperlocalise')
            );
            return (string) $this->all()[$field];
        }

        return $url;
    }
}
