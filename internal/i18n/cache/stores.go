package cache

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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
	if err := s.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "source_locale"},
				{Name: "target_locale"},
				{Name: "source_text"},
			},
			DoUpdates: clause.AssignmentColumns([]string{
				"translated_text", "score", "provenance", "source", "updated_at",
			}),
		}).
		Create(&entry).Error; err != nil {
		return fmt.Errorf("upsert translation memory entry: %w", err)
	}
	return nil
}

// tmLengthFilterRatio is the maximum allowed length ratio difference for a
// candidate to be considered. Candidates whose rune-length differs by more
// than this factor from the query are skipped without computing the full
// edit distance, because their similarity cannot exceed this threshold.
const tmLengthFilterRatio = 0.3

func (s *tmSQLiteStore) Lookup(ctx context.Context, sourceLocale, targetLocale, sourceText string, limit int) ([]TMResult, error) {
	if limit <= 0 {
		limit = 5
	}

	// Normalise the query once, outside the row loop.
	queryRunes := []rune(strings.ToLower(strings.TrimSpace(sourceText)))
	queryLen := len(queryRunes)

	// Pre-filter by source text length in SQL so the DB only returns plausible
	// candidates. For a normalised Levenshtein similarity of S, the candidate
	// length L must satisfy: 1 - |queryLen-L|/max(queryLen,L) >= S.
	// Using tmLengthFilterRatio as the minimum useful similarity gives a safe
	// bound on the allowed length difference.
	minLen := int(float64(queryLen) * (1 - tmLengthFilterRatio))
	maxLen := int(float64(queryLen) / (1 - tmLengthFilterRatio))

	rows, err := s.db.WithContext(ctx).
		Model(&TranslationMemoryEntry{}).
		Where("source_locale = ? AND target_locale = ? AND LENGTH(source_text) BETWEEN ? AND ?",
			sourceLocale, targetLocale, minLen, maxLen).
		Rows()
	if err != nil {
		return nil, fmt.Errorf("lookup translation memory entries: %w", err)
	}
	defer func() { _ = rows.Close() }()

	// Reusable buffers for levenshtein computation to avoid per-row allocs.
	var levBuf levBuffers

	results := make([]TMResult, 0, limit)
	for rows.Next() {
		var row TranslationMemoryEntry
		if err := s.db.ScanRows(rows, &row); err != nil {
			return nil, fmt.Errorf("scan translation memory row: %w", err)
		}
		rowRunes := []rune(strings.ToLower(strings.TrimSpace(row.SourceText)))
		similarity := normalizedLevenshteinRunes(queryRunes, rowRunes, &levBuf)
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

// normalizedLevenshteinRunes computes normalised Levenshtein similarity on
// pre-converted rune slices. If buf is non-nil it is reused across calls to
// avoid allocations in hot loops.
func normalizedLevenshteinRunes(left, right []rune, buf *levBuffers) float64 {
	if len(left) == 0 && len(right) == 0 {
		return 1
	}
	maxLen := max(len(left), len(right))
	dist := levenshteinDistance(left, right, buf)
	similarity := 1 - float64(dist)/float64(maxLen)
	if similarity < 0 {
		return 0
	}
	return similarity
}

// levBuffers holds reusable row buffers for levenshteinDistance so the hot
// loop inside Lookup avoids allocating two slices per candidate.
type levBuffers struct {
	prev []int
	curr []int
}

func (b *levBuffers) ensure(n int) ([]int, []int) {
	if cap(b.prev) < n {
		b.prev = make([]int, n)
	}
	if cap(b.curr) < n {
		b.curr = make([]int, n)
	}
	return b.prev[:n], b.curr[:n]
}

func levenshteinDistance(a, b []rune, buf *levBuffers) int {
	if len(a) == 0 {
		return len(b)
	}
	if len(b) == 0 {
		return len(a)
	}

	var prev, curr []int
	needed := len(b) + 1
	if buf != nil {
		prev, curr = buf.ensure(needed)
	} else {
		prev = make([]int, needed)
		curr = make([]int, needed)
	}

	for j := 0; j < needed; j++ {
		prev[j] = j
	}
	for i := 1; i <= len(a); i++ {
		curr[0] = i
		for j := 1; j <= len(b); j++ {
			cost := 0
			if a[i-1] != b[j-1] {
				cost = 1
			}
			curr[j] = min(
				curr[j-1]+1,
				prev[j]+1,
				prev[j-1]+cost,
			)
		}
		prev, curr = curr, prev
	}

	if buf != nil {
		buf.prev = prev
		buf.curr = curr
	}
	return prev[len(b)]
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

// tmCompositeScore computes a single sortable score that blends similarity
// with a small provenance bonus so that entries within the comparable-gap
// window are boosted by provenance without creating non-transitive cycles.
func tmCompositeScore(r TMResult) float64 {
	// provenanceRank returns 0-5; normalise to [0, tmComparableSimilarityGap]
	// so provenance can only break ties within the gap, never override a
	// larger similarity difference.
	bonus := float64(provenanceRank(r.Metadata.Provenance)) / 5.0 * tmComparableSimilarityGap
	return r.Similarity + bonus
}

func sortTMResults(results []TMResult) {
	sort.SliceStable(results, func(i, j int) bool {
		return tmResultBetter(results[i], results[j])
	})
}

func tmResultBetter(left, right TMResult) bool {
	lc := tmCompositeScore(left)
	rc := tmCompositeScore(right)
	if lc != rc {
		return lc > rc
	}
	if left.Score != right.Score {
		return left.Score > right.Score
	}
	return left.TranslatedText < right.TranslatedText
}
