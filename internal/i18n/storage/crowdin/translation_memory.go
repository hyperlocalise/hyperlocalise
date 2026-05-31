package crowdin

import (
	"cmp"
	"context"
	"encoding/csv"
	"encoding/xml"
	"fmt"
	"io"
	"slices"
	"strconv"
	"strings"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
	"github.com/hyperlocalise/hyperlocalise/internal/csvsafe"
)

const translationMemoryCSVPageLimit = 500

func translationMemoryCSVHeader() []string {
	return []string{
		"tm_id",
		"segment_id",
		"source_locale",
		"target_locale",
		"source_text",
		"target_text",
		"source_record_id",
		"target_record_id",
		"source_usage_count",
		"target_usage_count",
		"source_created_at",
		"target_created_at",
		"source_updated_at",
		"target_updated_at",
		"source_created_by",
		"target_created_by",
		"source_updated_by",
		"target_updated_by",
	}
}

// TranslationMemoryDownloadRequest identifies the Crowdin translation memory records to export.
type TranslationMemoryDownloadRequest struct {
	TranslationMemoryID int
	SourceLanguage      string
	TargetLanguages     []string
}

// TranslationMemoryDownloadResult summarizes a translation memory CSV export.
type TranslationMemoryDownloadResult struct {
	Rows     int
	Segments int
}

// WriteTranslationMemoryCSV downloads translation memory segments and writes source/target pairs as stable CSV.
func (c *HTTPClient) WriteTranslationMemoryCSV(ctx context.Context, req TranslationMemoryDownloadRequest, w io.Writer) (TranslationMemoryDownloadResult, error) {
	if c == nil || c.client == nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("crowdin translation memory download: client is nil")
	}
	if req.TranslationMemoryID <= 0 {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("crowdin translation memory download: translation memory id must be positive")
	}
	if strings.TrimSpace(req.SourceLanguage) == "" {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("crowdin translation memory download: source language is required")
	}
	if len(normalizeLanguages(req.TargetLanguages)) == 0 {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("crowdin translation memory download: at least one target language is required")
	}
	if w == nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("crowdin translation memory download: writer is nil")
	}

	segments, err := c.listTranslationMemorySegments(ctx, req.TranslationMemoryID)
	if err != nil {
		return TranslationMemoryDownloadResult{}, err
	}

	rows := translationMemoryCSVRows(req.TranslationMemoryID, segments, strings.TrimSpace(req.SourceLanguage), req.TargetLanguages)
	writer := csv.NewWriter(w)
	if err := writer.Write(translationMemoryCSVHeader()); err != nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("write translation memory csv header: %w", err)
	}
	for _, row := range rows {
		if err := writer.Write(csvsafe.EscapeRow(row)); err != nil {
			return TranslationMemoryDownloadResult{}, fmt.Errorf("write translation memory csv row: %w", err)
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("flush translation memory csv: %w", err)
	}

	return TranslationMemoryDownloadResult{Rows: len(rows), Segments: len(segments)}, nil
}

// WriteTranslationMemoryTMX downloads translation memory segments and writes source/target variants as TMX.
func (c *HTTPClient) WriteTranslationMemoryTMX(ctx context.Context, req TranslationMemoryDownloadRequest, w io.Writer) (TranslationMemoryDownloadResult, error) {
	if c == nil || c.client == nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("crowdin translation memory download: client is nil")
	}
	if req.TranslationMemoryID <= 0 {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("crowdin translation memory download: translation memory id must be positive")
	}
	if strings.TrimSpace(req.SourceLanguage) == "" {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("crowdin translation memory download: source language is required")
	}
	if len(normalizeLanguages(req.TargetLanguages)) == 0 {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("crowdin translation memory download: at least one target language is required")
	}
	if w == nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("crowdin translation memory download: writer is nil")
	}

	segments, err := c.listTranslationMemorySegments(ctx, req.TranslationMemoryID)
	if err != nil {
		return TranslationMemoryDownloadResult{}, err
	}
	units := translationMemoryTMXUnits(segments, strings.TrimSpace(req.SourceLanguage), req.TargetLanguages)
	if err := writeTranslationMemoryTMX(w, strings.TrimSpace(req.SourceLanguage), units); err != nil {
		return TranslationMemoryDownloadResult{}, err
	}
	return TranslationMemoryDownloadResult{Rows: translationMemoryTMXVariantCount(units), Segments: len(units)}, nil
}

func (c *HTTPClient) listTranslationMemorySegments(ctx context.Context, tmID int) ([]*model.TMSegment, error) {
	var segments []*model.TMSegment
	offset := 0

	for {
		page, _, err := c.client.TranslationMemory.ListTMSegments(ctx, tmID, &model.TMSegmentsListOptions{
			OrderBy: "id",
			ListOptions: model.ListOptions{
				Limit:  translationMemoryCSVPageLimit,
				Offset: offset,
			},
		})
		if err != nil {
			return nil, fmt.Errorf("list translation memory segments: %w", err)
		}
		segments = append(segments, page...)
		if len(page) < translationMemoryCSVPageLimit {
			break
		}
		offset += translationMemoryCSVPageLimit
	}

	return segments, nil
}

func translationMemoryCSVRows(tmID int, segments []*model.TMSegment, sourceLanguage string, targetLanguages []string) [][]string {
	targetSet := make(map[string]struct{})
	for _, language := range normalizeLanguages(targetLanguages) {
		targetSet[language] = struct{}{}
	}

	sortedSegments := slices.Clone(segments)
	slices.SortStableFunc(sortedSegments, func(left, right *model.TMSegment) int {
		if left == nil && right == nil {
			return 0
		}
		if left == nil {
			return 1
		}
		if right == nil {
			return -1
		}
		return cmp.Compare(left.ID, right.ID)
	})

	rows := make([][]string, 0, len(sortedSegments))
	for _, segment := range sortedSegments {
		if segment == nil {
			continue
		}
		sourceRecord, targets := translationMemorySegmentRecords(segment, sourceLanguage, targetSet)
		if sourceRecord == nil {
			continue
		}
		for _, target := range targets {
			rows = append(rows, translationMemoryCSVRow(tmID, segment.ID, sourceLanguage, sourceRecord, target))
		}
	}
	return rows
}

func translationMemorySegmentRecords(segment *model.TMSegment, sourceLanguage string, targetSet map[string]struct{}) (*model.TMSegmentRecord, []*model.TMSegmentRecord) {
	records := slices.Clone(segment.Records)
	slices.SortStableFunc(records, func(left, right *model.TMSegmentRecord) int {
		if left == nil && right == nil {
			return 0
		}
		if left == nil {
			return 1
		}
		if right == nil {
			return -1
		}
		if left.LanguageID != right.LanguageID {
			if left.LanguageID < right.LanguageID {
				return -1
			}
			return 1
		}
		return cmp.Compare(left.ID, right.ID)
	})

	var sourceRecord *model.TMSegmentRecord
	targets := make([]*model.TMSegmentRecord, 0, len(records))
	for _, record := range records {
		if record == nil {
			continue
		}
		if record.LanguageID == sourceLanguage && sourceRecord == nil {
			sourceRecord = record
			continue
		}
		if _, ok := targetSet[record.LanguageID]; ok {
			targets = append(targets, record)
		}
	}
	return sourceRecord, targets
}

func translationMemoryCSVRow(tmID, segmentID int, sourceLanguage string, source, target *model.TMSegmentRecord) []string {
	return []string{
		strconv.Itoa(tmID),
		strconv.Itoa(segmentID),
		sourceLanguage,
		target.LanguageID,
		source.Text,
		target.Text,
		strconv.Itoa(source.ID),
		strconv.Itoa(target.ID),
		strconv.Itoa(source.UsageCount),
		strconv.Itoa(target.UsageCount),
		source.CreatedAt,
		target.CreatedAt,
		source.UpdatedAt,
		target.UpdatedAt,
		strconv.Itoa(source.CreatedBy),
		strconv.Itoa(target.CreatedBy),
		strconv.Itoa(source.UpdatedBy),
		strconv.Itoa(target.UpdatedBy),
	}
}

func normalizeLanguages(languages []string) []string {
	normalized := make([]string, 0, len(languages))
	seen := make(map[string]struct{}, len(languages))
	for _, language := range languages {
		trimmed := strings.TrimSpace(language)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}
	return normalized
}

type translationMemoryTMXUnit struct {
	ID       int
	Variants []*model.TMSegmentRecord
}

func translationMemoryTMXUnits(segments []*model.TMSegment, sourceLanguage string, targetLanguages []string) []translationMemoryTMXUnit {
	targetSet := make(map[string]struct{})
	for _, language := range normalizeLanguages(targetLanguages) {
		targetSet[language] = struct{}{}
	}

	sortedSegments := slices.Clone(segments)
	slices.SortStableFunc(sortedSegments, func(left, right *model.TMSegment) int {
		if left == nil && right == nil {
			return 0
		}
		if left == nil {
			return 1
		}
		if right == nil {
			return -1
		}
		return cmp.Compare(left.ID, right.ID)
	})

	units := make([]translationMemoryTMXUnit, 0, len(sortedSegments))
	for _, segment := range sortedSegments {
		if segment == nil {
			continue
		}
		source, targets := translationMemorySegmentRecords(segment, sourceLanguage, targetSet)
		if source == nil || len(targets) == 0 {
			continue
		}
		variants := make([]*model.TMSegmentRecord, 0, 1+len(targets))
		variants = append(variants, source)
		variants = append(variants, targets...)
		units = append(units, translationMemoryTMXUnit{ID: segment.ID, Variants: variants})
	}
	return units
}

func translationMemoryTMXVariantCount(units []translationMemoryTMXUnit) int {
	count := 0
	for _, unit := range units {
		count += len(unit.Variants)
	}
	return count
}

func writeTranslationMemoryTMX(w io.Writer, sourceLanguage string, units []translationMemoryTMXUnit) error {
	if _, err := io.WriteString(w, xml.Header); err != nil {
		return fmt.Errorf("write translation memory tmx header: %w", err)
	}
	encoder := xml.NewEncoder(w)
	encoder.Indent("", "  ")
	tmxStart := xml.StartElement{Name: xml.Name{Local: "tmx"}, Attr: []xml.Attr{{Name: xml.Name{Local: "version"}, Value: "1.4"}}}
	if err := encoder.EncodeToken(tmxStart); err != nil {
		return fmt.Errorf("write translation memory tmx: %w", err)
	}
	headerStart := xml.StartElement{Name: xml.Name{Local: "header"}, Attr: []xml.Attr{
		{Name: xml.Name{Local: "creationtool"}, Value: "hyperlocalise"},
		{Name: xml.Name{Local: "creationtoolversion"}, Value: "1"},
		{Name: xml.Name{Local: "segtype"}, Value: "sentence"},
		{Name: xml.Name{Local: "adminlang"}, Value: "en"},
		{Name: xml.Name{Local: "srclang"}, Value: sourceLanguage},
		{Name: xml.Name{Local: "datatype"}, Value: "PlainText"},
	}}
	if err := encoder.EncodeToken(headerStart); err != nil {
		return fmt.Errorf("write translation memory tmx header: %w", err)
	}
	if err := encoder.EncodeToken(headerStart.End()); err != nil {
		return fmt.Errorf("write translation memory tmx header: %w", err)
	}
	bodyStart := xml.StartElement{Name: xml.Name{Local: "body"}}
	if err := encoder.EncodeToken(bodyStart); err != nil {
		return fmt.Errorf("write translation memory tmx body: %w", err)
	}
	for _, unit := range units {
		if err := writeTranslationMemoryTMXUnit(encoder, unit); err != nil {
			return err
		}
	}
	if err := encoder.EncodeToken(bodyStart.End()); err != nil {
		return fmt.Errorf("write translation memory tmx body: %w", err)
	}
	if err := encoder.EncodeToken(tmxStart.End()); err != nil {
		return fmt.Errorf("write translation memory tmx: %w", err)
	}
	if err := encoder.Flush(); err != nil {
		return fmt.Errorf("flush translation memory tmx: %w", err)
	}
	return nil
}

func writeTranslationMemoryTMXUnit(encoder *xml.Encoder, unit translationMemoryTMXUnit) error {
	tuStart := xml.StartElement{Name: xml.Name{Local: "tu"}, Attr: []xml.Attr{{Name: xml.Name{Local: "tuid"}, Value: strconv.Itoa(unit.ID)}}}
	if err := encoder.EncodeToken(tuStart); err != nil {
		return fmt.Errorf("write translation memory tmx unit: %w", err)
	}
	for _, variant := range unit.Variants {
		if variant == nil {
			continue
		}
		tuvStart := xml.StartElement{Name: xml.Name{Local: "tuv"}, Attr: []xml.Attr{{Name: xml.Name{Local: "xml:lang"}, Value: variant.LanguageID}}}
		if err := encoder.EncodeToken(tuvStart); err != nil {
			return fmt.Errorf("write translation memory tmx variant: %w", err)
		}
		segStart := xml.StartElement{Name: xml.Name{Local: "seg"}}
		if err := encoder.EncodeElement(variant.Text, segStart); err != nil {
			return fmt.Errorf("write translation memory tmx segment: %w", err)
		}
		if err := encoder.EncodeToken(tuvStart.End()); err != nil {
			return fmt.Errorf("write translation memory tmx variant: %w", err)
		}
	}
	if err := encoder.EncodeToken(tuStart.End()); err != nil {
		return fmt.Errorf("write translation memory tmx unit: %w", err)
	}
	return nil
}
