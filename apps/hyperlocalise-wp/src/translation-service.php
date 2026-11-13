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
    public const CHECKED_META = '_hyperlocalise_job_checked';
    public const SOURCE_POST_META = '_hyperlocalise_source_post';
    public const APPLIED_HASH_META = '_hyperlocalise_applied_hash';

    public const STATUS_SUCCEEDED = 'succeeded';
    public const STATUS_WAITING_FOR_REVIEW = 'waiting_for_review';
    /** Local only: the job record was copied from another site, such as production into staging. */
    public const STATUS_DETACHED = 'detached';
    public const PENDING_STATUSES = ['queued', 'running'];
    public const READY_STATUSES = [self::STATUS_SUCCEEDED, self::STATUS_WAITING_FOR_REVIEW];

    private const LOCK_OPTION_PREFIX = 'hyperlocalise_apply_lock_';
    private const LOCK_SECONDS = 10 * MINUTE_IN_SECONDS;

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
        $path = sprintf('wordpress/%s/%s/%d.json', self::site_key(), sanitize_key($post->post_type), $post->ID);
        return apply_filters('hyperlocalise_source_path', $path, $post);
    }

    /**
     * Subdirectory multisites and separate installs on one host share a
     * hostname and post IDs, so the home path is part of the site identity.
     */
    public static function site_key(): string
    {
        $host = (string) wp_parse_url(home_url(), PHP_URL_HOST);
        $path = trim((string) wp_parse_url(home_url(), PHP_URL_PATH), '/');
        $site = sanitize_title(implode('-', array_filter([$host, str_replace('/', '-', $path)])));
        return $site !== '' ? $site : 'site';
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
     * Segment keys are positional, so a job's translations only fit the exact
     * source it was created from.
     *
     * @param array<string, mixed> $job
     */
    public function is_stale(WP_Post $post, array $job): bool
    {
        return !hash_equals((string) ($job['source_hash'] ?? ''), $this->source_hash($post));
    }

    /**
     * Applying a job can create translation posts, which wp_insert_post() does
     * not authorize on the caller's behalf.
     */
    public static function can_create_translations(string $post_type): bool
    {
        $object = get_post_type_object($post_type);
        return $object !== null && current_user_can($object->cap->create_posts);
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
                'site' => self::site_key(),
                'postId' => (string) $post->ID,
                'postType' => $post->post_type,
            ]
        );

        $record = [
            'id' => (string) $job['id'],
            'status' => (string) ($job['status'] ?? 'queued'),
            'project_id' => $project_id,
            'site' => self::site_key(),
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
        $this->require_same_site($post_id, $record);
        try {
            $status = $this->settings->client()->get_job_status((string) $record['id']);
        } catch (PluginError $error) {
            // Move a failing job to the back of the cron batch so it cannot starve the rest.
            $record['checked_at'] = time();
            $this->save_job($post_id, $record);
            throw $error;
        }

        $record['status'] = (string) ($status['status'] ?? $record['status']);
        $record['last_error'] = isset($status['lastError']) && is_string($status['lastError']) ? $status['lastError'] : null;
        $record['checked_at'] = time();
        $this->save_job($post_id, $record);

        // Unreviewed translations are only saved when an editor asks for them.
        if ($apply_when_ready && $record['status'] === self::STATUS_SUCCEEDED && empty($record['applied_at'])) {
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
        $this->require_same_site($post_id, $record);
        if (!self::is_ready($record)) {
            throw new PluginError(
                'job_not_ready',
                __('Translations are not ready yet. Check the job status first.', 'hyperlocalise')
            );
        }
        if ($this->is_stale($post, $record)) {
            throw new PluginError(
                'source_changed',
                __('The post changed since it was sent, so these translations no longer match it. Send it again to translate the current text.', 'hyperlocalise')
            );
        }

        $adapter = $this->require_adapter();
        $client = $this->settings->client();
        $source_segments = $this->source_segments($post);
        $results = [];

        $this->lock($post_id);
        try {
            foreach ((array) $record['targets'] as $language => $locale) {
                try {
                    $downloaded = $client->download_translations(
                        (string) $record['project_id'],
                        (string) $record['source_path'],
                        (string) $locale
                    );
                    $results[$language] = $this->apply_language($adapter, $post, (string) $language, $source_segments, $downloaded);
                } catch (PluginError $error) {
                    $results[$language] = ['status' => 'failed', 'post_id' => null, 'message' => $error->getMessage()];
                }
            }

            $record['applied_at'] = time();
            $record['results'] = $results;
            $this->save_job($post_id, $record);
        } finally {
            $this->unlock($post_id);
        }

        return $record;
    }

    /**
     * Downloads fall back to source text for untranslated keys, so unchanged
     * text is treated as missing. Translations whose HTML tags differ from
     * the source are dropped so the block stays valid.
     *
     * @param array<string, string> $source_segments
     * @param array<string, string> $downloaded
     * @return array{translations: array<string, string>, untranslated: int, rejected: int}
     */
    public static function review_translations(array $source_segments, array $downloaded): array
    {
        $translations = [];
        $untranslated = 0;
        $rejected = 0;
        foreach ($source_segments as $key => $source) {
            $translated = $downloaded[$key] ?? null;
            if (!is_string($translated) || trim($translated) === '' || $translated === $source) {
                $untranslated++;
            } elseif (!Segmenter::same_markup($source, $translated)) {
                $rejected++;
            } else {
                $translations[$key] = $translated;
            }
        }
        return ['translations' => $translations, 'untranslated' => $untranslated, 'rejected' => $rejected];
    }

    /**
     * @param array<string, string> $source_segments
     * @param array<string, string> $downloaded
     * @return array{status: string, post_id: int|null, message: string|null}
     */
    private function apply_language(Adapter $adapter, WP_Post $post, string $language, array $source_segments, array $downloaded): array
    {
        $review = self::review_translations($source_segments, $downloaded);
        if ($review['translations'] === []) {
            return [
                'status' => 'skipped',
                'post_id' => $adapter->translation_id($post->ID, $language),
                'message' => __('No translated text yet, so nothing was saved.', 'hyperlocalise'),
            ];
        }

        $result = $this->write_translation($adapter, $post, $language, $review['translations']);
        if (!in_array($result['status'], ['created', 'updated'], true)) {
            return $result;
        }

        $notes = [];
        if ($review['untranslated'] > 0) {
            $notes[] = sprintf(
                /* translators: %d: number of text segments */
                _n('%d segment is not translated yet and stays in the source language.', '%d segments are not translated yet and stay in the source language.', $review['untranslated'], 'hyperlocalise'),
                $review['untranslated']
            );
        }
        if ($review['rejected'] > 0) {
            $notes[] = sprintf(
                /* translators: %d: number of text segments */
                _n('%d segment stays in the source language because its translation changed the HTML tags.', '%d segments stay in the source language because their translations changed the HTML tags.', $review['rejected'], 'hyperlocalise'),
                $review['rejected']
            );
        }
        $result['message'] = $notes !== [] ? implode(' ', $notes) : null;
        return $result;
    }

    /**
     * @param array<string, string> $translations
     * @return array{status: string, post_id: int|null, message: string|null}
     */
    private function write_translation(Adapter $adapter, WP_Post $source, string $language, array $translations): array
    {
        $existing_id = $adapter->translation_id($source->ID, $language);
        $existing = $existing_id !== null ? get_post($existing_id) : null;

        // Cron applies jobs with no user; the editor who sent the job was authorized to create translations.
        if (get_current_user_id() !== 0) {
            $allowed = $existing instanceof WP_Post
                ? current_user_can('edit_post', $existing->ID)
                : self::can_create_translations($source->post_type);
            if (!$allowed) {
                return [
                    'status' => 'failed',
                    'post_id' => $existing instanceof WP_Post ? $existing->ID : null,
                    'message' => __('You are not allowed to save this translation.', 'hyperlocalise'),
                ];
            }
        }

        if ($existing instanceof WP_Post && !$this->settings->update_published_translations()) {
            if (in_array($existing->post_status, self::PUBLISHED_STATUSES, true)) {
                return [
                    'status' => 'skipped',
                    'post_id' => $existing->ID,
                    'message' => __('Published translation kept unchanged.', 'hyperlocalise'),
                ];
            }
            $applied_hash = (string) get_post_meta($existing->ID, self::APPLIED_HASH_META, true);
            if ($applied_hash === '' || !hash_equals($applied_hash, $this->fingerprint($existing->ID))) {
                return [
                    'status' => 'skipped',
                    'post_id' => $existing->ID,
                    'message' => __('Edited outside Hyperlocalise, so it was kept unchanged.', 'hyperlocalise'),
                ];
            }
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
        update_post_meta($translation_id, self::APPLIED_HASH_META, $this->fingerprint($translation_id));

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
        update_post_meta($post_id, self::CHECKED_META, (int) $record['checked_at']);
    }

    /**
     * @param array<string, string> $segments
     */
    private function encode_segments(array $segments): string
    {
        $json = wp_json_encode(
            $segments,
            JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
        );
        if (!is_string($json)) {
            throw new PluginError(
                'encoding_failed',
                __('This post contains text that could not be prepared for translation.', 'hyperlocalise')
            );
        }
        return $json;
    }

    /**
     * @param array<string, mixed> $record
     */
    private function require_same_site(int $post_id, array $record): void
    {
        $site = (string) ($record['site'] ?? self::site_key());
        if ($site === self::site_key()) {
            return;
        }
        if ($record['status'] !== self::STATUS_DETACHED) {
            $record['status'] = self::STATUS_DETACHED;
            $record['checked_at'] = time();
            $this->save_job($post_id, $record);
        }
        throw new PluginError(
            'other_site',
            sprintf(
                /* translators: %s: site identifier, such as example-com */
                __('This job was sent from another site (%s), for example before the database was copied. Send the post again from this site.', 'hyperlocalise'),
                $site
            )
        );
    }

    /**
     * Cron and an editor can apply the same job at once; both would see no
     * translation yet and create duplicates. INSERT IGNORE makes taking the
     * lock atomic, which add_option() is not.
     */
    private function lock(int $post_id): void
    {
        global $wpdb;
        $name = self::LOCK_OPTION_PREFIX . $post_id;
        $now = time();
        $inserted = $wpdb->query($wpdb->prepare(
            "INSERT IGNORE INTO {$wpdb->options} (option_name, option_value, autoload) VALUES (%s, %s, 'no')",
            $name,
            (string) $now
        ));
        if ($inserted) {
            return;
        }

        $taken = $wpdb->query($wpdb->prepare(
            "UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = %s AND CAST(option_value AS UNSIGNED) < %d",
            (string) $now,
            $name,
            $now - self::LOCK_SECONDS
        ));
        if (!$taken) {
            throw new PluginError(
                'apply_in_progress',
                __('Translations for this post are already being saved. Try again in a moment.', 'hyperlocalise')
            );
        }
    }

    private function unlock(int $post_id): void
    {
        global $wpdb;
        $wpdb->delete($wpdb->options, ['option_name' => self::LOCK_OPTION_PREFIX . $post_id]);
    }

    /**
     * Detects hand edits made to a translation since Hyperlocalise last saved it.
     */
    private function fingerprint(int $post_id): string
    {
        $post = get_post($post_id);
        if (!$post instanceof WP_Post) {
            return '';
        }
        return hash('sha256', (string) wp_json_encode([$post->post_title, $post->post_excerpt, $post->post_content]));
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
