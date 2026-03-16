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
	Translate(ctx context.Context, task TranslationTask) (string, RoutingDecision, error)
}

type translatorExecutor struct {
	tool   *translator.Tool
	config Config
	router *policyEngine
}

// NewTranslatorExecutor creates a translator-backed string executor configured from cfg.
// It normalizes and lowercases cfg.Provider, requires a non-empty provider and model, and verifies the provider is allowed.
// The function initializes a translator.Tool and returns a translatorExecutor populated with the normalized provider,
// trimmed model, and supplied prompts. An error is returned if validation fails or the translator tool cannot be created.
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
		tool:   tool,
		router: newDefaultPolicyEngine(provider, strings.TrimSpace(cfg.Model)),
		config: Config{
			Provider:     provider,
			Model:        strings.TrimSpace(cfg.Model),
			SystemPrompt: cfg.SystemPrompt,
			UserPrompt:   cfg.UserPrompt,
		},
	}, nil
}

// Translate executes one string translation request for a target locale.
func (e *translatorExecutor) Translate(ctx context.Context, task TranslationTask) (string, RoutingDecision, error) {
	route := e.router.Select(task)

	translated, err := e.tool.Translate(ctx, translator.Request{
		Source:         task.SourceText,
		TargetLanguage: task.TargetLocale,
		ModelProvider:  route.Provider,
		Model:          route.Model,
		SystemPrompt:   e.config.SystemPrompt,
		UserPrompt:     e.config.UserPrompt,
	})
	if err != nil {
		return "", route, err
	}

	return translated, route, nil
}
