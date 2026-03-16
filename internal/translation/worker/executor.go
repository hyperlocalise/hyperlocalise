package worker

import (
	"context"
	"fmt"
	"strings"

	"github.com/quiet-circles/hyperlocalise/internal/i18n/translator"
)

var allowedServiceProviders = map[string]struct{}{
	translator.ProviderOpenAI:      {},
	translator.ProviderAzureOpenAI: {},
	translator.ProviderAnthropic:   {},
	translator.ProviderGemini:      {},
	translator.ProviderBedrock:     {},
	translator.ProviderGroq:        {},
	translator.ProviderMistral:     {},
}

// Config configures translation execution for the async worker.
type Config struct {
	Provider     string
	Model        string
	SystemPrompt string
	UserPrompt   string
}

type stringExecutor interface {
	Translate(ctx context.Context, source, targetLocale string) (string, error)
}

type translatorExecutor struct {
	tool   *translator.Tool
	config Config
}

// NewTranslatorExecutor constructs the default translator-backed string executor.
func NewTranslatorExecutor(cfg Config) (*translatorExecutor, error) {
	provider := strings.TrimSpace(strings.ToLower(cfg.Provider))
	if provider == "" {
		return nil, fmt.Errorf("translation worker: TRANSLATION_LLM_PROVIDER is required")
	}
	if strings.TrimSpace(cfg.Model) == "" {
		return nil, fmt.Errorf("translation worker: TRANSLATION_LLM_MODEL is required")
	}
	if _, ok := allowedServiceProviders[provider]; !ok {
		return nil, fmt.Errorf("translation worker: provider %q is not supported in service mode", provider)
	}

	tool, err := translator.New()
	if err != nil {
		return nil, fmt.Errorf("translation worker: create translator tool: %w", err)
	}

	return &translatorExecutor{
		tool: tool,
		config: Config{
			Provider:     provider,
			Model:        strings.TrimSpace(cfg.Model),
			SystemPrompt: cfg.SystemPrompt,
			UserPrompt:   cfg.UserPrompt,
		},
	}, nil
}

// Translate executes one string translation request for a target locale.
func (e *translatorExecutor) Translate(ctx context.Context, source, targetLocale string) (string, error) {
	translated, err := e.tool.Translate(ctx, translator.Request{
		Source:         source,
		TargetLanguage: targetLocale,
		ModelProvider:  e.config.Provider,
		Model:          e.config.Model,
		SystemPrompt:   e.config.SystemPrompt,
		UserPrompt:     e.config.UserPrompt,
	})
	if err != nil {
		return "", err
	}

	return translated, nil
}
