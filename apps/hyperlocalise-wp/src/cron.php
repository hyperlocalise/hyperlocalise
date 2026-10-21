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
        add_filter('cron_schedules', [$this, 'add_schedule']);
        add_action(self::HOOK, [$this, 'poll']);
        add_action('admin_init', [self::class, 'activate']);
    }

    /**
     * @param array<string, array<string, mixed>> $schedules
     * @return array<string, array<string, mixed>>
     */
    public function add_schedule(array $schedules): array
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

        $post_ids = get_posts([
            'post_type' => 'any',
            'post_status' => 'any',
            'fields' => 'ids',
            'posts_per_page' => self::BATCH_SIZE,
            'orderby' => 'modified',
            'order' => 'ASC',
            'meta_query' => [
                [
                    'key' => TranslationService::STATUS_META,
                    'value' => TranslationService::PENDING_STATUSES,
                    'compare' => 'IN',
                ],
            ],
            'suppress_filters' => true,
            'lang' => '',
        ]);

        foreach ($post_ids as $post_id) {
            try {
                $this->service->refresh((int) $post_id, $this->settings->auto_apply());
            } catch (PluginError $error) {
                if (in_array($error->status(), [401, 403], true)) {
                    return;
                }
            }
        }
    }
}
