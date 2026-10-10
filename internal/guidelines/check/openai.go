package check

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/shared"
)

const maxCompletionTokens = 4096

// OpenAIConfig targets any OpenAI-compatible chat completions API that
// supports json_schema response formats, such as Vercel AI Gateway.
type OpenAIConfig struct {
	BaseURL    string
	APIKey     string
	Model      string
	HTTPClient *http.Client
}

type OpenAIModel struct {
	client openai.Client
	model  string
}

var _ Model = (*OpenAIModel)(nil)

// NewOpenAIModel validates explicit configuration; it reads no environment.
func NewOpenAIModel(cfg OpenAIConfig) (*OpenAIModel, error) {
	if strings.TrimSpace(cfg.APIKey) == "" || strings.TrimSpace(cfg.Model) == "" {
		return nil, ErrInvalidInput
	}
	opts := []option.RequestOption{option.WithAPIKey(cfg.APIKey), option.WithMaxRetries(1)}
	if baseURL := strings.TrimSpace(cfg.BaseURL); baseURL != "" {
		opts = append(opts, option.WithBaseURL(baseURL))
	}
	if cfg.HTTPClient != nil {
		opts = append(opts, option.WithHTTPClient(cfg.HTTPClient))
	}
	return &OpenAIModel{client: openai.NewClient(opts...), model: strings.TrimSpace(cfg.Model)}, nil
}

func (m *OpenAIModel) Name() string { return m.model }

func (m *OpenAIModel) Complete(ctx context.Context, system, user string) (string, error) {
	resp, err := m.client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
		Model:               openai.ChatModel(m.model),
		Messages:            []openai.ChatCompletionMessageParamUnion{openai.SystemMessage(system), openai.UserMessage(user)},
		Temperature:         openai.Float(0),
		MaxCompletionTokens: openai.Int(maxCompletionTokens),
		ResponseFormat: openai.ChatCompletionNewParamsResponseFormatUnion{OfJSONSchema: &shared.ResponseFormatJSONSchemaParam{
			JSONSchema: shared.ResponseFormatJSONSchemaJSONSchemaParam{Name: "guideline_findings", Strict: openai.Bool(true), Schema: Schema},
		}},
	})
	if err != nil {
		return "", fmt.Errorf("chat completion: %w", err)
	}
	if len(resp.Choices) == 0 {
		return "", errors.New("chat completion returned no choices")
	}
	return resp.Choices[0].Message.Content, nil
}
