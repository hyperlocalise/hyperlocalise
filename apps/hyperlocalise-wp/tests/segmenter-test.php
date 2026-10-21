<?php

use Hyperlocalise\WordPress\Segmenter;
use PHPUnit\Framework\TestCase;

final class SegmenterTest extends TestCase
{
    /**
     * @return array<string, mixed>
     */
    private static function block(?string $name, array $inner_content, array $inner_blocks = []): array
    {
        return [
            'blockName' => $name,
            'attrs' => [],
            'innerBlocks' => $inner_blocks,
            'innerHTML' => implode('', array_filter($inner_content, 'is_string')),
            'innerContent' => $inner_content,
        ];
    }

    public function test_extracts_block_text_without_surrounding_whitespace(): void
    {
        $blocks = [
            self::block('core/paragraph', ["\n<p>Hello <strong>world</strong></p>\n"]),
            self::block(null, ["\n\n"]),
            self::block('core/heading', ["\n<h2>Next</h2>\n"]),
        ];

        $segments = (new Segmenter())->extract_blocks($blocks);

        $this->assertSame([
            'content.0.0.0' => '<p>Hello <strong>world</strong></p>',
            'content.2.0.0' => '<h2>Next</h2>',
        ], $segments);
    }

    public function test_walks_inner_blocks_and_skips_wrapper_markup(): void
    {
        $blocks = [
            self::block('core/list', ["\n<ul>", null, "\n", null, "</ul>\n"], [
                self::block('core/list-item', ['<li>One</li>']),
                self::block('core/list-item', ['<li>Two</li>']),
            ]),
        ];

        $segments = (new Segmenter())->extract_blocks($blocks);

        $this->assertSame([
            'content.0-0.0.0' => '<li>One</li>',
            'content.0-1.0.0' => '<li>Two</li>',
        ], $segments);
    }

    public function test_skips_configured_blocks(): void
    {
        $blocks = [
            self::block('core/code', ['<pre><code>echo 1;</code></pre>']),
            self::block('core/paragraph', ['<p>Keep</p>']),
        ];

        $segments = (new Segmenter())->extract_blocks($blocks);

        $this->assertSame(['content.1.0.0' => '<p>Keep</p>'], $segments);
    }

    public function test_splits_classic_content_into_paragraphs(): void
    {
        $blocks = [self::block(null, ["First paragraph.\n\nSecond paragraph.\n  \n[gallery ids=\"1,2\"]"])];

        $segments = (new Segmenter())->extract_blocks($blocks);

        $this->assertSame([
            'content.0.0.0' => 'First paragraph.',
            'content.0.0.1' => 'Second paragraph.',
        ], $segments);
    }

    public function test_apply_replaces_text_and_preserves_structure(): void
    {
        $blocks = [
            self::block('core/paragraph', ["\n<p>Hello</p>\n"]),
            self::block('core/list', ['<ul>', null, '</ul>'], [
                self::block('core/list-item', ['<li>One</li>']),
            ]),
            self::block(null, ["Classic one.\n\nClassic two."]),
        ];

        $translated = (new Segmenter())->apply_blocks($blocks, [
            'content.0.0.0' => '<p>Bonjour</p>',
            'content.1-0.0.0' => '<li>Un</li>',
            'content.2.0.1' => 'Classique deux.',
        ]);

        $this->assertSame(["\n<p>Bonjour</p>\n"], $translated[0]['innerContent']);
        $this->assertSame("\n<p>Bonjour</p>\n", $translated[0]['innerHTML']);
        $this->assertSame(['<ul>', null, '</ul>'], $translated[1]['innerContent']);
        $this->assertSame(['<li>Un</li>'], $translated[1]['innerBlocks'][0]['innerContent']);
        $this->assertSame(["Classic one.\n\nClassique deux."], $translated[2]['innerContent']);
    }

    public function test_apply_keeps_source_for_missing_or_blank_translations(): void
    {
        $segmenter = new Segmenter();

        $this->assertSame('  Title ', $segmenter->apply_text('title', '  Title ', ['title' => '   ']));
        $this->assertSame('  Titre ', $segmenter->apply_text('title', '  Title ', ['title' => 'Titre']));
        $this->assertSame('Title', $segmenter->apply_text('title', 'Title', []));
    }

    public function test_extract_and_apply_produce_matching_keys(): void
    {
        $blocks = [
            self::block('core/group', ['<div>', null, '</div>'], [
                self::block('core/paragraph', ['<p>A</p>']),
                self::block('core/paragraph', ['<p>B</p>']),
            ]),
        ];
        $segmenter = new Segmenter();
        $segments = $segmenter->extract_blocks($blocks);
        $french = array_map(static function (string $text): string {
            return str_replace('<p>', '<p>FR ', $text);
        }, $segments);

        $translated = $segmenter->extract_blocks($segmenter->apply_blocks($blocks, $french));

        $this->assertSame($french, $translated);
    }

    public function test_has_text_ignores_markup_entities_and_shortcodes(): void
    {
        $this->assertFalse(Segmenter::has_text("<div>\n</div>"));
        $this->assertFalse(Segmenter::has_text('<p>&nbsp;</p>'));
        $this->assertFalse(Segmenter::has_text('[embed]'));
        $this->assertFalse(Segmenter::has_text('<hr />'));
        $this->assertTrue(Segmenter::has_text('<p>日本語</p>'));
        $this->assertTrue(Segmenter::has_text('2026'));
    }
}
