//go:build cgo_hunspell

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"sync"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/spellcheck"
	"github.com/stretchr/testify/require"
)

// These tests exercise the handler-to-real-Hunspell path over HTTP.
// Lower-level Hunspell behaviour is covered by spellcheck_provider_cgo_test.go.

const (
	integrationLocaleEnUS = "en-US"
	integrationLocaleEnGB = "en-GB"
	integrationLocalePtBR = "pt-BR"
	integrationLocalePtPT = "pt-PT"
)

func newIntegrationSpellChecker(t *testing.T) *hunspellSpellChecker {
	t.Helper()

	dir := t.TempDir()
	writeFixtureCopy(t, dir, "en-us", filepath.Join("testdata", "integration", "en-us"))
	writeFixtureCopy(t, dir, "en-gb", filepath.Join("testdata", "integration", "en-gb"))
	writeFixtureCopy(t, dir, "pt-br", filepath.Join("testdata", "integration", "pt-br"))
	writeFixtureCopy(t, dir, "pt-pt", filepath.Join("testdata", "integration", "pt-pt"))

	registry := spellcheck.NewRegistry(map[string]spellcheck.DictionaryFiles{
		integrationLocaleEnUS: {AffFile: "en-us.aff", DicFile: "en-us.dic"},
		integrationLocaleEnGB: {AffFile: "en-gb.aff", DicFile: "en-gb.dic"},
		integrationLocalePtBR: {AffFile: "pt-br.aff", DicFile: "pt-br.dic"},
		integrationLocalePtPT: {AffFile: "pt-pt.aff", DicFile: "pt-pt.dic"},
	})

	checker := newHunspellSpellChecker(dir, registry)
	t.Cleanup(func() {
		require.NoError(t, checker.Close())
	})
	return checker
}

func spellingChecksOf(checks []segmentvalidate.Check) []segmentvalidate.Check {
	var out []segmentvalidate.Check
	for _, c := range checks {
		if c.Category == QA_MODE_SPELLING {
			out = append(out, c)
		}
	}
	return out
}

func postSegmentAndDecode(t *testing.T, client *http.Client, baseURL, payload string) validateSegmentResponse {
	t.Helper()

	resp, err := postSegment(client, baseURL, payload)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var parsed validateSegmentResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&parsed))
	return parsed
}

func TestIntegrationSpellingAcrossLocaleFamiliesAndRegionalVariants(t *testing.T) {
	checker := newIntegrationSpellChecker(t)
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: checker}
	baseURL, _ := startTestServer(t, h)
	client := &http.Client{}

	tests := []struct {
		name            string
		locale          string
		targetText      string
		wantWarningWord string 
		wantSuggestion  string 
	}{
		{name: "en-US accepts its own spelling", locale: integrationLocaleEnUS, targetText: "please update color"},
		{
			name:            "en-US flags the en-GB spelling",
			locale:          integrationLocaleEnUS,
			targetText:      "please update colour",
			wantWarningWord: "colour",
			wantSuggestion:  "color",
		},
		{name: "en-GB accepts its own spelling", locale: integrationLocaleEnGB, targetText: "please update colour"},
		{
			name:            "en-GB flags the en-US spelling (no regional fallback)",
			locale:          integrationLocaleEnGB,
			targetText:      "please update color",
			wantWarningWord: "color",
			wantSuggestion:  "colour",
		},
		{name: "pt-BR accepts its own spelling", locale: integrationLocalePtBR, targetText: "nome atualizar registro"},
		{
			name:            "pt-BR flags the pt-PT spelling",
			locale:          integrationLocalePtBR,
			targetText:      "nome atualizar registo",
			wantWarningWord: "registo",
			wantSuggestion:  "registro",
		},
		{name: "pt-PT accepts its own spelling", locale: integrationLocalePtPT, targetText: "nome atualizar registo"},
		{
			name:            "pt-PT flags the pt-BR spelling (no regional fallback)",
			locale:          integrationLocalePtPT,
			targetText:      "nome atualizar registro",
			wantWarningWord: "registro",
			wantSuggestion:  "registo",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload := fmt.Sprintf(
				`{"sourceText":"Hello","targetText":%q,"sourcePath":"/messages/test.json","modes":["spelling"],"targetLocale":%q}`,
				tt.targetText, tt.locale,
			)
			parsed := postSegmentAndDecode(t, client, baseURL, payload)
			require.Empty(t, parsed.SkippedModes, "a fixture-supported locale must not report spelling as skipped")

			spellingChecks := spellingChecksOf(parsed.Checks)
			if tt.wantWarningWord == "" {
				require.Empty(t, spellingChecks, "no spelling warnings expected for text using %s's own spelling", tt.locale)
				return
			}

			require.Len(t, spellingChecks, 1)
			require.Equal(t, segmentvalidate.StatusWarn, spellingChecks[0].Status)
			require.Contains(t, spellingChecks[0].RelatedTokens, tt.wantWarningWord)
			if tt.wantSuggestion != "" {
				require.Contains(t, spellingChecks[0].RelatedTokens, tt.wantSuggestion)
			}
		})
	}
}

func TestIntegrationPlaceholdersAndMarkupProduceNoFalsePositives(t *testing.T) {
	checker := newIntegrationSpellChecker(t)
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: checker}
	baseURL, _ := startTestServer(t, h)
	client := &http.Client{}

	const payload = `{"sourceText":"<b>hello</b> update {name} color","targetText":"<b>please</b> update {name} colour","sourcePath":"/messages/test.json","modes":["spelling"],"targetLocale":"en-US"}`
	parsed := postSegmentAndDecode(t, client, baseURL, payload)
	require.Empty(t, parsed.SkippedModes)

	spellingChecks := spellingChecksOf(parsed.Checks)
	require.Len(t, spellingChecks, 1, "the HTML tags and {name} placeholder must not be flagged, only the genuine misspelling")
	require.Equal(t, segmentvalidate.StatusWarn, spellingChecks[0].Status)
	require.Contains(t, spellingChecks[0].RelatedTokens, "colour")
}

func TestIntegrationUnsupportedLocaleSkipsSpellingButKeepsFormatChecks(t *testing.T) {
	checker := newIntegrationSpellChecker(t)
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: checker}
	baseURL, _ := startTestServer(t, h)
	client := &http.Client{}

	const payload = `{"sourceText":"Hello","targetText":"Bonjour","sourcePath":"/messages/test.json","modes":["spelling"],"targetLocale":"ja-JP"}`
	parsed := postSegmentAndDecode(t, client, baseURL, payload)

	require.Equal(t, []string{QA_MODE_SPELLING}, parsed.SkippedModes)
	require.NotEmpty(t, parsed.Checks, "format/QA checks must still run for a locale with no spelling dictionary")
	require.Empty(t, spellingChecksOf(parsed.Checks))
}

type localeConcurrencyCase struct {
	locale          string
	targetText      string
	wantWarningWord string
}

func TestIntegrationConcurrentRequestsAcrossLocales(t *testing.T) {
	checker := newIntegrationSpellChecker(t)
	h := &handler{validate: segmentvalidate.ValidateSegment, spellChecker: checker}
	baseURL, _ := startTestServer(t, h)
	client := &http.Client{}

	cases := []localeConcurrencyCase{
		{locale: integrationLocaleEnUS, targetText: "please update color"},
		{locale: integrationLocaleEnUS, targetText: "please update colour", wantWarningWord: "colour"},
		{locale: integrationLocaleEnGB, targetText: "please update colour"},
		{locale: integrationLocaleEnGB, targetText: "please update color", wantWarningWord: "color"},
		{locale: integrationLocalePtBR, targetText: "nome atualizar registro"},
		{locale: integrationLocalePtBR, targetText: "nome atualizar registo", wantWarningWord: "registo"},
		{locale: integrationLocalePtPT, targetText: "nome atualizar registo"},
		{locale: integrationLocalePtPT, targetText: "nome atualizar registro", wantWarningWord: "registro"},
	}

	const repeats = 3
	var wg sync.WaitGroup
	errCh := make(chan error, len(cases)*repeats)

	for _, tc := range cases {
		for i := 0; i < repeats; i++ {
			wg.Add(1)
			go func(tc localeConcurrencyCase) {
				defer wg.Done()

				payload := fmt.Sprintf(
					`{"sourceText":"Hello","targetText":%q,"sourcePath":"/messages/test.json","modes":["spelling"],"targetLocale":%q}`,
					tc.targetText, tc.locale,
				)
				resp, err := postSegment(client, baseURL, payload)
				if err != nil {
					errCh <- fmt.Errorf("%s/%s: request error: %w", tc.locale, tc.targetText, err)
					return
				}
				defer func() { _ = resp.Body.Close() }()

				body, err := io.ReadAll(resp.Body)
				if err != nil {
					errCh <- fmt.Errorf("%s/%s: read body: %w", tc.locale, tc.targetText, err)
					return
				}
				if resp.StatusCode != http.StatusOK {
					errCh <- fmt.Errorf("%s/%s: status = %d (body=%s)", tc.locale, tc.targetText, resp.StatusCode, body)
					return
				}

				var parsed validateSegmentResponse
				if err := json.Unmarshal(body, &parsed); err != nil {
					errCh <- fmt.Errorf("%s/%s: decode: %w", tc.locale, tc.targetText, err)
					return
				}

				spellingChecks := spellingChecksOf(parsed.Checks)
				if tc.wantWarningWord == "" {
					if len(spellingChecks) != 0 {
						errCh <- fmt.Errorf("%s/%s: unexpected spelling warnings: %+v", tc.locale, tc.targetText, spellingChecks)
					}
					return
				}
				if len(spellingChecks) != 1 {
					errCh <- fmt.Errorf("%s/%s: got %d spelling warnings, want 1", tc.locale, tc.targetText, len(spellingChecks))
					return
				}
				found := false
				for _, token := range spellingChecks[0].RelatedTokens {
					if token == tc.wantWarningWord {
						found = true
						break
					}
				}
				if !found {
					errCh <- fmt.Errorf("%s/%s: expected warning for %q, got tokens %v", tc.locale, tc.targetText, tc.wantWarningWord, spellingChecks[0].RelatedTokens)
				}
			}(tc)
		}
	}

	wg.Wait()
	close(errCh)
	for err := range errCh {
		t.Error(err)
	}
}
