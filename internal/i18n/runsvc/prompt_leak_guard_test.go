package runsvc

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/quiet-circles/hyperlocalise/internal/config"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/translator"
)

func TestValidateTranslatedOutputRejectsPromptLeakSignatures(t *testing.T) {
	tests := []struct {
		name       string
		source     string
		translated string
	}{
		{
			name:       "reject chinese leaked instruction",
			source:     "Keep .env out of version control.",
			translated: "保留 .env 和返回仅包含译文的文本，不要包含任何解释。",
		},
		{
			name:       "reject english leaked instruction",
			source:     "Use environment variables for secrets.",
			translated: "Return only the translated text and do not include any explanations.",
		},
		{
			name:       "reject vietnamese leaked instruction",
			source:     "Giữ token trong biến môi trường.",
			translated: "chỉ chứa bản dịch và không bao gồm bất kỳ giải thích nào.",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateTranslatedOutput(tt.source, tt.translated)
			if err == nil {
				t.Fatalf("expected prompt leakage error")
			}
		})
	}
}

func TestValidateTranslatedOutputAllowsLiteralInstructionWhenPresentInSource(t *testing.T) {
	source := "The warning text is: Return only the translated text."
	translated := "Le texte d'avertissement est : Return only the translated text."
	if err := validateTranslatedOutput(source, translated); err != nil {
		t.Fatalf("expected no rejection when source also contains signature: %v", err)
	}
}

func TestRunBlocksPromptLeakInsteadOfWritingOutput(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.mdx"
	targetPath := "/tmp/out.mdx"
	svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
		cfg := testConfig(sourcePath, targetPath)
		return &cfg, nil
	}
	svc.readFile = func(path string) ([]byte, error) {
		switch path {
		case sourcePath:
			return []byte("# Security\n\nKeep .env out of version control.\n"), nil
		case targetPath:
			return []byte("# Sécurité\n\nConservez .env hors du contrôle de version.\n"), nil
		default:
			return nil, filepath.ErrBadPattern
		}
	}
	var written [][]byte
	svc.writeFile = func(_ string, content []byte) error {
		clone := make([]byte, len(content))
		copy(clone, content)
		written = append(written, clone)
		return nil
	}
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		if strings.Contains(req.Source, "Keep .env") {
			return "返回仅包含译文的文本，不要包含任何解释。", nil
		}
		return "ok", nil
	}

	report, err := svc.Run(context.Background(), Input{})
	if err != nil {
		t.Fatalf("unexpected run error: %v", err)
	}
	for _, content := range written {
		if strings.Contains(string(content), "返回仅包含译文的文本") {
			t.Fatalf("prompt leakage should never be persisted, got %q", string(content))
		}
	}
	if report.Failed == 0 {
		t.Fatalf("expected failed task in report")
	}
	if len(report.Failures) == 0 || !strings.Contains(report.Failures[0].Reason, "rejected translation output due to suspected prompt leakage") {
		t.Fatalf("expected prompt leakage reason in failures, got %+v", report.Failures)
	}
}
