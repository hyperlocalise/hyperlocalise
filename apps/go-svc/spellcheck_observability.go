package main

import (
	"context"
	"log/slog"
	"time"
)

func logSpellingObservability(ctx context.Context, duration time.Duration, localeSkipped bool, providerErrorCount, warningCount int) {
	slog.InfoContext(ctx, "spellcheck: request completed",
		"spelling_duration_ms", duration.Milliseconds(),
		"spelling_locale_skipped", localeSkipped,
		"spelling_provider_error_count", providerErrorCount,
		"spelling_warning_count", warningCount,
	)
}
