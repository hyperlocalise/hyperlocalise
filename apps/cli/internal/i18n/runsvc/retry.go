package runsvc

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/icuparser"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translator"
)

const (
	translationAPIMaxAttempts        = 3 // initial + 2 retries
	translationValidationMaxAttempts = 3 // initial output + 2 correction rounds
	translationRetryBaseDelay        = 250 * time.Millisecond
	translationRetryMaxDelay         = 5 * time.Second
	maxSourceContextLen              = 800
)

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

type invariantViolationError struct {
	msg   string
	cause error
}

func (e *invariantViolationError) Error() string {
	if e.cause == nil {
		return e.msg
	}
	return e.msg + ": " + e.cause.Error()
}

func (e *invariantViolationError) Unwrap() error {
	return e.cause
}

// postTranslateValidationError is a non-ICU validation failure (HTML, markdown tokens, etc.).
type postTranslateValidationError struct {
	msg string
}

func (e *postTranslateValidationError) Error() string { return e.msg }

type translateValidator func(source, translated string) error

func (s *Service) translateWithRetry(ctx context.Context, task Task) (string, error) {
	materializeTaskPrompts(&task)
	runtimeContext := buildTranslationRuntimeContext(task.EntryKey, task.SourceContext, task.ContextMemory)
	userPrompt := strings.TrimSpace(task.UserPrompt)

	request := translator.Request{
		Source:         task.SourceText,
		TargetLanguage: task.TargetLocale,
		ModelProvider:  task.Provider,
		Model:          task.Model,
		SystemPrompt:   task.SystemPrompt,
		UserPrompt:     userPrompt,
		RuntimeContext: runtimeContext,
	}

	return s.translateWithValidationStrategy(ctx, request, func(_, translated string) error {
		return validateTranslatedOutput(task, translated)
	})
}

func (s *Service) translateRequestWithRetry(ctx context.Context, request translator.Request) (string, error) {
	return s.translateWithValidationStrategy(ctx, request, validateTranslatedInvariant)
}

func (s *Service) translateWithValidationStrategy(ctx context.Context, request translator.Request, validate translateValidator) (string, error) {
	source := request.Source
	baseReq := request
	baseRuntime := strings.TrimSpace(request.RuntimeContext)

	var lastValErr error
	var lastOut string

	for valAttempt := 0; valAttempt < translationValidationMaxAttempts; valAttempt++ {
		req := baseReq
		if valAttempt == 0 {
			req.RuntimeContext = baseRuntime
		} else {
			req.RuntimeContext = buildValidationFixRuntimeContext(baseRuntime, lastValErr, lastOut)
		}

		translated, err := s.translateWithAPIRetries(ctx, req)
		if err != nil {
			return "", err
		}

		vErr := validate(source, translated)
		if vErr == nil {
			return translated, nil
		}
		if valAttempt+1 >= translationValidationMaxAttempts {
			return "", fmt.Errorf("translation validation failed after %d attempt(s): %w", translationValidationMaxAttempts, vErr)
		}
		lastValErr, lastOut = vErr, translated
	}
	panic("unreachable")
}

func buildValidationFixRuntimeContext(baseRuntime string, valErr error, previousOutput string) string {
	var b strings.Builder
	if baseRuntime != "" {
		b.WriteString(baseRuntime)
		b.WriteString("\n\n")
	}
	b.WriteString("Translation validation failed. Return only the corrected translation with no explanations.\n\nError:\n")
	b.WriteString(valErr.Error())
	b.WriteString("\n\nPrevious output:\n")
	b.WriteString(elideInvariantDebugString(previousOutput, 400))
	return strings.TrimSpace(b.String())
}

func (s *Service) translateWithAPIRetries(ctx context.Context, request translator.Request) (string, error) {
	for attempt := 0; attempt < translationAPIMaxAttempts; attempt++ {
		translated, err := s.translate(ctx, request)
		if err == nil {
			return translated, nil
		}
		if !isRetryableTranslateError(err) || attempt+1 >= translationAPIMaxAttempts {
			return "", fmt.Errorf("translation failed after %d attempts: %w", attempt+1, err)
		}
		delay := translationRetryDelay(attempt)
		if waitErr := sleepWithContext(ctx, delay); waitErr != nil {
			return "", fmt.Errorf("translation retry wait interrupted: %w", waitErr)
		}
	}
	panic("unreachable")
}

func buildTranslationRuntimeContext(entryKey, sourceContext, sharedMemory string) string {
	parts := make([]string, 0, 3)
	if key := sanitizeScopeIdentifier(entryKey); key != "" {
		parts = append(parts, "Entry key: "+key)
	}
	if sanitizedContext := sanitizePromptContext(sourceContext, maxSourceContextLen); sanitizedContext != "" {
		parts = append(parts, "Source context:\n"+sanitizedContext)
	}
	if memory := strings.TrimSpace(sharedMemory); memory != "" {
		parts = append(parts, "Shared memory:\n"+memory)
	}
	return strings.TrimSpace(strings.Join(parts, "\n\n"))
}

func validateTranslatedInvariant(source, translated string) error {
	source = strings.TrimSpace(source)
	translated = strings.TrimSpace(translated)

	srcInv, srcErr := icuparser.ParseInvariant(source)
	if srcErr != nil {
		return nil
	}
	if len(srcInv.Placeholders) == 0 && len(srcInv.ICUBlocks) == 0 {
		return nil
	}

	translatedInv, translatedErr := icuparser.ParseInvariant(translated)
	if translatedErr != nil {
		return &invariantViolationError{
			msg:   fmt.Sprintf("translation invariant violation: invalid ICU/braces structure | %s", formatInvariantDebugContext(source, translated)),
			cause: translatedErr,
		}
	}
	if !icuparser.SamePlaceholderSet(srcInv.Placeholders, translatedInv.Placeholders) {
		return &invariantViolationError{msg: fmt.Sprintf(
			"translation invariant violation: placeholder parity mismatch (expected %v, got %v) | %s",
			srcInv.Placeholders,
			translatedInv.Placeholders,
			formatInvariantDebugContext(source, translated),
		)}
	}
	if !icuparser.SameICUBlocks(srcInv.ICUBlocks, translatedInv.ICUBlocks) {
		return &invariantViolationError{msg: fmt.Sprintf(
			"translation invariant violation: ICU parity mismatch (expected %s, got %s) | %s",
			icuparser.FormatICUBlocks(srcInv.ICUBlocks),
			icuparser.FormatICUBlocks(translatedInv.ICUBlocks),
			formatInvariantDebugContext(source, translated),
		)}
	}
	if icuparser.HasDuplicatePounds(translatedInv.ICUBlocks) {
		return &invariantViolationError{msg: fmt.Sprintf(
			"translation invariant violation: duplicate # tokens in ICU plural/selectordinal branch (got %s) | %s",
			icuparser.FormatICUBlocks(translatedInv.ICUBlocks),
			formatInvariantDebugContext(source, translated),
		)}
	}
	return nil
}

func formatInvariantDebugContext(source, translated string) string {
	return fmt.Sprintf(
		`source=%q candidate=%q diff=%s`,
		elideInvariantDebugString(source, 160),
		elideInvariantDebugString(translated, 160),
		firstDiffWindow(source, translated, 24),
	)
}

func elideInvariantDebugString(s string, maxRunes int) string {
	runes := []rune(s)
	if len(runes) <= maxRunes {
		return s
	}
	if maxRunes <= 1 {
		return string(runes[:maxRunes])
	}
	return string(runes[:maxRunes-1]) + "…"
}

func firstDiffWindow(a, b string, radius int) string {
	ar := []rune(a)
	br := []rune(b)
	limit := len(ar)
	if len(br) < limit {
		limit = len(br)
	}
	idx := 0
	for idx < limit && ar[idx] == br[idx] {
		idx++
	}
	if idx == len(ar) && idx == len(br) {
		return "none"
	}

	aStart := max(0, idx-radius)
	aEnd := min(len(ar), idx+radius)
	bStart := max(0, idx-radius)
	bEnd := min(len(br), idx+radius)

	return fmt.Sprintf(
		`at=%d source[%d:%d]=%q candidate[%d:%d]=%q`,
		idx,
		aStart,
		aEnd,
		string(ar[aStart:aEnd]),
		bStart,
		bEnd,
		string(br[bStart:bEnd]),
	)
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

func sanitizePromptContext(value string, maxLen int) string {
	clean := strings.ReplaceAll(value, "\r", "\n")
	lines := strings.Split(clean, "\n")
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		out = append(out, trimmed)
	}
	if len(out) == 0 {
		return ""
	}
	joined := strings.Join(out, "\n")
	if maxLen > 0 {
		runes := []rune(joined)
		if len(runes) > maxLen {
			const ellipsis = "…"
			if maxLen <= len([]rune(ellipsis)) {
				joined = ellipsis
			} else {
				joined = strings.TrimSpace(string(runes[:maxLen-len([]rune(ellipsis))])) + ellipsis
			}
		}
	}
	return joined
}
