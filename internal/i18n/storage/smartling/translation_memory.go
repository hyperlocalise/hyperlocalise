package smartling

import (
	"cmp"
	"context"
	"encoding/csv"
	"encoding/xml"
	"fmt"
	"io"
	"net/url"
	"slices"
	"strings"
)

// TranslationMemoryDownloadRequest identifies the Smartling translation memory to export.
type TranslationMemoryDownloadRequest struct {
	AccountUID           string
	TranslationMemoryUID string
	SourceLanguage       string
	TargetLanguages      []string
}

// TranslationMemoryDownloadResult summarizes a Smartling translation memory export.
type TranslationMemoryDownloadResult struct {
	Rows     int
	Segments int
}

type smartlingTMEntry struct {
	EntryUID       string                   `json:"entryUid"`
	SourceText     string                   `json:"sourceText"`
	SourceLocaleID string                   `json:"sourceLocaleId"`
	Translations   []smartlingTMTranslation `json:"translations"`
}

type smartlingTMTranslation struct {
	TargetLocaleID  string `json:"targetLocaleId"`
	TranslationText string `json:"translationText"`
}

func (c *HTTPClient) listTranslationMemoryEntries(ctx context.Context, token string, req TranslationMemoryDownloadRequest) ([]smartlingTMEntry, error) {
	var entries []smartlingTMEntry
	offset := 0
	limit := 500

	for {
		endpoint := fmt.Sprintf("%s/accounts/%s/translation-memories/%s/entries", c.tmBaseURL, url.PathEscape(req.AccountUID), url.PathEscape(req.TranslationMemoryUID))
		params := url.Values{}
		params.Set("sourceLocaleId", req.SourceLanguage)
		if len(req.TargetLanguages) > 0 {
			params.Set("targetLocaleIds", strings.Join(req.TargetLanguages, ","))
		}
		params.Set("limit", fmt.Sprintf("%d", limit))
		params.Set("offset", fmt.Sprintf("%d", offset))
		fullURL := endpoint + "?" + params.Encode()

		var resp struct {
			Response struct {
				Code string `json:"code"`
			} `json:"response"`
			Data struct {
				Items []smartlingTMEntry `json:"items"`
			} `json:"data"`
		}

		if err := c.getJSON(ctx, fullURL, token, &resp); err != nil {
			return nil, fmt.Errorf("list translation memory entries: %w", err)
		}

		entries = append(entries, resp.Data.Items...)
		if len(resp.Data.Items) < limit {
			break
		}
		offset += limit
	}
	return entries, nil
}

var smartlingTMCSVHeader = []string{
	"tm_uid",
	"entry_uid",
	"source_locale",
	"target_locale",
	"source_text",
	"target_text",
}

// WriteTranslationMemoryCSV downloads Smartling translation memory entries and writes them as stable CSV.
func (c *HTTPClient) WriteTranslationMemoryCSV(ctx context.Context, req TranslationMemoryDownloadRequest, w io.Writer) (TranslationMemoryDownloadResult, error) {
	if strings.TrimSpace(req.AccountUID) == "" {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("smartling tm download: account uid is required")
	}
	if strings.TrimSpace(req.TranslationMemoryUID) == "" {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("smartling tm download: tm uid is required")
	}
	if strings.TrimSpace(req.SourceLanguage) == "" {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("smartling tm download: source language is required")
	}
	if w == nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("smartling tm download: writer is nil")
	}

	token, err := c.accessToken(ctx)
	if err != nil {
		return TranslationMemoryDownloadResult{}, err
	}

	entries, err := c.listTranslationMemoryEntries(ctx, token, req)
	if err != nil {
		return TranslationMemoryDownloadResult{}, err
	}

	rows := smartlingTMCSVRows(req.TranslationMemoryUID, entries)

	writer := csv.NewWriter(w)
	if err := writer.Write(smartlingTMCSVHeader); err != nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("write smartling tm csv header: %w", err)
	}
	for _, row := range rows {
		if err := writer.Write(row); err != nil {
			return TranslationMemoryDownloadResult{}, fmt.Errorf("write smartling tm csv row: %w", err)
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("flush smartling tm csv: %w", err)
	}

	return TranslationMemoryDownloadResult{Rows: len(rows), Segments: len(entries)}, nil
}

func smartlingTMCSVRows(tmUID string, entries []smartlingTMEntry) [][]string {
	sortedEntries := slices.Clone(entries)
	slices.SortStableFunc(sortedEntries, func(left, right smartlingTMEntry) int {
		return cmp.Compare(left.EntryUID, right.EntryUID)
	})

	var rows [][]string
	for _, entry := range sortedEntries {
		translations := slices.Clone(entry.Translations)
		slices.SortStableFunc(translations, func(left, right smartlingTMTranslation) int {
			return cmp.Compare(left.TargetLocaleID, right.TargetLocaleID)
		})

		for _, translation := range translations {
			rows = append(rows, []string{
				tmUID,
				entry.EntryUID,
				entry.SourceLocaleID,
				translation.TargetLocaleID,
				entry.SourceText,
				translation.TranslationText,
			})
		}
	}
	return rows
}

// WriteTranslationMemoryTMX downloads Smartling translation memory entries and writes them as TMX.
func (c *HTTPClient) WriteTranslationMemoryTMX(ctx context.Context, req TranslationMemoryDownloadRequest, w io.Writer) (TranslationMemoryDownloadResult, error) {
	if strings.TrimSpace(req.AccountUID) == "" {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("smartling tm download: account uid is required")
	}
	if strings.TrimSpace(req.TranslationMemoryUID) == "" {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("smartling tm download: tm uid is required")
	}
	if strings.TrimSpace(req.SourceLanguage) == "" {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("smartling tm download: source language is required")
	}
	if w == nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("smartling tm download: writer is nil")
	}

	token, err := c.accessToken(ctx)
	if err != nil {
		return TranslationMemoryDownloadResult{}, err
	}

	entries, err := c.listTranslationMemoryEntries(ctx, token, req)
	if err != nil {
		return TranslationMemoryDownloadResult{}, err
	}

	if _, err := io.WriteString(w, xml.Header); err != nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("write smartling tm tmx header: %w", err)
	}

	encoder := xml.NewEncoder(w)
	encoder.Indent("", "  ")

	tmxStart := xml.StartElement{Name: xml.Name{Local: "tmx"}, Attr: []xml.Attr{{Name: xml.Name{Local: "version"}, Value: "1.4"}}}
	if err := encoder.EncodeToken(tmxStart); err != nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("write smartling tm tmx: %w", err)
	}

	headerStart := xml.StartElement{Name: xml.Name{Local: "header"}, Attr: []xml.Attr{
		{Name: xml.Name{Local: "creationtool"}, Value: "hyperlocalise"},
		{Name: xml.Name{Local: "creationtoolversion"}, Value: "1"},
		{Name: xml.Name{Local: "segtype"}, Value: "sentence"},
		{Name: xml.Name{Local: "adminlang"}, Value: "en"},
		{Name: xml.Name{Local: "srclang"}, Value: req.SourceLanguage},
		{Name: xml.Name{Local: "datatype"}, Value: "PlainText"},
	}}
	if err := encoder.EncodeToken(headerStart); err != nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("write smartling tm tmx header: %w", err)
	}
	if err := encoder.EncodeToken(headerStart.End()); err != nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("write smartling tm tmx header: %w", err)
	}

	bodyStart := xml.StartElement{Name: xml.Name{Local: "body"}}
	if err := encoder.EncodeToken(bodyStart); err != nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("write smartling tm tmx body: %w", err)
	}

	rowCount := 0
	for _, entry := range entries {
		tuStart := xml.StartElement{Name: xml.Name{Local: "tu"}, Attr: []xml.Attr{{Name: xml.Name{Local: "tuid"}, Value: entry.EntryUID}}}
		if err := encoder.EncodeToken(tuStart); err != nil {
			return TranslationMemoryDownloadResult{}, fmt.Errorf("write smartling tm tmx unit: %w", err)
		}

		// Source
		tuvSourceStart := xml.StartElement{Name: xml.Name{Local: "tuv"}, Attr: []xml.Attr{{Name: xml.Name{Local: "xml:lang"}, Value: entry.SourceLocaleID}}}
		if err := encoder.EncodeToken(tuvSourceStart); err != nil {
			return TranslationMemoryDownloadResult{}, fmt.Errorf("write smartling tm tmx variant: %w", err)
		}
		segStart := xml.StartElement{Name: xml.Name{Local: "seg"}}
		if err := encoder.EncodeElement(entry.SourceText, segStart); err != nil {
			return TranslationMemoryDownloadResult{}, fmt.Errorf("write smartling tm tmx segment: %w", err)
		}
		if err := encoder.EncodeToken(tuvSourceStart.End()); err != nil {
			return TranslationMemoryDownloadResult{}, fmt.Errorf("write smartling tm tmx variant: %w", err)
		}
		rowCount++

		// Targets
		for _, tr := range entry.Translations {
			tuvTargetStart := xml.StartElement{Name: xml.Name{Local: "tuv"}, Attr: []xml.Attr{{Name: xml.Name{Local: "xml:lang"}, Value: tr.TargetLocaleID}}}
			if err := encoder.EncodeToken(tuvTargetStart); err != nil {
				return TranslationMemoryDownloadResult{}, fmt.Errorf("write smartling tm tmx variant: %w", err)
			}
			if err := encoder.EncodeElement(tr.TranslationText, segStart); err != nil {
				return TranslationMemoryDownloadResult{}, fmt.Errorf("write smartling tm tmx segment: %w", err)
			}
			if err := encoder.EncodeToken(tuvTargetStart.End()); err != nil {
				return TranslationMemoryDownloadResult{}, fmt.Errorf("write smartling tm tmx variant: %w", err)
			}
			rowCount++
		}

		if err := encoder.EncodeToken(tuStart.End()); err != nil {
			return TranslationMemoryDownloadResult{}, fmt.Errorf("write smartling tm tmx unit: %w", err)
		}
	}

	if err := encoder.EncodeToken(bodyStart.End()); err != nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("write smartling tm tmx body: %w", err)
	}
	if err := encoder.EncodeToken(tmxStart.End()); err != nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("write smartling tm tmx: %w", err)
	}
	if err := encoder.Flush(); err != nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("flush smartling tm tmx: %w", err)
	}

	return TranslationMemoryDownloadResult{Rows: rowCount, Segments: len(entries)}, nil
}
