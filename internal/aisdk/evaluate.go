package aisdk

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type evaluateRequestBody struct {
	State           any            `json:"state"`
	Questions       map[string]any `json:"questions"`
	ProviderOptions map[string]any `json:"providerOptions,omitempty"`
}

type evaluateResponseBody struct {
	Answers  map[string]Answer `json:"answers"`
	Rounding *Rounding         `json:"rounding"`
	Usage    *struct {
		InputTokens  *int `json:"inputTokens"`
		OutputTokens *int `json:"outputTokens"`
	} `json:"usage"`
	Warnings         []Warning      `json:"warnings"`
	ProviderMetadata map[string]any `json:"providerMetadata"`
}

// ExperimentalEvaluate calls an evaluation model through AI Gateway.
// It mirrors AI SDK experimental_evaluate. The default model is Jev.
func ExperimentalEvaluate(ctx context.Context, req EvaluateRequest) (*EvaluateResult, error) {
	client, err := NewClient()
	if err != nil {
		return nil, err
	}
	return client.ExperimentalEvaluate(ctx, req)
}

// ExperimentalEvaluate evaluates named questions against one shared state.
func (c *Client) ExperimentalEvaluate(ctx context.Context, req EvaluateRequest) (*EvaluateResult, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	modelID := strings.TrimSpace(req.Model)
	if modelID == "" {
		modelID = JevModelID
	}
	if err := validateEvaluateInput(req.State, req.Questions); err != nil {
		return nil, err
	}

	body := evaluateRequestBody{
		State:           req.State,
		Questions:       encodeQuestions(req.Questions),
		ProviderOptions: req.ProviderOptions,
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("aisdk: marshal evaluate request: %w", err)
	}

	maxRetries := c.maxRetries
	if req.MaxRetries != nil {
		maxRetries = *req.MaxRetries
	}
	attempts := retryAttempts(maxRetries)

	var lastErr error
	attempt := 0
	for attempt = 1; attempt <= attempts; attempt++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		result, err := c.doEvaluate(ctx, modelID, req.Questions, payload, req.Headers)
		if err == nil {
			return result, nil
		}
		lastErr = err
		if attempt == attempts || !isTransient(err) {
			break
		}
	}
	return nil, formatRetryError(lastErr, attempt)
}

func (c *Client) doEvaluate(ctx context.Context, modelID string, questions map[string]Question, payload []byte, extraHeaders map[string]string) (*EvaluateResult, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.evaluateURL(), bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("aisdk: build evaluate request: %w", err)
	}
	httpReq.Header = c.requestHeaders(modelID, extraHeaders)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("aisdk: read evaluate response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, httpError(resp.StatusCode, string(responseBody))
	}

	var parsed evaluateResponseBody
	if err := json.Unmarshal(responseBody, &parsed); err != nil {
		return nil, invalidResponse("AI Gateway returned invalid JSON")
	}
	if err := validateEvaluateAnswers(questions, parsed.Answers, parsed.Rounding); err != nil {
		return nil, err
	}

	usage := Usage{}
	if parsed.Usage != nil {
		usage.InputTokens = parsed.Usage.InputTokens
		usage.OutputTokens = parsed.Usage.OutputTokens
		if parsed.Usage.InputTokens != nil && parsed.Usage.OutputTokens != nil {
			total := *parsed.Usage.InputTokens + *parsed.Usage.OutputTokens
			usage.TotalTokens = &total
		}
	}

	headers := make(map[string]string, len(resp.Header))
	for key, values := range resp.Header {
		if len(values) > 0 {
			headers[key] = values[0]
		}
	}

	var raw any
	_ = json.Unmarshal(responseBody, &raw)

	return &EvaluateResult{
		Answers:          parsed.Answers,
		Usage:            usage,
		Warnings:         parsed.Warnings,
		Rounding:         parsed.Rounding,
		ProviderMetadata: parsed.ProviderMetadata,
		Response: ResponseMeta{
			Timestamp: time.Now(),
			ModelID:   modelID,
			Headers:   headers,
			Body:      raw,
		},
	}, nil
}

func encodeQuestions(questions map[string]Question) map[string]any {
	out := make(map[string]any, len(questions))
	for id, question := range questions {
		encoded := map[string]any{
			"type":         string(question.Type),
			"instructions": question.Instructions,
		}
		if question.Criteria != nil {
			if criteria, ok := asStringMap(question.Criteria); ok {
				encoded["criteria"] = criteria
			} else {
				encoded["criteria"] = question.Criteria
			}
		}
		out[id] = encoded
	}
	return out
}
