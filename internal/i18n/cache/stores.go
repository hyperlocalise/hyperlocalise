package cache

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
)

const (
	tmComparableSimilarityGap = 0.02
)

type noopExactCache struct{}

func (noopExactCache) Get(_ context.Context, _ string) (string, bool, error) {
	return "", false, nil
}

func (noopExactCache) Put(_ context.Context, _ ExactCacheWrite) error {
	return nil
}

type noopTranslationMemory struct{}

func (noopTranslationMemory) Upsert(_ context.Context, _ TMWrite) error {
	return nil
}

func (noopTranslationMemory) Lookup(_ context.Context, _, _, _ string, _ int) ([]TMResult, error) {
	return nil, nil
}

type noopRetriever struct{}

func (noopRetriever) Retrieve(_ context.Context, _ string, _ int) ([]RAGDocument, error) {
	return nil, nil
}

type exactSQLiteStore struct {
	db       *gorm.DB
	maxItems int
}

func (s *exactSQLiteStore) Get(ctx context.Context, key string) (string, bool, error) {
	var row ExactCacheEntry
	if err := s.db.WithContext(ctx).Where("cache_key = ?", key).Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", false, nil
		}
		return "", false, fmt.Errorf("lookup exact cache: %w", err)
	}
	if err := s.db.WithContext(ctx).Model(&ExactCacheEntry{}).Where("id = ?", row.ID).Update("updated_at", time.Now().UTC()).Error; err != nil {
		// Non-fatal: keep serving valid cache hits even if metadata touch fails.
		// This only affects LRU recency ordering for eviction.
		_ = err
	}
	return row.Value, true, nil
}

func (s *exactSQLiteStore) Put(ctx context.Context, write ExactCacheWrite) error {
	entry := ExactCacheEntry{
		CacheKey:     write.Key,
		SourceLocale: write.SourceLocale,
		TargetLocale: write.TargetLocale,
		Provider:     write.Provider,
		Model:        write.Model,
		SourceHash:   write.SourceHash,
		Value:        write.Value,
	}
	if err := s.db.WithContext(ctx).Where("cache_key = ?", write.Key).Assign(entry).FirstOrCreate(&entry).Error; err != nil {
		return fmt.Errorf("upsert exact cache: %w", err)
	}
	if s.maxItems > 0 {
		if err := s.evictIfNeeded(ctx); err != nil {
			return err
		}
	}
	return nil
}

func (s *exactSQLiteStore) evictIfNeeded(ctx context.Context) error {
	var count int64
	if err := s.db.WithContext(ctx).Model(&ExactCacheEntry{}).Count(&count).Error; err != nil {
		return fmt.Errorf("count exact cache entries: %w", err)
	}
	overflow := int(count) - s.maxItems
	if overflow <= 0 {
		return nil
	}
	var oldIDs []uint
	if err := s.db.WithContext(ctx).Model(&ExactCacheEntry{}).Order("updated_at asc").Limit(overflow).Pluck("id", &oldIDs).Error; err != nil {
		return fmt.Errorf("select exact cache eviction candidates: %w", err)
	}
	if len(oldIDs) == 0 {
		return nil
	}
	if err := s.db.WithContext(ctx).Delete(&ExactCacheEntry{}, oldIDs).Error; err != nil {
		return fmt.Errorf("evict exact cache entries: %w", err)
	}
	return nil
}

type tmSQLiteStore struct {
	db                  *gorm.DB
	autoAcceptThreshold float64
}

func (s *tmSQLiteStore) Upsert(ctx context.Context, write TMWrite) error {
	metadata := write.Metadata
	if metadata.Provenance == "" && write.Provenance != "" {
		metadata.Provenance = write.Provenance
	}
	if metadata.Source == "" && write.Source != "" {
		metadata.Source = write.Source
	}

	provenance, err := normalizeTMProvenance(metadata.Provenance)
	if err != nil {
		return fmt.Errorf("normalize tm provenance: %w", err)
	}
	source, err := normalizeTMSource(metadata.Source)
	if err != nil {
		return fmt.Errorf("normalize tm source: %w", err)
	}
	entry := TranslationMemoryEntry{
		SourceLocale:   write.SourceLocale,
		TargetLocale:   write.TargetLocale,
		SourceText:     write.SourceText,
		TranslatedText: write.TranslatedText,
		Score:          write.Score,
		Provenance:     provenance,
		Source:         source,
	}
	query := s.db.WithContext(ctx).
		Where("source_locale = ? AND target_locale = ? AND source_text = ?", write.SourceLocale, write.TargetLocale, write.SourceText).
		Assign(entry)
	if err := query.FirstOrCreate(&entry).Error; err != nil {
		return fmt.Errorf("upsert translation memory entry: %w", err)
	}
	return nil
}

func (s *tmSQLiteStore) Lookup(ctx context.Context, sourceLocale, targetLocale, sourceText string, limit int) ([]TMResult, error) {
	if limit <= 0 {
		limit = 5
	}
	rows, err := s.db.WithContext(ctx).
		Model(&TranslationMemoryEntry{}).
		Where("source_locale = ? AND target_locale = ?", sourceLocale, targetLocale).
		Rows()
	if err != nil {
		return nil, fmt.Errorf("lookup translation memory entries: %w", err)
	}
	defer rows.Close()

	results := make([]TMResult, 0, limit)
	for rows.Next() {
		var row TranslationMemoryEntry
		if err := s.db.ScanRows(rows, &row); err != nil {
			return nil, fmt.Errorf("scan translation memory row: %w", err)
		}
		similarity := normalizedLevenshtein(sourceText, row.SourceText)
		metadata := TMMetadata{
			Provenance: sanitizeTMProvenance(row.Provenance),
			Source:     sanitizeTMSource(row.Source),
		}
		candidate := TMResult{
			SourceText:     row.SourceText,
			TranslatedText: row.TranslatedText,
			Score:          row.Score,
			Similarity:     similarity,
			Metadata:       metadata,
			Provenance:     metadata.Provenance,
			Source:         metadata.Source,
			AutoAccepted:   similarity >= s.autoAcceptThreshold,
		}
		if len(results) < limit {
			results = append(results, candidate)
			sortTMResults(results)
			continue
		}
		worstIndex := len(results) - 1
		if tmResultBetter(candidate, results[worstIndex]) {
			results[worstIndex] = candidate
			sortTMResults(results)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate translation memory rows: %w", err)
	}
	return results, nil
}

func normalizedLevenshtein(a, b string) float64 {
	left := []rune(strings.ToLower(strings.TrimSpace(a)))
	right := []rune(strings.ToLower(strings.TrimSpace(b)))
	if len(left) == 0 && len(right) == 0 {
		return 1
	}
	maxLen := max(len(left), len(right))
	if maxLen == 0 {
		return 1
	}
	dist := levenshteinDistance(left, right)
	similarity := 1 - float64(dist)/float64(maxLen)
	if similarity < 0 {
		return 0
	}
	return similarity
}

func levenshteinDistance(a, b []rune) int {
	if len(a) == 0 {
		return len(b)
	}
	if len(b) == 0 {
		return len(a)
	}
	prev := make([]int, len(b)+1)
	curr := make([]int, len(b)+1)
	for j := 0; j <= len(b); j++ {
		prev[j] = j
	}
	for i := 1; i <= len(a); i++ {
		curr[0] = i
		for j := 1; j <= len(b); j++ {
			cost := 0
			if a[i-1] != b[j-1] {
				cost = 1
			}
			curr[j] = minInt(
				curr[j-1]+1,
				prev[j]+1,
				prev[j-1]+cost,
			)
		}
		prev, curr = curr, prev
	}
	return prev[len(b)]
}

func minInt(values ...int) int {
	minValue := values[0]
	for _, value := range values[1:] {
		if value < minValue {
			minValue = value
		}
	}
	return minValue
}

func provenanceRank(provenance TMProvenance) int {
	switch sanitizeTMProvenance(provenance) {
	case TMProvenanceCurated:
		return 5
	case TMProvenanceTMS:
		return 4
	case TMProvenanceDraft:
		return 3
	case TMProvenanceLLM:
		return 2
	case TMProvenanceUnknown:
		return 1
	default:
		return 0
	}
}

func sortTMResults(results []TMResult) {
	sort.SliceStable(results, func(i, j int) bool {
		return tmResultBetter(results[i], results[j])
	})
}

func tmResultBetter(left, right TMResult) bool {
	diff := math.Abs(left.Similarity - right.Similarity)
	if diff <= tmComparableSimilarityGap {
		leftRank := provenanceRank(left.Metadata.Provenance)
		rightRank := provenanceRank(right.Metadata.Provenance)
		if leftRank != rightRank {
			return leftRank > rightRank
		}
	}
	if left.Similarity != right.Similarity {
		return left.Similarity > right.Similarity
	}
	if left.Score != right.Score {
		return left.Score > right.Score
	}
	return left.TranslatedText < right.TranslatedText
}
