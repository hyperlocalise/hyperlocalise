<?php

namespace Hyperlocalise\WordPress;

use Hyperlocalise\WordPress\Multilingual\Adapter;
use Hyperlocalise\WordPress\Multilingual\Registry;
use WP_Post;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Send: one flat JSON source file per post is uploaded, then a file job is
 * created for every site language that maps to a project target locale.
 * Apply: each locale's reconstructed JSON is written into the multilingual
 * plugin's translation of the post. New translations are always drafts.
 */
final class TranslationService
{
    public const JOB_META = '_hyperlocalise_job';
    public const STATUS_META = '_hyperlocalise_job_status';
    public const SOURCE_POST_META = '_hyperlocalise_source_post';

    public const PENDING_STATUSES = ['queued', 'running'];
    public const READY_STATUSES = ['succeeded', 'waiting_for_review'];

    private const MAX_TARGET_LOCALES = 20;
    private const PROJECT_TRANSIENT = 'hyperlocalise_project';
    private const PROJECT_CACHE_SECONDS = 5 * MINUTE_IN_SECONDS;
    private const PUBLISHED_STATUSES = ['publish', 'future', 'private'];

    private Settings $settings;
    private Registry $registry;
    private Segmenter $segmenter;

    /** @var array<string, mixed>|null */
    private ?array $project = null;

    public function __construct(Settings $settings, Registry $registry, Segmenter $segmenter)
    {
        $this->settings = $settings;
        $this->registry = $registry;
        $this->segmenter = $segmenter;
    }

    public function adapter(): ?Adapter
    {
        return $this->registry->active();
    }

    /**
     * @return array<string, mixed>
     */
    public function project(): array
    {
        $project_id = $this->settings->project_id();
        if ($project_id === '') {
            throw new PluginError(
                'not_configured',
                __('Choose a Hyperlocalise project under Settings → Hyperlocalise.', 'hyperlocalise')
            );
        }
        if ($this->project !== null && ($this->project['id'] ?? '') === $project_id) {
            return $this->project;
        }

        $cached = get_transient(self::PROJECT_TRANSIENT);
        if (is_array($cached) && ($cached['id'] ?? '') === $project_id) {
            $this->project = $cached;
            return $cached;
        }

        $project = $this->settings->client()->get_project($project_id);
        set_transient(self::PROJECT_TRANSIENT, $project, self::PROJECT_CACHE_SECONDS);
        $this->project = $project;
        return $project;
    }

    public static function forget_project(): void
    {
        delete_transient(self::PROJECT_TRANSIENT);
    }

    /**
     * Maps every site language to a project locale, or null when unmapped.
     *
     * @return array<string, array{code: string, locale: string, name: string, project_locale: string|null, is_source: bool}>
     */
    public function language_map(): array
    {
        $adapter = $this->require_adapter();
        $project = $this->project();
        $source_locale = (string) ($project['sourceLocale'] ?? '');
        $target_locales = array_map('strval', (array) ($project['targetLocales'] ?? []));
        $overrides = $this->settings->locale_overrides();

        $map = [];
        foreach ($adapter->languages() as $code => $language) {
            $source_match = LocaleMatcher::find($code, $language['locale'], [$source_locale], $overrides);
            $map[$code] = array_merge($language, [
                'project_locale' => $source_match ?? LocaleMatcher::find($code, $language['locale'], $target_locales, $overrides),
                'is_source' => $source_match !== null,
            ]);
        }
        return $map;
    }

    /**
     * @return array{source_language: string, source_locale: string, targets: array<string, string>}
     */
    public function context(WP_Post $post): array
    {
        if (!$this->settings->is_configured()) {
            throw new PluginError(
                'not_configured',
                __('Connect Hyperlocalise under Settings → Hyperlocalise.', 'hyperlocalise')
            );
        }
        if (!$this->settings->supports_post_type($post->post_type)) {
            throw new PluginError(
                'unsupported_post_type',
                __('Hyperlocalise is not enabled for this post type.', 'hyperlocalise')
            );
        }

        $adapter = $this->require_adapter();
        $source_language = $adapter->post_language($post->ID) ?? $adapter->default_language();
        $languages = $this->language_map();
        $source = $languages[$source_language] ?? null;
        $project_source = (string) ($this->project()['sourceLocale'] ?? '');

        if ($source === null || !$source['is_source']) {
            throw new PluginError(
                'source_locale_mismatch',
                sprintf(
                    /* translators: 1: WordPress language code, 2: Hyperlocalise locale */
                    __('This post is in %1$s, but the Hyperlocalise project translates from %2$s. Open the %2$s version of this post to translate it.', 'hyperlocalise'),
                    $source_language,
                    $project_source
                )
            );
        }

        $targets = [];
        foreach ($languages as $code => $language) {
            if ($code !== $source_language && !$language['is_source'] && $language['project_locale'] !== null) {
                $targets[$code] = $language['project_locale'];
            }
        }

        if ($targets === []) {
            throw new PluginError(
                'no_target_languages',
                __('No site language matches a target locale on the Hyperlocalise project. Add target locales to the project or set locale overrides.', 'hyperlocalise')
            );
        }
        if (count($targets) > self::MAX_TARGET_LOCALES) {
            throw new PluginError(
                'too_many_target_languages',
                sprintf(
                    /* translators: %d: maximum number of target locales */
                    __('Hyperlocalise can translate into at most %d locales per job.', 'hyperlocalise'),
                    self::MAX_TARGET_LOCALES
                )
            );
        }

        return [
            'source_language' => $source_language,
            'source_locale' => $project_source,
            'targets' => $targets,
        ];
    }

    /**
     * @return array<string, string>
     */
    public function source_segments(WP_Post $post): array
    {
        $segments = [];
        $this->segmenter->extract_text(Segmenter::TITLE_KEY, $post->post_title, $segments);
        $this->segmenter->extract_text(Segmenter::EXCERPT_KEY, $post->post_excerpt, $segments);
        $segments += $this->segmenter->extract_blocks(parse_blocks($post->post_content));

        foreach ($this->settings->meta_keys() as $meta_key) {
            $value = get_post_meta($post->ID, $meta_key, true);
            if (is_string($value)) {
                $this->segmenter->extract_text(Segmenter::META_PREFIX . $meta_key, $value, $segments);
            }
        }

        return apply_filters('hyperlocalise_source_segments', $segments, $post);
    }

    public function source_hash(WP_Post $post): string
    {
        return hash('sha256', $this->encode_segments($this->source_segments($post)));
    }

    public function source_path(WP_Post $post): string
    {
        $host = (string) wp_parse_url(home_url(), PHP_URL_HOST);
        $site = sanitize_title($host !== '' ? $host : 'site');
        $path = sprintf('wordpress/%s/%s/%d.json', $site, sanitize_key($post->post_type), $post->ID);
        return apply_filters('hyperlocalise_source_path', $path, $post);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function job(int $post_id): ?array
    {
        $job = get_post_meta($post_id, self::JOB_META, true);
        return is_array($job) && isset($job['id']) ? $job : null;
    }

    public static function is_pending(?array $job): bool
    {
        return $job !== null && in_array($job['status'] ?? '', self::PENDING_STATUSES, true);
    }

    public static function is_ready(?array $job): bool
    {
        return $job !== null && in_array($job['status'] ?? '', self::READY_STATUSES, true);
    }

    /**
     * @return array<string, mixed>
     */
    public function send(int $post_id): array
    {
        $post = $this->require_post($post_id);
        if (self::is_pending($this->job($post_id))) {
            throw new PluginError(
                'job_already_running',
                __('A translation job is already running for this post.', 'hyperlocalise')
            );
        }

        $context = $this->context($post);
        $segments = $this->source_segments($post);
        if ($segments === []) {
            throw new PluginError('no_text', __('This post has no translatable text.', 'hyperlocalise'));
        }

        $content = $this->encode_segments($segments);
        $source_hash = hash('sha256', $content);
        $source_path = $this->source_path($post);
        $project_id = $this->settings->project_id();
        $client = $this->settings->client();

        $file = $client->upload_source_file($project_id, $source_path, $content, $context['source_locale'], $source_hash);
        $job = $client->create_file_job(
            $project_id,
            (string) $file['id'],
            $context['source_locale'],
            array_values($context['targets']),
            [
                'source' => 'wordpress',
                'site' => (string) wp_parse_url(home_url(), PHP_URL_HOST),
                'postId' => (string) $post->ID,
                'postType' => $post->post_type,
            ]
        );

        $record = [
            'id' => (string) $job['id'],
            'status' => (string) ($job['status'] ?? 'queued'),
            'project_id' => $project_id,
            'source_path' => $source_path,
            'source_hash' => $source_hash,
            'source_language' => $context['source_language'],
            'targets' => $context['targets'],
            'segment_count' => count($segments),
            'submitted_at' => time(),
            'checked_at' => time(),
            'applied_at' => null,
            'last_error' => null,
            'results' => [],
        ];
        $this->save_job($post_id, $record);

        return $record;
    }

    /**
     * @return array<string, mixed>
     */
    public function refresh(int $post_id, bool $apply_when_ready = false): array
    {
        $record = $this->require_job($post_id);
        $status = $this->settings->client()->get_job_status((string) $record['id']);

        $record['status'] = (string) ($status['status'] ?? $record['status']);
        $record['last_error'] = isset($status['lastError']) && is_string($status['lastError']) ? $status['lastError'] : null;
        $record['checked_at'] = time();
        $this->save_job($post_id, $record);

        if ($apply_when_ready && self::is_ready($record) && empty($record['applied_at'])) {
            return $this->apply($post_id);
        }
        return $record;
    }

    /**
     * @return array<string, mixed>
     */
    public function apply(int $post_id): array
    {
        $post = $this->require_post($post_id);
        $record = $this->require_job($post_id);
        if (!self::is_ready($record)) {
            throw new PluginError(
                'job_not_ready',
                __('Translations are not ready yet. Check the job status first.', 'hyperlocalise')
            );
        }

        $adapter = $this->require_adapter();
        $client = $this->settings->client();
        $results = [];

        foreach ((array) $record['targets'] as $language => $locale) {
            try {
                $translations = $client->download_translations(
                    (string) $record['project_id'],
                    (string) $record['source_path'],
                    (string) $locale
                );
                $results[$language] = $this->write_translation($adapter, $post, (string) $language, $translations);
            } catch (PluginError $error) {
                $results[$language] = ['status' => 'failed', 'post_id' => null, 'message' => $error->getMessage()];
            }
        }

        $record['applied_at'] = time();
        $record['results'] = $results;
        $this->save_job($post_id, $record);

        return $record;
    }

    /**
     * @param array<string, string> $translations
     * @return array{status: string, post_id: int|null, message: string|null}
     */
    private function write_translation(Adapter $adapter, WP_Post $source, string $language, array $translations): array
    {
        $existing_id = $adapter->translation_id($source->ID, $language);
        $existing = $existing_id !== null ? get_post($existing_id) : null;

        if (
            $existing instanceof WP_Post
            && in_array($existing->post_status, self::PUBLISHED_STATUSES, true)
            && !$this->settings->update_published_translations()
        ) {
            return [
                'status' => 'skipped',
                'post_id' => $existing->ID,
                'message' => __('Published translation kept unchanged.', 'hyperlocalise'),
            ];
        }

        $blocks = $this->segmenter->apply_blocks(parse_blocks($source->post_content), $translations);
        $parent_id = $source->post_parent > 0 ? ($adapter->translation_id($source->post_parent, $language) ?? 0) : 0;

        $postarr = [
            'post_type' => $source->post_type,
            'post_title' => $this->segmenter->apply_text(Segmenter::TITLE_KEY, $source->post_title, $translations),
            'post_excerpt' => $this->segmenter->apply_text(Segmenter::EXCERPT_KEY, $source->post_excerpt, $translations),
            'post_content' => serialize_blocks($blocks),
            'post_parent' => $parent_id,
            'menu_order' => $source->menu_order,
            'comment_status' => $source->comment_status,
            'ping_status' => $source->ping_status,
        ];

        if ($existing instanceof WP_Post) {
            $postarr['ID'] = $existing->ID;
            $result = wp_update_post(wp_slash($postarr), true);
        } else {
            $postarr['post_status'] = 'draft';
            $postarr['post_author'] = (int) $source->post_author;
            $result = wp_insert_post(wp_slash($postarr), true);
        }

        if (is_wp_error($result)) {
            return ['status' => 'failed', 'post_id' => $existing ? $existing->ID : null, 'message' => $result->get_error_message()];
        }

        $translation_id = (int) $result;
        if (!$existing instanceof WP_Post) {
            $adapter->assign_translation($source->ID, $translation_id, $language);
            $this->copy_untranslated_meta($source->ID, $translation_id);
        }

        foreach ($this->settings->meta_keys() as $meta_key) {
            $value = get_post_meta($source->ID, $meta_key, true);
            if (is_string($value) && $value !== '') {
                $translated = $this->segmenter->apply_text(Segmenter::META_PREFIX . $meta_key, $value, $translations);
                update_post_meta($translation_id, $meta_key, wp_slash($translated));
            }
        }
        update_post_meta($translation_id, self::SOURCE_POST_META, $source->ID);

        do_action('hyperlocalise_translation_saved', $translation_id, $source, $language, $translations);

        return [
            'status' => $existing instanceof WP_Post ? 'updated' : 'created',
            'post_id' => $translation_id,
            'message' => null,
        ];
    }

    private function copy_untranslated_meta(int $source_id, int $translation_id): void
    {
        $thumbnail_id = get_post_thumbnail_id($source_id);
        if ($thumbnail_id) {
            set_post_thumbnail($translation_id, $thumbnail_id);
        }
        $template = get_post_meta($source_id, '_wp_page_template', true);
        if (is_string($template) && $template !== '') {
            update_post_meta($translation_id, '_wp_page_template', $template);
        }
    }

    /**
     * @param array<string, mixed> $record
     */
    private function save_job(int $post_id, array $record): void
    {
        update_post_meta($post_id, self::JOB_META, $record);
        update_post_meta($post_id, self::STATUS_META, (string) $record['status']);
    }

    /**
     * @param array<string, string> $segments
     */
    private function encode_segments(array $segments): string
    {
        return (string) wp_json_encode($segments, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private function require_adapter(): Adapter
    {
        $adapter = $this->adapter();
        if ($adapter === null) {
            throw new PluginError(
                'no_multilingual_plugin',
                __('Install and activate WPML or Polylang to choose where translations are saved.', 'hyperlocalise')
            );
        }
        return $adapter;
    }

    private function require_post(int $post_id): WP_Post
    {
        $post = get_post($post_id);
        if (!$post instanceof WP_Post || $post->post_status === 'auto-draft') {
            throw new PluginError('post_not_found', __('Save the post before translating it.', 'hyperlocalise'));
        }
        return $post;
    }

    /**
     * @return array<string, mixed>
     */
    private function require_job(int $post_id): array
    {
        $job = $this->job($post_id);
        if ($job === null) {
            throw new PluginError(
                'job_not_found',
                __('This post has not been sent to Hyperlocalise yet.', 'hyperlocalise')
            );
        }
        return $job;
    }
}
