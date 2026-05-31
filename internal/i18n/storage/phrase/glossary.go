package phrase

import (
	"cmp"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/csvsafe"
)

var glossaryCSVHeader = []string{
	"account_id",
	"glossary_id",
	"term_id",
	"source_term",
	"description",
	"translatable",
	"case_sensitive",
	"translation_locale",
	"translated_term",
	"translation_id",
	"translation_created_at",
	"translation_updated_at",
	"term_created_at",
	"term_updated_at",
}

// GlossaryDownloadInput identifies the Phrase term base to export.
type GlossaryDownloadInput struct {
	AccountID  string
	GlossaryID string
	APIToken   string
	Locales    []string
}

// GlossaryDownloadResult summarizes a Phrase glossary CSV export.
type GlossaryDownloadResult struct {
	Terms int
	Rows  int
}

type glossaryTerm struct {
	ID            string                    `json:"id"`
	Term          string                    `json:"term"`
	Description   string                    `json:"description"`
	Translatable  bool                      `json:"translatable"`
	CaseSensitive bool                      `json:"case_sensitive"`
	Translations  []glossaryTermTranslation `json:"translations"`
	CreatedAt     string                    `json:"created_at"`
	UpdatedAt     string                    `json:"updated_at"`
}

type glossaryTermTranslation struct {
	ID         string `json:"id"`
	LocaleCode string `json:"locale_code"`
	Content    string `json:"content"`
	CreatedAt  string `json:"created_at"`
	UpdatedAt  string `json:"updated_at"`
}

// WriteGlossaryCSV downloads Phrase glossary terms and writes them as stable CSV.
func (c *HTTPClient) WriteGlossaryCSV(ctx context.Context, in GlossaryDownloadInput, w io.Writer) (GlossaryDownloadResult, error) {
	if strings.TrimSpace(in.AccountID) == "" {
		return GlossaryDownloadResult{}, fmt.Errorf("phrase glossary download: account id is required")
	}
	if strings.TrimSpace(in.GlossaryID) == "" {
		return GlossaryDownloadResult{}, fmt.Errorf("phrase glossary download: glossary id is required")
	}
	if strings.TrimSpace(in.APIToken) == "" {
		return GlossaryDownloadResult{}, fmt.Errorf("phrase glossary download: api token is required")
	}
	if w == nil {
		return GlossaryDownloadResult{}, fmt.Errorf("phrase glossary download: writer is nil")
	}

	terms, err := c.listGlossaryTerms(ctx, strings.TrimSpace(in.AccountID), strings.TrimSpace(in.GlossaryID), strings.TrimSpace(in.APIToken))
	if err != nil {
		return GlossaryDownloadResult{}, err
	}
	rows := phraseGlossaryCSVRows(strings.TrimSpace(in.AccountID), strings.TrimSpace(in.GlossaryID), terms, in.Locales)

	writer := csv.NewWriter(w)
	if err := writer.Write(glossaryCSVHeader); err != nil {
		return GlossaryDownloadResult{}, fmt.Errorf("write phrase glossary csv header: %w", err)
	}
	for _, row := range rows {
		if err := writer.Write(csvsafe.EscapeRow(row)); err != nil {
			return GlossaryDownloadResult{}, fmt.Errorf("write phrase glossary csv row: %w", err)
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return GlossaryDownloadResult{}, fmt.Errorf("flush phrase glossary csv: %w", err)
	}
	return GlossaryDownloadResult{Terms: len(terms), Rows: len(rows)}, nil
}

func (c *HTTPClient) listGlossaryTerms(ctx context.Context, accountID, glossaryID, token string) ([]glossaryTerm, error) {
	terms := make([]glossaryTerm, 0)
	page := 1
	for {
		var pageItems []glossaryTerm
		path := fmt.Sprintf("/accounts/%s/glossaries/%s/terms?page=%d&per_page=%d", url.PathEscape(accountID), url.PathEscape(glossaryID), page, defaultPageSize)
		if err := c.doJSON(ctx, http.MethodGet, path, token, nil, &pageItems); err != nil {
			return nil, fmt.Errorf("list phrase glossary terms: %w", err)
		}
		terms = append(terms, pageItems...)
		if len(pageItems) < defaultPageSize {
			break
		}
		page++
	}
	return terms, nil
}

func phraseGlossaryCSVRows(accountID, glossaryID string, terms []glossaryTerm, locales []string) [][]string {
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
			if left.LocaleCode != right.LocaleCode {
				return cmp.Compare(left.LocaleCode, right.LocaleCode)
			}
			return cmp.Compare(left.ID, right.ID)
		})
		wroteTranslation := false
		for _, translation := range translations {
			if len(localeSet) > 0 {
				if _, ok := localeSet[translation.LocaleCode]; !ok {
					continue
				}
			}
			rows = append(rows, phraseGlossaryCSVRow(accountID, glossaryID, term, &translation))
			wroteTranslation = true
		}
		if !wroteTranslation && len(localeSet) == 0 {
			rows = append(rows, phraseGlossaryCSVRow(accountID, glossaryID, term, nil))
		}
	}
	return rows
}

func phraseGlossaryCSVRow(accountID, glossaryID string, term glossaryTerm, translation *glossaryTermTranslation) []string {
	row := []string{
		accountID,
		glossaryID,
		term.ID,
		term.Term,
		term.Description,
		fmt.Sprintf("%t", term.Translatable),
		fmt.Sprintf("%t", term.CaseSensitive),
		"",
		"",
		"",
		"",
		"",
		term.CreatedAt,
		term.UpdatedAt,
	}
	if translation != nil {
		row[7] = translation.LocaleCode
		row[8] = translation.Content
		row[9] = translation.ID
		row[10] = translation.CreatedAt
		row[11] = translation.UpdatedAt
	}
	return row
}
