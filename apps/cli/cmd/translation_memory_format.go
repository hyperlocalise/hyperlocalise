package cmd

import (
	"context"
	"fmt"
	"io"
	"strings"

	crowdinstorage "github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/crowdin"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/phrase"
)

const (
	translationMemoryFormatCSV = "csv"
	translationMemoryFormatTMX = "tmx"
)

func normalizeTranslationMemoryDownloadFormat(format string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(format))
	if normalized == "" {
		normalized = translationMemoryFormatCSV
	}
	switch normalized {
	case translationMemoryFormatCSV, translationMemoryFormatTMX:
		return normalized, nil
	default:
		return "", fmt.Errorf("unsupported --format %q; expected csv or tmx", format)
	}
}

func writePhraseTranslationMemory(ctx context.Context, client phraseTranslationMemoryWriter, input phrase.TranslationMemoryDownloadInput, format string, w io.Writer) (phrase.TranslationMemoryDownloadResult, error) {
	switch format {
	case translationMemoryFormatCSV:
		return client.WriteTranslationMemoryCSV(ctx, input, w)
	case translationMemoryFormatTMX:
		return client.WriteTranslationMemoryTMX(ctx, input, w)
	default:
		return phrase.TranslationMemoryDownloadResult{}, fmt.Errorf("unsupported translation memory format %q", format)
	}
}

func writeCrowdinTranslationMemory(ctx context.Context, client crowdinTranslationMemoryWriter, req crowdinstorage.TranslationMemoryDownloadRequest, format string, w io.Writer) (crowdinstorage.TranslationMemoryDownloadResult, error) {
	switch format {
	case translationMemoryFormatCSV:
		return client.WriteTranslationMemoryCSV(ctx, req, w)
	case translationMemoryFormatTMX:
		return client.WriteTranslationMemoryTMX(ctx, req, w)
	default:
		return crowdinstorage.TranslationMemoryDownloadResult{}, fmt.Errorf("unsupported translation memory format %q", format)
	}
}

func writeTranslationMemoryDownloadSummary(w io.Writer, outputPath, format string, rows, segments int) (int, error) {
	if format == translationMemoryFormatCSV {
		return fmt.Fprintf(w, "wrote %s rows=%d segments=%d\n", outputPath, rows, segments)
	}
	return fmt.Fprintf(w, "wrote %s format=%s rows=%d segments=%d\n", outputPath, format, rows, segments)
}
