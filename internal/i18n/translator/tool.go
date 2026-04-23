package translator

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
)

const otelTracerName = "github.com/hyperlocalise/hyperlocalise/internal/i18n/translator"

type Tool struct {
	mu        sync.RWMutex
	providers map[string]Provider
}

var (
	defaultToolOnce    sync.Once
	defaultTool        *Tool
	defaultToolInitErr error
)

func Translate(ctx context.Context, req Request) (string, error) {
	// Initialization is attempted once. If it fails, all subsequent calls
	// to Translate will return the same error; re-initialization is not possible.
	defaultToolOnce.Do(func() {
		defaultTool, defaultToolInitErr = New()
	})
	if defaultToolInitErr != nil {
		return "", defaultToolInitErr
	}
	return defaultTool.Translate(ctx, req)
}

func EditImage(ctx context.Context, req ImageEditRequest) ([]byte, error) {
	defaultToolOnce.Do(func() {
		defaultTool, defaultToolInitErr = New()
	})
	if defaultToolInitErr != nil {
		return nil, defaultToolInitErr
	}
	return defaultTool.EditImage(ctx, req)
}

func New() (*Tool, error) {
	t := &Tool{providers: map[string]Provider{}}
	if err := RegisterBuiltins(t); err != nil {
		return nil, fmt.Errorf("creating translator: %w", err)
	}
	return t, nil
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

	systemPrompt := buildSystemPrompt(req)
	userPrompt := buildUserPrompt(req)
	logPromptCall(req, providerName, systemPrompt, userPrompt)
	req.SystemPrompt = systemPrompt
	req.UserPrompt = userPrompt
	req.RuntimeContext = ""

	tctx, span := otel.Tracer(otelTracerName).Start(ctx, "translate")
	defer span.End()
	span.SetAttributes(attribute.String("llm.provider", providerName))

	start := time.Now()
	translated, err := provider.Translate(tctx, req)
	duration := time.Since(start)
	if err != nil {
		span.SetStatus(codes.Error, "translate_failed")
		logPromptResult(req, providerName, "", err, duration)
		return "", fmt.Errorf("translate with provider %q: %w", providerName, err)
	}

	translated = strings.TrimSpace(translated)
	logPromptResult(req, providerName, translated, nil, duration)
	return translated, nil
}

func (t *Tool) EditImage(ctx context.Context, req ImageEditRequest) ([]byte, error) {
	if err := validateImageEditRequest(req); err != nil {
		return nil, err
	}

	providerName := normalizeProvider(req.ModelProvider)
	if providerName == "" {
		providerName = ProviderOpenAI
	}

	t.mu.RLock()
	provider, ok := t.providers[providerName]
	t.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("edit image: unknown model provider %q", providerName)
	}
	imageProvider, ok := provider.(ImageProvider)
	if !ok {
		return nil, fmt.Errorf("edit image: provider %q does not support image editing", providerName)
	}

	tctx, span := otel.Tracer(otelTracerName).Start(ctx, "edit_image")
	defer span.End()
	span.SetAttributes(attribute.String("llm.provider", providerName))

	start := time.Now()
	image, err := imageProvider.EditImage(tctx, req)
	duration := time.Since(start)
	if err != nil {
		span.SetStatus(codes.Error, "edit_image_failed")
		logPromptResult(Request{TargetLanguage: req.TargetLanguage, ModelProvider: providerName, Model: req.Model, UserPrompt: req.Prompt}, providerName, "", err, duration)
		return nil, fmt.Errorf("edit image with provider %q: %w", providerName, err)
	}
	logPromptResult(Request{TargetLanguage: req.TargetLanguage, ModelProvider: providerName, Model: req.Model, UserPrompt: req.Prompt}, providerName, "<image>", nil, duration)
	return image, nil
}
