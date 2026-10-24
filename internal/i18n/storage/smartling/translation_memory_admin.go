package smartling

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/locales"
)

const (
	translationMemoryListPageLimit = 100
	translationMemoryListMaxPages  = 1000
)

// TranslationMemorySummary is one account translation memory.
type TranslationMemorySummary struct {
	TranslationMemoryUID string   `json:"translationMemoryUid"`
	Name                 string   `json:"name"`
	Description          string   `json:"description,omitempty"`
	SourceLocaleID       string   `json:"sourceLocaleId,omitempty"`
	LocaleIDs            []string `json:"localeIds,omitempty"`
}

// TranslationMemoryListInput lists translation memories on an account.
type TranslationMemoryListInput struct {
	AccountUID string
	Query      string
}

// TranslationMemoryCreateInput creates a translation memory on an account.
type TranslationMemoryCreateInput struct {
	AccountUID     string
	Name           string
	Description    string
	SourceLocaleID string
}

// TranslationMemoryCreateResult is the created translation memory identity.
type TranslationMemoryCreateResult struct {
	TranslationMemoryUID string `json:"translationMemoryUid"`
	Name                 string `json:"name"`
	Description          string `json:"description,omitempty"`
	SourceLocaleID       string `json:"sourceLocaleId,omitempty"`
}

// TranslationMemoryImportInput uploads a TMX file into a translation memory.
type TranslationMemoryImportInput struct {
	AccountUID           string
	TranslationMemoryUID string
	FilePath             string
	FileURI              string
}

// TranslationMemoryImportResult summarizes an accepted TMX import.
type TranslationMemoryImportResult struct {
	JobUID      string `json:"jobUid"`
	TmxUID      string `json:"tmxUid"`
	StringCount int    `json:"stringCount"`
	WordCount   int    `json:"wordCount"`
}

type translationMemoryListPayload struct {
	TotalCount int                            `json:"totalCount"`
	Items      []translationMemoryListItemRaw `json:"items"`
}

type translationMemoryListItemRaw struct {
	TranslationMemoryUID  string   `json:"translationMemoryUid"`
	TranslationMemoryUID2 string   `json:"translationMemoryUID"`
	UID                   string   `json:"uid"`
	Name                  string   `json:"name"`
	Description           string   `json:"description"`
	SourceLocaleID        string   `json:"sourceLocaleId"`
	LocaleIDs             []string `json:"localeIds"`
}

type translationMemoryImportPayload struct {
	JobUID      string `json:"jobUid"`
	TmxUID      string `json:"tmxUid"`
	StringCount int    `json:"stringCount"`
	WordCount   int    `json:"wordCount"`
}

type graphqlEnvelope struct {
	Data   json.RawMessage `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

type createTmGraphQLData struct {
	CreateTm struct {
		TmUID          string `json:"tmUid"`
		Name           string `json:"name"`
		Description    string `json:"description"`
		SourceLocaleID string `json:"sourceLocaleId"`
	} `json:"createTm"`
}

const createTmGraphQLQuery = `mutation createTm($createTm: CreateTm!) {
  createTm(createTm: $createTm) {
    tmUid
    name
    description
    sourceLocaleId
  }
}`

// ListTranslationMemories pages GET /translation-memory-api/v2/accounts/{accountUid}/translation-memories.
func (c *HTTPClient) ListTranslationMemories(ctx context.Context, in TranslationMemoryListInput) ([]TranslationMemorySummary, error) {
	accountUID := strings.TrimSpace(in.AccountUID)
	if accountUID == "" {
		return nil, fmt.Errorf("smartling tm list: account uid is required")
	}

	token, err := c.accessToken(ctx)
	if err != nil {
		return nil, err
	}

	query := strings.ToLower(strings.TrimSpace(in.Query))
	limit := translationMemoryListPageLimit
	if limit <= 0 {
		limit = 100
	}
	maxPages := translationMemoryListMaxPages
	if maxPages <= 0 {
		maxPages = 1000
	}

	var all []TranslationMemorySummary
	offset := 0
	for page := 1; ; page++ {
		if page > maxPages {
			return nil, fmt.Errorf("smartling tm list: exceeded maximum page count")
		}
		params := url.Values{}
		params.Set("limit", fmt.Sprintf("%d", limit))
		params.Set("offset", fmt.Sprintf("%d", offset))
		endpoint := fmt.Sprintf("%s/accounts/%s/translation-memories?%s", c.tmBaseURL, url.PathEscape(accountUID), params.Encode())

		var envelope smartlingDataEnvelope
		if err := c.getJSON(ctx, endpoint, token, &envelope); err != nil {
			return nil, fmt.Errorf("smartling tm list: %w", err)
		}
		var payload translationMemoryListPayload
		if err := decodeSmartlingData(envelope, "smartling tm list", &payload); err != nil {
			return nil, err
		}
		if len(payload.Items) == 0 {
			break
		}
		for _, item := range payload.Items {
			summary := item.summary()
			if query != "" && !strings.Contains(strings.ToLower(summary.Name), query) {
				continue
			}
			all = append(all, summary)
		}
		if len(payload.Items) < limit {
			break
		}
		if payload.TotalCount > 0 && offset+len(payload.Items) >= payload.TotalCount {
			break
		}
		next := offset + limit
		if next <= offset {
			return nil, fmt.Errorf("smartling tm list: pagination offset did not advance")
		}
		offset = next
	}
	return all, nil
}

// CreateTranslationMemory posts the Translation Memory GraphQL createTm mutation.
func (c *HTTPClient) CreateTranslationMemory(ctx context.Context, in TranslationMemoryCreateInput) (TranslationMemoryCreateResult, error) {
	accountUID := strings.TrimSpace(in.AccountUID)
	if accountUID == "" {
		return TranslationMemoryCreateResult{}, fmt.Errorf("smartling tm create: account uid is required")
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return TranslationMemoryCreateResult{}, fmt.Errorf("smartling tm create: translation memory name is required")
	}
	localeIDs := locales.NormalizeList([]string{in.SourceLocaleID})
	if len(localeIDs) == 0 {
		return TranslationMemoryCreateResult{}, fmt.Errorf("smartling tm create: source locale is required")
	}
	sourceLocaleID := localeIDs[0]

	token, err := c.accessToken(ctx)
	if err != nil {
		return TranslationMemoryCreateResult{}, err
	}

	createInput := map[string]any{
		"name":           name,
		"sourceLocaleId": sourceLocaleID,
	}
	if description := strings.TrimSpace(in.Description); description != "" {
		createInput["description"] = description
	}

	endpoint := fmt.Sprintf("%s/accounts/%s/graphql", c.tmGraphQLBaseURL, url.PathEscape(accountUID))
	var envelope graphqlEnvelope
	if err := c.postJSON(ctx, endpoint, token, map[string]any{
		"query": createTmGraphQLQuery,
		"variables": map[string]any{
			"createTm": createInput,
		},
	}, &envelope); err != nil {
		return TranslationMemoryCreateResult{}, fmt.Errorf("smartling tm create: %w", err)
	}
	if err := envelope.err("smartling tm create"); err != nil {
		return TranslationMemoryCreateResult{}, err
	}
	var payload createTmGraphQLData
	if len(envelope.Data) == 0 || string(envelope.Data) == "null" {
		return TranslationMemoryCreateResult{}, fmt.Errorf("smartling tm create: empty response data")
	}
	if err := json.Unmarshal(envelope.Data, &payload); err != nil {
		return TranslationMemoryCreateResult{}, fmt.Errorf("smartling tm create: decode response data: %w", err)
	}
	tmUID := strings.TrimSpace(payload.CreateTm.TmUID)
	if tmUID == "" {
		return TranslationMemoryCreateResult{}, fmt.Errorf("smartling tm create: missing translation memory uid in response")
	}
	return TranslationMemoryCreateResult{
		TranslationMemoryUID: tmUID,
		Name:                 strings.TrimSpace(payload.CreateTm.Name),
		Description:          strings.TrimSpace(payload.CreateTm.Description),
		SourceLocaleID:       strings.TrimSpace(payload.CreateTm.SourceLocaleID),
	}, nil
}

// ImportTranslationMemory uploads a TMX file into a translation memory.
func (c *HTTPClient) ImportTranslationMemory(ctx context.Context, in TranslationMemoryImportInput) (TranslationMemoryImportResult, error) {
	accountUID := strings.TrimSpace(in.AccountUID)
	if accountUID == "" {
		return TranslationMemoryImportResult{}, fmt.Errorf("smartling tm import: account uid is required")
	}
	tmUID := strings.TrimSpace(in.TranslationMemoryUID)
	if tmUID == "" {
		return TranslationMemoryImportResult{}, fmt.Errorf("smartling tm import: tm uid is required")
	}
	filePath := strings.TrimSpace(in.FilePath)
	if filePath == "" {
		return TranslationMemoryImportResult{}, fmt.Errorf("smartling tm import: file path is required")
	}
	if !strings.EqualFold(filepath.Ext(filePath), ".tmx") {
		return TranslationMemoryImportResult{}, fmt.Errorf("smartling tm import: input file must be .tmx")
	}
	if _, err := os.Stat(filePath); err != nil {
		if os.IsNotExist(err) {
			return TranslationMemoryImportResult{}, fmt.Errorf("smartling tm import: file %q does not exist", filePath)
		}
		return TranslationMemoryImportResult{}, fmt.Errorf("smartling tm import: stat file %q: %w", filePath, err)
	}

	fileURI := strings.TrimSpace(in.FileURI)
	if fileURI == "" {
		fileURI = filepath.Base(filePath)
	}

	token, err := c.accessToken(ctx)
	if err != nil {
		return TranslationMemoryImportResult{}, err
	}

	endpoint := fmt.Sprintf("%s/accounts/%s/tmx/file", c.tmxBaseURL, url.PathEscape(accountUID))
	var envelope smartlingDataEnvelope
	if err := c.postMultipart(ctx, endpoint, token, map[string]string{
		"tmUid":   tmUID,
		"fileUri": fileURI,
	}, "file", filePath, &envelope); err != nil {
		return TranslationMemoryImportResult{}, fmt.Errorf("smartling tm import: %w", err)
	}
	var payload translationMemoryImportPayload
	if err := decodeSmartlingData(envelope, "smartling tm import", &payload); err != nil {
		return TranslationMemoryImportResult{}, err
	}
	if strings.TrimSpace(payload.JobUID) == "" && strings.TrimSpace(payload.TmxUID) == "" {
		return TranslationMemoryImportResult{}, fmt.Errorf("smartling tm import: missing job uid in response")
	}
	return TranslationMemoryImportResult{
		JobUID:      strings.TrimSpace(payload.JobUID),
		TmxUID:      strings.TrimSpace(payload.TmxUID),
		StringCount: payload.StringCount,
		WordCount:   payload.WordCount,
	}, nil
}

func (item translationMemoryListItemRaw) summary() TranslationMemorySummary {
	uid := strings.TrimSpace(item.TranslationMemoryUID)
	if uid == "" {
		uid = strings.TrimSpace(item.TranslationMemoryUID2)
	}
	if uid == "" {
		uid = strings.TrimSpace(item.UID)
	}
	return TranslationMemorySummary{
		TranslationMemoryUID: uid,
		Name:                 strings.TrimSpace(item.Name),
		Description:          strings.TrimSpace(item.Description),
		SourceLocaleID:       strings.TrimSpace(item.SourceLocaleID),
		LocaleIDs:            locales.NormalizeList(item.LocaleIDs),
	}
}

func (e graphqlEnvelope) err(action string) error {
	if len(e.Errors) == 0 {
		return nil
	}
	messages := make([]string, 0, len(e.Errors))
	for _, item := range e.Errors {
		if message := strings.TrimSpace(item.Message); message != "" {
			messages = append(messages, message)
		}
	}
	if len(messages) == 0 {
		return fmt.Errorf("%s: graphql error", action)
	}
	return fmt.Errorf("%s: %s", action, strings.Join(messages, "; "))
}
