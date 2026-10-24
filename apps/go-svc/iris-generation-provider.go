package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	defaultIrisGatewayBaseURL = "https://ai-gateway.vercel.sh/v1"
	irisProviderTimeout       = 9 * time.Minute
)

type irisProviderRequest struct {
	Model       irisModelInfo
	Prompt      string
	Voice       string
	Duration    float64
	AspectRatio string
	Resolution  string
	Count       int
	Language    string
	Inputs      []irisProviderInput
}

type irisProviderInput struct {
	Role        string
	Bytes       []byte
	ContentType string
}

type irisProviderOutput struct {
	Bytes       []byte
	Filename    string
	ContentType string
}

type irisGenerationProvider interface {
	Generate(context.Context, irisProviderRequest) ([]irisProviderOutput, error)
}

type irisGatewayProvider struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

func newIrisGatewayProvider() *irisGatewayProvider {
	apiKey := strings.TrimSpace(os.Getenv("AI_GATEWAY_API_KEY"))
	if apiKey == "" {
		return nil
	}
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("AI_GATEWAY_BASE_URL")), "/")
	if baseURL == "" {
		baseURL = defaultIrisGatewayBaseURL
	}
	return &irisGatewayProvider{
		baseURL:    baseURL,
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: irisProviderTimeout},
	}
}

func (p *irisGatewayProvider) Generate(ctx context.Context, req irisProviderRequest) ([]irisProviderOutput, error) {
	switch req.Model.Kind {
	case irisKindVoice, irisKindAudio:
		return p.speech(ctx, req)
	case irisKindVideo:
		return p.video(ctx, req)
	case irisKindTool:
		return p.tool(ctx, req)
	default:
		return p.image(ctx, req)
	}
}

func (p *irisGatewayProvider) image(ctx context.Context, req irisProviderRequest) ([]irisProviderOutput, error) {
	count := req.Count
	if count < 1 {
		count = 1
	}
	if refs := inputsByRole(req.Inputs, "image", "start", "end"); len(refs) > 0 {
		return p.imageEdit(ctx, req, refs, count)
	}
	payload := map[string]any{
		"model":  req.Model.GatewayID,
		"prompt": req.Prompt,
		"n":      count,
		"size":   imageSize(req.Resolution, req.AspectRatio),
	}
	body, err := p.json(ctx, http.MethodPost, "/images/generations", payload)
	if err != nil {
		return nil, err
	}
	return decodeImageOutputs(ctx, body, "image", "png")
}

func (p *irisGatewayProvider) imageEdit(ctx context.Context, req irisProviderRequest, images []irisProviderInput, count int) ([]irisProviderOutput, error) {
	if len(images) == 0 {
		return nil, fmt.Errorf("image input is required")
	}
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	_ = writer.WriteField("model", req.Model.GatewayID)
	_ = writer.WriteField("prompt", req.Prompt)
	_ = writer.WriteField("n", fmt.Sprintf("%d", count))
	for i, image := range images {
		name := "input.png"
		if len(images) > 1 {
			name = fmt.Sprintf("input-%d.png", i+1)
		}
		part, err := writer.CreateFormFile("image", name)
		if err != nil {
			return nil, err
		}
		if _, err := part.Write(image.Bytes); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/images/edits", &buf)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	httpReq.Header.Set("Content-Type", writer.FormDataContentType())
	body, err := p.do(httpReq)
	if err != nil {
		return nil, err
	}
	return decodeImageOutputs(ctx, body, "image", "png")
}

func (p *irisGatewayProvider) speech(ctx context.Context, req irisProviderRequest) ([]irisProviderOutput, error) {
	payload := map[string]any{
		"model": req.Model.GatewayID,
		"input": req.Prompt,
		"voice": req.Voice,
	}
	if req.Duration > 0 {
		payload["duration"] = req.Duration
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/audio/speech", bytes.NewReader(mustJSON(payload)))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("gateway speech failed: %s", truncate(string(body), 400))
	}
	contentType := resp.Header.Get("Content-Type")
	if contentType == "" || strings.Contains(contentType, "json") {
		contentType = "audio/mpeg"
	}
	ext := "mp3"
	if strings.Contains(contentType, "wav") {
		ext = "wav"
	}
	return []irisProviderOutput{{Bytes: body, Filename: "speech." + ext, ContentType: contentType}}, nil
}

func (p *irisGatewayProvider) video(ctx context.Context, req irisProviderRequest) ([]irisProviderOutput, error) {
	duration := req.Duration
	if duration <= 0 {
		duration = 6
	}
	payload := map[string]any{
		"model":        req.Model.GatewayID,
		"prompt":       req.Prompt,
		"duration":     duration,
		"aspect_ratio": req.AspectRatio,
	}
	if start, ok := firstInput(req.Inputs, "start", "video"); ok {
		fallback := "image/png"
		if start.Role == "video" {
			fallback = "video/mp4"
		}
		payload["input_reference"] = "data:" + defaultType(start.ContentType, fallback) + ";base64," + base64.StdEncoding.EncodeToString(start.Bytes)
	}
	body, err := p.json(ctx, http.MethodPost, "/videos", payload)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
			URL     string `json:"url"`
		} `json:"data"`
		Video struct {
			B64JSON string `json:"b64_json"`
			URL     string `json:"url"`
		} `json:"video"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	if len(parsed.Data) > 0 {
		return decodeImageOutputs(ctx, body, "video", "mp4")
	}
	if parsed.Video.B64JSON != "" {
		raw, err := base64.StdEncoding.DecodeString(parsed.Video.B64JSON)
		if err != nil {
			return nil, err
		}
		return []irisProviderOutput{{Bytes: raw, Filename: "video.mp4", ContentType: "video/mp4"}}, nil
	}
	if parsed.Video.URL != "" {
		raw, contentType, err := fetchHTTPS(ctx, parsed.Video.URL)
		if err != nil {
			return nil, err
		}
		return []irisProviderOutput{{Bytes: raw, Filename: "video.mp4", ContentType: defaultType(contentType, "video/mp4")}}, nil
	}
	return nil, fmt.Errorf("gateway video response had no asset")
}

func (p *irisGatewayProvider) tool(ctx context.Context, req irisProviderRequest) ([]irisProviderOutput, error) {
	switch req.Model.ID {
	case "universal-3.5-pro", "qwen3.8-omni-flash":
		return p.transcribe(ctx, req)
	case "bytedance-upscaler":
		req.Prompt = irisFirstNonEmpty(req.Prompt, "Upscale this video. Preserve subject, motion, and audio.")
		return p.video(ctx, req)
	default:
		image, ok := firstInput(req.Inputs, "image")
		if !ok {
			return nil, fmt.Errorf("image input is required")
		}
		if req.Model.ID == "bria-rmbg-2.0" {
			req.Prompt = irisFirstNonEmpty(req.Prompt, "Remove the background. Return a transparent PNG.")
		} else {
			req.Prompt = irisFirstNonEmpty(req.Prompt, "Upscale this image. Preserve detail.")
		}
		return p.imageEdit(ctx, req, []irisProviderInput{image}, 1)
	}
}

func (p *irisGatewayProvider) transcribe(ctx context.Context, req irisProviderRequest) ([]irisProviderOutput, error) {
	audio, ok := firstInput(req.Inputs, "audio", "media")
	if !ok {
		return nil, fmt.Errorf("audio input is required")
	}
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	_ = writer.WriteField("model", req.Model.GatewayID)
	if req.Language != "" {
		_ = writer.WriteField("language", req.Language)
	}
	if req.Prompt != "" {
		_ = writer.WriteField("prompt", req.Prompt)
	}
	part, err := writer.CreateFormFile("file", "audio.wav")
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(audio.Bytes); err != nil {
		return nil, err
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/audio/transcriptions", &buf)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	httpReq.Header.Set("Content-Type", writer.FormDataContentType())
	body, err := p.do(httpReq)
	if err != nil {
		return nil, err
	}
	transcript := normalizeTranscript(body)
	return []irisProviderOutput{{Bytes: transcript, Filename: "transcript.json", ContentType: "application/json"}}, nil
}

func (p *irisGatewayProvider) json(ctx context.Context, method, path string, payload any) ([]byte, error) {
	httpReq, err := http.NewRequestWithContext(ctx, method, p.baseURL+path, bytes.NewReader(mustJSON(payload)))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")
	return p.do(httpReq)
}

func (p *irisGatewayProvider) do(req *http.Request) ([]byte, error) {
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("gateway request failed: %s", truncate(string(body), 400))
	}
	return body, nil
}

func decodeImageOutputs(ctx context.Context, body []byte, stem, ext string) ([]irisProviderOutput, error) {
	var parsed struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
			URL     string `json:"url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	if len(parsed.Data) == 0 {
		return nil, fmt.Errorf("gateway returned no images")
	}
	contentType := "image/" + ext
	if stem == "video" {
		contentType = "video/mp4"
	}
	out := make([]irisProviderOutput, 0, len(parsed.Data))
	for i, item := range parsed.Data {
		var raw []byte
		var err error
		if item.B64JSON != "" {
			raw, err = base64.StdEncoding.DecodeString(item.B64JSON)
		} else if item.URL != "" {
			raw, _, err = fetchHTTPS(ctx, item.URL)
		} else {
			err = fmt.Errorf("empty image payload")
		}
		if err != nil {
			return nil, err
		}
		name := fmt.Sprintf("%s-%d.%s", stem, i+1, ext)
		if len(parsed.Data) == 1 {
			name = stem + "." + ext
		}
		out = append(out, irisProviderOutput{Bytes: raw, Filename: name, ContentType: contentType})
	}
	return out, nil
}

func normalizeTranscript(body []byte) []byte {
	var parsed struct {
		Text     string `json:"text"`
		Language string `json:"language"`
		Words    []struct {
			Text  string  `json:"text"`
			Start float64 `json:"start"`
			End   float64 `json:"end"`
		} `json:"words"`
		Segments []struct {
			Text  string  `json:"text"`
			Start float64 `json:"start"`
			End   float64 `json:"end"`
		} `json:"segments"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil || strings.TrimSpace(parsed.Text) == "" && len(parsed.Segments) == 0 {
		return mustJSON([]map[string]any{{"text": strings.TrimSpace(string(body)), "words": []any{}}})
	}
	if len(parsed.Words) > 0 {
		words := make([]map[string]any, 0, len(parsed.Words))
		for _, word := range parsed.Words {
			words = append(words, map[string]any{"text": word.Text, "start": word.Start, "end": word.End})
		}
		return mustJSON([]map[string]any{{"text": parsed.Text, "words": words}})
	}
	if len(parsed.Segments) > 0 {
		out := make([]map[string]any, 0, len(parsed.Segments))
		for _, segment := range parsed.Segments {
			out = append(out, map[string]any{
				"text":  segment.Text,
				"words": []map[string]any{{"text": segment.Text, "start": segment.Start, "end": segment.End}},
			})
		}
		return mustJSON(out)
	}
	return mustJSON([]map[string]any{{"text": parsed.Text, "words": []any{}}})
}

func inputsByRole(inputs []irisProviderInput, roles ...string) []irisProviderInput {
	wanted := map[string]struct{}{}
	for _, role := range roles {
		wanted[role] = struct{}{}
	}
	out := make([]irisProviderInput, 0)
	for _, input := range inputs {
		if _, ok := wanted[input.Role]; ok {
			out = append(out, input)
		}
	}
	return out
}

func firstInput(inputs []irisProviderInput, roles ...string) (irisProviderInput, bool) {
	found := inputsByRole(inputs, roles...)
	if len(found) == 0 {
		return irisProviderInput{}, false
	}
	return found[0], true
}

func imageSize(resolution, aspect string) string {
	switch resolution {
	case "4K":
		return "2048x2048"
	case "2K":
		return "1536x1536"
	default:
		if aspect == "16:9" {
			return "1536x1024"
		}
		if aspect == "9:16" {
			return "1024x1536"
		}
		return "1024x1024"
	}
}

func defaultType(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func irisFirstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func mustJSON(value any) []byte {
	body, err := json.Marshal(value)
	if err != nil {
		return []byte("{}")
	}
	return body
}

func truncate(value string, max int) string {
	if len(value) <= max {
		return value
	}
	return value[:max]
}
