package cache

import (
	"time"

	"github.com/uptrace/bun"
)

// CHECK constraints for TranslationMemoryEntry.
// These are enforced in ensureTMTableConstraints() in service.go.
const (
	TMProvenanceCheck = "check (provenance in ('curated','draft','llm','tms','unknown'))"
	TMSourceCheck     = "check (source in ('run','sync_pull','sync_push','manual','import','legacy','unknown'))"
)

// ExactCacheEntry stores exact-match translations for deterministic reuse.
type ExactCacheEntry struct {
	bun.BaseModel `bun:"table:exact_cache_entries,alias:ece"`

	ID           uint64    `bun:"id,pk,autoincrement"`
	CacheKey     string    `bun:"cache_key,unique,notnull"`
	SourceLocale string    `bun:"source_locale,notnull"`
	TargetLocale string    `bun:"target_locale,notnull"`
	Provider     string    `bun:"provider,notnull"`
	Model        string    `bun:"model,notnull"`
	SourceHash   string    `bun:"source_hash,notnull"`
	Value        string    `bun:"value,type:text,notnull"`
	CreatedAt    time.Time `bun:"created_at,nullzero,notnull,default:current_timestamp"`
	UpdatedAt    time.Time `bun:"updated_at,nullzero,notnull,default:current_timestamp"`
}

// TranslationMemoryEntry stores L2 memory candidates.
type TranslationMemoryEntry struct {
	bun.BaseModel `bun:"table:translation_memory_entries,alias:tme"`

	ID             uint64       `bun:"id,pk,autoincrement"`
	SourceLocale   string       `bun:"source_locale,notnull"`
	TargetLocale   string       `bun:"target_locale,notnull"`
	SourceText     string       `bun:"source_text,type:text,notnull"`
	TranslatedText string       `bun:"translated_text,type:text,notnull"`
	Score          float64      `bun:"score,notnull,default:0"`
	Provenance     TMProvenance `bun:"provenance,notnull,default:'unknown'"`
	Source         TMSource     `bun:"source,notnull,default:'unknown'"`
	CreatedAt      time.Time    `bun:"created_at,nullzero,notnull,default:current_timestamp"`
	UpdatedAt      time.Time    `bun:"updated_at,nullzero,notnull,default:current_timestamp"`
}
