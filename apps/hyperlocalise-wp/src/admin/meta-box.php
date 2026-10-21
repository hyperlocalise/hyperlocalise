<?php

namespace Hyperlocalise\WordPress\Admin;

use Hyperlocalise\WordPress\RestController;
use Hyperlocalise\WordPress\Settings;
use WP_Post;

if (!defined('ABSPATH')) {
    exit;
}

final class MetaBox
{
    private Settings $settings;
    private Panel $panel;

    public function __construct(Settings $settings, Panel $panel)
    {
        $this->settings = $settings;
        $this->panel = $panel;
    }

    public function register(): void
    {
        add_action('add_meta_boxes', [$this, 'add']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue']);
    }

    public function add(string $post_type): void
    {
        if (!$this->settings->supports_post_type($post_type)) {
            return;
        }
        add_meta_box('hyperlocalise', __('Hyperlocalise', 'hyperlocalise'), [$this, 'render'], $post_type, 'side');
    }

    public function render(WP_Post $post): void
    {
        printf(
            '<div class="hyperlocalise-panel" data-post-id="%1$d" aria-live="polite"><p class="hyperlocalise-panel__message" hidden></p><div class="hyperlocalise-panel__body">%2$s</div></div>',
            (int) $post->ID,
            $this->panel->render($post->ID) // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Panel escapes its output.
        );
    }

    public function enqueue(string $hook): void
    {
        if (!in_array($hook, ['post.php', 'post-new.php'], true)) {
            return;
        }
        $screen = get_current_screen();
        if (!$screen || !$this->settings->supports_post_type((string) $screen->post_type)) {
            return;
        }

        wp_enqueue_style(
            'hyperlocalise-admin',
            HYPERLOCALISE_PLUGIN_URL . 'assets/admin.css',
            [],
            HYPERLOCALISE_VERSION
        );
        wp_enqueue_script(
            'hyperlocalise-meta-box',
            HYPERLOCALISE_PLUGIN_URL . 'assets/meta-box.js',
            ['wp-api-fetch'],
            HYPERLOCALISE_VERSION,
            true
        );
        wp_localize_script('hyperlocalise-meta-box', 'hyperlocaliseMetaBox', [
            'namespace' => RestController::NAMESPACE,
            'workingLabel' => __('Working…', 'hyperlocalise'),
            'failedLabel' => __('Hyperlocalise request failed.', 'hyperlocalise'),
        ]);
    }
}
