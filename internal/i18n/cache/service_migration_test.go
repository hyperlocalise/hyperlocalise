package cache

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/quiet-circles/hyperlocalise/internal/config"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestNewFromConfigMigratesLegacyTMTableWithConstraints(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "cache.sqlite")
	legacyDB, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		t.Fatalf("open legacy db: %v", err)
	}
	if err := legacyDB.Exec(`CREATE TABLE translation_memory_entries (
id integer PRIMARY KEY AUTOINCREMENT,
source_locale text NOT NULL,
target_locale text NOT NULL,
source_text text NOT NULL,
translated_text text NOT NULL,
score real NOT NULL DEFAULT 0,
provenance text NOT NULL DEFAULT 'unknown',
source text NOT NULL DEFAULT 'unknown',
created_at datetime,
updated_at datetime
)`).Error; err != nil {
		t.Fatalf("create legacy tm table: %v", err)
	}
	if err := legacyDB.Exec(`INSERT INTO translation_memory_entries
(source_locale, target_locale, source_text, translated_text, score, provenance, source)
VALUES ('en', 'fr', 'Hello', 'Bonjour', 0.8, 'bad_provenance', 'bad_source')`).Error; err != nil {
		t.Fatalf("seed legacy row: %v", err)
	}
	sqlDB, err := legacyDB.DB()
	if err != nil {
		t.Fatalf("resolve legacy sql db: %v", err)
	}
	if err := sqlDB.Close(); err != nil {
		t.Fatalf("close legacy sql db: %v", err)
	}

	svc, err := NewFromConfig(config.CacheConfig{
		Enabled: true,
		DBPath:  dbPath,
		SQLite:  config.CacheSQLiteConfig{MaxOpenConns: 1, MaxIdleConns: 1, ConnMaxLifetime: 5},
		L2:      config.CacheTierConfig{Enabled: true},
	})
	if err != nil {
		t.Fatalf("new cache service: %v", err)
	}
	t.Cleanup(func() { _ = svc.Close() })

	var createSQL string
	if err := svc.db.Raw("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", "translation_memory_entries").Scan(&createSQL).Error; err != nil {
		t.Fatalf("load tm table schema: %v", err)
	}
	schemaSQL := strings.ToLower(createSQL)
	if !strings.Contains(schemaSQL, "check (provenance in ('curated','draft','llm','tms','unknown'))") {
		t.Fatalf("expected provenance check constraint, schema=%s", createSQL)
	}
	if !strings.Contains(schemaSQL, "check (source in ('run','sync_pull','sync_push','manual','import','legacy','unknown'))") {
		t.Fatalf("expected source check constraint, schema=%s", createSQL)
	}

	var row TranslationMemoryEntry
	if err := svc.db.Where("source_locale = ? AND target_locale = ? AND source_text = ?", "en", "fr", "Hello").Take(&row).Error; err != nil {
		t.Fatalf("load migrated row: %v", err)
	}
	if row.Provenance != TMProvenanceUnknown {
		t.Fatalf("provenance=%q, want %q", row.Provenance, TMProvenanceUnknown)
	}
	if row.Source != TMSourceUnknown {
		t.Fatalf("source=%q, want %q", row.Source, TMSourceUnknown)
	}
}
