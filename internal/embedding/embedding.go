// Package embedding generates vectors for later turbopuffer indexing.
//
// It calls Vercel AI Gateway with google/gemini-embedding-2. Model ID and
// output dimensions are package constants so every caller writes the same
// vector space.
package embedding

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	// Model is the AI Gateway embedding model. Changing it requires a new
	// turbopuffer deployment prefix.
	Model = "google/gemini-embedding-2"
	// Dimensions is the output vector length. Changing it requires a new
	// turbopuffer deployment prefix.
	Dimensions = 1536
	// DefaultMaxBytes bounds untrusted document bytes sent to the gateway.
	DefaultMaxBytes = 20 << 20

	defaultBaseURL    = "https://ai-gateway.vercel.sh/v1"
	defaultTimeout    = 60 * time.Second
	defaultMaxRetries = 2
	defaultRetryBase  = 200 * time.Millisecond
	maxRetryAfter     = 30 * time.Second
	maxResponseBytes  = 1 << 20
	embeddingsPath    = "/embeddings"
	queryPrefix       = "task: search result | query: "
	documentTitleNone = "none"
	fileOnlyInput     = "document"
	pngMediaType      = "image/png"
	jpegMediaType     = "image/jpeg"
	pdfMediaType      = "application/pdf"
)

var (
	ErrInvalidInput      = errors.New("invalid embedding input")
	ErrTooLarge          = errors.New("document exceeds embedding size limit")
	ErrUnsupportedFormat = errors.New("unsupported embedding format")
	ErrInvalidResponse   = errors.New("invalid embedding response")

	pngSignature  = []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
	jpegSignature = []byte{0xFF, 0xD8, 0xFF}
	pdfSignature  = []byte("%PDF-")
)

// Config is explicit connection state. The package reads no environment.
type Config struct {
	BaseURL    string
	APIKey     string
	MaxBytes   int64
	HTTPClient *http.Client
}

// Document is one item to embed for retrieval. Text and Data may both be set.
type Document struct {
	Title string
	Text  string
	Data  []byte
}

// Result is a vector of length Dimensions.
type Result struct {
	Vector []float32
	Tokens int
}

// Client is safe for concurrent use.
type Client struct {
	baseURL    string
	apiKey     string
	maxBytes   int64
	httpClient *http.Client
	maxRetries int
	retryBase  time.Duration
}

// New validates explicit configuration.
func New(cfg Config) (*Client, error) {
	if strings.TrimSpace(cfg.APIKey) == "" {
		return nil, ErrInvalidInput
	}
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	maxBytes := cfg.MaxBytes
	if maxBytes <= 0 {
		maxBytes = DefaultMaxBytes
	}
	httpClient := cfg.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: defaultTimeout}
	}
	return &Client{baseURL: baseURL, apiKey: strings.TrimSpace(cfg.APIKey), maxBytes: maxBytes, httpClient: httpClient, maxRetries: defaultMaxRetries, retryBase: defaultRetryBase}, nil
}

// EmbedQuery embeds a retrieval query.
func (c *Client) EmbedQuery(ctx context.Context, text string) (Result, error) {
	text = strings.TrimSpace(text)
	if text == "" || !utf8.ValidString(text) {
		return Result{}, ErrInvalidInput
	}
	if int64(len(text)) > c.maxBytes {
		return Result{}, ErrTooLarge
	}
	return c.embed(ctx, request{input: queryPrefix + text})
}

// EmbedDocument embeds document text and optional PNG, JPEG, or PDF bytes.
func (c *Client) EmbedDocument(ctx context.Context, doc Document) (Result, error) {
	text := strings.TrimSpace(doc.Text)
	title := strings.TrimSpace(doc.Title)
	if text != "" && !utf8.ValidString(text) {
		return Result{}, ErrInvalidInput
	}
	if int64(len(title))+int64(len(text))+int64(len(doc.Data)) > c.maxBytes {
		return Result{}, ErrTooLarge
	}
	var mediaType string
	if len(doc.Data) > 0 {
		detected, err := detectMedia(doc.Data)
		if err != nil {
			return Result{}, err
		}
		mediaType = detected
	}
	if text == "" && mediaType == "" {
		return Result{}, ErrInvalidInput
	}
	req := request{input: formatDocumentInput(title, text)}
	if mediaType != "" {
		req.content = []map[string]any{inlineDataPart(mediaType, doc.Data)}
	}
	return c.embed(ctx, req)
}

type request struct {
	input   string
	content []map[string]any
}

type embeddingRequestBody struct {
	Model           string         `json:"model"`
	Input           string         `json:"input"`
	Dimensions      int            `json:"dimensions"`
	ProviderOptions map[string]any `json:"providerOptions,omitempty"`
}

type embeddingResponseBody struct {
	Data []struct {
		Embedding []float64 `json:"embedding"`
	} `json:"data"`
	Usage struct {
		TotalTokens int `json:"total_tokens"`
	} `json:"usage"`
}

func (c *Client) embed(ctx context.Context, req request) (Result, error) {
	if strings.TrimSpace(req.input) == "" {
		return Result{}, ErrInvalidInput
	}
	body := embeddingRequestBody{Model: Model, Input: req.input, Dimensions: Dimensions}
	if len(req.content) > 0 {
		body.ProviderOptions = map[string]any{"google": map[string]any{"content": []any{req.content}}}
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return Result{}, fmt.Errorf("marshal embedding request: %w", err)
	}
	attempts := c.maxRetries + 1
	var lastErr error
	attempt := 0
	for attempt = 1; attempt <= attempts; attempt++ {
		if err := ctx.Err(); err != nil {
			return Result{}, err
		}
		result, err := c.doEmbed(ctx, payload)
		if err == nil {
			return result, nil
		}
		lastErr = err
		if attempt == attempts || !isTransient(err) {
			break
		}
		if err := sleepWithContext(ctx, retryDelay(attempt, c.retryBase, err)); err != nil {
			return Result{}, err
		}
	}
	if attempt <= 1 {
		return Result{}, lastErr
	}
	return Result{}, fmt.Errorf("%w (after %d attempts)", lastErr, attempt)
}

func (c *Client) doEmbed(ctx context.Context, payload []byte) (Result, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+embeddingsPath, bytes.NewReader(payload))
	if err != nil {
		return Result{}, fmt.Errorf("build embedding request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return Result{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	responseBody, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes+1))
	if err != nil {
		return Result{}, fmt.Errorf("read embedding response: %w", err)
	}
	if int64(len(responseBody)) > maxResponseBytes {
		return Result{}, ErrInvalidResponse
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return Result{}, &httpError{status: resp.StatusCode, body: strings.TrimSpace(string(responseBody)), retryAfter: parseRetryAfter(resp.Header)}
	}
	var parsed embeddingResponseBody
	if err := json.Unmarshal(responseBody, &parsed); err != nil {
		return Result{}, ErrInvalidResponse
	}
	if len(parsed.Data) == 0 || len(parsed.Data[0].Embedding) != Dimensions {
		return Result{}, ErrInvalidResponse
	}
	vector := make([]float32, Dimensions)
	for i, value := range parsed.Data[0].Embedding {
		vector[i] = float32(value)
	}
	return Result{Vector: vector, Tokens: parsed.Usage.TotalTokens}, nil
}

type httpError struct {
	status     int
	body       string
	retryAfter time.Duration
}

func (e *httpError) Error() string {
	if e == nil {
		return "<nil>"
	}
	if e.body == "" {
		return fmt.Sprintf("embedding: AI Gateway HTTP %d", e.status)
	}
	return fmt.Sprintf("embedding: AI Gateway HTTP %d: %s", e.status, truncate(e.body, 300))
}

func isTransient(err error) bool {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return false
	}
	var upstream *httpError
	if errors.As(err, &upstream) {
		return upstream.status == http.StatusTooManyRequests || upstream.status >= 500
	}
	return true
}

func formatDocumentInput(title, text string) string {
	if text == "" {
		return fileOnlyInput
	}
	if title == "" {
		title = documentTitleNone
	}
	return "title: " + title + " | text: " + text
}

func parseRetryAfter(header http.Header) time.Duration {
	raw := strings.TrimSpace(header.Get("Retry-After"))
	seconds, err := strconv.Atoi(raw)
	if err != nil || seconds <= 0 {
		return 0
	}
	delay := time.Duration(seconds) * time.Second
	if delay > maxRetryAfter {
		return maxRetryAfter
	}
	return delay
}

func retryDelay(attempt int, base time.Duration, err error) time.Duration {
	var upstream *httpError
	if errors.As(err, &upstream) && upstream.retryAfter > 0 {
		return upstream.retryAfter
	}
	if base <= 0 {
		base = defaultRetryBase
	}
	delay := base
	for i := 1; i < attempt; i++ {
		delay *= 2
	}
	return delay
}

func sleepWithContext(ctx context.Context, delay time.Duration) error {
	if delay <= 0 {
		return ctx.Err()
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func inlineDataPart(mediaType string, data []byte) map[string]any {
	return map[string]any{"inlineData": map[string]any{"mimeType": mediaType, "data": base64.StdEncoding.EncodeToString(data)}}
}

func detectMedia(data []byte) (string, error) {
	switch {
	case bytes.HasPrefix(data, pdfSignature):
		return pdfMediaType, nil
	case bytes.HasPrefix(data, pngSignature):
		return pngMediaType, nil
	case bytes.HasPrefix(data, jpegSignature):
		return jpegMediaType, nil
	default:
		return "", ErrUnsupportedFormat
	}
}

func truncate(value string, max int) string {
	if len(value) <= max {
		return value
	}
	return value[:max] + "..."
}
