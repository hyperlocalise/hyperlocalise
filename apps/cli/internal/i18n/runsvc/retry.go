package runsvc

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
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
	b.WriteString(segmentvalidate.ElideDebugString(previousOutput, 400))
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
		parts = append(parts, "String description (guidance only; do not translate or use as the translation):\n"+sanitizedContext)
	}
	if memory := strings.TrimSpace(sharedMemory); memory != "" {
		parts = append(parts, "Shared memory:\n"+memory)
	}
	return strings.TrimSpace(strings.Join(parts, "\n\n"))
}

func validateTranslatedInvariant(source, translated string) error {
	return validationErrorFromSegment(segmentvalidate.FirstValidationError("", source, translated))
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

// sanitizePromptContext cleans, normalizes, trims, and truncates prompt context strings.
// It uses a single-pass string builder over line boundaries to eliminate intermediate slice allocations.
func sanitizePromptContext(value string, maxLen int) string {
	if value == "" {
		return ""
	}

	if !strings.ContainsAny(value, "\r\n") {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return ""
		}
		if maxLen == 0 || utf8.RuneCountInString(trimmed) <= maxLen {
			return trimmed
		}
	}

	var b strings.Builder
	b.Grow(len(value))
	first := true
	n := len(value)
	start := 0

	for start < n {
		end := start
		for end < n && value[end] != '\r' && value[end] != '\n' {
			end++
		}
		line := strings.TrimSpace(value[start:end])
		if line != "" {
			if !first {
				b.WriteByte('\n')
			}
			b.WriteString(line)
			first = false
		}
		if end < n {
			if value[end] == '\r' && end+1 < n && value[end+1] == '\n' {
				end++
			}
			end++
		}
		start = end
	}

	if b.Len() == 0 {
		return ""
	}

	joined := b.String()
	if maxLen > 0 && utf8.RuneCountInString(joined) > maxLen {
		if maxLen <= 1 {
			return "…"
		}
		targetRunes := maxLen - 1
		runeCount := 0
		byteIdx := 0
		for byteIdx < len(joined) && runeCount < targetRunes {
			_, size := utf8.DecodeRuneInString(joined[byteIdx:])
			byteIdx += size
			runeCount++
		}
		return strings.TrimSpace(joined[:byteIdx]) + "…"
	}

	return joined
}
