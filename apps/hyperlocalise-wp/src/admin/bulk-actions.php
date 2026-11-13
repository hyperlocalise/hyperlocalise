<?php

namespace Hyperlocalise\WordPress\Admin;

use Hyperlocalise\WordPress\PluginError;
use Hyperlocalise\WordPress\Settings;
use Hyperlocalise\WordPress\TranslationService;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Adds "Send to Hyperlocalise" to the posts list. Requests run inline, so the
 * batch is capped to keep the admin request within typical PHP time limits.
 */
final class BulkActions
{
    private const ACTION = 'hyperlocalise_send';
    private const MAX_POSTS = 20;

    private Settings $settings;
    private TranslationService $service;

    public function __construct(Settings $settings, TranslationService $service)
    {
        $this->settings = $settings;
        $this->service = $service;
    }

    public function register(): void
    {
        add_action('admin_init', [$this, 'register_post_types']);
        add_action('admin_notices', [$this, 'notice']);
    }

    public function register_post_types(): void
    {
        foreach ($this->settings->post_types() as $post_type) {
            add_filter('bulk_actions-edit-' . $post_type, [$this, 'add_action']);
            add_filter('handle_bulk_actions-edit-' . $post_type, [$this, 'handle'], 10, 3);
        }
    }

    /**
     * @param array<string, string> $actions
     * @return array<string, string>
     */
    public function add_action(array $actions): array
    {
        $actions[self::ACTION] = __('Send to Hyperlocalise', 'hyperlocalise');
        return $actions;
    }

    /**
     * @param int[] $post_ids
     */
    public function handle(string $redirect_to, string $action, array $post_ids): string
    {
        if ($action !== self::ACTION) {
            return $redirect_to;
        }

        $sent = 0;
        $failed = 0;
        $skipped = max(0, count($post_ids) - self::MAX_POSTS);
        $last_error = '';

        foreach (array_slice($post_ids, 0, self::MAX_POSTS) as $post_id) {
            $post_type = get_post_type((int) $post_id);
            if (
                !$post_type
                || !current_user_can('edit_post', (int) $post_id)
                || !TranslationService::can_create_translations($post_type)
            ) {
                $skipped++;
                continue;
            }
            try {
                $this->service->send((int) $post_id);
                $sent++;
            } catch (PluginError $error) {
                $failed++;
                $last_error = $error->getMessage();
            }
        }

        $redirect_to = remove_query_arg(['hyperlocalise_sent', 'hyperlocalise_failed', 'hyperlocalise_skipped'], $redirect_to);
        if ($last_error !== '') {
            set_transient($this->error_transient(), $last_error, MINUTE_IN_SECONDS);
        }
        return add_query_arg([
            'hyperlocalise_sent' => $sent,
            'hyperlocalise_failed' => $failed,
            'hyperlocalise_skipped' => $skipped,
        ], $redirect_to);
    }

    public function notice(): void
    {
        // phpcs:disable WordPress.Security.NonceVerification.Recommended -- Display-only counters set by handle().
        if (!isset($_GET['hyperlocalise_sent'])) {
            return;
        }
        $sent = absint($_GET['hyperlocalise_sent']);
        $failed = absint($_GET['hyperlocalise_failed'] ?? 0);
        $skipped = absint($_GET['hyperlocalise_skipped'] ?? 0);
        // phpcs:enable

        $messages = [];
        if ($sent > 0) {
            /* translators: %d: number of posts */
            $messages[] = sprintf(_n('%d post sent to Hyperlocalise.', '%d posts sent to Hyperlocalise.', $sent, 'hyperlocalise'), $sent);
        }
        if ($failed > 0) {
            /* translators: %d: number of posts */
            $messages[] = sprintf(_n('%d post could not be sent.', '%d posts could not be sent.', $failed, 'hyperlocalise'), $failed);
            $last_error = get_transient($this->error_transient());
            if (is_string($last_error) && $last_error !== '') {
                $messages[] = $last_error;
                delete_transient($this->error_transient());
            }
        }
        if ($skipped > 0) {
            /* translators: 1: number of posts, 2: batch size */
            $messages[] = sprintf(_n('%1$d post was skipped. Send at most %2$d posts at a time.', '%1$d posts were skipped. Send at most %2$d posts at a time.', $skipped, 'hyperlocalise'), $skipped, self::MAX_POSTS);
        }

        printf(
            '<div class="notice notice-%1$s is-dismissible"><p>%2$s</p></div>',
            $failed > 0 ? 'warning' : 'success',
            esc_html(implode(' ', $messages))
        );
    }

    private function error_transient(): string
    {
        return 'hyperlocalise_bulk_error_' . get_current_user_id();
    }
}
