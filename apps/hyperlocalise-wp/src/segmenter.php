<?php

namespace Hyperlocalise\WordPress;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Converts post fields into flat `key => text` segments and writes translated
 * segments back. Content is handled as parsed block arrays (`parse_blocks()`
 * output) so block comments and attributes are never sent for translation.
 *
 * Segment keys must stay stable for an unchanged post because Hyperlocalise
 * matches translations by key.
 */
final class Segmenter
{
    public const TITLE_KEY = 'title';
    public const EXCERPT_KEY = 'excerpt';
    public const CONTENT_PREFIX = 'content.';
    public const META_PREFIX = 'meta.';

    public const DEFAULT_SKIPPED_BLOCKS = [
        'core/code',
        'core/embed',
        'core/shortcode',
        'core/freeform-code',
    ];

    private const PARAGRAPH_BREAK = '/(\n[ \t]*\n)/';
    private const TAG = '/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/';
    private const VOID_ELEMENTS = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'];

    /** @var array<string, true> */
    private array $skipped_blocks;

    /**
     * @param string[] $skipped_blocks
     */
    public function __construct(array $skipped_blocks = self::DEFAULT_SKIPPED_BLOCKS)
    {
        $this->skipped_blocks = array_fill_keys($skipped_blocks, true);
    }

    /**
     * @param array<int, array<string, mixed>> $blocks
     * @return array<string, string>
     */
    public function extract_blocks(array $blocks): array
    {
        $segments = [];
        $this->transform_blocks($blocks, '', null, $segments);
        return $segments;
    }

    /**
     * @param array<int, array<string, mixed>> $blocks
     * @param array<string, string> $translations
     * @return array<int, array<string, mixed>>
     */
    public function apply_blocks(array $blocks, array $translations): array
    {
        $segments = [];
        return $this->transform_blocks($blocks, '', $translations, $segments);
    }

    /**
     * @param array<string, string> $segments
     */
    public function extract_text(string $key, string $value, array &$segments): void
    {
        $this->transform_text($key, $value, null, $segments);
    }

    /**
     * @param array<string, string> $translations
     */
    public function apply_text(string $key, string $value, array $translations): string
    {
        $segments = [];
        return $this->transform_text($key, $value, $translations, $segments);
    }

    public static function has_text(string $html): bool
    {
        $text = (string) preg_replace('/\[[^\]]*\]/', '', strip_tags($html));
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        return preg_match('/[\p{L}\p{N}]/u', $text) === 1;
    }

    /**
     * A translation may reorder inline tags but must keep the same tags and
     * nest them correctly, or the block editor reports the block as invalid.
     */
    public static function same_markup(string $source, string $translated): bool
    {
        [$source_tags, $source_balanced] = self::tags($source);
        [$translated_tags, $translated_balanced] = self::tags($translated);
        sort($source_tags);
        sort($translated_tags);
        // Classic-editor chunks split on blank lines can be unbalanced in the source itself.
        return $source_tags === $translated_tags && ($translated_balanced || !$source_balanced);
    }

    /**
     * @return array{0: string[], 1: bool} Tag tokens such as `strong` and `/strong`, and whether they nest correctly.
     */
    private static function tags(string $html): array
    {
        preg_match_all(self::TAG, $html, $matches, PREG_SET_ORDER);
        $tokens = [];
        $open = [];
        $balanced = true;
        foreach ($matches as $match) {
            $name = strtolower($match[2]);
            $is_closing = $match[1] === '/';
            $tokens[] = ($is_closing ? '/' : '') . $name;
            if ($match[3] === '/' || in_array($name, self::VOID_ELEMENTS, true)) {
                continue;
            }
            if (!$is_closing) {
                $open[] = $name;
            } elseif (array_pop($open) !== $name) {
                $balanced = false;
            }
        }
        return [$tokens, $balanced && $open === []];
    }

    /**
     * @param array<int, array<string, mixed>> $blocks
     * @param array<string, string>|null $translations Null to collect segments.
     * @param array<string, string> $segments
     * @return array<int, array<string, mixed>>
     */
    private function transform_blocks(array $blocks, string $prefix, ?array $translations, array &$segments): array
    {
        foreach ($blocks as $index => $block) {
            $name = isset($block['blockName']) && is_string($block['blockName']) ? $block['blockName'] : '';
            if ($name !== '' && isset($this->skipped_blocks[$name])) {
                continue;
            }

            $path = $prefix === '' ? (string) $index : $prefix . '-' . $index;
            $inner_content = isset($block['innerContent']) && is_array($block['innerContent'])
                ? $block['innerContent']
                : [];

            foreach ($inner_content as $part_index => $part) {
                if (!is_string($part)) {
                    continue;
                }
                $inner_content[$part_index] = $this->transform_html(
                    self::CONTENT_PREFIX . $path . '.' . $part_index,
                    $part,
                    $translations,
                    $segments
                );
            }

            if ($translations !== null) {
                $block['innerContent'] = $inner_content;
                $block['innerHTML'] = implode('', array_filter($inner_content, 'is_string'));
            }

            if (isset($block['innerBlocks']) && is_array($block['innerBlocks']) && $block['innerBlocks'] !== []) {
                $block['innerBlocks'] = $this->transform_blocks($block['innerBlocks'], $path, $translations, $segments);
            }

            $blocks[$index] = $block;
        }

        return $blocks;
    }

    /**
     * Splits on blank lines so classic-editor content becomes paragraph-sized
     * segments instead of one segment per post.
     *
     * @param array<string, string>|null $translations
     * @param array<string, string> $segments
     */
    private function transform_html(string $key, string $html, ?array $translations, array &$segments): string
    {
        $pieces = preg_split(self::PARAGRAPH_BREAK, $html, -1, PREG_SPLIT_DELIM_CAPTURE);
        if (!is_array($pieces)) {
            return $html;
        }

        $chunk = 0;
        foreach ($pieces as $piece_index => $piece) {
            if ($piece_index % 2 === 1) {
                continue;
            }
            $pieces[$piece_index] = $this->transform_text($key . '.' . $chunk, $piece, $translations, $segments);
            $chunk++;
        }

        return implode('', $pieces);
    }

    /**
     * @param array<string, string>|null $translations
     * @param array<string, string> $segments
     */
    private function transform_text(string $key, string $value, ?array $translations, array &$segments): string
    {
        if (!self::has_text($value)) {
            return $value;
        }

        preg_match('/^(\s*)(.*?)(\s*)$/su', $value, $matches);
        $leading = $matches[1] ?? '';
        $core = $matches[2] ?? $value;
        $trailing = $matches[3] ?? '';

        if ($translations === null) {
            $segments[$key] = $core;
            return $value;
        }

        $translated = $translations[$key] ?? null;
        if (!is_string($translated) || trim($translated) === '') {
            return $value;
        }
        return $leading . $translated . $trailing;
    }
}
