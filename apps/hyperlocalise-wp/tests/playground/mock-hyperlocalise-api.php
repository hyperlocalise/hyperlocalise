<?php
/**
 * Plugin Name: Hyperlocalise API mock (Playground only)
 * Description: Answers Hyperlocalise API requests locally. Accepts the key `hl_test_key` and project `project_1`. French translations swap a few English words; other locales have none.
 */

const HYPERLOCALISE_MOCK_UPLOAD = 'hyperlocalise_mock_upload';
const HYPERLOCALISE_MOCK_JOB_REQUEST = 'hyperlocalise_mock_job_request';

add_filter('pre_http_request', static function ($pre, array $args, string $url) {
    $host = (string) wp_parse_url($url, PHP_URL_HOST);
    if (!in_array($host, ['hyperlocalise.com', 'api.hyperlocalise.com'], true)) {
        return $pre;
    }

    $json = static function (array $body, int $status = 200): array {
        return ['headers' => [], 'body' => wp_json_encode($body), 'response' => ['code' => $status, 'message' => ''], 'cookies' => [], 'filename' => null];
    };
    if (($args['headers']['x-api-key'] ?? '') !== 'hl_test_key') {
        return $json(['error' => 'unauthorized'], 401);
    }

    $path = (string) wp_parse_url($url, PHP_URL_PATH);
    $project = ['id' => 'project_1', 'name' => 'Marketing site', 'identifier' => 'SITE', 'source' => 'native', 'sourceLocale' => 'en-US', 'targetLocales' => ['fr-FR', 'de-DE']];

    switch ($path) {
        case '/v1/me':
            return $json(['principal' => ['tokenId' => 'token_1', 'organizationId' => 'org_1', 'permissions' => ['files:read', 'files:write', 'jobs:read', 'jobs:write', 'projects:read']]]);
        case '/v1/projects':
            return $json(['projects' => [$project], 'pagination' => ['limit' => 100, 'offset' => 0, 'total' => 1]]);
        case '/v1/projects/project_1':
            return $json(['project' => $project]);
        case '/api/v1/files':
            preg_match('/Content-Type: application\/json\r\n\r\n(.*?)\r\n--/s', (string) $args['body'], $file);
            preg_match('/name="sourcePath"\r\n\r\n([^\r]+)/', (string) $args['body'], $source_path);
            update_option(HYPERLOCALISE_MOCK_UPLOAD, [
                'sourcePath' => $source_path[1] ?? '',
                'segments' => json_decode($file[1] ?? '', true),
            ], false);
            return $json(['file' => ['id' => 'file_1', 'destination' => 'native']], 201);
        case '/api/v1/jobs':
            update_option(HYPERLOCALISE_MOCK_JOB_REQUEST, json_decode((string) $args['body'], true), false);
            return $json(['job' => ['id' => 'job_1', 'type' => 'file', 'status' => 'queued']], 201);
        case '/v1/jobs/job_1/status':
            return $json(['job' => ['id' => 'job_1', 'status' => 'succeeded', 'lastError' => null]]);
        case '/api/v1/projects/project_1/translations/download':
            parse_str((string) wp_parse_url($url, PHP_URL_QUERY), $query);
            $upload = get_option(HYPERLOCALISE_MOCK_UPLOAD, []);
            if (($query['sourcePath'] ?? '') !== ($upload['sourcePath'] ?? null)) {
                return $json(['error' => 'source_file_not_found'], 404);
            }
            if (($query['locale'] ?? '') !== 'fr-FR') {
                return $json(['error' => 'translations_not_found'], 404);
            }
            $words = ['Hello' => 'Bonjour', 'World' => 'Monde', 'Shipping' => 'Livraison', 'Fast' => 'Rapide'];
            return $json(array_map(static function (string $text) use ($words): string {
                return strtr($text, $words);
            }, (array) $upload['segments']));
    }

    return $json(['error' => 'unexpected_url', 'message' => $url], 500);
}, 10, 3);
