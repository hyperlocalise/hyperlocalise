<?php

namespace Hyperlocalise\WordPress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Polls running jobs so translations land without an editor reopening the post.
 */
final class Cron
{
    public const HOOK = 'hyperlocalise_poll_jobs';
    public const SCHEDULE = 'hyperlocalise_five_minutes';
    private const BATCH_SIZE = 20;

    private TranslationService $service;
    private Settings $settings;

    public function __construct(TranslationService $service, Settings $settings)
    {
        $this->service = $service;
        $this->settings = $settings;
    }

    public static function activate(): void
    {
        // The activation hook can run before plugins_loaded (WP-CLI, headless installs).
        add_filter('cron_schedules', [self::class, 'add_schedule']);
        if (!wp_next_scheduled(self::HOOK)) {
            wp_schedule_event(time() + MINUTE_IN_SECONDS, self::SCHEDULE, self::HOOK);
        }
    }

    public static function deactivate(): void
    {
        wp_clear_scheduled_hook(self::HOOK);
    }

    public function register(): void
    {
        add_filter('cron_schedules', [self::class, 'add_schedule']);
        add_action(self::HOOK, [$this, 'poll']);
        add_action('admin_init', [self::class, 'activate']);
    }

    /**
     * @param array<string, array<string, mixed>> $schedules
     * @return array<string, array<string, mixed>>
     */
    public static function add_schedule(array $schedules): array
    {
        $schedules[self::SCHEDULE] = [
            'interval' => 5 * MINUTE_IN_SECONDS,
            'display' => __('Every five minutes (Hyperlocalise)', 'hyperlocalise'),
        ];
        return $schedules;
    }

    public function poll(): void
    {
        if (!$this->settings->is_configured()) {
            return;
        }

        foreach ($this->pending_post_ids() as $post_id) {
            try {
                $this->service->refresh((int) $post_id, $this->settings->auto_apply());
            } catch (PluginError $error) {
                if (in_array($error->status(), [401, 403], true)) {
                    return;
                }
            }
        }
    }

    /**
     * Least recently checked first: every refresh updates the checked meta,
     * so each run advances through the pending set.
     *
     * @return int[]
     */
    public function pending_post_ids(): array
    {
        $post_ids = get_posts([
            'post_type' => 'any',
            'post_status' => 'any',
            'fields' => 'ids',
            'posts_per_page' => self::BATCH_SIZE,
            'meta_query' => [
                'pending' => [
                    'key' => TranslationService::STATUS_META,
                    'value' => TranslationService::PENDING_STATUSES,
                    'compare' => 'IN',
                ],
                'checked' => [
                    'key' => TranslationService::CHECKED_META,
                    'type' => 'NUMERIC',
                ],
            ],
            'orderby' => ['checked' => 'ASC', 'ID' => 'ASC'],
            'suppress_filters' => true,
            'lang' => '',
        ]);
        return array_map('intval', $post_ids);
    }
}
