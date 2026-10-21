<?php

namespace Hyperlocalise\WordPress\Admin;

use Hyperlocalise\WordPress\PluginError;
use Hyperlocalise\WordPress\TranslationService;
use WP_Post;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Renders the editor panel HTML used by the meta box and REST responses.
 */
final class Panel
{
    private TranslationService $service;

    public function __construct(TranslationService $service)
    {
        $this->service = $service;
    }

    public static function status_label(string $status): string
    {
        $labels = [
            'queued' => __('Queued', 'hyperlocalise'),
            'running' => __('Translating', 'hyperlocalise'),
            'succeeded' => __('Ready', 'hyperlocalise'),
            'waiting_for_review' => __('Ready (waiting for review)', 'hyperlocalise'),
            'failed' => __('Failed', 'hyperlocalise'),
            'cancelled' => __('Cancelled', 'hyperlocalise'),
        ];
        return $labels[$status] ?? $status;
    }

    public function render(int $post_id): string
    {
        $post = get_post($post_id);
        if (!$post instanceof WP_Post) {
            return '';
        }

        ob_start();
        if ($post->post_status === 'auto-draft') {
            $this->notice(__('Save the post to translate it with Hyperlocalise.', 'hyperlocalise'));
            return (string) ob_get_clean();
        }

        try {
            $context = $this->service->context($post);
        } catch (PluginError $error) {
            $this->notice($error->getMessage(), 'error');
            if ($error->error_code() === 'not_configured' && current_user_can('manage_options')) {
                printf(
                    '<p><a href="%s">%s</a></p>',
                    esc_url(admin_url('options-general.php?page=' . SettingsPage::SLUG)),
                    esc_html__('Open Hyperlocalise settings', 'hyperlocalise')
                );
            }
            return (string) ob_get_clean();
        }

        $job = $this->service->job($post->ID);
        $this->render_job($post, $job);
        $this->render_languages($post, $context['targets'], $job);
        $this->render_actions($job);

        return (string) ob_get_clean();
    }

    /**
     * @param array<string, mixed>|null $job
     */
    private function render_job(WP_Post $post, ?array $job): void
    {
        if ($job === null) {
            $this->notice(__('Not sent to Hyperlocalise yet.', 'hyperlocalise'));
            return;
        }

        $status = (string) $job['status'];
        echo '<p class="hyperlocalise-panel__status">';
        printf(
            '<span class="hyperlocalise-badge hyperlocalise-badge--%1$s">%2$s</span> ',
            esc_attr(sanitize_html_class($status)),
            esc_html(self::status_label($status))
        );
        printf(
            /* translators: %s: human-readable time difference */
            esc_html__('Sent %s ago', 'hyperlocalise'),
            esc_html(human_time_diff((int) $job['submitted_at']))
        );
        echo '</p>';

        if (!empty($job['last_error'])) {
            $this->notice((string) $job['last_error'], 'error');
        }

        if (!empty($job['source_hash']) && $this->service->source_hash($post) !== $job['source_hash']) {
            $this->notice(
                __('The post changed since it was sent. Send it again to translate the new text.', 'hyperlocalise'),
                'warning'
            );
        }
    }

    /**
     * @param array<string, string> $targets
     * @param array<string, mixed>|null $job
     */
    private function render_languages(WP_Post $post, array $targets, ?array $job): void
    {
        $adapter = $this->service->adapter();
        if ($adapter === null) {
            return;
        }
        $languages = $adapter->languages();
        $results = is_array($job['results'] ?? null) ? $job['results'] : [];

        echo '<ul class="hyperlocalise-panel__languages">';
        foreach ($targets as $code => $locale) {
            $name = $languages[$code]['name'] ?? $code;
            $translation_id = $adapter->translation_id($post->ID, $code);
            $result = $results[$code] ?? null;

            echo '<li>';
            printf(
                '<span class="hyperlocalise-panel__language">%1$s <code>%2$s</code></span>',
                esc_html($name),
                esc_html($locale)
            );

            if ($translation_id !== null && current_user_can('edit_post', $translation_id)) {
                $status_object = get_post_status_object((string) get_post_status($translation_id));
                printf(
                    ' <a href="%1$s">%2$s</a>',
                    esc_url((string) get_edit_post_link($translation_id)),
                    esc_html($status_object ? $status_object->label : __('Edit', 'hyperlocalise'))
                );
            } else {
                echo ' <span class="hyperlocalise-panel__muted">' . esc_html__('Not created', 'hyperlocalise') . '</span>';
            }

            if (is_array($result) && !empty($result['message'])) {
                printf(
                    '<br><span class="hyperlocalise-panel__result hyperlocalise-panel__result--%1$s">%2$s</span>',
                    esc_attr(sanitize_html_class((string) $result['status'])),
                    esc_html((string) $result['message'])
                );
            }
            echo '</li>';
        }
        echo '</ul>';
    }

    /**
     * @param array<string, mixed>|null $job
     */
    private function render_actions(?array $job): void
    {
        $pending = TranslationService::is_pending($job);
        $ready = TranslationService::is_ready($job);

        echo '<div class="hyperlocalise-panel__actions">';
        $this->button('send', $job === null ? __('Send for translation', 'hyperlocalise') : __('Send again', 'hyperlocalise'), !$pending, !$ready);
        if ($pending) {
            $this->button('refresh', __('Check status', 'hyperlocalise'), true, true);
        }
        if ($ready) {
            $this->button(
                'apply',
                empty($job['applied_at']) ? __('Save translations', 'hyperlocalise') : __('Update translations', 'hyperlocalise'),
                true,
                true
            );
        }
        echo '</div>';
        echo '<p class="hyperlocalise-panel__muted">' . esc_html__('Unsaved changes are not sent. New translations are saved as drafts.', 'hyperlocalise') . '</p>';
    }

    private function button(string $action, string $label, bool $enabled, bool $primary): void
    {
        printf(
            '<button type="button" class="button %1$s" data-hyperlocalise-action="%2$s"%3$s>%4$s</button> ',
            $primary ? 'button-primary' : '',
            esc_attr($action),
            $enabled ? '' : ' disabled',
            esc_html($label)
        );
    }

    private function notice(string $message, string $type = 'info'): void
    {
        printf(
            '<p class="hyperlocalise-panel__notice hyperlocalise-panel__notice--%1$s">%2$s</p>',
            esc_attr($type),
            esc_html($message)
        );
    }
}
