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

	"github.com/quiet-circles/hyperlocalise/pkg/i18nconfig"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
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

	db *gorm.DB
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

	db, err := gorm.Open(sqlite.Open(cfg.DBPath), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("open sqlite cache db: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("resolve sqlite sql db: %w", err)
	}
	applyConnPool(sqlDB, cfg)

	// Enforce CHECK constraints before AutoMigrate on existing tables so
	// GORM's internal copy step doesn't fail on legacy invalid values.
	if db.Migrator().HasTable(&TranslationMemoryEntry{}) {
		if err := ensureTMTableConstraints(db); err != nil {
			_ = sqlDB.Close()
			return nil, fmt.Errorf("enforce tm table constraints (pre-migrate): %w", err)
		}
	}

	if err := db.AutoMigrate(&ExactCacheEntry{}, &TranslationMemoryEntry{}); err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("migrate cache schema: %w", err)
	}

	// Run again after AutoMigrate to handle fresh tables where GORM tags
	// provide the constraints but the unique index may not exist yet.
	if err := ensureTMTableConstraints(db); err != nil {
		_ = sqlDB.Close()
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
	sqlDB, err := s.db.DB()
	if err != nil {
		return fmt.Errorf("resolve sqlite sql db: %w", err)
	}
	if closeErr := sqlDB.Close(); closeErr != nil && !errors.Is(closeErr, sql.ErrConnDone) {
		return fmt.Errorf("close sqlite cache db: %w", closeErr)
	}
	return nil
}

func applyConnPool(sqlDB *sql.DB, cfg config.CacheConfig) {
	sqlDB.SetMaxOpenConns(cfg.SQLite.MaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.SQLite.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(time.Duration(cfg.SQLite.ConnMaxLifetime) * time.Second)
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

func ensureTMTableConstraints(db *gorm.DB) error {
	const (
		provenanceCheck  = "check (provenance in ('curated','draft','llm','tms','unknown'))"
		sourceCheck      = "check (source in ('run','sync_pull','sync_push','manual','import','legacy','unknown'))"
		uniqueIdxCheck   = "unique"
		localesTextIndex = "idx_tm_locales_text"
	)

	var createSQL string
	if err := db.Raw("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", "translation_memory_entries").Scan(&createSQL).Error; err != nil {
		return fmt.Errorf("inspect translation_memory_entries schema: %w", err)
	}
	schemaSQL := strings.ToLower(strings.TrimSpace(createSQL))

	hasChecks := strings.Contains(schemaSQL, provenanceCheck) && strings.Contains(schemaSQL, sourceCheck)

	var idxSQL string
	if err := db.Raw("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?", localesTextIndex).Scan(&idxSQL).Error; err != nil {
		return fmt.Errorf("inspect %s schema: %w", localesTextIndex, err)
	}
	hasUniqueIdx := strings.Contains(strings.ToLower(idxSQL), uniqueIdxCheck)

	if hasChecks && hasUniqueIdx {
		return nil
	}

	return db.Transaction(func(tx *gorm.DB) error {
		// Discover columns dynamically so future model changes are preserved.
		type sqliteCol struct {
			Name   string `gorm:"column:name"`
			Hidden int    `gorm:"column:hidden"`
		}
		var cols []sqliteCol
		if err := tx.Raw(`PRAGMA table_xinfo("translation_memory_entries")`).Scan(&cols).Error; err != nil {
			return fmt.Errorf("inspect tm columns: %w", err)
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

		// Capture existing indexes and triggers so they can be replayed.
		type schemaObj struct {
			SQL string `gorm:"column:sql"`
		}
		var existingObjs []schemaObj
		if err := tx.Raw(`SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('index','trigger') AND sql IS NOT NULL`, "translation_memory_entries").Scan(&existingObjs).Error; err != nil {
			return fmt.Errorf("inspect tm indexes/triggers: %w", err)
		}

		// Patch the existing CREATE TABLE DDL to inject CHECK constraints.
		newCreateSQL := createSQL
		if !strings.Contains(strings.ToLower(newCreateSQL), provenanceCheck) {
			newCreateSQL = patchColumnConstraint(newCreateSQL, "provenance", "CHECK (provenance IN ('curated','draft','llm','tms','unknown'))")
		}
		if !strings.Contains(strings.ToLower(newCreateSQL), sourceCheck) {
			newCreateSQL = patchColumnConstraint(newCreateSQL, "source", "CHECK (source IN ('run','sync_pull','sync_push','manual','import','legacy','unknown'))")
		}
		// Point the DDL at the temp table name.
		newCreateSQL = strings.Replace(newCreateSQL, "translation_memory_entries", "translation_memory_entries_new", 1)

		if err := tx.Exec(newCreateSQL).Error; err != nil {
			return fmt.Errorf("create constrained tm table: %w", err)
		}

		copySQL := fmt.Sprintf(`INSERT INTO "translation_memory_entries_new" (%s) SELECT %s FROM "translation_memory_entries"`, colList, selList)
		if err := tx.Exec(copySQL).Error; err != nil {
			return fmt.Errorf("copy tm rows into constrained table: %w", err)
		}

		if err := tx.Exec(`DROP TABLE "translation_memory_entries"`).Error; err != nil {
			return fmt.Errorf("drop legacy tm table: %w", err)
		}
		if err := tx.Exec(`ALTER TABLE "translation_memory_entries_new" RENAME TO "translation_memory_entries"`).Error; err != nil {
			return fmt.Errorf("rename constrained tm table: %w", err)
		}

		// Replay captured indexes/triggers, replacing any non-unique
		// locales_text index with a unique one.
		for _, obj := range existingObjs {
			sql := obj.SQL
			lower := strings.ToLower(sql)
			if strings.Contains(lower, localesTextIndex) {
				continue // will be recreated as unique below
			}
			if err := tx.Exec(sql).Error; err != nil {
				return fmt.Errorf("replay tm schema object: %w", err)
			}
		}

		if err := tx.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tm_locales_text ON translation_memory_entries(source_locale, target_locale, source_text)`).Error; err != nil {
			return fmt.Errorf("create tm locales_text unique index: %w", err)
		}
		if err := tx.Exec(`CREATE INDEX IF NOT EXISTS idx_tm_provenance ON translation_memory_entries(provenance)`).Error; err != nil {
			return fmt.Errorf("create tm provenance index: %w", err)
		}
		if err := tx.Exec(`CREATE INDEX IF NOT EXISTS idx_tm_source ON translation_memory_entries(source)`).Error; err != nil {
			return fmt.Errorf("create tm source index: %w", err)
		}
		return nil
	})
}

// patchColumnConstraint appends a CHECK constraint to a column definition
// inside a CREATE TABLE statement. It finds the column by name and appends
// the constraint text after the existing column definition.
func patchColumnConstraint(createSQL, column, constraint string) string {
	lines := strings.Split(createSQL, "\n")
	target := strings.ToLower(column)
	for i, line := range lines {
		trimmed := strings.TrimSpace(strings.ToLower(line))
		// Match lines starting with the column name (possibly quoted).
		col := strings.TrimPrefix(trimmed, `"`)
		if strings.HasPrefix(col, target+" ") || strings.HasPrefix(col, target+`"`) {
			clean := strings.TrimRight(lines[i], ", \t")
			sep := ","
			if !strings.HasSuffix(strings.TrimRight(line, " \t"), ",") {
				sep = ""
			}
			lines[i] = clean + " " + constraint + sep
			break
		}
	}
	return strings.Join(lines, "\n")
}
