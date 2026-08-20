package translator

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/openai/openai-go/v3/option"
)

const (
	defaultOpenRouterBaseURL    = "https://openrouter.ai/api/v1"
	defaultOpenRouterBaseURLEnv = "OPENROUTER_BASE_URL"
	defaultOpenRouterAPIKeyEnv  = "OPENROUTER_API_KEY"
)

type OpenRouterProvider struct{}

func NewOpenRouterProvider() *OpenRouterProvider { return &OpenRouterProvider{} }

func (p *OpenRouterProvider) Name() string { return ProviderOpenRouter }

func (p *OpenRouterProvider) Translate(ctx context.Context, req Request) (string, error) {
	baseURL := strings.TrimSpace(os.Getenv(defaultOpenRouterBaseURLEnv))
	if baseURL == "" {
		baseURL = defaultOpenRouterBaseURL
	}

	apiKey := strings.TrimSpace(os.Getenv(defaultOpenRouterAPIKeyEnv))
	if apiKey == "" {
		return "", fmt.Errorf("openrouter provider: API key is required (%s)", defaultOpenRouterAPIKeyEnv)
	}

	return translateWithOpenAICompatibleClient(
		ctx,
		ProviderOpenRouter,
		req,
		option.WithBaseURL(baseURL),
		option.WithAPIKey(apiKey),
	)
}
