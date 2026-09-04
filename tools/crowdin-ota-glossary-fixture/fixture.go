package main

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"time"
)

const (
	defaultBaseURL       = "https://api.crowdin.com/api/v2"
	defaultFixturePath   = "apps/hyperlocalise-web/src/lib/glossary/fixtures/fixture.json"
	defaultSeedOutput    = "tools/crowdin-ota-glossary-fixture/ota-glossary.tbx"
	defaultRecordOutput  = "apps/hyperlocalise-web/src/lib/glossary/fixtures/ota-concordance-recording.json"
	expectedConceptCount = 52
	expectedQueryCases   = 10
	maxExpressions       = 20
)

var expectedLocales = []string{"en", "vi", "ja", "de", "ko"}

type fixture struct {
	SchemaVersion     int         `json:"schemaVersion"`
	Domain            string      `json:"domain"`
	Name              string      `json:"name"`
	Description       string      `json:"description"`
	SourceLanguageID  string      `json:"sourceLanguageId"`
	TargetLanguageIDs []string    `json:"targetLanguageIds"`
	Concepts          []concept   `json:"concepts"`
	QueryCases        []queryCase `json:"queryCases"`
}

type concept struct {
	ID           string `json:"id"`
	Subject      string `json:"subject"`
	Definition   string `json:"definition"`
	Translatable *bool  `json:"translatable,omitempty"`
	Terms        []term `json:"terms"`
}

func (c concept) isTranslatable() bool {
	return c.Translatable == nil || *c.Translatable
}

type term struct {
	Locale       string `json:"locale"`
	Text         string `json:"text"`
	Description  string `json:"description,omitempty"`
	PartOfSpeech string `json:"partOfSpeech,omitempty"`
	Status       string `json:"status"`
	Forbidden    bool   `json:"forbidden,omitempty"`
}

type queryCase struct {
	ID          string   `json:"id"`
	Description string   `json:"description"`
	Expressions []string `json:"expressions"`
}

type concordanceRequest struct {
	SourceLanguageID string   `json:"sourceLanguageId"`
	TargetLanguageID string   `json:"targetLanguageId"`
	Expressions      []string `json:"expressions"`
	UserID           *int     `json:"userId,omitempty"`
}

type glossaryRecord struct {
	ID           int    `json:"id"`
	Name         string `json:"name"`
	ConceptCount int    `json:"conceptCount"`
	SeedFile     string `json:"seedFile"`
}

type recordedRun struct {
	CaseID           string             `json:"caseId"`
	TargetLanguageID string             `json:"targetLanguageId"`
	Input            concordanceRequest `json:"input"`
	HTTPStatus       int                `json:"httpStatus"`
	Output           json.RawMessage    `json:"output"`
}

type recording struct {
	SchemaVersion     int            `json:"schemaVersion"`
	CapturedAt        string         `json:"capturedAt"`
	Domain            string         `json:"domain"`
	SourceLanguageID  string         `json:"sourceLanguageId"`
	TargetLanguageIDs []string       `json:"targetLanguageIds"`
	Glossary          glossaryRecord `json:"glossary"`
	Runs              []recordedRun  `json:"runs"`
}

type tbxDocument struct {
	XMLName xml.Name  `xml:"tbx"`
	XMLNS   string    `xml:"xmlns,attr"`
	Style   string    `xml:"style,attr"`
	Type    string    `xml:"type,attr"`
	Lang    string    `xml:"xml:lang,attr"`
	Header  tbxHeader `xml:"tbxHeader"`
	Text    tbxText   `xml:"text"`
}

type tbxHeader struct {
	FileDescription tbxFileDescription `xml:"fileDesc"`
}

type tbxFileDescription struct {
	TitleStatement tbxTitleStatement `xml:"titleStmt"`
	Source         tbxSource         `xml:"sourceDesc"`
}

type tbxTitleStatement struct {
	Title string `xml:"title"`
}

type tbxSource struct {
	Paragraph string `xml:"p"`
}

type tbxText struct {
	Body tbxBody `xml:"body"`
}

type tbxBody struct {
	Concepts []tbxConcept `xml:"conceptEntry"`
}

type tbxConcept struct {
	ID           string        `xml:"id,attr"`
	Descriptions []tbxTextNode `xml:"descrip"`
	Notes        *tbxNote      `xml:"note,omitempty"`
	Languages    []tbxLanguage `xml:"langSec"`
}

type tbxLanguage struct {
	Lang         string        `xml:"xml:lang,attr"`
	Descriptions []tbxTextNode `xml:"descrip"`
	Terms        []tbxTerm     `xml:"termSec"`
}

type tbxTerm struct {
	ID          string          `xml:"id,attr"`
	Text        string          `xml:"term"`
	Notes       []tbxTermNote   `xml:"termNote"`
	Description *tbxDescription `xml:"descripGrp,omitempty"`
}

type tbxDescription struct {
	Context tbxTextNode `xml:"descrip"`
	Note    string      `xml:"note,omitempty"`
}

type tbxTextNode struct {
	Type string `xml:"type,attr"`
	Text string `xml:",chardata"`
}

type tbxTermNote struct {
	Type string `xml:"type,attr"`
	Text string `xml:",chardata"`
}

type tbxNote struct {
	Text string `xml:",chardata"`
}

type apiClient struct {
	baseURL       string
	token         string
	httpClient    *http.Client
	pollInterval  time.Duration
	importTimeout time.Duration
}

type apiError struct {
	Method string
	Path   string
	Status int
	Body   string
}

func fixtureExpressionCount(value fixture) int {
	count := 0
	for _, query := range value.QueryCases {
		count += len(query.Expressions)
	}
	return count
}

func loadDefaultFixture() (fixture, error) {
	content, err := readDefaultFixture()
	if err != nil {
		return fixture{}, err
	}
	return loadFixture(content)
}

func readDefaultFixture() ([]byte, error) {
	candidates := []string{defaultFixturePath}
	if _, sourcePath, _, ok := runtime.Caller(0); ok {
		candidates = append(candidates, filepath.Join(filepath.Dir(sourcePath), "..", "..", defaultFixturePath))
	}

	var lastErr error
	for _, candidate := range candidates {
		content, err := os.ReadFile(candidate)
		if err == nil {
			return content, nil
		}
		lastErr = err
	}

	return nil, fmt.Errorf("read default fixture %q: %w", defaultFixturePath, lastErr)
}

func (e *apiError) Error() string {
	if e.Body == "" {
		return fmt.Sprintf("crowdin %s %s: HTTP %d", e.Method, e.Path, e.Status)
	}
	return fmt.Sprintf("crowdin %s %s: HTTP %d: %s", e.Method, e.Path, e.Status, e.Body)
}

func loadFixture(data []byte) (fixture, error) {
	var value fixture
	if err := json.Unmarshal(data, &value); err != nil {
		return fixture{}, fmt.Errorf("decode fixture: %w", err)
	}
	if err := validateFixture(value); err != nil {
		return fixture{}, err
	}
	return value, nil
}

func validateFixture(value fixture) error {
	if value.SchemaVersion != 1 {
		return fmt.Errorf("fixture schemaVersion must be 1, got %d", value.SchemaVersion)
	}
	if value.SourceLanguageID != "en" {
		return fmt.Errorf("fixture source language must be en, got %q", value.SourceLanguageID)
	}
	if len(value.TargetLanguageIDs) != 4 || !slices.Equal(value.TargetLanguageIDs, []string{"vi", "ja", "de", "ko"}) {
		return fmt.Errorf("fixture target languages must be vi, ja, de, ko")
	}
	if len(value.Concepts) != expectedConceptCount {
		return fmt.Errorf("fixture must contain %d concepts, got %d", expectedConceptCount, len(value.Concepts))
	}

	conceptIDs := make(map[string]struct{}, len(value.Concepts))
	for _, item := range value.Concepts {
		if item.ID == "" || item.Definition == "" || item.Subject == "" {
			return fmt.Errorf("concept %q must have an id, subject, and definition", item.ID)
		}
		if _, exists := conceptIDs[item.ID]; exists {
			return fmt.Errorf("duplicate concept id %q", item.ID)
		}
		conceptIDs[item.ID] = struct{}{}

		locales := make(map[string]struct{}, len(item.Terms))
		terms := make(map[string]struct{}, len(item.Terms))
		for _, candidate := range item.Terms {
			if candidate.Text == "" || candidate.Locale == "" || candidate.Status == "" {
				return fmt.Errorf("concept %q has an incomplete term", item.ID)
			}
			if !slices.Contains(expectedLocales, candidate.Locale) {
				return fmt.Errorf("concept %q has unsupported locale %q", item.ID, candidate.Locale)
			}
			if _, exists := locales[candidate.Locale]; exists && candidate.Locale != "en" {
				return fmt.Errorf("concept %q has duplicate %s term", item.ID, candidate.Locale)
			}
			locales[candidate.Locale] = struct{}{}
			key := strings.ToLower(candidate.Locale + "\x00" + candidate.Text)
			if _, exists := terms[key]; exists {
				return fmt.Errorf("concept %q has duplicate term %q", item.ID, candidate.Text)
			}
			terms[key] = struct{}{}
		}
		for _, locale := range expectedLocales {
			if _, exists := locales[locale]; !exists {
				return fmt.Errorf("concept %q is missing locale %q", item.ID, locale)
			}
		}
	}

	if len(value.QueryCases) != expectedQueryCases {
		return fmt.Errorf("fixture must contain %d query cases, got %d", expectedQueryCases, len(value.QueryCases))
	}
	queryIDs := make(map[string]struct{}, len(value.QueryCases))
	for _, query := range value.QueryCases {
		if query.ID == "" || len(query.Expressions) == 0 || len(query.Expressions) > maxExpressions {
			return fmt.Errorf("query case %q must contain 1-%d expressions", query.ID, maxExpressions)
		}
		if _, exists := queryIDs[query.ID]; exists {
			return fmt.Errorf("duplicate query case id %q", query.ID)
		}
		queryIDs[query.ID] = struct{}{}
		for _, expression := range query.Expressions {
			if strings.TrimSpace(expression) == "" {
				return fmt.Errorf("query case %q contains an empty expression", query.ID)
			}
		}
	}
	return nil
}

func writeTBX(path string, value fixture) error {
	document := tbxDocument{
		XMLNS: defaultTBXNamespace,
		Style: "dca",
		Type:  "TBX-Basic",
		Lang:  value.SourceLanguageID,
		Header: tbxHeader{FileDescription: tbxFileDescription{
			TitleStatement: tbxTitleStatement{Title: value.Name},
			Source:         tbxSource{Paragraph: "Generated by Hyperlocalise OTA concordance fixture tool"},
		}},
	}

	for _, item := range value.Concepts {
		conceptEntry := tbxConcept{ID: "c-" + item.ID}
		subject := tbxTextNode{Type: "subjectField", Text: item.Subject}
		conceptEntry.Descriptions = []tbxTextNode{subject, {Type: "definition", Text: item.Definition}}
		conceptEntry.Notes = &tbxNote{Text: fmt.Sprintf("[Hyperlocalise::translatable]::%t", item.isTranslatable())}

		byLocale := make(map[string][]term)
		for _, candidate := range item.Terms {
			byLocale[candidate.Locale] = append(byLocale[candidate.Locale], candidate)
		}
		for _, locale := range expectedLocales {
			candidates := byLocale[locale]
			if len(candidates) == 0 {
				continue
			}
			language := tbxLanguage{Lang: locale}
			if locale == value.SourceLanguageID {
				language.Descriptions = []tbxTextNode{{Type: "definition", Text: item.Definition}}
			}
			for index, candidate := range candidates {
				xmlTerm := tbxTerm{ID: fmt.Sprintf("t-%s-%s-%d", item.ID, locale, index), Text: candidate.Text}
				if candidate.PartOfSpeech != "" {
					xmlTerm.Notes = append(xmlTerm.Notes, tbxTermNote{Type: "partOfSpeech", Text: candidate.PartOfSpeech})
				}
				if candidate.Status == "preferred" || candidate.Status == "admitted" {
					xmlTerm.Notes = append(xmlTerm.Notes, tbxTermNote{Type: "administrativeStatus", Text: candidate.Status + "Term-admn-sts"})
				}
				notes := []string{}
				if candidate.Forbidden {
					notes = append(notes, "[Hyperlocalise::forbidden]::true")
				}
				if candidate.Description != "" {
					xmlTerm.Description = &tbxDescription{
						Context: tbxTextNode{Type: "context", Text: candidate.Description},
					}
				}
				if len(notes) > 0 {
					if xmlTerm.Description == nil {
						xmlTerm.Description = &tbxDescription{}
					}
					xmlTerm.Description.Note = strings.Join(notes, "\n")
				}
				language.Terms = append(language.Terms, xmlTerm)
			}
			conceptEntry.Languages = append(conceptEntry.Languages, language)
		}
		document.Text.Body.Concepts = append(document.Text.Body.Concepts, conceptEntry)
	}

	var buffer bytes.Buffer
	buffer.WriteString("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
	encoder := xml.NewEncoder(&buffer)
	encoder.Indent("", "  ")
	if err := encoder.Encode(document); err != nil {
		return fmt.Errorf("encode TBX: %w", err)
	}
	if err := encoder.Flush(); err != nil {
		return fmt.Errorf("flush TBX: %w", err)
	}
	return atomicWrite(path, buffer.Bytes())
}

func newAPIClient(baseURL, token string) *apiClient {
	return &apiClient{
		baseURL:       strings.TrimRight(baseURL, "/"),
		token:         token,
		httpClient:    &http.Client{Timeout: 30 * time.Second},
		pollInterval:  time.Second,
		importTimeout: 5 * time.Minute,
	}
}

func (c *apiClient) request(ctx context.Context, method, path string, body []byte, contentType string, extraHeaders map[string]string) ([]byte, int, error) {
	request, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, 0, fmt.Errorf("build crowdin request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+c.token)
	request.Header.Set("User-Agent", "hyperlocalise-crowdin-ota-fixture/1")
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	for key, value := range extraHeaders {
		request.Header.Set(key, value)
	}

	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, 0, fmt.Errorf("crowdin %s %s: %w", method, path, err)
	}
	defer func() { _ = response.Body.Close() }()
	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, response.StatusCode, fmt.Errorf("read crowdin %s %s response: %w", method, path, err)
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, response.StatusCode, &apiError{Method: method, Path: path, Status: response.StatusCode, Body: strings.TrimSpace(string(responseBody))}
	}
	return responseBody, response.StatusCode, nil
}

func (c *apiClient) createGlossary(ctx context.Context, value fixture) (int, error) {
	payload, err := json.Marshal(map[string]any{
		"name":       value.Name,
		"languageId": value.SourceLanguageID,
	})
	if err != nil {
		return 0, fmt.Errorf("encode glossary creation: %w", err)
	}
	body, _, err := c.request(ctx, http.MethodPost, "/glossaries", payload, "application/json", nil)
	if err != nil {
		return 0, err
	}
	var response struct {
		Data struct {
			ID int `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return 0, fmt.Errorf("decode glossary creation: %w", err)
	}
	if response.Data.ID <= 0 {
		return 0, errors.New("crowdin glossary creation returned no glossary id")
	}
	return response.Data.ID, nil
}

func (c *apiClient) uploadStorage(ctx context.Context, path string) (int, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return 0, fmt.Errorf("read seed TBX: %w", err)
	}
	body, _, err := c.request(ctx, http.MethodPost, "/storages", content, "application/xml", map[string]string{
		"Crowdin-API-FileName": url.PathEscape(filepath.Base(path)),
	})
	if err != nil {
		return 0, err
	}
	var response struct {
		Data struct {
			ID int `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return 0, fmt.Errorf("decode storage upload: %w", err)
	}
	if response.Data.ID <= 0 {
		return 0, errors.New("crowdin storage upload returned no storage id")
	}
	return response.Data.ID, nil
}

func (c *apiClient) importGlossary(ctx context.Context, glossaryID, storageID int) error {
	payload, err := json.Marshal(map[string]int{"storageId": storageID})
	if err != nil {
		return fmt.Errorf("encode glossary import: %w", err)
	}
	body, _, err := c.request(ctx, http.MethodPost, fmt.Sprintf("/glossaries/%d/imports", glossaryID), payload, "application/json", nil)
	if err != nil {
		return err
	}
	var response importResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return fmt.Errorf("decode glossary import: %w", err)
	}
	identifier := strings.TrimSpace(response.Data.Identifier)
	if identifier == "" {
		return errors.New("crowdin glossary import returned no identifier")
	}
	status := response.Data.Status
	lastResponseBody := body
	deadline := time.Now().Add(c.importTimeout)
	for {
		switch strings.ToLower(strings.TrimSpace(status)) {
		case "finished", "completed", "done":
			return nil
		case "failed", "error", "canceled", "cancelled":
			return fmt.Errorf(
				"crowdin glossary import %s: %s",
				strings.ToLower(strings.TrimSpace(status)),
				importFailureDetail(response, lastResponseBody),
			)
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("crowdin glossary import timed out with status %q", status)
		}
		timer := time.NewTimer(c.pollInterval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
		statusBody, _, err := c.request(ctx, http.MethodGet, fmt.Sprintf("/glossaries/%d/imports/%s", glossaryID, url.PathEscape(identifier)), nil, "", nil)
		if err != nil {
			return err
		}
		var next importResponse
		if err := json.Unmarshal(statusBody, &next); err != nil {
			return fmt.Errorf("decode glossary import status: %w", err)
		}
		if strings.TrimSpace(next.Data.Identifier) != "" {
			identifier = strings.TrimSpace(next.Data.Identifier)
		}
		response = next
		lastResponseBody = statusBody
		status = next.Data.Status
	}
}

type importResponse struct {
	Data struct {
		Identifier string          `json:"identifier"`
		Status     string          `json:"status"`
		Error      json.RawMessage `json:"error"`
		Errors     json.RawMessage `json:"errors"`
	} `json:"data"`
}

func importFailureDetail(response importResponse, rawResponse []byte) string {
	for _, detail := range []json.RawMessage{response.Data.Error, response.Data.Errors} {
		if len(detail) == 0 || string(detail) == "null" {
			continue
		}
		return strings.TrimSpace(string(detail))
	}
	if detail := strings.TrimSpace(string(rawResponse)); detail != "" {
		return detail
	}
	return "Crowdin did not return an error detail"
}

func (c *apiClient) concordance(ctx context.Context, input concordanceRequest) (json.RawMessage, int, error) {
	payload, err := json.Marshal(input)
	if err != nil {
		return nil, 0, fmt.Errorf("encode concordance request: %w", err)
	}
	body, status, err := c.request(ctx, http.MethodPost, "/glossaries/concordance", payload, "application/json", nil)
	if err != nil {
		return nil, status, err
	}
	if !json.Valid(body) {
		return nil, status, errors.New("crowdin concordance returned invalid JSON")
	}
	return json.RawMessage(body), status, nil
}

func filterConcordanceOutputForGlossary(output json.RawMessage, glossaryID int) (json.RawMessage, error) {
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(output, &envelope); err != nil {
		return nil, fmt.Errorf("decode concordance response: %w", err)
	}

	rawData, ok := envelope["data"]
	if !ok {
		return nil, errors.New("concordance response returned no data")
	}

	var entries []json.RawMessage
	if err := json.Unmarshal(rawData, &entries); err != nil {
		return nil, fmt.Errorf("decode concordance results: %w", err)
	}

	filtered := make([]json.RawMessage, 0, len(entries))
	for index, entry := range entries {
		var result struct {
			Data struct {
				Glossary struct {
					ID int `json:"id"`
				} `json:"glossary"`
			} `json:"data"`
		}
		if err := json.Unmarshal(entry, &result); err != nil {
			return nil, fmt.Errorf("decode concordance result %d: %w", index, err)
		}
		if result.Data.Glossary.ID == 0 {
			return nil, fmt.Errorf("concordance result %d returned no glossary id", index)
		}
		if result.Data.Glossary.ID == glossaryID {
			filtered = append(filtered, entry)
		}
	}

	filteredData, err := json.Marshal(filtered)
	if err != nil {
		return nil, fmt.Errorf("encode filtered concordance results: %w", err)
	}
	envelope["data"] = filteredData
	filteredOutput, err := json.Marshal(envelope)
	if err != nil {
		return nil, fmt.Errorf("encode filtered concordance response: %w", err)
	}
	return filteredOutput, nil
}

func buildRecording(value fixture, glossaryID int, seedPath string, userID *int, outputs []recordedRun) recording {
	return recording{
		SchemaVersion:     1,
		CapturedAt:        time.Now().UTC().Format(time.RFC3339),
		Domain:            value.Domain,
		SourceLanguageID:  value.SourceLanguageID,
		TargetLanguageIDs: value.TargetLanguageIDs,
		Glossary: glossaryRecord{
			ID:           glossaryID,
			Name:         value.Name,
			ConceptCount: len(value.Concepts),
			SeedFile:     seedPath,
		},
		Runs: outputs,
	}
}

func recordingBytes(value recording) ([]byte, error) {
	content, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode recording: %w", err)
	}
	return append(content, '\n'), nil
}

func atomicWrite(path string, content []byte) error {
	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return fmt.Errorf("create output directory: %w", err)
	}
	temporary, err := os.CreateTemp(directory, ".crowdin-ota-fixture-*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary output: %w", err)
	}
	temporaryName := temporary.Name()
	defer func() { _ = os.Remove(temporaryName) }()
	if _, err := temporary.Write(content); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("write temporary output: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close temporary output: %w", err)
	}
	if err := os.Chmod(temporaryName, 0o644); err != nil {
		return fmt.Errorf("set output permissions: %w", err)
	}
	if err := os.Rename(temporaryName, path); err != nil {
		return fmt.Errorf("replace output %q: %w", path, err)
	}
	return nil
}

const defaultTBXNamespace = "urn:iso:std:iso:30042:ed-2"
