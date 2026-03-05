package runsvc

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/quiet-circles/hyperlocalise/internal/i18n/translator"
)

const (
	translationRetryMaxAttempts = 5
	translationRetryBaseDelay   = 250 * time.Millisecond
	translationRetryMaxDelay    = 5 * time.Second
)

var wordTokenPattern = regexp.MustCompile(`[\p{L}][\p{L}\p{N}_-]{2,}`)

var sleepWithContext = func(ctx context.Context, delay time.Duration) error {
	t := time.NewTimer(delay)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

type autoRepairOutcome struct {
	Evaluated bool
	Triggered bool
	Succeeded bool
	Failed    bool
	Overhead  translator.Usage
}

func (s *Service) translateWithRetry(ctx context.Context, task Task) (string, autoRepairOutcome, error) {
	requestContext := strings.TrimSpace(task.EntryKey)
	if memory := strings.TrimSpace(task.ContextMemory); memory != "" {
		requestContext = requestContext + "\n\nShared memory:\n" + memory
	}

	request := translator.Request{
		Source:         task.SourceText,
		TargetLanguage: task.TargetLocale,
		Context:        requestContext,
		ModelProvider:  task.Provider,
		Model:          task.Model,
		Prompt:         task.Prompt,
	}

	outcome := autoRepairOutcome{}
	if !task.AutoRepair {
		translated, err := s.translateRequestWithRetry(ctx, request)
		return translated, outcome, err
	}
	outcome.Evaluated = true

	// Pass 1 produces the draft translation.
	pass1Usage := translator.Usage{}
	pass1, err := s.translateRequestWithRetry(translator.WithUsageCollector(ctx, &pass1Usage), request)
	if err != nil {
		return "", outcome, err
	}
	// Guardrails keep repair targeted to likely leakage cases to control cost and latency.
	if !shouldAttemptAutoRepair(task.SourceLocale, task.TargetLocale, task.SourceText, pass1) {
		translator.SetUsage(ctx, pass1Usage)
		return pass1, outcome, nil
	}
	outcome.Triggered = true

	// Pass 2 rewrites the draft when leakage is suspected.
	repairReq := request
	repairReq.Source = buildRepairSource(task.SourceText, pass1)
	repairReq.Prompt = buildRepairPrompt(task.Prompt)

	pass2Usage := translator.Usage{}
	repaired, err := s.translateRequestWithRetry(translator.WithUsageCollector(ctx, &pass2Usage), repairReq)
	outcome.Overhead = pass2Usage
	if err != nil {
		outcome.Failed = true
		translator.SetUsage(ctx, addTranslatorUsage(pass1Usage, pass2Usage))
		return "", outcome, fmt.Errorf("auto-repair failed: %w", err)
	}
	outcome.Succeeded = true
	translator.SetUsage(ctx, addTranslatorUsage(pass1Usage, pass2Usage))
	return repaired, outcome, nil
}

func (s *Service) translateRequestWithRetry(ctx context.Context, request translator.Request) (string, error) {
	var lastErr error
	attempt := 0
	for attempt = range translationRetryMaxAttempts {
		translated, err := s.translate(ctx, request)
		if err == nil {
			return translated, nil
		}
		lastErr = err
		if !isRetryableTranslateError(err) || attempt+1 >= translationRetryMaxAttempts {
			break
		}

		delay := translationRetryDelay(attempt)
		if waitErr := sleepWithContext(ctx, delay); waitErr != nil {
			return "", fmt.Errorf("translation retry wait interrupted: %w", waitErr)
		}
	}

	if lastErr == nil {
		return "", fmt.Errorf("translation failed: unknown error")
	}
	return "", fmt.Errorf("translation failed after %d attempts: %w", attempt+1, lastErr)
}

func isRetryableTranslateError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}

	var netErr net.Error
	if errors.As(err, &netErr) {
		if netErr.Timeout() {
			return true
		}
	}

	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "429") || strings.Contains(msg, "rate limit") || strings.Contains(msg, "too many requests") {
		return true
	}
	if strings.Contains(msg, "timeout") || strings.Contains(msg, "timed out") {
		return true
	}
	if strings.Contains(msg, "status code 500") || strings.Contains(msg, "status code 502") || strings.Contains(msg, "status code 503") || strings.Contains(msg, "status code 504") {
		return true
	}
	if strings.Contains(msg, "service unavailable") || strings.Contains(msg, "temporarily unavailable") {
		return true
	}

	return false
}

func translationRetryDelay(attempt int) time.Duration {
	factor := math.Pow(2, float64(attempt))
	delay := time.Duration(float64(translationRetryBaseDelay) * factor)
	if delay > translationRetryMaxDelay {
		return translationRetryMaxDelay
	}
	return delay
}

func buildRepairPrompt(basePrompt string) string {
	base := strings.TrimSpace(basePrompt)
	if base == "" {
		base = "You are a translation assistant."
	}
	return base + " This is pass 2 quality repair. Improve the translation draft so it is fully in the target language, fluent, and natural. Remove source-language bleed-through while preserving placeholders, variables, markup, and formatting. Return only the repaired translation."
}

func buildRepairSource(source, draft string) string {
	return "ORIGINAL_SOURCE_TEXT:\n" + source + "\n\nTRANSLATION_DRAFT:\n" + draft
}

func shouldAttemptAutoRepair(sourceLocale, targetLocale, source, translated string) bool {
	source = strings.TrimSpace(source)
	translated = strings.TrimSpace(translated)
	if source == "" || translated == "" {
		return false
	}
	// If source/target are effectively the same language, high lexical overlap is expected.
	// Auto-repair would mostly add cost and churn without quality gains.
	if sameLanguageFamily(sourceLocale, targetLocale) {
		return false
	}
	// Very short strings are noisy for language/leak heuristics; avoid over-triggering.
	if len([]rune(translated)) < 12 {
		return false
	}

	// Exact copy is a clear failure mode for translation and should always be repaired.
	if strings.EqualFold(source, translated) {
		return true
	}

	// Full-source echo in output is a strong leakage signal.
	normalizedSource := strings.ToLower(strings.Join(strings.Fields(source), " "))
	normalizedTranslated := strings.ToLower(strings.Join(strings.Fields(translated), " "))
	if len([]rune(normalizedSource)) >= 16 && strings.Contains(normalizedTranslated, normalizedSource) {
		return true
	}

	sourceTokens := normalizeTokenSet(wordTokenPattern.FindAllString(source, -1))
	if len(sourceTokens) == 0 {
		return false
	}
	translatedTokens := normalizeTokenSet(wordTokenPattern.FindAllString(translated, -1))
	if len(translatedTokens) == 0 {
		return false
	}

	overlap := 0
	for token := range translatedTokens {
		if _, ok := sourceTokens[token]; ok {
			overlap++
		}
	}

	translatedTokenCount := len(translatedTokens)
	// When all output tokens exist in source tokens, output is effectively an unlocalized rewrite.
	if overlap == translatedTokenCount && translatedTokenCount >= 1 {
		return true
	}
	overlapRatio := float64(overlap) / float64(translatedTokenCount)
	// Extremely high overlap is a fallback guardrail even when language confidence is unavailable.
	// This keeps leakage catch-rate high for unsupported locales.
	if overlapRatio >= 0.9 && translatedTokenCount >= 3 {
		return true
	}

	// Language confidence is the primary signal; overlap is used as corroboration.
	confidence, known := targetLanguageConfidence(targetLocale, translated)
	if known && confidence < 0.2 && overlap >= 2 && overlapRatio >= 0.2 {
		return true
	}
	if !known && overlap >= 3 && overlapRatio >= 0.9 {
		return true
	}

	return false
}

func normalizeTokenSet(tokens []string) map[string]struct{} {
	set := make(map[string]struct{}, len(tokens))
	for _, token := range tokens {
		normalized := strings.ToLower(strings.TrimSpace(token))
		if normalized == "" || containsDigit(normalized) || len([]rune(normalized)) < 3 {
			continue
		}
		set[normalized] = struct{}{}
	}
	return set
}

func containsDigit(s string) bool {
	for _, r := range s {
		if unicode.IsDigit(r) {
			return true
		}
	}
	return false
}

func sameLanguageFamily(sourceLocale, targetLocale string) bool {
	return localeRoot(sourceLocale) == localeRoot(targetLocale)
}

func localeRoot(locale string) string {
	trimmed := strings.ToLower(strings.TrimSpace(locale))
	if trimmed == "" {
		return ""
	}
	if idx := strings.IndexAny(trimmed, "-_"); idx > 0 {
		return trimmed[:idx]
	}
	return trimmed
}

var localeStopwords = map[string]map[string]struct{}{
	"fr": {"le": {}, "la": {}, "les": {}, "des": {}, "pour": {}, "avec": {}, "dans": {}, "est": {}, "une": {}, "sur": {}, "pas": {}, "que": {}},
	"es": {"el": {}, "la": {}, "los": {}, "las": {}, "para": {}, "con": {}, "una": {}, "por": {}, "que": {}, "del": {}, "como": {}, "está": {}},
	"de": {"der": {}, "die": {}, "das": {}, "und": {}, "mit": {}, "für": {}, "ist": {}, "nicht": {}, "eine": {}, "auf": {}, "von": {}, "den": {}},
	"it": {"il": {}, "la": {}, "gli": {}, "con": {}, "per": {}, "una": {}, "che": {}, "non": {}, "del": {}, "della": {}, "sul": {}, "dei": {}},
	"pt": {"o": {}, "a": {}, "os": {}, "as": {}, "para": {}, "com": {}, "uma": {}, "que": {}, "não": {}, "dos": {}, "das": {}, "está": {}},
	"vi": {"và": {}, "của": {}, "cho": {}, "với": {}, "một": {}, "không": {}, "trong": {}, "được": {}, "để": {}, "là": {}, "này": {}, "các": {}},
	"en": {"the": {}, "and": {}, "for": {}, "with": {}, "from": {}, "that": {}, "this": {}, "you": {}, "are": {}, "not": {}, "your": {}, "into": {}},
}

func targetLanguageConfidence(targetLocale, text string) (float64, bool) {
	root := localeRoot(targetLocale)
	switch root {
	case "zh":
		return scriptPresenceConfidence(text, unicode.Han), true
	case "ja":
		return scriptPresenceConfidence(text, unicode.Hiragana, unicode.Katakana, unicode.Han), true
	case "ko":
		return scriptPresenceConfidence(text, unicode.Hangul), true
	case "ru", "uk", "bg", "sr":
		return scriptPresenceConfidence(text, unicode.Cyrillic), true
	case "ar":
		return scriptPresenceConfidence(text, unicode.Arabic), true
	}

	stopwords, ok := localeStopwords[root]
	if !ok {
		return 0, false
	}
	// For Latin-script locales we use a tiny stopword probe as a cheap language-ID heuristic.
	tokens := wordTokenPattern.FindAllString(strings.ToLower(text), -1)
	if len(tokens) == 0 {
		return 0, true
	}
	matches := 0
	limit := min(len(tokens), 10)
	for i := 0; i < limit; i++ {
		if _, hit := stopwords[tokens[i]]; hit {
			matches++
		}
	}
	return float64(matches) / float64(limit), true
}

func scriptPresenceConfidence(text string, tables ...*unicode.RangeTable) float64 {
	total := 0
	matches := 0
	for _, r := range text {
		if unicode.IsSpace(r) || unicode.IsPunct(r) || unicode.IsDigit(r) {
			continue
		}
		total++
		for _, table := range tables {
			if unicode.Is(table, r) {
				matches++
				break
			}
		}
	}
	if total == 0 {
		return 0
	}
	return float64(matches) / float64(total)
}

func addTranslatorUsage(current, delta translator.Usage) translator.Usage {
	current.PromptTokens += delta.PromptTokens
	current.CompletionTokens += delta.CompletionTokens
	current.TotalTokens += delta.TotalTokens
	return current
}
