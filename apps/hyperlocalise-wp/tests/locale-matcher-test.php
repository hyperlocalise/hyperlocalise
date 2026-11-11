<?php

use Hyperlocalise\WordPress\LocaleMatcher;
use PHPUnit\Framework\TestCase;

final class LocaleMatcherTest extends TestCase
{
    public function test_matches_wordpress_locale_to_project_locale(): void
    {
        $this->assertSame('fr-FR', LocaleMatcher::find('fr', 'fr_FR', ['de-DE', 'fr-FR']));
        $this->assertSame('pt-BR', LocaleMatcher::find('pt-br', 'pt_BR', ['pt-BR', 'pt-PT']));
    }

    public function test_falls_back_to_code_then_unique_language(): void
    {
        $this->assertSame('ja', LocaleMatcher::find('ja', '', ['ja']));
        $this->assertSame('de-DE', LocaleMatcher::find('de', 'de_CH', ['de-DE', 'fr-FR']));
        $this->assertNull(LocaleMatcher::find('pt', 'pt_AO', ['pt-BR', 'pt-PT']));
    }

    public function test_override_wins_and_does_not_fall_back(): void
    {
        $overrides = LocaleMatcher::parse_overrides("# comment\npt = pt-PT\nes=es-419\n");

        $this->assertSame(['pt' => 'pt-PT', 'es' => 'es-419'], $overrides);
        $this->assertSame('pt-PT', LocaleMatcher::find('pt', 'pt_BR', ['pt-BR', 'pt-PT'], $overrides));
        $this->assertNull(LocaleMatcher::find('es', 'es_ES', ['es-ES'], $overrides));
    }

    public function test_match_maps_every_language(): void
    {
        $this->assertSame(
            ['en' => 'en-US', 'fr' => 'fr-FR', 'it' => null],
            LocaleMatcher::match(['en' => 'en_US', 'fr' => 'fr_FR', 'it' => 'it_IT'], ['en-US', 'fr-FR'])
        );
    }
}
