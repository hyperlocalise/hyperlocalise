package cache

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
	"github.com/hyperlocalise/rain-orm/pkg/rain"
)

func TestNewFromConfigMigratesLegacyTMTableWithConstraints(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "cache.sqlite")

	// Create legacy table using raw SQL
	db, err := rain.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open legacy db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	_, err = db.Exec(context.Background(), `CREATE TABLE translation_memory_entries (
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
)`)
	if err != nil {
		t.Fatalf("create legacy tm table: %v", err)
	}

	_, err = db.Exec(context.Background(), `INSERT INTO translation_memory_entries
(source_locale, target_locale, source_text, translated_text, score, provenance, source)
VALUES ('en', 'fr', 'Hello', 'Bonjour', 0.8, 'bad_provenance', 'bad_source')`)
	if err != nil {
		t.Fatalf("seed legacy row: %v", err)
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
	if err := svc.db.QueryRow(context.Background(), "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", "translation_memory_entries").Scan(&createSQL); err != nil {
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
	if err := svc.db.Select().
		Table(TranslationMemoryEntries).
		Where(TranslationMemoryEntries.SourceLocale.Eq("en")).
		Where(TranslationMemoryEntries.TargetLocale.Eq("fr")).
		Where(TranslationMemoryEntries.SourceText.Eq("Hello")).
		Scan(context.Background(), &row); err != nil {
		t.Fatalf("load migrated row: %v", err)
	}
	if row.Provenance != TMProvenanceUnknown {
		t.Fatalf("provenance=%q, want %q", row.Provenance, TMProvenanceUnknown)
	}
	if row.Source != TMSourceUnknown {
		t.Fatalf("source=%q, want %q", row.Source, TMSourceUnknown)
	}
}
