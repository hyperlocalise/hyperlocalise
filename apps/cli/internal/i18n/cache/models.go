package cache

import (
	"time"

	"github.com/hyperlocalise/rain-orm/pkg/rain"
	"github.com/hyperlocalise/rain-orm/pkg/schema"
)

// CHECK constraints for TranslationMemoryEntry.
// These are enforced in ensureTMTableConstraints() in service.go.
const (
	TMProvenanceCheck = "check (provenance in ('curated','draft','llm','tms','unknown'))"
	TMSourceCheck     = "check (source in ('run','sync_pull','sync_push','manual','import','legacy','unknown'))"
)

type exactCacheEntriesTable struct {
	schema.TableModel
	ID           *schema.Column[int64]
	CacheKey     *schema.Column[string]
	SourceLocale *schema.Column[string]
	TargetLocale *schema.Column[string]
	Provider     *schema.Column[string]
	Model        *schema.Column[string]
	SourceHash   *schema.Column[string]
	Value        *schema.Column[string]
	CreatedAt    *schema.Column[time.Time]
	UpdatedAt    *schema.Column[time.Time]
}

type translationMemoryEntriesTable struct {
	schema.TableModel
	ID             *schema.Column[int64]
	SourceLocale   *schema.Column[string]
	TargetLocale   *schema.Column[string]
	SourceText     *schema.Column[string]
	TranslatedText *schema.Column[string]
	Score          *schema.Column[float64]
	Provenance     *schema.Column[string]
	Source         *schema.Column[string]
	CreatedAt      *schema.Column[time.Time]
	UpdatedAt      *schema.Column[time.Time]
}

var ExactCacheEntries = schema.Define("exact_cache_entries", func(t *exactCacheEntriesTable) {
	t.ID = t.BigSerial("id").PrimaryKey()
	t.CacheKey = t.Text("cache_key").NotNull().Unique()
	t.SourceLocale = t.Text("source_locale").NotNull()
	t.TargetLocale = t.Text("target_locale").NotNull()
	t.Provider = t.Text("provider").NotNull()
	t.Model = t.Text("model").NotNull()
	t.SourceHash = t.Text("source_hash").NotNull()
	t.Value = t.Text("value").NotNull()
	t.CreatedAt = t.Timestamp("created_at").NotNull().DefaultNow()
	t.UpdatedAt = t.Timestamp("updated_at").NotNull().DefaultNow()
	t.Index("idx_exact_source_locale").On(t.SourceLocale)
	t.Index("idx_exact_target_locale").On(t.TargetLocale)
	t.Index("idx_exact_provider").On(t.Provider)
	t.Index("idx_exact_model").On(t.Model)
	t.Index("idx_exact_source_hash").On(t.SourceHash)
})

var TranslationMemoryEntries = schema.Define("translation_memory_entries", func(t *translationMemoryEntriesTable) {
	t.ID = t.BigSerial("id").PrimaryKey()
	t.SourceLocale = t.Text("source_locale").NotNull()
	t.TargetLocale = t.Text("target_locale").NotNull()
	t.SourceText = t.Text("source_text").NotNull()
	t.TranslatedText = t.Text("translated_text").NotNull()
	t.Score = t.Double("score").NotNull().Default(0)
	t.Provenance = t.Text("provenance").NotNull().Default("unknown")
	t.Source = t.Text("source").NotNull().Default("unknown")
	t.CreatedAt = t.Timestamp("created_at").NotNull().DefaultNow()
	t.UpdatedAt = t.Timestamp("updated_at").NotNull().DefaultNow()
	t.Unique("idx_tm_locales_text").On(t.SourceLocale, t.TargetLocale, t.SourceText)
	t.Index("idx_tm_provenance").On(t.Provenance)
	t.Index("idx_tm_source").On(t.Source)
	t.Index("idx_tm_source_locale").On(t.SourceLocale)
	t.Index("idx_tm_target_locale").On(t.TargetLocale)
})

// ExactCacheEntry stores exact-match translations for deterministic reuse.
type ExactCacheEntry struct {
	ID           uint64    `db:"id"`
	CacheKey     string    `db:"cache_key"`
	SourceLocale string    `db:"source_locale"`
	TargetLocale string    `db:"target_locale"`
	Provider     string    `db:"provider"`
	Model        string    `db:"model"`
	SourceHash   string    `db:"source_hash"`
	Value        string    `db:"value"`
	CreatedAt    time.Time `db:"created_at"`
	UpdatedAt    time.Time `db:"updated_at"`
}

// TranslationMemoryEntry stores L2 memory candidates.
type TranslationMemoryEntry struct {
	ID             uint64       `db:"id"`
	SourceLocale   string       `db:"source_locale"`
	TargetLocale   string       `db:"target_locale"`
	SourceText     string       `db:"source_text"`
	TranslatedText string       `db:"translated_text"`
	Score          float64      `db:"score"`
	Provenance     TMProvenance `db:"provenance"`
	Source         TMSource     `db:"source"`
	CreatedAt      time.Time    `db:"created_at"`
	UpdatedAt      time.Time    `db:"updated_at"`
}

func init() {
	rain.MustBindTableModel[ExactCacheEntry](ExactCacheEntries)
	rain.MustBindTableModel[TranslationMemoryEntry](TranslationMemoryEntries)
}
