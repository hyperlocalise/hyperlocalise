package translator

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"

	"go.jetify.com/ai"
	"go.jetify.com/ai/api"
	jetifyopenai "go.jetify.com/ai/provider/openai"
)

const (
	ProviderOpenAI         = "openai"
	defaultOpenAIAPIKeyEnv = "OPENAI_API_KEY"
)

type Request struct {
	Source         string
	TargetLanguage string
	Context        string
	ModelProvider  string
	Model          string
	Prompt         string
}

type Provider interface {
	Name() string
	Translate(ctx context.Context, req Request) (string, error)
}

type Tool struct {
	mu        sync.RWMutex
	providers map[string]Provider
}

var (
	defaultToolOnce sync.Once
	defaultTool     *Tool
)

func Translate(ctx context.Context, req Request) (string, error) {
	defaultToolOnce.Do(func() {
		defaultTool = New()
	})
	return defaultTool.Translate(ctx, req)
}

func New() *Tool {
	t := &Tool{providers: map[string]Provider{}}
	t.MustRegister(NewOpenAIProvider())
	return t
}

func (t *Tool) Register(provider Provider) error {
	if provider == nil {
		return fmt.Errorf("register translation provider: provider must not be nil")
	}

	name := normalizeProvider(provider.Name())
	if name == "" {
		return fmt.Errorf("register translation provider: name must not be empty")
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	if _, exists := t.providers[name]; exists {
		return fmt.Errorf("register translation provider %q: already registered", name)
	}

	t.providers[name] = provider
	return nil
}

func (t *Tool) MustRegister(provider Provider) {
	if err := t.Register(provider); err != nil {
		panic(err)
	}
}

func (t *Tool) Translate(ctx context.Context, req Request) (string, error) {
	if err := validateRequest(req); err != nil {
		return "", err
	}

	providerName := normalizeProvider(req.ModelProvider)
	if providerName == "" {
		providerName = ProviderOpenAI
	}

	t.mu.RLock()
	provider, ok := t.providers[providerName]
	t.mu.RUnlock()
	if !ok {
		return "", fmt.Errorf("translate: unknown model provider %q", providerName)
	}

	translated, err := provider.Translate(ctx, req)
	if err != nil {
		return "", fmt.Errorf("translate with provider %q: %w", providerName, err)
	}

	return strings.TrimSpace(translated), nil
}

type OpenAIProvider struct{}

func NewOpenAIProvider() *OpenAIProvider { return &OpenAIProvider{} }

func (p *OpenAIProvider) Name() string { return ProviderOpenAI }

func (p *OpenAIProvider) Translate(ctx context.Context, req Request) (string, error) {
	if strings.TrimSpace(os.Getenv(defaultOpenAIAPIKeyEnv)) == "" {
		return "", fmt.Errorf("openai provider: API key is required (%s)", defaultOpenAIAPIKeyEnv)
	}

	model := jetifyopenai.NewLanguageModel(strings.TrimSpace(req.Model))

	messages := []api.Message{
		&api.SystemMessage{Content: buildSystemPrompt(req.Prompt)},
		&api.UserMessage{Content: api.ContentFromText(buildUserPrompt(req))},
	}

	resp, err := ai.GenerateText(ctx, messages, ai.WithModel(model))
	if err != nil {
		return "", fmt.Errorf("openai generate text: %w", err)
	}

	output, err := responseText(resp)
	if err != nil {
		return "", fmt.Errorf("openai response: %w", err)
	}

	return output, nil
}

func validateRequest(req Request) error {
	if strings.TrimSpace(req.Source) == "" {
		return fmt.Errorf("translate request: source is required")
	}
	if strings.TrimSpace(req.TargetLanguage) == "" {
		return fmt.Errorf("translate request: target language is required")
	}
	if strings.TrimSpace(req.Model) == "" {
		return fmt.Errorf("translate request: model is required")
	}
	return nil
}

func normalizeProvider(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

func buildSystemPrompt(customPrompt string) string {
	base := strings.TrimSpace(customPrompt)
	if base == "" {
		base = "You are a translation assistant."
	}

	return base + " Return only the translated text with no explanations, labels, markdown, or quotes unless the translated content itself requires them."
}

func buildUserPrompt(req Request) string {
	b := strings.Builder{}
	b.WriteString("Translate the following source text into the requested target language. Preserve placeholders, variables, and formatting.\n\n")
	b.WriteString("Target language: ")
	b.WriteString(strings.TrimSpace(req.TargetLanguage))
	b.WriteString("\n")

	ctx := strings.TrimSpace(req.Context)
	if ctx != "" {
		b.WriteString("Context: ")
		b.WriteString(ctx)
		b.WriteString("\n")
	}

	b.WriteString("Source text:\n")
	b.WriteString(req.Source)
	return b.String()
}

func responseText(resp *api.Response) (string, error) {
	if resp == nil {
		return "", fmt.Errorf("response is nil")
	}

	b := strings.Builder{}
	for _, block := range resp.Content {
		textBlock, ok := block.(*api.TextBlock)
		if !ok {
			continue
		}
		b.WriteString(textBlock.Text)
	}

	text := strings.TrimSpace(b.String())
	if text == "" {
		return "", fmt.Errorf("no text generated")
	}

	return text, nil
}
