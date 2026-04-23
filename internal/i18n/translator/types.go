package translator

import (
	"context"
	"fmt"
	"strings"
)

const (
	ProviderOpenAI      = "openai"
	ProviderAzureOpenAI = "azure_openai"
	ProviderAnthropic   = "anthropic"
	ProviderLMStudio    = "lmstudio"
	ProviderGroq        = "groq"
	ProviderMistral     = "mistral"
	ProviderOllama      = "ollama"
	ProviderGemini      = "gemini"
	ProviderBedrock     = "bedrock"
)

const OpenAIImageModel = "gpt-image-2-2026-04-21"

type Request struct {
	Source         string
	TargetLanguage string
	ModelProvider  string
	Model          string
	SystemPrompt   string
	UserPrompt     string
	RuntimeContext string
}

type Provider interface {
	Name() string
	Translate(ctx context.Context, req Request) (string, error)
}

type ImageEditRequest struct {
	SourceImage    []byte
	SourceFilename string
	SourceMIMEType string
	TargetLanguage string
	ModelProvider  string
	Model          string
	Prompt         string
	OutputFormat   string
}

type ImageProvider interface {
	Name() string
	EditImage(ctx context.Context, req ImageEditRequest) ([]byte, error)
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

func validateImageEditRequest(req ImageEditRequest) error {
	if len(req.SourceImage) == 0 {
		return fmt.Errorf("image edit request: source image is required")
	}
	if strings.TrimSpace(req.TargetLanguage) == "" {
		return fmt.Errorf("image edit request: target language is required")
	}
	if strings.TrimSpace(req.Model) == "" {
		return fmt.Errorf("image edit request: model is required")
	}
	if strings.TrimSpace(req.Prompt) == "" {
		return fmt.Errorf("image edit request: prompt is required")
	}
	switch strings.ToLower(strings.TrimSpace(req.OutputFormat)) {
	case "png", "jpeg", "webp":
	default:
		return fmt.Errorf("image edit request: unsupported output format %q", req.OutputFormat)
	}
	return nil
}

func normalizeProvider(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}
