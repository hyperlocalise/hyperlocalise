package cache

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
	"github.com/hyperlocalise/rain-orm/pkg/rain"
)

func TestNewFromConfigDisabled(t *testing.T) {
	t.Parallel()

	svc, err := NewFromConfig(config.CacheConfig{Enabled: false})
	if err != nil {
		t.Fatalf("new cache service: %v", err)
	}
	if svc == nil {
		t.Fatal("expected non-nil service")
	}
	if svc.db != nil {
		t.Fatal("expected db to be nil when cache is disabled")
	}
}

func TestNewFromConfigEnabledMigratesSchema(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "cache", "cache.sqlite")
	svc, err := NewFromConfig(config.CacheConfig{
		Enabled: true,
		DBPath:  dbPath,
		SQLite: config.CacheSQLiteConfig{
			MaxOpenConns:    1,
			MaxIdleConns:    1,
			ConnMaxLifetime: 5,
		},
		L1: config.CacheTierConfig{Enabled: true, MaxItems: 10},
		L2: config.CacheTierConfig{Enabled: true},
	})
	if err != nil {
		t.Fatalf("new cache service: %v", err)
	}
	t.Cleanup(func() {
		_ = svc.Close()
	})

	// Check if tables exist using raw SQL
	var count int
	err = svc.db.QueryRow(context.Background(),
		"SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?",
		"exact_cache_entries").Scan(&count)
	if err != nil {
		t.Fatalf("check exact cache table: %v", err)
	}
	if count == 0 {
		t.Fatal("expected exact cache table")
	}

	err = svc.db.QueryRow(context.Background(),
		"SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?",
		"translation_memory_entries").Scan(&count)
	if err != nil {
		t.Fatalf("check translation memory table: %v", err)
	}
	if count == 0 {
		t.Fatal("expected translation memory table")
	}
}

func TestNewFromConfigMigrationIsIdempotent(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "cache.sqlite")
	cfg := config.CacheConfig{
		Enabled: true,
		DBPath:  dbPath,
		SQLite:  config.CacheSQLiteConfig{MaxOpenConns: 1, MaxIdleConns: 1, ConnMaxLifetime: 5},
		L1:      config.CacheTierConfig{Enabled: true, MaxItems: 10},
		L2:      config.CacheTierConfig{Enabled: true},
	}

	svc1, err := NewFromConfig(cfg)
	if err != nil {
		t.Fatalf("first new cache service: %v", err)
	}
	if err := svc1.Close(); err != nil {
		t.Fatalf("close first cache service: %v", err)
	}

	svc2, err := NewFromConfig(cfg)
	if err != nil {
		t.Fatalf("second new cache service: %v", err)
	}
	if err := svc2.Close(); err != nil {
		t.Fatalf("close second cache service: %v", err)
	}
}

func TestL1GetUpdatesHitMetadataTimestamp(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "cache.sqlite")
	svc, err := NewFromConfig(config.CacheConfig{
		Enabled: true,
		DBPath:  dbPath,
		SQLite:  config.CacheSQLiteConfig{MaxOpenConns: 1, MaxIdleConns: 1, ConnMaxLifetime: 5},
		L1:      config.CacheTierConfig{Enabled: true, MaxItems: 10},
	})
	if err != nil {
		t.Fatalf("new cache service: %v", err)
	}
	t.Cleanup(func() { _ = svc.Close() })

	if err := svc.L1.Put(context.Background(), ExactCacheWrite{
		Key:          "k1",
		Value:        "v1",
		SourceLocale: "en",
		TargetLocale: "fr",
		Provider:     "openai",
		Model:        "gpt-4.1-mini",
		SourceHash:   "hash",
	}); err != nil {
		t.Fatalf("seed cache entry: %v", err)
	}
	stale := time.Now().UTC().Add(-2 * time.Hour)
	_, err = svc.db.Update().
		Table(ExactCacheEntries).
		Set(ExactCacheEntries.UpdatedAt, stale).
		Where(ExactCacheEntries.CacheKey.Eq("k1")).
		Exec(context.Background())
	if err != nil {
		t.Fatalf("set stale updated_at: %v", err)
	}

	if _, hit, err := svc.L1.Get(context.Background(), "k1"); err != nil {
		t.Fatalf("lookup cache entry: %v", err)
	} else if !hit {
		t.Fatal("expected cache hit")
	}

	var row ExactCacheEntry
	if err := svc.db.Select().
		Table(ExactCacheEntries).
		Where(ExactCacheEntries.CacheKey.Eq("k1")).
		Scan(context.Background(), &row); err != nil {
		t.Fatalf("reload cache entry: %v", err)
	}
	if !row.UpdatedAt.After(stale) {
		t.Fatalf("expected updated_at to move forward on hit, stale=%s got=%s", stale, row.UpdatedAt)
	}
}

func TestL1PutPersistsMetadataColumns(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "cache.sqlite")
	svc, err := NewFromConfig(config.CacheConfig{
		Enabled: true,
		DBPath:  dbPath,
		SQLite:  config.CacheSQLiteConfig{MaxOpenConns: 1, MaxIdleConns: 1, ConnMaxLifetime: 5},
		L1:      config.CacheTierConfig{Enabled: true, MaxItems: 10},
	})
	if err != nil {
		t.Fatalf("new cache service: %v", err)
	}
	t.Cleanup(func() { _ = svc.Close() })

	if err := svc.L1.Put(context.Background(), ExactCacheWrite{
		Key:          "k-meta",
		Value:        "v-meta",
		SourceLocale: "en-US",
		TargetLocale: "fr-FR",
		Provider:     "openai",
		Model:        "gpt-5.2",
		SourceHash:   "source-hash",
	}); err != nil {
		t.Fatalf("put cache entry: %v", err)
	}

	var row ExactCacheEntry
	if err := svc.db.Select().
		Table(ExactCacheEntries).
		Where(ExactCacheEntries.CacheKey.Eq("k-meta")).
		Scan(context.Background(), &row); err != nil {
		t.Fatalf("load cache row: %v", err)
	}
	if row.SourceLocale != "en-US" || row.TargetLocale != "fr-FR" || row.Provider != "openai" || row.Model != "gpt-5.2" || row.SourceHash != "source-hash" {
		t.Fatalf("unexpected metadata row: %+v", row)
	}
}

func TestL1GetReturnsCachedValueWhenEntryExists(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "cache.sqlite")
	svc, err := NewFromConfig(config.CacheConfig{
		Enabled: true,
		DBPath:  dbPath,
		SQLite:  config.CacheSQLiteConfig{MaxOpenConns: 1, MaxIdleConns: 1, ConnMaxLifetime: 5},
		L1:      config.CacheTierConfig{Enabled: true, MaxItems: 10},
	})
	if err != nil {
		t.Fatalf("new cache service: %v", err)
	}
	t.Cleanup(func() { _ = svc.Close() })

	// Seed a cache entry
	if err := svc.L1.Put(context.Background(), ExactCacheWrite{
		Key:          "k-touch",
		Value:        "v-touch",
		SourceLocale: "en",
		TargetLocale: "fr",
		Provider:     "openai",
		Model:        "gpt-4",
		SourceHash:   "hash",
	}); err != nil {
		t.Fatalf("seed cache entry: %v", err)
	}

	// The Get should return the cached value and update the timestamp
	val, hit, err := svc.L1.Get(context.Background(), "k-touch")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !hit {
		t.Fatal("expected cache hit")
	}
	if val != "v-touch" {
		t.Fatalf("expected cached value 'v-touch', got %q", val)
	}
}

func TestL1GetReturnsCachedValueWhenTouchFails(t *testing.T) {
	t.Parallel()

	// This test verifies that when the touch UPDATE fails (lines 64-68 in stores.go),
	// the cached value is still returned. The UPDATE error is intentionally ignored
	// with `_, _ = ...` to allow cache hits even when the timestamp update fails.

	// Create a temporary database in a temp dir
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "cache-touch-fail.sqlite")
	db, err := rain.Open("sqlite", dbPath+"?_fk=1")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	// Run migrations manually for this test
	if err := migrateSchema(db); err != nil {
		t.Fatalf("migrate schema: %v", err)
	}

	// Create the store
	store := &exactSQLiteStore{db: db, maxItems: 10}

	// Seed a cache entry
	if err := store.Put(context.Background(), ExactCacheWrite{
		Key:          "k-touch-fail",
		Value:        "v-touch-fail",
		SourceLocale: "en",
		TargetLocale: "de",
		Provider:     "openai",
		Model:        "gpt-4",
		SourceHash:   "hash",
	}); err != nil {
		t.Fatalf("seed cache entry: %v", err)
	}

	// Make the database file read-only to simulate a write failure.
	// SQLite can still read from a read-only file, but writes will fail.
	if err := os.Chmod(dbPath, 0o444); err != nil {
		t.Fatalf("chmod read-only: %v", err)
	}
	// Also make the directory read-only to prevent creating WAL files
	if err := os.Chmod(tmpDir, 0o555); err != nil {
		t.Fatalf("chmod dir read-only: %v", err)
	}
	t.Cleanup(func() {
		// Restore permissions for cleanup
		_ = os.Chmod(tmpDir, 0o755)
		_ = os.Chmod(dbPath, 0o644)
	})

	// Now call Get - the SELECT should succeed (read works), but the UPDATE should fail.
	// Despite the UPDATE failure, the cached value should be returned due to the
	// error-swallowing at stores.go lines 64-68.
	val, hit, getErr := store.Get(context.Background(), "k-touch-fail")

	// The key assertion: even though the UPDATE fails (because file is read-only),
	// the cached value should still be returned. The SELECT should succeed since
	// SQLite can read from a read-only file.
	if getErr != nil {
		t.Fatalf("Get returned unexpected error: %v", getErr)
	}

	// Verify we got a cache hit with the correct value
	if !hit {
		t.Fatal("expected cache hit but got miss")
	}
	if val != "v-touch-fail" {
		t.Fatalf("expected cached value 'v-touch-fail', got %q", val)
	}
}
