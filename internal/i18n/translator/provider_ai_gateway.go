package translator

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/openai/openai-go/v3/option"
)

const (
	defaultAIGatewayBaseURL    = "https://ai-gateway.vercel.sh/v1"
	defaultAIGatewayBaseURLEnv = "AI_GATEWAY_BASE_URL"
	defaultAIGatewayAPIKeyEnv  = "AI_GATEWAY_API_KEY"
)

type AIGatewayProvider struct{}

func NewAIGatewayProvider() *AIGatewayProvider { return &AIGatewayProvider{} }

func (p *AIGatewayProvider) Name() string { return ProviderAIGateway }

func (p *AIGatewayProvider) Translate(ctx context.Context, req Request) (string, error) {
	baseURL := strings.TrimSpace(os.Getenv(defaultAIGatewayBaseURLEnv))
	if baseURL == "" {
		baseURL = defaultAIGatewayBaseURL
	}

	apiKey := strings.TrimSpace(os.Getenv(defaultAIGatewayAPIKeyEnv))
	if apiKey == "" {
		return "", fmt.Errorf("ai_gateway provider: API key is required (%s)", defaultAIGatewayAPIKeyEnv)
	}

	return translateWithOpenAICompatibleClient(
		ctx,
		ProviderAIGateway,
		req,
		option.WithBaseURL(baseURL),
		option.WithAPIKey(apiKey),
	)
}
