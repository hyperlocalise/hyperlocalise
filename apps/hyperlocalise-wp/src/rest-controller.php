<?php

namespace Hyperlocalise\WordPress;

use Hyperlocalise\WordPress\Admin\Panel;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Editor actions for the meta box. Each response carries the re-rendered panel
 * so all copy and state rendering stays in PHP.
 */
final class RestController
{
    public const NAMESPACE = 'hyperlocalise/v1';

    private TranslationService $service;
    private Settings $settings;
    private Panel $panel;

    public function __construct(TranslationService $service, Settings $settings, Panel $panel)
    {
        $this->service = $service;
        $this->settings = $settings;
        $this->panel = $panel;
    }

    public function register(): void
    {
        add_action('rest_api_init', [$this, 'register_routes']);
    }

    public function register_routes(): void
    {
        $routes = [
            'panel' => ['GET', 'panel'],
            'send' => ['POST', 'send'],
            'refresh' => ['POST', 'refresh'],
            'apply' => ['POST', 'apply'],
        ];

        foreach ($routes as $path => [$method, $handler]) {
            register_rest_route(self::NAMESPACE, '/posts/(?P<id>\d+)/' . $path, [
                'methods' => $method,
                'callback' => [$this, $handler],
                'permission_callback' => [$this, 'can_translate'],
                'args' => [
                    'id' => ['type' => 'integer', 'required' => true],
                ],
            ]);
        }
    }

    /**
     * @return bool|WP_Error
     */
    public function can_translate(WP_REST_Request $request)
    {
        $post = get_post((int) $request['id']);
        if (!$post || !$this->settings->supports_post_type($post->post_type)) {
            return new WP_Error('hyperlocalise_post_not_found', __('Post not found.', 'hyperlocalise'), ['status' => 404]);
        }

        $post_type = get_post_type_object($post->post_type);
        $can_create = $post_type && current_user_can($post_type->cap->edit_posts);
        if (!$can_create || !current_user_can('edit_post', $post->ID)) {
            return new WP_Error(
                'hyperlocalise_forbidden',
                __('You cannot translate this post.', 'hyperlocalise'),
                ['status' => rest_authorization_required_code()]
            );
        }
        return true;
    }

    public function panel(WP_REST_Request $request): WP_REST_Response
    {
        return $this->respond((int) $request['id'], null);
    }

    public function send(WP_REST_Request $request): WP_REST_Response
    {
        $post_id = (int) $request['id'];
        return $this->run($post_id, function () use ($post_id): string {
            $job = $this->service->send($post_id);
            return sprintf(
                /* translators: %d: number of target languages */
                _n('Sent for translation into %d language.', 'Sent for translation into %d languages.', count($job['targets']), 'hyperlocalise'),
                count($job['targets'])
            );
        });
    }

    public function refresh(WP_REST_Request $request): WP_REST_Response
    {
        $post_id = (int) $request['id'];
        return $this->run($post_id, function () use ($post_id): string {
            $job = $this->service->refresh($post_id);
            return sprintf(
                /* translators: %s: job status */
                __('Job status: %s.', 'hyperlocalise'),
                Panel::status_label((string) $job['status'])
            );
        });
    }

    public function apply(WP_REST_Request $request): WP_REST_Response
    {
        $post_id = (int) $request['id'];
        return $this->run($post_id, function () use ($post_id): string {
            $job = $this->service->apply($post_id);
            $failed = count(array_filter((array) $job['results'], static function ($result): bool {
                return ($result['status'] ?? '') === 'failed';
            }));
            return $failed > 0
                ? __('Some translations could not be saved. See the language list for details.', 'hyperlocalise')
                : __('Translations saved.', 'hyperlocalise');
        });
    }

    private function run(int $post_id, callable $action): WP_REST_Response
    {
        try {
            $message = $action();
        } catch (PluginError $error) {
            $response = $this->respond($post_id, $error->getMessage());
            $response->set_data(array_merge($response->get_data(), ['error' => $error->error_code()]));
            $response->set_status(400);
            return $response;
        }
        return $this->respond($post_id, $message);
    }

    private function respond(int $post_id, ?string $message): WP_REST_Response
    {
        return new WP_REST_Response([
            'panel' => $this->panel->render($post_id),
            'message' => $message,
        ]);
    }
}
