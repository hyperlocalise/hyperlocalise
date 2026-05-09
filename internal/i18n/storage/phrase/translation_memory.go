package phrase

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/locales"
)

const (
	defaultTMSBaseURL        = "https://cloud.memsource.com/web/api2"
	phraseTMSPollDelay       = 500 * time.Millisecond
	phraseTMSMaxPollAttempts = 120
)

func TranslationMemoryCSVHeader() []string {
	return []string{
		"tm_id",
		"segment_id",
		"source_locale",
		"target_locale",
		"source_text",
		"target_text",
		"created_at",
		"changed_at",
		"creation_id",
		"change_id",
	}
}

type TranslationMemoryDownloadInput struct {
	TranslationMemoryID string
	APIToken            string
	SourceLanguage      string
	TargetLanguages     []string
}

type TranslationMemoryDownloadResult struct {
	Rows     int
	Segments int
}

type translationMemoryTU struct {
	ID         string
	CreatedAt  string
	ChangedAt  string
	CreationID string
	ChangeID   string
	Variants   []translationMemoryTUV
}

type translationMemoryTUV struct {
	Language string
	Text     string
}

func NewTMSHTTPClientWithBaseURL(cfg Config, baseURL string, client *http.Client) (*HTTPClient, error) {
	if client == nil {
		return nil, fmt.Errorf("phrase tms http client: client must not be nil")
	}
	if strings.TrimSpace(baseURL) == "" {
		baseURL = defaultTMSBaseURL
	}
	return newHTTPClient(baseURL, client), nil
}

func (c *HTTPClient) WriteTranslationMemoryCSV(ctx context.Context, in TranslationMemoryDownloadInput, w io.Writer) (TranslationMemoryDownloadResult, error) {
	if c == nil || c.httpClient == nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("phrase translation memory download: client is nil")
	}
	if strings.TrimSpace(in.TranslationMemoryID) == "" {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("phrase translation memory download: translation memory id is required")
	}
	if strings.TrimSpace(in.APIToken) == "" {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("phrase translation memory download: api token is required")
	}
	if strings.TrimSpace(in.SourceLanguage) == "" {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("phrase translation memory download: source language is required")
	}
	targets := locales.NormalizeList(in.TargetLanguages)
	if len(targets) == 0 {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("phrase translation memory download: at least one target language is required")
	}
	if w == nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("phrase translation memory download: writer is nil")
	}

	content, err := c.downloadTranslationMemoryTMX(ctx, in.TranslationMemoryID, in.APIToken, targets)
	if err != nil {
		return TranslationMemoryDownloadResult{}, err
	}
	segments, err := parseTranslationMemoryTMX(content)
	if err != nil {
		return TranslationMemoryDownloadResult{}, err
	}
	rows := phraseTranslationMemoryCSVRows(strings.TrimSpace(in.TranslationMemoryID), segments, strings.TrimSpace(in.SourceLanguage), targets)

	writer := csv.NewWriter(w)
	if err := writer.Write(TranslationMemoryCSVHeader()); err != nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("write phrase translation memory csv header: %w", err)
	}
	for _, row := range rows {
		if err := writer.Write(row); err != nil {
			return TranslationMemoryDownloadResult{}, fmt.Errorf("write phrase translation memory csv row: %w", err)
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("flush phrase translation memory csv: %w", err)
	}
	return TranslationMemoryDownloadResult{Rows: len(rows), Segments: len(segments)}, nil
}

func (c *HTTPClient) downloadTranslationMemoryTMX(ctx context.Context, tmID, token string, targetLanguages []string) ([]byte, error) {
	var start struct {
		AsyncRequest struct {
			ID string `json:"id"`
		} `json:"asyncRequest"`
	}
	payload := map[string]any{"exportTargetLangs": targetLanguages}
	path := fmt.Sprintf("/v2/transMemories/%s/export", url.PathEscape(tmID))
	if err := c.doTMSJSON(ctx, http.MethodPost, path, token, payload, &start); err != nil {
		return nil, fmt.Errorf("start phrase translation memory export: %w", err)
	}
	asyncID := strings.TrimSpace(start.AsyncRequest.ID)
	if asyncID == "" {
		return nil, fmt.Errorf("start phrase translation memory export: response missing async request id")
	}
	return c.waitForTranslationMemoryExport(ctx, token, asyncID)
}

func (c *HTTPClient) waitForTranslationMemoryExport(ctx context.Context, token, asyncID string) ([]byte, error) {
	path := fmt.Sprintf("/v1/transMemories/downloadExport/%s?format=TMX", url.PathEscape(asyncID))
	for attempt := 0; attempt < phraseTMSMaxPollAttempts; attempt++ {
		content, retry, err := c.doTMSDownload(ctx, path, token)
		if err == nil {
			return content, nil
		}
		if !retry {
			return nil, fmt.Errorf("download phrase translation memory export: %w", err)
		}
		if err := sleepWithContext(ctx, phraseTMSPollDelay); err != nil {
			return nil, err
		}
	}
	return nil, fmt.Errorf("download phrase translation memory export: timed out waiting for async request %q", asyncID)
}

func (c *HTTPClient) doTMSJSON(ctx context.Context, method, path, token string, payload any, out any) error {
	var bodyBytes []byte
	contentType := ""
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		bodyBytes = encoded
		contentType = "application/json"
	}
	return c.doTMSRequest(ctx, method, path, token, contentType, bodyBytes, out)
}

func (c *HTTPClient) doTMSRequest(ctx context.Context, method, path, token, contentType string, bodyBytes []byte, out any) error {
	attempt := 0
	for {
		var body io.Reader
		if len(bodyBytes) > 0 {
			body = bytes.NewReader(bodyBytes)
		}
		req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", phraseTMSAuthorizationHeader(token))
		req.Header.Set("Accept", "application/json")
		if contentType != "" {
			req.Header.Set("Content-Type", contentType)
		}
		resp, err := c.httpClient.Do(req)
		if err != nil {
			if !shouldRetry(nil, err) || attempt >= maxRetries {
				return err
			}
			delay := retryDelay(attempt, nil)
			attempt++
			if err := sleepWithContext(ctx, delay); err != nil {
				return err
			}
			continue
		}
		rawBody, readErr := io.ReadAll(resp.Body)
		closeErr := resp.Body.Close()
		if readErr != nil {
			return readErr
		}
		if closeErr != nil {
			return closeErr
		}
		if shouldRetry(resp, nil) && attempt < maxRetries {
			delay := retryDelay(attempt, resp)
			attempt++
			if err := sleepWithContext(ctx, delay); err != nil {
				return err
			}
			continue
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return fmt.Errorf("response status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(rawBody)))
		}
		if out == nil || len(rawBody) == 0 {
			return nil
		}
		if err := json.Unmarshal(rawBody, out); err != nil {
			return err
		}
		return nil
	}
}

func (c *HTTPClient) doTMSDownload(ctx context.Context, path, token string) ([]byte, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, false, err
	}
	req.Header.Set("Authorization", phraseTMSAuthorizationHeader(token))
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, shouldRetry(nil, err), err
	}
	defer func() {
		_ = resp.Body.Close()
	}()
	if resp.StatusCode == http.StatusAccepted || resp.StatusCode == http.StatusRequestTimeout || resp.StatusCode == http.StatusTooManyRequests {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return nil, true, fmt.Errorf("export is not ready (status=%d)", resp.StatusCode)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, false, fmt.Errorf("response status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	content, err := io.ReadAll(resp.Body)
	return content, false, err
}

func phraseTMSAuthorizationHeader(token string) string {
	trimmed := strings.TrimSpace(token)
	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "apitoken ") || strings.HasPrefix(lower, "bearer ") {
		return trimmed
	}
	return "ApiToken " + trimmed
}

func parseTranslationMemoryTMX(content []byte) ([]translationMemoryTU, error) {
	decoder := xml.NewDecoder(bytes.NewReader(content))
	segments := make([]translationMemoryTU, 0)
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("parse phrase translation memory tmx: %w", err)
		}
		start, ok := token.(xml.StartElement)
		if !ok || start.Name.Local != "tu" {
			continue
		}
		segment, err := decodeTranslationMemoryTU(decoder, start)
		if err != nil {
			return nil, err
		}
		segments = append(segments, segment)
	}
	return segments, nil
}

func decodeTranslationMemoryTU(decoder *xml.Decoder, start xml.StartElement) (translationMemoryTU, error) {
	segment := translationMemoryTU{}
	for _, attr := range start.Attr {
		switch attr.Name.Local {
		case "tuid":
			segment.ID = attr.Value
		case "creationdate":
			segment.CreatedAt = attr.Value
		case "changedate":
			segment.ChangedAt = attr.Value
		case "creationid":
			segment.CreationID = attr.Value
		case "changeid":
			segment.ChangeID = attr.Value
		}
	}
	for {
		token, err := decoder.Token()
		if err != nil {
			return translationMemoryTU{}, fmt.Errorf("parse phrase translation memory tu: %w", err)
		}
		switch typed := token.(type) {
		case xml.StartElement:
			if typed.Name.Local == "tuv" {
				variant, err := decodeTranslationMemoryTUV(decoder, typed)
				if err != nil {
					return translationMemoryTU{}, err
				}
				segment.Variants = append(segment.Variants, variant)
			}
		case xml.EndElement:
			if typed.Name.Local == start.Name.Local {
				return segment, nil
			}
		}
	}
}

func decodeTranslationMemoryTUV(decoder *xml.Decoder, start xml.StartElement) (translationMemoryTUV, error) {
	variant := translationMemoryTUV{}
	for _, attr := range start.Attr {
		if attr.Name.Local == "lang" {
			variant.Language = attr.Value
		}
	}
	for {
		token, err := decoder.Token()
		if err != nil {
			return translationMemoryTUV{}, fmt.Errorf("parse phrase translation memory tuv: %w", err)
		}
		switch typed := token.(type) {
		case xml.StartElement:
			if typed.Name.Local == "seg" {
				var text string
				if err := decoder.DecodeElement(&text, &typed); err != nil {
					return translationMemoryTUV{}, fmt.Errorf("parse phrase translation memory seg: %w", err)
				}
				variant.Text = text
			}
		case xml.EndElement:
			if typed.Name.Local == start.Name.Local {
				return variant, nil
			}
		}
	}
}

func phraseTranslationMemoryCSVRows(tmID string, segments []translationMemoryTU, sourceLanguage string, targetLanguages []string) [][]string {
	targetSet := make(map[string]string)
	for _, language := range locales.NormalizeList(targetLanguages) {
		targetSet[strings.ToLower(language)] = language
	}
	sortedSegments := slices.Clone(segments)
	slices.SortStableFunc(sortedSegments, func(left, right translationMemoryTU) int {
		return strings.Compare(left.ID, right.ID)
	})
	usedSegmentIDs := phraseTranslationMemoryUsedSegmentIDs(sortedSegments)
	nextSyntheticSegmentID := 1

	rows := make([][]string, 0, len(sortedSegments))
	for _, segment := range sortedSegments {
		source, targets := phraseTranslationMemorySegmentVariants(segment, sourceLanguage, targetSet)
		if source == nil {
			continue
		}
		segmentID := strings.TrimSpace(segment.ID)
		if segmentID == "" {
			segmentID, nextSyntheticSegmentID = phraseTranslationMemorySyntheticSegmentID(usedSegmentIDs, nextSyntheticSegmentID)
		}
		for _, target := range targets {
			rows = append(rows, []string{
				tmID,
				segmentID,
				sourceLanguage,
				target.Language,
				source.Text,
				target.Text,
				segment.CreatedAt,
				segment.ChangedAt,
				segment.CreationID,
				segment.ChangeID,
			})
		}
	}
	return rows
}

func phraseTranslationMemoryUsedSegmentIDs(segments []translationMemoryTU) map[string]struct{} {
	used := make(map[string]struct{}, len(segments))
	for _, segment := range segments {
		if id := strings.TrimSpace(segment.ID); id != "" {
			used[id] = struct{}{}
		}
	}
	return used
}

func phraseTranslationMemorySyntheticSegmentID(used map[string]struct{}, next int) (string, int) {
	for {
		candidate := fmt.Sprintf("__missing_tuid_%d", next)
		next++
		if _, exists := used[candidate]; exists {
			continue
		}
		used[candidate] = struct{}{}
		return candidate, next
	}
}

func phraseTranslationMemorySegmentVariants(segment translationMemoryTU, sourceLanguage string, targetSet map[string]string) (*translationMemoryTUV, []translationMemoryTUV) {
	variants := slices.Clone(segment.Variants)
	slices.SortStableFunc(variants, func(left, right translationMemoryTUV) int {
		return strings.Compare(left.Language, right.Language)
	})
	var source *translationMemoryTUV
	targets := make([]translationMemoryTUV, 0, len(variants))
	seenTargets := make(map[string]struct{}, len(targetSet))
	for idx := range variants {
		variant := variants[idx]
		if strings.EqualFold(variant.Language, sourceLanguage) && source == nil {
			source = &variants[idx]
			continue
		}
		targetKey := strings.ToLower(variant.Language)
		targetLang, ok := targetSet[targetKey]
		if !ok {
			continue
		}
		if _, ok := seenTargets[targetKey]; ok {
			continue
		}
		seenTargets[targetKey] = struct{}{}
		variant.Language = targetLang
		targets = append(targets, variant)
	}
	return source, targets
}
