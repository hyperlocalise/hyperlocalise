<?php

use Hyperlocalise\WordPress\Segmenter;
use Hyperlocalise\WordPress\TranslationService;
use PHPUnit\Framework\TestCase;

final class ReviewTranslationsTest extends TestCase
{
    public function test_same_markup_allows_reordered_inline_tags(): void
    {
        $this->assertTrue(Segmenter::same_markup(
            '<p>Hello <strong>World</strong> and <a href="/a">link</a></p>',
            '<p><a href="/fr/a">Lien</a> et <strong>Monde</strong> bonjour</p>'
        ));
        $this->assertTrue(Segmenter::same_markup('Line<br>two', 'Ligne<br />deux'));
    }

    public function test_same_markup_rejects_missing_extra_or_misnested_tags(): void
    {
        $this->assertFalse(Segmenter::same_markup('<p>Hello <strong>World</strong></p>', '<p>Bonjour Monde</p>'));
        $this->assertFalse(Segmenter::same_markup('<p>Hello</p>', '<p>Bonjour <em>!</em></p>'));
        $this->assertFalse(Segmenter::same_markup('<p><strong><em>Hi</em></strong></p>', '<p><strong><em>Salut</strong></em></p>'));
        $this->assertFalse(Segmenter::same_markup('<p>Hello</p>', '<p>Bonjour'));
    }

    public function test_same_markup_accepts_chunks_unbalanced_in_the_source(): void
    {
        $this->assertTrue(Segmenter::same_markup('<p>First', '<p>Premier'));
        $this->assertFalse(Segmenter::same_markup('<p>First', 'Premier'));
    }

    public function test_review_counts_untranslated_and_rejected_segments(): void
    {
        $review = TranslationService::review_translations(
            [
                'title' => 'Hello',
                'content.0.0.0' => '<p>Hello <strong>World</strong></p>',
                'content.1.0.0' => '<p>Shipping</p>',
                'excerpt' => 'Fast',
                'meta.description' => 'Fast shipping',
            ],
            [
                'title' => 'Bonjour',
                'content.0.0.0' => '<p>Bonjour Monde</p>',
                'content.1.0.0' => '<p>Shipping</p>',
                'excerpt' => '  ',
            ]
        );

        $this->assertSame(['title' => 'Bonjour'], $review['translations']);
        $this->assertSame(3, $review['untranslated']);
        $this->assertSame(1, $review['rejected']);
    }
}
