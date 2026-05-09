package crowdin

import (
	"cmp"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"slices"
	"strings"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
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
		if err := writer.Write(row); err != nil {
			return TranslationMemoryDownloadResult{}, fmt.Errorf("write translation memory csv row: %w", err)
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return TranslationMemoryDownloadResult{}, fmt.Errorf("flush translation memory csv: %w", err)
	}

	return TranslationMemoryDownloadResult{Rows: len(rows), Segments: len(segments)}, nil
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
		fmt.Sprintf("%d", tmID),
		fmt.Sprintf("%d", segmentID),
		sourceLanguage,
		target.LanguageID,
		source.Text,
		target.Text,
		fmt.Sprintf("%d", source.ID),
		fmt.Sprintf("%d", target.ID),
		fmt.Sprintf("%d", source.UsageCount),
		fmt.Sprintf("%d", target.UsageCount),
		source.CreatedAt,
		target.CreatedAt,
		source.UpdatedAt,
		target.UpdatedAt,
		fmt.Sprintf("%d", source.CreatedBy),
		fmt.Sprintf("%d", target.CreatedBy),
		fmt.Sprintf("%d", source.UpdatedBy),
		fmt.Sprintf("%d", target.UpdatedBy),
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
