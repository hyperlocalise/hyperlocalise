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
	"strconv"
	"strings"
)

const (
	glossaryCSVPageLimit      = 500
	glossaryLanguagePageLimit = 5000
	lokaliseMaxGlossaryPages  = 10000
	lokaliseMaxLanguagePages  = 10000
	lokaliseMaxJSONBodyBytes  = 10 * 1024 * 1024
)

// Base columns for Lokalise's documented glossary CSV template.
// Translation columns are added after these as <locale> and <locale>_description.
var glossaryCSVBaseHeader = []string{
	"term",
	"description",
	"casesensitive",
	"translatable",
	"Forbidden",
	"tags",
}

// GlossaryDownloadInput identifies the Lokalise project glossary to export.
type GlossaryDownloadInput struct {
	ProjectID string
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

type projectLanguage struct {
	LanguageID  int64  `json:"lang_id"`
	LanguageISO string `json:"lang_iso"`
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
	Languages []projectLanguage `json:"languages"`
	Items     []projectLanguage `json:"items"`
	Data      []projectLanguage `json:"data"`
}

// WriteGlossaryCSV is the storage-level flow used by the CLI:
// validate inputs, download all glossary pages, enrich translation language IDs,
// convert the terms into Lokalise-compatible semicolon CSV, then stream it to the writer.
func (c *HTTPClient) WriteGlossaryCSV(ctx context.Context, in GlossaryDownloadInput, w io.Writer) (GlossaryDownloadResult, error) {
	if c == nil || c.httpClient == nil {
		return GlossaryDownloadResult{}, fmt.Errorf("lokalise glossary download: client is nil")
	}
	projectID := strings.TrimSpace(in.ProjectID)
	if projectID == "" {
		return GlossaryDownloadResult{}, fmt.Errorf("lokalise glossary download: project id is required")
	}
	if strings.TrimSpace(c.apiToken) == "" {
		return GlossaryDownloadResult{}, fmt.Errorf("lokalise glossary download: api token is required")
	}
	if w == nil {
		return GlossaryDownloadResult{}, fmt.Errorf("lokalise glossary download: writer is nil")
	}

	terms, err := c.listGlossaryTerms(ctx, projectID)
	if err != nil {
		return GlossaryDownloadResult{}, err
	}
	languageByID := map[int64]string{}
	if glossaryTermsHaveTranslations(terms) {
		languageByID, err = c.listProjectLanguageISOs(ctx, projectID)
		if err != nil {
			return GlossaryDownloadResult{}, err
		}
	}
	locales := glossaryCSVLocales(terms, languageByID, in.Locales)
	rows := glossaryCSVRows(terms, languageByID, locales)

	writer := csv.NewWriter(w)
	writer.Comma = ';'
	if err := writer.Write(glossaryCSVHeader(locales)); err != nil {
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

func (c *HTTPClient) listGlossaryTerms(ctx context.Context, projectID string) ([]glossaryTerm, error) {
	// Lokalise glossaries are project-scoped. The API returns terms page by page,
	// so this loop follows the cursor until Lokalise stops returning one.
	terms := make([]glossaryTerm, 0)
	cursor := ""
	seenCursors := map[string]struct{}{}
	for pageNum := 0; ; pageNum++ {
		if pageNum >= lokaliseMaxGlossaryPages {
			return nil, fmt.Errorf("lokalise glossary terms pagination exceeded %d pages", lokaliseMaxGlossaryPages)
		}
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
		nextCursor, err := c.doLokaliseJSON(ctx, http.MethodGet, endpoint.String(), &page)
		if err != nil {
			return nil, fmt.Errorf("list lokalise glossary terms: %w", err)
		}
		pageItems := page.Items
		if len(pageItems) == 0 && len(page.Data) > 0 {
			pageItems = page.Data
		}
		if len(pageItems) == 0 {
			break
		}
		terms = append(terms, pageItems...)

		if nextCursor == "" {
			nextCursor = firstNonEmpty(page.NextCursor, page.NextCursorSnake, page.Meta.NextCursor, page.Meta.NextCursorSnake)
		}
		if nextCursor == "" {
			break
		}
		if _, ok := seenCursors[nextCursor]; ok {
			return nil, fmt.Errorf("lokalise glossary terms pagination repeated cursor %q", nextCursor)
		}
		seenCursors[nextCursor] = struct{}{}
		cursor = nextCursor
	}
	return terms, nil
}

func (c *HTTPClient) listProjectLanguageISOs(ctx context.Context, projectID string) (map[int64]string, error) {
	// Some glossary translation payloads only contain lang_id. This lookup turns
	// those IDs into stable locale strings for Lokalise's language columns.
	out := map[int64]string{}
	page := 1
	for {
		if page > lokaliseMaxLanguagePages {
			return nil, fmt.Errorf("lokalise project languages pagination exceeded %d pages", lokaliseMaxLanguagePages)
		}
		endpoint, err := url.Parse(c.baseURL + "/projects/" + url.PathEscape(projectID) + "/languages")
		if err != nil {
			return nil, fmt.Errorf("build project languages URL: %w", err)
		}
		q := endpoint.Query()
		q.Set("limit", fmt.Sprintf("%d", glossaryLanguagePageLimit))
		q.Set("page", fmt.Sprintf("%d", page))
		endpoint.RawQuery = q.Encode()

		var resp projectLanguagesResponse
		if _, err := c.doLokaliseJSON(ctx, http.MethodGet, endpoint.String(), &resp); err != nil {
			return nil, fmt.Errorf("list lokalise project languages: %w", err)
		}
		languages := resp.Languages
		if len(languages) == 0 && len(resp.Items) > 0 {
			languages = resp.Items
		}
		if len(languages) == 0 && len(resp.Data) > 0 {
			languages = resp.Data
		}
		before := len(out)
		for _, lang := range languages {
			if lang.LanguageID > 0 && strings.TrimSpace(lang.LanguageISO) != "" {
				out[lang.LanguageID] = strings.TrimSpace(lang.LanguageISO)
			}
		}
		if len(languages) == 0 || len(languages) < glossaryLanguagePageLimit || len(out) == before {
			break
		}
		page++
	}
	return out, nil
}

func (c *HTTPClient) doLokaliseJSON(ctx context.Context, method, endpoint string, out any) (string, error) {
	// The official SDK is still used for existing key sync flows. Glossary export
	// uses raw HTTP here because this endpoint is not covered by the SDK shape used in this repo.
	req, err := http.NewRequestWithContext(ctx, method, endpoint, nil)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("X-Api-Token", c.apiToken)
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
	if err := json.NewDecoder(io.LimitReader(resp.Body, lokaliseMaxJSONBodyBytes)).Decode(out); err != nil {
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

func glossaryCSVHeader(locales []string) []string {
	header := slices.Clone(glossaryCSVBaseHeader)
	header = append(header, locales...)
	for _, locale := range locales {
		header = append(header, locale+"_description")
	}
	return header
}

func glossaryCSVLocales(terms []glossaryTerm, languageByID map[int64]string, requested []string) []string {
	requestedLocales := splitGlossaryLocales(requested)
	if len(requestedLocales) > 0 {
		return normalizeGlossaryLocales(requestedLocales, languageByID)
	}

	localeSet := map[string]struct{}{}
	for _, term := range terms {
		for _, translation := range term.Translations {
			if locale := glossaryTranslationLocale(translation, languageByID); locale != "" {
				localeSet[locale] = struct{}{}
			}
		}
	}
	locales := make([]string, 0, len(localeSet))
	for locale := range localeSet {
		locales = append(locales, locale)
	}
	slices.Sort(locales)
	return locales
}

func splitGlossaryLocales(values []string) []string {
	locales := make([]string, 0, len(values))
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			if locale := strings.TrimSpace(part); locale != "" {
				locales = append(locales, locale)
			}
		}
	}
	return locales
}

func normalizeGlossaryLocales(values []string, languageByID map[int64]string) []string {
	locales := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		locale := value
		if langID, err := strconv.ParseInt(value, 10, 64); err == nil {
			if mapped := strings.TrimSpace(languageByID[langID]); mapped != "" {
				locale = mapped
			}
		}
		if _, ok := seen[locale]; ok {
			continue
		}
		seen[locale] = struct{}{}
		locales = append(locales, locale)
	}
	return locales
}

func glossaryCSVRows(terms []glossaryTerm, languageByID map[int64]string, locales []string) [][]string {
	// CSV output must be deterministic for review/import workflows: one row per
	// term, sorted by source text, with stable language and description columns.
	sortedTerms := slices.Clone(terms)
	slices.SortStableFunc(sortedTerms, func(left, right glossaryTerm) int {
		if left.Term != right.Term {
			return cmp.Compare(left.Term, right.Term)
		}
		return cmp.Compare(left.ID, right.ID)
	})

	rows := make([][]string, 0, len(sortedTerms))
	for _, term := range sortedTerms {
		rows = append(rows, glossaryCSVRow(term, languageByID, locales))
	}
	return rows
}

func glossaryCSVRow(term glossaryTerm, languageByID map[int64]string, locales []string) []string {
	row := []string{
		term.Term,
		term.Description,
		lokaliseCSVBool(term.CaseSensitive),
		lokaliseCSVBool(term.Translatable),
		lokaliseCSVBool(term.Forbidden),
		strings.Join(term.Tags, ","),
	}

	translationByLocale := glossaryTranslationsByLocale(term.Translations, languageByID)
	for _, locale := range locales {
		row = append(row, translationByLocale[locale].Translation)
	}
	for _, locale := range locales {
		row = append(row, translationByLocale[locale].Description)
	}
	return row
}

func glossaryTranslationsByLocale(translations []glossaryTermTranslation, languageByID map[int64]string) map[string]glossaryTermTranslation {
	sortedTranslations := slices.Clone(translations)
	slices.SortStableFunc(sortedTranslations, func(left, right glossaryTermTranslation) int {
		leftLocale := glossaryTranslationLocale(left, languageByID)
		rightLocale := glossaryTranslationLocale(right, languageByID)
		if leftLocale != rightLocale {
			return cmp.Compare(leftLocale, rightLocale)
		}
		return cmp.Compare(left.ID, right.ID)
	})

	out := map[string]glossaryTermTranslation{}
	for _, translation := range sortedTranslations {
		locale := glossaryTranslationLocale(translation, languageByID)
		if locale == "" {
			continue
		}
		if _, exists := out[locale]; !exists {
			out[locale] = translation
		}
	}
	return out
}

func lokaliseCSVBool(value bool) string {
	if value {
		return "yes"
	}
	return "no"
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
