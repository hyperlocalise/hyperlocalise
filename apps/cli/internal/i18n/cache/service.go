package cache

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
	"github.com/hyperlocalise/rain-orm/pkg/rain"
	_ "modernc.org/sqlite"
)

// ExactCache is the L1 exact-match cache contract.
type ExactCache interface {
	Get(ctx context.Context, key string) (string, bool, error)
	Put(ctx context.Context, entry ExactCacheWrite) error
}

// ExactCacheWrite carries L1 payload and metadata for write-through upserts.
type ExactCacheWrite struct {
	Key          string
	Value        string
	SourceLocale string
	TargetLocale string
	Provider     string
	Model        string
	SourceHash   string
}

// TranslationMemory is the L2 fuzzy memory contract.
type TranslationMemory interface {
	Upsert(ctx context.Context, entry TMWrite) error
	Lookup(ctx context.Context, sourceLocale, targetLocale, sourceText string, limit int) ([]TMResult, error)
}

// TMWrite carries L2 translation-memory payload and metadata.
type TMWrite struct {
	SourceLocale   string
	TargetLocale   string
	SourceText     string
	TranslatedText string
	Score          float64
	Metadata       TMMetadata
	// Deprecated: use Metadata.Provenance.
	Provenance TMProvenance
	// Deprecated: use Metadata.Source.
	Source TMSource
}

// Retriever is an optional retrieval contract for context augmentation.
type Retriever interface {
	Retrieve(ctx context.Context, query string, limit int) ([]RAGDocument, error)
}

// TMResult is a translation-memory lookup result.
type TMResult struct {
	SourceText     string
	TranslatedText string
	Score          float64
	Similarity     float64
	Metadata       TMMetadata
	// Deprecated: use Metadata.Provenance.
	Provenance TMProvenance
	// Deprecated: use Metadata.Source.
	Source       TMSource
	AutoAccepted bool
}

// RAGDocument is an optional retrieval result.
type RAGDocument struct {
	ID      string
	Content string
	Score   float64
}

// Service groups L1/L2/RAG cache dependencies.
type Service struct {
	Enabled   bool
	L1        ExactCache
	L2        TranslationMemory
	Retriever Retriever

	db *rain.DB
}

// NewFromConfig bootstraps cache service dependencies from config.
func NewFromConfig(cfg config.CacheConfig) (*Service, error) {
	svc := &Service{
		Enabled: cfg.Enabled,
		L1:      noopExactCache{},
		L2:      noopTranslationMemory{},
	}

	if !cfg.Enabled {
		return svc, nil
	}

	if err := ensureDBDir(cfg.DBPath); err != nil {
		return nil, fmt.Errorf("prepare cache db path: %w", err)
	}

	db, err := rain.Open("sqlite", cfg.DBPath+"?_fk=1")
	if err != nil {
		return nil, fmt.Errorf("open sqlite cache db: %w", err)
	}

	tableExists, err := checkTableExists(db, "translation_memory_entries")
	if err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("check tm table exists: %w", err)
	}
	if tableExists {
		if err := ensureTMTableConstraints(db); err != nil {
			_ = db.Close()
			return nil, fmt.Errorf("enforce tm table constraints (pre-migrate): %w", err)
		}
	}

	if err := migrateSchema(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("migrate cache schema: %w", err)
	}

	if err := ensureTMTableConstraints(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("enforce tm table constraints: %w", err)
	}

	svc.db = db
	if cfg.L1.Enabled {
		svc.L1 = &exactSQLiteStore{db: db, maxItems: cfg.L1.MaxItems}
	}
	if cfg.L2.Enabled {
		autoAcceptThreshold := cfg.L2.AutoAcceptThreshold
		if autoAcceptThreshold <= 0 {
			autoAcceptThreshold = config.DefaultCacheL2AutoAcceptThreshold
		}
		svc.L2 = &tmSQLiteStore{
			db:                  db,
			autoAcceptThreshold: autoAcceptThreshold,
		}
	}
	if cfg.RAG.Enabled {
		svc.Retriever = noopRetriever{}
	}

	return svc, nil
}

// Close closes underlying DB resources.
func (s *Service) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	if err := s.db.Close(); err != nil && !errors.Is(err, sql.ErrConnDone) {
		return fmt.Errorf("close sqlite cache db: %w", err)
	}
	return nil
}

func ensureDBDir(dbPath string) error {
	dir := filepath.Dir(dbPath)
	if dir == "." || dir == "" {
		return nil
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return nil
}

func checkTableExists(db *rain.DB, tableName string) (bool, error) {
	var count int
	err := db.QueryRow(
		context.Background(),
		"SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?",
		tableName,
	).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func migrateSchema(db *rain.DB) error {
	ctx := context.Background()

	statements := []string{
		`CREATE TABLE IF NOT EXISTS "exact_cache_entries" (
			"id" INTEGER PRIMARY KEY AUTOINCREMENT,
			"cache_key" TEXT NOT NULL,
			"source_locale" TEXT NOT NULL,
			"target_locale" TEXT NOT NULL,
			"provider" TEXT NOT NULL,
			"model" TEXT NOT NULL,
			"source_hash" TEXT NOT NULL,
			"value" TEXT NOT NULL,
			"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_exact_cache_key ON exact_cache_entries(cache_key)`,
		`CREATE INDEX IF NOT EXISTS idx_exact_source_locale ON exact_cache_entries(source_locale)`,
		`CREATE INDEX IF NOT EXISTS idx_exact_target_locale ON exact_cache_entries(target_locale)`,
		`CREATE INDEX IF NOT EXISTS idx_exact_provider ON exact_cache_entries(provider)`,
		`CREATE INDEX IF NOT EXISTS idx_exact_model ON exact_cache_entries(model)`,
		`CREATE INDEX IF NOT EXISTS idx_exact_source_hash ON exact_cache_entries(source_hash)`,
		`CREATE TABLE IF NOT EXISTS "translation_memory_entries" (
			"id" INTEGER PRIMARY KEY AUTOINCREMENT,
			"source_locale" TEXT NOT NULL,
			"target_locale" TEXT NOT NULL,
			"source_text" TEXT NOT NULL,
			"translated_text" TEXT NOT NULL,
			"score" REAL NOT NULL DEFAULT 0,
			"provenance" TEXT NOT NULL DEFAULT 'unknown' ` + TMProvenanceCheck + `,
			"source" TEXT NOT NULL DEFAULT 'unknown' ` + TMSourceCheck + `,
			"created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			"updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_tm_locales_text ON translation_memory_entries(source_locale, target_locale, source_text)`,
		`CREATE INDEX IF NOT EXISTS idx_tm_provenance ON translation_memory_entries(provenance)`,
		`CREATE INDEX IF NOT EXISTS idx_tm_source ON translation_memory_entries(source)`,
		`CREATE INDEX IF NOT EXISTS idx_tm_source_locale ON translation_memory_entries(source_locale)`,
		`CREATE INDEX IF NOT EXISTS idx_tm_target_locale ON translation_memory_entries(target_locale)`,
	}

	for _, statement := range statements {
		if _, err := db.Exec(ctx, statement); err != nil {
			return fmt.Errorf("apply cache schema statement: %w", err)
		}
	}

	return nil
}

func ensureTMTableConstraints(db *rain.DB) error {
	const (
		provenanceCheck = TMProvenanceCheck
		sourceCheck     = TMSourceCheck
		uniqueIdxCheck  = "unique"
		localesTextIdx  = "idx_tm_locales_text"
	)

	ctx := context.Background()

	var createSQL string
	err := db.QueryRow(ctx, "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", "translation_memory_entries").Scan(&createSQL)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("inspect translation_memory_entries schema: %w", err)
	}
	if createSQL == "" {
		return nil
	}

	schemaSQL := strings.ToLower(strings.TrimSpace(createSQL))
	hasChecks := strings.Contains(schemaSQL, provenanceCheck) && strings.Contains(schemaSQL, sourceCheck)

	var idxSQL string
	err = db.QueryRow(ctx, "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?", localesTextIdx).Scan(&idxSQL)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("inspect %s schema: %w", localesTextIdx, err)
	}
	hasUniqueIdx := strings.Contains(strings.ToLower(idxSQL), uniqueIdxCheck)

	if hasChecks && hasUniqueIdx {
		return nil
	}

	type sqliteCol struct {
		CID       int
		Name      string
		Type      string
		NotNull   int
		DfltValue sql.NullString
		PK        int
		Hidden    int
	}

	colRows, err := db.Query(ctx, `PRAGMA table_xinfo("translation_memory_entries")`)
	if err != nil {
		return fmt.Errorf("inspect tm columns: %w", err)
	}
	defer func() { _ = colRows.Close() }()

	var cols []sqliteCol
	for colRows.Next() {
		var col sqliteCol
		if err := colRows.Scan(&col.CID, &col.Name, &col.Type, &col.NotNull, &col.DfltValue, &col.PK, &col.Hidden); err != nil {
			return fmt.Errorf("scan tm column info: %w", err)
		}
		cols = append(cols, col)
	}
	if err := colRows.Err(); err != nil {
		return fmt.Errorf("read tm column info: %w", err)
	}
	if len(cols) == 0 {
		return fmt.Errorf("translation_memory_entries has no columns")
	}

	var insertCols, selectExprs []string
	for _, c := range cols {
		if c.Hidden != 0 {
			continue
		}
		quoted := `"` + c.Name + `"`
		insertCols = append(insertCols, quoted)
		switch strings.ToLower(c.Name) {
		case "provenance":
			selectExprs = append(selectExprs, `CASE
  WHEN LOWER(TRIM(COALESCE("provenance", ''))) IN ('curated','draft','llm','tms','unknown')
    THEN LOWER(TRIM("provenance"))
  ELSE 'unknown'
END`)
		case "source":
			selectExprs = append(selectExprs, `CASE
  WHEN LOWER(TRIM(COALESCE("source", ''))) IN ('run','sync_pull','sync_push','manual','import','legacy','unknown')
    THEN LOWER(TRIM("source"))
  ELSE 'unknown'
END`)
		default:
			selectExprs = append(selectExprs, quoted)
		}
	}
	colList := strings.Join(insertCols, ", ")
	selList := strings.Join(selectExprs, ", ")

	type schemaObj struct {
		SQL string
	}

	objRows, err := db.Query(ctx, `SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('index','trigger') AND sql IS NOT NULL`, "translation_memory_entries")
	if err != nil {
		return fmt.Errorf("inspect tm indexes/triggers: %w", err)
	}
	defer func() { _ = objRows.Close() }()

	var existingObjs []schemaObj
	for objRows.Next() {
		var obj schemaObj
		if err := objRows.Scan(&obj.SQL); err != nil {
			return fmt.Errorf("scan tm schema object: %w", err)
		}
		existingObjs = append(existingObjs, obj)
	}
	if err := objRows.Err(); err != nil {
		return fmt.Errorf("read tm schema objects: %w", err)
	}

	newCreateSQL := createSQL
	if !strings.Contains(strings.ToLower(newCreateSQL), provenanceCheck) {
		newCreateSQL, err = patchColumnConstraint(newCreateSQL, "provenance", "CHECK (provenance IN ('curated','draft','llm','tms','unknown'))")
		if err != nil {
			return fmt.Errorf("patch provenance constraint: %w", err)
		}
	}
	if !strings.Contains(strings.ToLower(newCreateSQL), sourceCheck) {
		newCreateSQL, err = patchColumnConstraint(newCreateSQL, "source", "CHECK (source IN ('run','sync_pull','sync_push','manual','import','legacy','unknown'))")
		if err != nil {
			return fmt.Errorf("patch source constraint: %w", err)
		}
	}
	newCreateSQL = strings.Replace(newCreateSQL, "translation_memory_entries", "translation_memory_entries_new", 1)

	statements := []string{
		newCreateSQL,
		fmt.Sprintf(`INSERT INTO "translation_memory_entries_new" (%s) SELECT %s FROM "translation_memory_entries"`, colList, selList),
		`DROP TABLE "translation_memory_entries"`,
		`ALTER TABLE "translation_memory_entries_new" RENAME TO "translation_memory_entries"`,
	}
	for _, statement := range statements {
		if _, err := db.Exec(ctx, statement); err != nil {
			return fmt.Errorf("apply tm constraint migration statement: %w", err)
		}
	}

	for _, obj := range existingObjs {
		sql := obj.SQL
		lower := strings.ToLower(sql)
		if strings.Contains(lower, localesTextIdx) {
			continue
		}
		if _, err := db.Exec(ctx, sql); err != nil {
			return fmt.Errorf("replay tm schema object: %w", err)
		}
	}

	indexStatements := []string{
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_tm_locales_text ON translation_memory_entries(source_locale, target_locale, source_text)`,
		`CREATE INDEX IF NOT EXISTS idx_tm_provenance ON translation_memory_entries(provenance)`,
		`CREATE INDEX IF NOT EXISTS idx_tm_source ON translation_memory_entries(source)`,
	}
	for _, statement := range indexStatements {
		if _, err := db.Exec(ctx, statement); err != nil {
			return fmt.Errorf("apply tm index statement: %w", err)
		}
	}

	return nil
}

// patchColumnConstraint appends a CHECK constraint to a column definition
// inside a CREATE TABLE statement. It finds the column by name and appends
// the constraint text after the existing column definition.
func patchColumnConstraint(createSQL, column, constraint string) (string, error) {
	lines := strings.Split(createSQL, "\n")
	target := strings.ToLower(column)
	found := false
	for i, line := range lines {
		trimmed := strings.TrimSpace(strings.ToLower(line))
		col := strings.TrimPrefix(trimmed, `"`)
		if strings.HasPrefix(col, target+" ") || strings.HasPrefix(col, target+`"`) {
			found = true
			clean := strings.TrimRight(lines[i], ", \t")
			sep := ","
			if !strings.HasSuffix(strings.TrimRight(line, " \t"), ",") {
				sep = ""
			}
			lines[i] = clean + " " + constraint + sep
			break
		}
	}
	if !found {
		return "", fmt.Errorf("column %q not found in CREATE TABLE statement", column)
	}
	return strings.Join(lines, "\n"), nil
}
