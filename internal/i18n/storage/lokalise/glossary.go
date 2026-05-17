package lokalise

import (
	"cmp"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
)

const glossaryCSVPageLimit = 500

// Stable review/import schema for downloaded Lokalise glossary rows.
// One source term can produce multiple rows when it has translations in multiple locales.
var glossaryCSVHeader = []string{
	"project_id",
	"term_id",
	"source_term",
	"description",
	"translatable",
	"forbidden",
	"case_sensitive",
	"tags",
	"translation_locale",
	"translated_term",
	"translation_id",
	"translation_language_id",
	"translation_description",
	"term_created_at",
	"term_updated_at",
}

// GlossaryDownloadInput identifies the Lokalise project glossary to export.
type GlossaryDownloadInput struct {
	ProjectID string
	APIToken  string
	Locales   []string
}

// GlossaryDownloadResult summarizes a Lokalise glossary CSV export.
type GlossaryDownloadResult struct {
	Terms int
	Rows  int
}

type glossaryTerm struct {
	ID            int64                     `json:"id"`
	Term          string                    `json:"term"`
	Description   string                    `json:"description"`
	Translatable  bool                      `json:"translatable"`
	Forbidden     bool                      `json:"forbidden"`
	CaseSensitive bool                      `json:"caseSensitive"`
	Tags          []string                  `json:"tags"`
	Translations  []glossaryTermTranslation `json:"translations"`
	CreatedAt     string                    `json:"createdAt"`
	UpdatedAt     string                    `json:"updatedAt"`
}

type glossaryTermTranslation struct {
	ID               int64  `json:"id"`
	LanguageID       int64  `json:"langId"`
	LanguageIDSnake  int64  `json:"lang_id"`
	LanguageISO      string `json:"languageIso"`
	LanguageISOSnake string `json:"language_iso"`
	LangISO          string `json:"lang_iso"`
	Translation      string `json:"translation"`
	Description      string `json:"description"`
}

type glossaryTermsResponse struct {
	Items           []glossaryTerm `json:"items"`
	Data            []glossaryTerm `json:"data"`
	NextCursor      string         `json:"nextCursor"`
	NextCursorSnake string         `json:"next_cursor"`
	Meta            struct {
		NextCursor      string `json:"nextCursor"`
		NextCursorSnake string `json:"next_cursor"`
	} `json:"meta"`
}

type projectLanguagesResponse struct {
	Languages []struct {
		LanguageID  int64  `json:"lang_id"`
		LanguageISO string `json:"lang_iso"`
	} `json:"languages"`
}

// WriteGlossaryCSV is the storage-level flow used by the CLI:
// validate inputs, download all glossary pages, enrich translation language IDs,
// convert the terms into deterministic CSV rows, then stream them to the writer.
func (c *HTTPClient) WriteGlossaryCSV(ctx context.Context, in GlossaryDownloadInput, w io.Writer) (GlossaryDownloadResult, error) {
	if c == nil || c.httpClient == nil {
		return GlossaryDownloadResult{}, fmt.Errorf("lokalise glossary download: client is nil")
	}
	projectID := strings.TrimSpace(in.ProjectID)
	if projectID == "" {
		return GlossaryDownloadResult{}, fmt.Errorf("lokalise glossary download: project id is required")
	}
	apiToken := strings.TrimSpace(in.APIToken)
	if apiToken == "" {
		return GlossaryDownloadResult{}, fmt.Errorf("lokalise glossary download: api token is required")
	}
	if w == nil {
		return GlossaryDownloadResult{}, fmt.Errorf("lokalise glossary download: writer is nil")
	}

	terms, err := c.listGlossaryTerms(ctx, projectID, apiToken)
	if err != nil {
		return GlossaryDownloadResult{}, err
	}
	languageByID := map[int64]string{}
	if glossaryTermsHaveTranslations(terms) {
		languageByID, err = c.listProjectLanguageISOs(ctx, projectID, apiToken)
		if err != nil {
			return GlossaryDownloadResult{}, err
		}
	}
	rows := glossaryCSVRows(projectID, terms, languageByID, in.Locales)

	writer := csv.NewWriter(w)
	if err := writer.Write(glossaryCSVHeader); err != nil {
		return GlossaryDownloadResult{}, fmt.Errorf("write lokalise glossary csv header: %w", err)
	}
	for _, row := range rows {
		if err := writer.Write(row); err != nil {
			return GlossaryDownloadResult{}, fmt.Errorf("write lokalise glossary csv row: %w", err)
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return GlossaryDownloadResult{}, fmt.Errorf("flush lokalise glossary csv: %w", err)
	}
	return GlossaryDownloadResult{Terms: len(terms), Rows: len(rows)}, nil
}

func (c *HTTPClient) listGlossaryTerms(ctx context.Context, projectID, apiToken string) ([]glossaryTerm, error) {
	// Lokalise glossaries are project-scoped. The API returns terms page by page,
	// so this loop follows the cursor until Lokalise stops returning one.
	terms := make([]glossaryTerm, 0)
	cursor := ""
	for {
		endpoint, err := url.Parse(c.baseURL + "/projects/" + url.PathEscape(projectID) + "/glossary-terms")
		if err != nil {
			return nil, fmt.Errorf("build glossary terms URL: %w", err)
		}
		q := endpoint.Query()
		q.Set("limit", fmt.Sprintf("%d", glossaryCSVPageLimit))
		if cursor != "" {
			q.Set("cursor", cursor)
		}
		endpoint.RawQuery = q.Encode()

		var page glossaryTermsResponse
		nextCursor, err := c.doLokaliseJSON(ctx, http.MethodGet, endpoint.String(), apiToken, &page)
		if err != nil {
			return nil, fmt.Errorf("list lokalise glossary terms: %w", err)
		}
		pageItems := page.Items
		if len(pageItems) == 0 && len(page.Data) > 0 {
			pageItems = page.Data
		}
		terms = append(terms, pageItems...)

		if nextCursor == "" {
			nextCursor = firstNonEmpty(page.NextCursor, page.NextCursorSnake, page.Meta.NextCursor, page.Meta.NextCursorSnake)
		}
		if nextCursor == "" {
			break
		}
		cursor = nextCursor
	}
	return terms, nil
}

func (c *HTTPClient) listProjectLanguageISOs(ctx context.Context, projectID, apiToken string) (map[int64]string, error) {
	// Some glossary translation payloads only contain lang_id. This lookup turns
	// those IDs into stable locale strings for the CSV's translation_locale column.
	endpoint, err := url.Parse(c.baseURL + "/projects/" + url.PathEscape(projectID) + "/languages")
	if err != nil {
		return nil, fmt.Errorf("build project languages URL: %w", err)
	}
	q := endpoint.Query()
	q.Set("limit", fmt.Sprintf("%d", glossaryCSVPageLimit))
	endpoint.RawQuery = q.Encode()

	var resp projectLanguagesResponse
	if _, err := c.doLokaliseJSON(ctx, http.MethodGet, endpoint.String(), apiToken, &resp); err != nil {
		return nil, fmt.Errorf("list lokalise project languages: %w", err)
	}
	out := make(map[int64]string, len(resp.Languages))
	for _, lang := range resp.Languages {
		if lang.LanguageID > 0 && strings.TrimSpace(lang.LanguageISO) != "" {
			out[lang.LanguageID] = strings.TrimSpace(lang.LanguageISO)
		}
	}
	return out, nil
}

func (c *HTTPClient) doLokaliseJSON(ctx context.Context, method, endpoint, apiToken string, out any) (string, error) {
	// The official SDK is still used for existing key sync flows. Glossary export
	// uses raw HTTP here because this endpoint is not covered by the SDK shape used in this repo.
	req, err := http.NewRequestWithContext(ctx, method, endpoint, nil)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("X-Api-Token", apiToken)
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("send request: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}
	return strings.TrimSpace(resp.Header.Get("X-Pagination-Next-Cursor")), nil
}

func glossaryTermsHaveTranslations(terms []glossaryTerm) bool {
	for _, term := range terms {
		if len(term.Translations) > 0 {
			return true
		}
	}
	return false
}

func glossaryCSVRows(projectID string, terms []glossaryTerm, languageByID map[int64]string, locales []string) [][]string {
	// CSV output must be deterministic for review/import workflows: normalize the
	// optional locale filter, sort terms by source text, then sort translations by locale.
	localeSet := make(map[string]struct{}, len(locales))
	for _, value := range locales {
		for _, part := range strings.Split(value, ",") {
			if locale := strings.TrimSpace(part); locale != "" {
				localeSet[locale] = struct{}{}
			}
		}
	}

	sortedTerms := slices.Clone(terms)
	slices.SortStableFunc(sortedTerms, func(left, right glossaryTerm) int {
		if left.Term != right.Term {
			return cmp.Compare(left.Term, right.Term)
		}
		return cmp.Compare(left.ID, right.ID)
	})

	rows := make([][]string, 0, len(sortedTerms))
	for _, term := range sortedTerms {
		translations := slices.Clone(term.Translations)
		slices.SortStableFunc(translations, func(left, right glossaryTermTranslation) int {
			leftLocale := glossaryTranslationLocale(left, languageByID)
			rightLocale := glossaryTranslationLocale(right, languageByID)
			if leftLocale != rightLocale {
				return cmp.Compare(leftLocale, rightLocale)
			}
			return cmp.Compare(left.ID, right.ID)
		})
		wroteTranslation := false
		for _, translation := range translations {
			locale := glossaryTranslationLocale(translation, languageByID)
			if len(localeSet) > 0 {
				if _, ok := localeSet[locale]; !ok {
					if _, ok := localeSet[fmt.Sprintf("%d", glossaryTranslationLanguageID(translation))]; !ok {
						continue
					}
				}
			}
			rows = append(rows, glossaryCSVRow(projectID, term, &translation, locale))
			wroteTranslation = true
		}
		if !wroteTranslation && len(localeSet) == 0 {
			rows = append(rows, glossaryCSVRow(projectID, term, nil, ""))
		}
	}
	return rows
}

func glossaryCSVRow(projectID string, term glossaryTerm, translation *glossaryTermTranslation, locale string) []string {
	row := []string{
		projectID,
		fmt.Sprintf("%d", term.ID),
		term.Term,
		term.Description,
		fmt.Sprintf("%t", term.Translatable),
		fmt.Sprintf("%t", term.Forbidden),
		fmt.Sprintf("%t", term.CaseSensitive),
		strings.Join(term.Tags, ";"),
		"",
		"",
		"",
		"",
		"",
		term.CreatedAt,
		term.UpdatedAt,
	}
	if translation != nil {
		row[8] = locale
		row[9] = translation.Translation
		row[10] = fmt.Sprintf("%d", translation.ID)
		row[11] = fmt.Sprintf("%d", glossaryTranslationLanguageID(*translation))
		row[12] = translation.Description
	}
	return row
}

func glossaryTranslationLanguageID(translation glossaryTermTranslation) int64 {
	if translation.LanguageID > 0 {
		return translation.LanguageID
	}
	return translation.LanguageIDSnake
}

func glossaryTranslationLocale(translation glossaryTermTranslation, languageByID map[int64]string) string {
	if locale := firstNonEmpty(translation.LanguageISO, translation.LanguageISOSnake, translation.LangISO); locale != "" {
		return locale
	}
	return languageByID[glossaryTranslationLanguageID(translation)]
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
