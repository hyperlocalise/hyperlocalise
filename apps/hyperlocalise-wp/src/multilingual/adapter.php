<?php

namespace Hyperlocalise\WordPress\Multilingual;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Bridges Hyperlocalise to the site's multilingual plugin. Hyperlocalise never
 * stores language relationships itself; adapters read and write them through
 * the multilingual plugin's public API.
 */
interface Adapter
{
    public function id(): string;

    public function label(): string;

    public function is_available(): bool;

    /**
     * @return array<string, array{code: string, locale: string, name: string}>
     */
    public function languages(): array;

    public function default_language(): string;

    public function post_language(int $post_id): ?string;

    public function translation_id(int $post_id, string $language): ?int;

    public function assign_translation(int $source_id, int $translation_id, string $language): void;
}
