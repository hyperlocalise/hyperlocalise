<?php

namespace Hyperlocalise\WordPress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Files and jobs go to the platform host (`{app}/api/v1`). Identity, projects,
 * and job reads go to the public API host (`{api}/v1`).
 */
final class ApiClient
{
    private const TIMEOUT_SECONDS = 30;
    private const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

    private string $app_url;
    private string $api_url;
    private string $api_key;

    public function __construct(string $app_url, string $api_url, string $api_key)
    {
        $this->app_url = untrailingslashit($app_url);
        $this->api_url = untrailingslashit($api_url);
        $this->api_key = $api_key;
    }

    /**
     * @return array<string, mixed>
     */
    public function me(): array
    {
        $payload = $this->request_json('GET', $this->api_url . '/v1/me');
        return $this->read_object($payload, 'principal');
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function list_projects(): array
    {
        $payload = $this->request_json('GET', $this->api_url . '/v1/projects?limit=100');
        $projects = $payload['projects'] ?? null;
        if (!is_array($projects)) {
            throw $this->unexpected_response();
        }
        return array_values(array_filter($projects, 'is_array'));
    }

    /**
     * @return array<string, mixed>
     */
    public function get_project(string $project_id): array
    {
        $payload = $this->request_json('GET', $this->api_url . '/v1/projects/' . rawurlencode($project_id));
        return $this->read_object($payload, 'project');
    }

    /**
     * @return array<string, mixed>
     */
    public function upload_source_file(
        string $project_id,
        string $source_path,
        string $content,
        string $source_locale,
        string $source_hash
    ): array {
        $boundary = 'hyperlocalise-' . wp_generate_password(24, false);
        $fields = [
            'projectId' => $project_id,
            'sourcePath' => $source_path,
            'sourceHash' => $source_hash,
            'sourceLocale' => $source_locale,
        ];

        $body = '';
        foreach ($fields as $name => $value) {
            $body .= "--{$boundary}\r\n";
            $body .= "Content-Disposition: form-data; name=\"{$name}\"\r\n\r\n";
            $body .= $value . "\r\n";
        }
        $filename = basename($source_path);
        $body .= "--{$boundary}\r\n";
        $body .= "Content-Disposition: form-data; name=\"file\"; filename=\"{$filename}\"\r\n";
        $body .= "Content-Type: application/json\r\n\r\n";
        $body .= $content . "\r\n";
        $body .= "--{$boundary}--\r\n";

        $payload = $this->request_json('POST', $this->app_url . '/api/v1/files', [
            'headers' => ['Content-Type' => 'multipart/form-data; boundary=' . $boundary],
            'body' => $body,
        ]);
        $file = $this->read_object($payload, 'file');
        if (!isset($file['id']) || !is_string($file['id']) || $file['id'] === '') {
            if (($file['destination'] ?? '') === 'external_tms') {
                throw new PluginError(
                    'external_tms_project',
                    __('Projects backed by an external TMS are not supported by the WordPress plugin yet.', 'hyperlocalise')
                );
            }
            throw $this->unexpected_response();
        }
        return $file;
    }

    /**
     * @param string[] $target_locales
     * @param array<string, string> $metadata
     * @return array<string, mixed>
     */
    public function create_file_job(
        string $project_id,
        string $source_file_id,
        string $source_locale,
        array $target_locales,
        array $metadata
    ): array {
        $payload = $this->request_json('POST', $this->app_url . '/api/v1/jobs', [
            'headers' => ['Content-Type' => 'application/json'],
            'body' => wp_json_encode([
                'type' => 'file',
                'projectId' => $project_id,
                'fileInput' => [
                    'sourceFileId' => $source_file_id,
                    'fileFormat' => 'json',
                    'sourceLocale' => $source_locale,
                    'targetLocales' => array_values($target_locales),
                    'metadata' => $metadata,
                ],
            ]),
        ]);
        $job = $this->read_object($payload, 'job');
        if (!isset($job['id']) || !is_string($job['id'])) {
            throw $this->unexpected_response();
        }
        return $job;
    }

    /**
     * @return array<string, mixed>
     */
    public function get_job_status(string $job_id): array
    {
        $payload = $this->request_json('GET', $this->api_url . '/v1/jobs/' . rawurlencode($job_id) . '/status');
        return $this->read_object($payload, 'job');
    }

    /**
     * @return array<string, string>
     */
    public function download_translations(string $project_id, string $source_path, string $locale): array
    {
        $url = add_query_arg(
            [
                'sourcePath' => rawurlencode($source_path),
                'locale' => rawurlencode($locale),
            ],
            $this->app_url . '/api/v1/projects/' . rawurlencode($project_id) . '/translations/download'
        );
        $payload = $this->request_json('GET', $url, ['limit_response_size' => self::MAX_DOWNLOAD_BYTES]);

        $translations = [];
        foreach ($payload as $key => $value) {
            if (is_string($value)) {
                $translations[(string) $key] = $value;
            }
        }
        return $translations;
    }

    /**
     * @param array<string, mixed> $args
     * @return array<string, mixed>
     */
    private function request_json(string $method, string $url, array $args = []): array
    {
        if ($this->api_key === '') {
            throw new PluginError(
                'missing_api_key',
                __('Add a Hyperlocalise API key under Settings → Hyperlocalise.', 'hyperlocalise')
            );
        }

        $headers = array_merge(
            [
                'Accept' => 'application/json',
                'x-api-key' => $this->api_key,
            ],
            $args['headers'] ?? []
        );
        $response = wp_remote_request($url, array_merge($args, [
            'method' => $method,
            'headers' => $headers,
            'timeout' => self::TIMEOUT_SECONDS,
            'user-agent' => 'hyperlocalise-wp/' . HYPERLOCALISE_VERSION . '; ' . home_url('/'),
        ]));

        if (is_wp_error($response)) {
            throw new PluginError(
                'network_error',
                sprintf(
                    /* translators: %s: transport error message */
                    __('Could not reach Hyperlocalise: %s', 'hyperlocalise'),
                    $response->get_error_message()
                )
            );
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $decoded = json_decode((string) wp_remote_retrieve_body($response), true);

        if ($status < 200 || $status >= 300) {
            $code = is_array($decoded) && isset($decoded['error']) && is_string($decoded['error'])
                ? $decoded['error']
                : 'http_' . $status;
            throw new PluginError($code, $this->message_for($code, $decoded, $status), $status);
        }

        if (!is_array($decoded)) {
            throw $this->unexpected_response();
        }
        return $decoded;
    }

    /**
     * @param mixed $decoded
     */
    private function message_for(string $code, $decoded, int $status): string
    {
        $known = self::error_messages();
        if (isset($known[$code])) {
            return $known[$code];
        }
        if (is_array($decoded) && isset($decoded['message']) && is_string($decoded['message'])) {
            return $decoded['message'];
        }
        return sprintf(
            /* translators: %d: HTTP status code */
            __('Hyperlocalise returned HTTP %d.', 'hyperlocalise'),
            $status
        );
    }

    /**
     * @return array<string, string>
     */
    private static function error_messages(): array
    {
        return [
            'unauthorized' => __('The Hyperlocalise API key is missing, invalid, or revoked.', 'hyperlocalise'),
            'workspace_archived' => __('The Hyperlocalise workspace is archived.', 'hyperlocalise'),
            'project_not_found' => __('The Hyperlocalise project was not found or the API key cannot access it.', 'hyperlocalise'),
            'source_file_not_found' => __('Hyperlocalise has no source file for this post yet. Send it for translation first.', 'hyperlocalise'),
            'translations_not_found' => __('Hyperlocalise has no translations for this post yet.', 'hyperlocalise'),
            'job_source_locale_not_in_project' => __('The post language does not match the project source locale.', 'hyperlocalise'),
            'job_target_locale_not_in_project' => __('A target language is not a target locale on the Hyperlocalise project.', 'hyperlocalise'),
            'translation_job_queue_unavailable' => __('The Hyperlocalise translation queue is unavailable. Try again later.', 'hyperlocalise'),
            'file_upload_too_large' => __('This post is too large to upload.', 'hyperlocalise'),
        ];
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function read_object(array $payload, string $key): array
    {
        if (!isset($payload[$key]) || !is_array($payload[$key])) {
            throw $this->unexpected_response();
        }
        return $payload[$key];
    }

    private function unexpected_response(): PluginError
    {
        return new PluginError(
            'unexpected_response',
            __('Hyperlocalise returned an unexpected response.', 'hyperlocalise')
        );
    }
}
