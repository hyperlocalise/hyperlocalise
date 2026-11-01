package elevenlabs

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	dubbingPath             = "/v1/dubbing"
	defaultDubPollInterval  = 3 * time.Second
	dubStatusDubbed         = "dubbed"
	dubStatusFailed         = "failed"
	defaultDubSourceLang    = "auto"
	maxDubSpeakers          = 9
	defaultDubbingMediaName = "media"
)

// DubRequest dubs a video or audio file into another language, keeping the
// speakers' own voices.
type DubRequest struct {
	Media       []byte
	ContentType string
	// TargetLanguage is an ISO 639-1 code or BCP 47 tag (`fr`, `pt-BR`); the
	// region is dropped before the call, as ElevenLabs takes languages.
	TargetLanguage string
	// SourceLanguage is detected when empty.
	SourceLanguage string
	// Speakers is the number of distinct voices; detected when 0.
	Speakers int
	// PollInterval overrides how often the dub's status is checked.
	PollInterval time.Duration
}

// Dub is a finished dub: the dubbed media in the container it was given in.
type Dub struct {
	ID          string
	Bytes       []byte
	ContentType string
}

type dubCreateResponse struct {
	DubbingID string `json:"dubbing_id"`
}

type dubStatusResponse struct {
	Status string `json:"status"`
	Error  string `json:"error"`
}

// DubbingLanguage reduces a locale to the language code ElevenLabs dubbing takes.
func DubbingLanguage(locale string) string {
	trimmed := strings.TrimSpace(strings.ReplaceAll(locale, "_", "-"))
	if trimmed == "" {
		return ""
	}
	lower := strings.ToLower(trimmed)
	// Chinese is the one language ElevenLabs names by script.
	if strings.HasPrefix(lower, "zh") {
		return "zh"
	}
	if i := strings.Index(lower, "-"); i > 0 {
		return lower[:i]
	}
	return lower
}

// CreateDub runs a dub to completion: starts it, polls until ElevenLabs has
// dubbed it (or ctx ends), then downloads the dubbed media.
func (c *Client) CreateDub(ctx context.Context, req DubRequest) (Dub, error) {
	if len(req.Media) == 0 {
		return Dub{}, newError(ErrorCodeValidation, "media is required", dubbingPath, 0)
	}
	target := DubbingLanguage(req.TargetLanguage)
	if target == "" {
		return Dub{}, newError(ErrorCodeValidation, "target language is required", dubbingPath, 0)
	}
	id, err := c.startDub(ctx, req, target)
	if err != nil {
		return Dub{}, err
	}
	interval := req.PollInterval
	if interval <= 0 {
		interval = defaultDubPollInterval
	}
	if err := c.waitForDub(ctx, id, interval); err != nil {
		return Dub{}, err
	}
	body, contentType, err := c.do(ctx, http.MethodGet, dubbingPath+"/"+url.PathEscape(id)+"/audio/"+url.PathEscape(target), nil, nil)
	if err != nil {
		return Dub{}, err
	}
	if len(body) == 0 {
		return Dub{}, newError(ErrorCodeInvalidResponse, "ElevenLabs returned an empty dub", dubbingPath, 0)
	}
	return Dub{ID: id, Bytes: body, ContentType: dubContentType(contentType, req.ContentType)}, nil
}

func (c *Client) startDub(ctx context.Context, req DubRequest, target string) (string, error) {
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	source := DubbingLanguage(req.SourceLanguage)
	if source == "" {
		source = defaultDubSourceLang
	}
	fields := map[string]string{
		"target_lang": target,
		"source_lang": source,
		"watermark":   "false",
	}
	if req.Speakers > 0 {
		speakers := req.Speakers
		if speakers > maxDubSpeakers {
			speakers = maxDubSpeakers
		}
		fields["num_speakers"] = strconv.Itoa(speakers)
	}
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			return "", fmt.Errorf("elevenlabs: build dubbing request: %w", err)
		}
	}
	part, err := writer.CreatePart(mediaPartHeader(req.ContentType))
	if err != nil {
		return "", fmt.Errorf("elevenlabs: build dubbing request: %w", err)
	}
	if _, err := part.Write(req.Media); err != nil {
		return "", fmt.Errorf("elevenlabs: build dubbing request: %w", err)
	}
	if err := writer.Close(); err != nil {
		return "", fmt.Errorf("elevenlabs: build dubbing request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+dubbingPath, &buf)
	if err != nil {
		return "", fmt.Errorf("elevenlabs: build request: %w", err)
	}
	httpReq.Header.Set("xi-api-key", c.apiKey)
	httpReq.Header.Set("Content-Type", writer.FormDataContentType())
	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", httpError(resp.StatusCode, dubbingPath, string(body))
	}
	var created dubCreateResponse
	if err := json.Unmarshal(body, &created); err != nil || strings.TrimSpace(created.DubbingID) == "" {
		return "", newError(ErrorCodeInvalidResponse, "ElevenLabs returned no dubbing id", dubbingPath, 0)
	}
	return created.DubbingID, nil
}

func (c *Client) waitForDub(ctx context.Context, id string, interval time.Duration) error {
	path := dubbingPath + "/" + url.PathEscape(id)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		var status dubStatusResponse
		if err := c.doJSON(ctx, http.MethodGet, path, nil, &status); err != nil {
			return err
		}
		switch status.Status {
		case dubStatusDubbed:
			return nil
		case dubStatusFailed:
			message := strings.TrimSpace(status.Error)
			if message == "" {
				message = "ElevenLabs could not dub the media"
			}
			return newError(ErrorCodeUpstream, message, path, 0)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func mediaPartHeader(contentType string) map[string][]string {
	contentType = strings.TrimSpace(contentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return map[string][]string{
		"Content-Disposition": {fmt.Sprintf(`form-data; name="file"; filename="%s%s"`, defaultDubbingMediaName, mediaExtension(contentType))},
		"Content-Type":        {contentType},
	}
}

func mediaExtension(contentType string) string {
	switch {
	case strings.Contains(contentType, "mp4"):
		return ".mp4"
	case strings.Contains(contentType, "quicktime"):
		return ".mov"
	case strings.Contains(contentType, "webm"):
		return ".webm"
	case strings.Contains(contentType, "wav"):
		return ".wav"
	case strings.Contains(contentType, "mpeg"), strings.Contains(contentType, "mp3"):
		return ".mp3"
	default:
		return ""
	}
}

func dubContentType(returned, given string) string {
	returned = strings.TrimSpace(returned)
	if returned != "" && !strings.Contains(returned, "json") && returned != "application/octet-stream" {
		return returned
	}
	if strings.HasPrefix(given, "video/") {
		return "video/mp4"
	}
	return "audio/mpeg"
}
