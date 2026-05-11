package smartling

import (
	"bytes"
	"cmp"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
)

const (
	authAPIBaseURL     = "https://api.smartling.com/auth-api/v2"
	stringsAPIBaseURL  = "https://api.smartling.com/strings-api/v2"
	glossaryAPIBaseURL = "https://api.smartling.com/glossary-api/v2"
	tmAPIBaseURL       = "https://api.smartling.com/translation-memory-api/v2"
	filesAPIBaseURL    = "https://api.smartling.com/files-api/v2"
	translationsLimit  = 500
	glossaryLimit      = 500
)

type HTTPClient struct {
	authBaseURL     string
	stringsBaseURL  string
	glossaryBaseURL string
	tmBaseURL       string
	filesBaseURL    string
	http            *http.Client
	userIdentifier  string
	userSecret      string

	tokenMu           sync.Mutex
	cachedAccessToken string
	tokenExpiresAt    time.Time
}

func NewHTTPClient(cfg Config) (*HTTPClient, error) {
	timeout := time.Duration(cfg.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}

	return &HTTPClient{
		authBaseURL:     authAPIBaseURL,
		stringsBaseURL:  stringsAPIBaseURL,
		glossaryBaseURL: glossaryAPIBaseURL,
		tmBaseURL:       tmAPIBaseURL,
		filesBaseURL:    filesAPIBaseURL,
		http:            &http.Client{Timeout: timeout},
		userIdentifier:  cfg.UserIdentifier,
		userSecret:      cfg.UserSecret,
	}, nil
}

// SourceUploadInput contains the parameters for uploading a source file to Smartling.
type SourceUploadInput struct {
	ProjectID string
	FileURI   string
	FilePath  string
	FileType  string
	Authorize bool
}

// SourceUploadResult contains the results of a source file upload to Smartling.
type SourceUploadResult struct {
	OverWritten bool `json:"overWritten"`
	StringCount int  `json:"stringCount"`
	WordCount   int  `json:"wordCount"`
}

// UploadSourceFile uploads a source file to Smartling.
func (c *HTTPClient) UploadSourceFile(ctx context.Context, in SourceUploadInput) (SourceUploadResult, error) {
	if strings.TrimSpace(in.ProjectID) == "" {
		return SourceUploadResult{}, fmt.Errorf("smartling upload: project id is required")
	}
	if strings.TrimSpace(in.FileURI) == "" {
		return SourceUploadResult{}, fmt.Errorf("smartling upload: file uri is required")
	}
	if strings.TrimSpace(in.FilePath) == "" {
		return SourceUploadResult{}, fmt.Errorf("smartling upload: file path is required")
	}
	if strings.TrimSpace(in.FileType) == "" {
		return SourceUploadResult{}, fmt.Errorf("smartling upload: file type is required")
	}

	token, err := c.accessToken(ctx)
	if err != nil {
		return SourceUploadResult{}, err
	}

	endpoint := fmt.Sprintf("%s/projects/%s/file", c.filesBaseURL, url.PathEscape(in.ProjectID))
	params := map[string]string{
		"fileUri":   in.FileURI,
		"fileType":  in.FileType,
		"authorize": fmt.Sprintf("%t", in.Authorize),
	}

	var resp struct {
		Response struct {
			Code string `json:"code"`
		} `json:"response"`
		Data SourceUploadResult `json:"data"`
	}

	if err := c.uploadMultipart(ctx, endpoint, token, params, "file", in.FilePath, &resp); err != nil {
		return SourceUploadResult{}, fmt.Errorf("smartling upload file: %w", err)
	}

	return resp.Data, nil
}

func (c *HTTPClient) uploadMultipart(ctx context.Context, endpoint string, token string, params map[string]string, fileFieldName, filePath string, out any) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("open file: %w", err)
	}
	defer func() {
		_ = file.Close()
	}()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	for key, val := range params {
		if err := writer.WriteField(key, val); err != nil {
			return fmt.Errorf("write form field %s: %w", key, err)
		}
	}

	part, err := writer.CreateFormFile(fileFieldName, filepath.Base(filePath))
	if err != nil {
		return fmt.Errorf("create form file: %w", err)
	}

	if _, err := io.Copy(part, file); err != nil {
		return fmt.Errorf("copy file to form: %w", err)
	}

	if err := writer.Close(); err != nil {
		return fmt.Errorf("close multipart writer: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, body)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	return c.do(req, out)
}

func (c *HTTPClient) ListTranslations(ctx context.Context, in ListTranslationsInput) ([]StringTranslation, string, error) {
	token, err := c.accessToken(ctx)
	if err != nil {
		return nil, "", err
	}
	revision := time.Now().UTC().Format(time.RFC3339Nano)
	if len(in.Locales) == 0 {
		return nil, revision, nil
	}

	entries := make([]StringTranslation, 0)
	errs := make([]error, 0)
	for _, locale := range in.Locales {
		trimmedLocale := strings.TrimSpace(locale)
		if trimmedLocale == "" {
			continue
		}
		offset := 0
		for {
			batch, hasMore, err := c.listTranslationsPage(ctx, token, in.ProjectID, trimmedLocale, translationsLimit, offset)
			if err != nil {
				errs = append(errs, err)
				break
			}
			entries = append(entries, batch...)
			if !hasMore {
				break
			}
			offset += translationsLimit
		}
	}

	if len(errs) > 0 {
		return entries, revision, errors.Join(errs...)
	}

	return entries, revision, nil
}

func (c *HTTPClient) UpsertTranslations(ctx context.Context, in UpsertTranslationsInput) (string, error) {
	if len(in.Entries) == 0 {
		return time.Now().UTC().Format(time.RFC3339Nano), nil
	}

	token, err := c.accessToken(ctx)
	if err != nil {
		return "", err
	}

	byLocale := make(map[string][]StringTranslation)
	for _, entry := range in.Entries {
		locale := strings.TrimSpace(entry.Locale)
		if locale == "" {
			continue
		}
		byLocale[locale] = append(byLocale[locale], entry)
	}

	errs := make([]error, 0)
	for locale, entries := range byLocale {
		if err := c.upsertLocaleTranslations(ctx, token, in.ProjectID, locale, entries); err != nil {
			errs = append(errs, err)
		}
	}

	if len(errs) > 0 {
		return "", errors.Join(errs...)
	}

	return time.Now().UTC().Format(time.RFC3339Nano), nil
}

func (c *HTTPClient) authenticate(ctx context.Context) (string, error) {
	endpoint := fmt.Sprintf("%s/authenticate", c.authBaseURL)
	payload := map[string]string{
		"userIdentifier": c.userIdentifier,
		"userSecret":     c.userSecret,
	}

	var resp struct {
		Response struct {
			Code string `json:"code"`
		} `json:"response"`
		Data struct {
			AccessToken string `json:"accessToken"`
			ExpiresIn   int    `json:"expiresIn"`
		} `json:"data"`
	}

	if err := c.postJSON(ctx, endpoint, "", payload, &resp); err != nil {
		return "", fmt.Errorf("smartling authenticate: %w", err)
	}

	c.tokenMu.Lock()
	c.cachedAccessToken = resp.Data.AccessToken
	if resp.Data.ExpiresIn > 0 {
		c.tokenExpiresAt = time.Now().UTC().Add(time.Duration(resp.Data.ExpiresIn) * time.Second).Add(-time.Minute)
	} else {
		c.tokenExpiresAt = time.Time{}
	}
	c.tokenMu.Unlock()

	return resp.Data.AccessToken, nil
}

func (c *HTTPClient) accessToken(ctx context.Context) (string, error) {
	c.tokenMu.Lock()
	cached := c.cachedAccessToken
	expiresAt := c.tokenExpiresAt
	c.tokenMu.Unlock()

	now := time.Now().UTC()
	if strings.TrimSpace(cached) != "" {
		if expiresAt.IsZero() || now.Before(expiresAt) {
			return cached, nil
		}
	}
	return c.authenticate(ctx)
}

func (c *HTTPClient) listTranslationsPage(ctx context.Context, token string, projectID string, locale string, limit int, offset int) ([]StringTranslation, bool, error) {
	endpoint := fmt.Sprintf("%s/projects/%s/translations", c.stringsBaseURL, url.PathEscape(projectID))
	params := url.Values{}
	params.Set("targetLocaleId", locale)
	params.Set("limit", fmt.Sprintf("%d", limit))
	params.Set("offset", fmt.Sprintf("%d", offset))
	endpoint = endpoint + "?" + params.Encode()

	var resp struct {
		Response struct {
			Code string `json:"code"`
		} `json:"response"`
		Data struct {
			Items []struct {
				StringText       string `json:"stringText"`
				ParsedStringText string `json:"parsedStringText"`
				Translation      string `json:"translation"`
				Instruction      string `json:"instruction"`
				FileURI          string `json:"fileUri"`
				TargetLocaleID   string `json:"targetLocaleId"`
			} `json:"items"`
		} `json:"data"`
	}

	if err := c.getJSON(ctx, endpoint, token, &resp); err != nil {
		return nil, false, fmt.Errorf("list translations %s: %w", locale, err)
	}

	out := make([]StringTranslation, 0, len(resp.Data.Items))
	for _, item := range resp.Data.Items {
		key := strings.TrimSpace(item.ParsedStringText)
		if key == "" {
			key = strings.TrimSpace(item.StringText)
		}
		if key == "" {
			continue
		}
		contextValue := strings.TrimSpace(item.Instruction)
		if contextValue == "" {
			contextValue = strings.TrimSpace(item.FileURI)
		}
		targetLocale := strings.TrimSpace(item.TargetLocaleID)
		if targetLocale == "" {
			targetLocale = locale
		}
		out = append(out, StringTranslation{
			Key:     key,
			Context: contextValue,
			Locale:  targetLocale,
			Value:   item.Translation,
		})
	}

	return out, len(resp.Data.Items) == limit, nil
}

func (c *HTTPClient) upsertLocaleTranslations(ctx context.Context, token string, projectID string, locale string, entries []StringTranslation) error {
	endpoint := fmt.Sprintf("%s/projects/%s/locales/%s/translations", c.stringsBaseURL, url.PathEscape(projectID), url.PathEscape(locale))
	payload := map[string]any{"items": entries}
	if err := c.putJSON(ctx, endpoint, token, payload, nil); err != nil {
		return fmt.Errorf("upsert translations %s: %w", locale, err)
	}
	return nil
}

func (c *HTTPClient) getJSON(ctx context.Context, endpoint string, token string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return c.do(req, out)
}

func (c *HTTPClient) postJSON(ctx context.Context, endpoint string, token string, payload any, out any) error {
	return c.sendJSON(ctx, http.MethodPost, endpoint, token, payload, out)
}

func (c *HTTPClient) putJSON(ctx context.Context, endpoint string, token string, payload any, out any) error {
	return c.sendJSON(ctx, http.MethodPut, endpoint, token, payload, out)
}

func (c *HTTPClient) sendJSON(ctx context.Context, method string, endpoint string, token string, payload any, out any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal request body: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return c.do(req, out)
}

func (c *HTTPClient) do(req *http.Request, out any) error {
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("do request: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if out == nil {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
}

// GlossaryDownloadRequest identifies the Smartling glossary to export.
type GlossaryDownloadRequest struct {
	AccountUID  string
	GlossaryUID string
	Languages   []string
}

// GlossaryDownloadResult summarizes a Smartling glossary CSV export.
type GlossaryDownloadResult struct {
	Entries int
}

type smartlingGlossaryEntry struct {
	EntryUID     string                         `json:"entryUid"`
	Term         string                         `json:"term"`
	Definition   string                         `json:"definition"`
	PartOfSpeech string                         `json:"partOfSpeech"`
	LabelUIDs    []string                       `json:"labelUids"`
	Translations []smartlingGlossaryTranslation `json:"translations"`
}

type smartlingGlossaryTranslation struct {
	LocaleID   string `json:"localeId"`
	Term       string `json:"term"`
	Notes      string `json:"notes"`
	Definition string `json:"definition"`
}

func (c *HTTPClient) listGlossaryEntries(ctx context.Context, token string, accountUID string, glossaryUID string) ([]smartlingGlossaryEntry, error) {
	var entries []smartlingGlossaryEntry
	offset := 0
	for {
		endpoint := fmt.Sprintf("%s/accounts/%s/glossaries/%s/entries", c.glossaryBaseURL, url.PathEscape(accountUID), url.PathEscape(glossaryUID))
		params := url.Values{}
		params.Set("limit", fmt.Sprintf("%d", glossaryLimit))
		params.Set("offset", fmt.Sprintf("%d", offset))
		fullURL := endpoint + "?" + params.Encode()

		var resp struct {
			Response struct {
				Code string `json:"code"`
			} `json:"response"`
			Data struct {
				Items []smartlingGlossaryEntry `json:"items"`
			} `json:"data"`
		}

		if err := c.getJSON(ctx, fullURL, token, &resp); err != nil {
			return nil, fmt.Errorf("list glossary entries: %w", err)
		}

		entries = append(entries, resp.Data.Items...)
		if len(resp.Data.Items) < glossaryLimit {
			break
		}
		offset += glossaryLimit
	}
	return entries, nil
}

var smartlingGlossaryCSVHeader = []string{
	"account_uid",
	"glossary_uid",
	"entry_uid",
	"term",
	"definition",
	"part_of_speech",
	"label_uids",
	"translation_locale",
	"translation_term",
	"translation_notes",
	"translation_definition",
}

// WriteGlossaryCSV downloads Smartling glossary terms and writes them as stable CSV.
func (c *HTTPClient) WriteGlossaryCSV(ctx context.Context, req GlossaryDownloadRequest, w io.Writer) (GlossaryDownloadResult, error) {
	if strings.TrimSpace(req.AccountUID) == "" {
		return GlossaryDownloadResult{}, fmt.Errorf("smartling glossary download: account uid is required")
	}
	if strings.TrimSpace(req.GlossaryUID) == "" {
		return GlossaryDownloadResult{}, fmt.Errorf("smartling glossary download: glossary uid is required")
	}
	if w == nil {
		return GlossaryDownloadResult{}, fmt.Errorf("smartling glossary download: writer is nil")
	}

	token, err := c.accessToken(ctx)
	if err != nil {
		return GlossaryDownloadResult{}, err
	}

	entries, err := c.listGlossaryEntries(ctx, token, req.AccountUID, req.GlossaryUID)
	if err != nil {
		return GlossaryDownloadResult{}, err
	}

	rows := smartlingGlossaryCSVRows(req.AccountUID, req.GlossaryUID, entries, req.Languages)

	writer := csv.NewWriter(w)
	if err := writer.Write(smartlingGlossaryCSVHeader); err != nil {
		return GlossaryDownloadResult{}, fmt.Errorf("write smartling glossary csv header: %w", err)
	}
	for _, row := range rows {
		if err := writer.Write(row); err != nil {
			return GlossaryDownloadResult{}, fmt.Errorf("write smartling glossary csv row: %w", err)
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return GlossaryDownloadResult{}, fmt.Errorf("flush smartling glossary csv: %w", err)
	}

	return GlossaryDownloadResult{Entries: len(rows)}, nil
}

func smartlingGlossaryCSVRows(accountUID, glossaryUID string, entries []smartlingGlossaryEntry, locales []string) [][]string {
	localeSet := make(map[string]struct{}, len(locales))
	for _, value := range locales {
		for _, part := range strings.Split(value, ",") {
			if locale := strings.TrimSpace(part); locale != "" {
				localeSet[locale] = struct{}{}
			}
		}
	}

	sortedEntries := slices.Clone(entries)
	slices.SortStableFunc(sortedEntries, func(left, right smartlingGlossaryEntry) int {
		if left.Term != right.Term {
			return cmp.Compare(left.Term, right.Term)
		}
		return cmp.Compare(left.EntryUID, right.EntryUID)
	})

	var rows [][]string
	for _, entry := range sortedEntries {
		translations := slices.Clone(entry.Translations)
		slices.SortStableFunc(translations, func(left, right smartlingGlossaryTranslation) int {
			return cmp.Compare(left.LocaleID, right.LocaleID)
		})

		wroteTranslation := false
		for _, translation := range translations {
			if len(localeSet) > 0 {
				if _, ok := localeSet[translation.LocaleID]; !ok {
					continue
				}
			}
			rows = append(rows, smartlingGlossaryCSVRow(accountUID, glossaryUID, entry, &translation))
			wroteTranslation = true
		}

		if !wroteTranslation && len(localeSet) == 0 {
			rows = append(rows, smartlingGlossaryCSVRow(accountUID, glossaryUID, entry, nil))
		}
	}
	return rows
}

func smartlingGlossaryCSVRow(accountUID, glossaryUID string, entry smartlingGlossaryEntry, translation *smartlingGlossaryTranslation) []string {
	row := []string{
		accountUID,
		glossaryUID,
		entry.EntryUID,
		entry.Term,
		entry.Definition,
		entry.PartOfSpeech,
		strings.Join(entry.LabelUIDs, ","),
		"",
		"",
		"",
		"",
	}
	if translation != nil {
		row[7] = translation.LocaleID
		row[8] = translation.Term
		row[9] = translation.Notes
		row[10] = translation.Definition
	}
	return row
}
