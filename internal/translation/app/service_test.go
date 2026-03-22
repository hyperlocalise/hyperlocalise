package app

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	"github.com/quiet-circles/hyperlocalise/internal/translation/objectstore"
	"github.com/quiet-circles/hyperlocalise/internal/translation/store"
	translationv1 "github.com/quiet-circles/hyperlocalise/pkg/api/proto/hyperlocalise/translation/v1"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/sqlitedialect"
	"github.com/uptrace/bun/driver/sqliteshim"
)

func TestCreateJobPersistsOutboxWithoutPublishingInline(t *testing.T) {
	t.Parallel()

	sqldb, err := sql.Open(sqliteshim.ShimName, "file::memory:?cache=shared")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() {
		_ = sqldb.Close()
	})

	db := bun.NewDB(sqldb, sqlitedialect.New())
	t.Cleanup(func() {
		_ = db.Close()
	})

	if err := createTranslationTables(t, db); err != nil {
		t.Fatalf("create translation tables: %v", err)
	}

	repository := store.NewRepository(db)
	service := NewService(repository, "stub", "memory", objectstore.NewMemoryStore(), "translations")
	service.clock = func() time.Time { return time.Unix(1700000000, 0).UTC() }

	record, err := service.CreateJob(context.Background(), &translationv1.CreateTranslationJobRequest{
		ProjectId: "proj-1",
		Input: &translationv1.CreateTranslationJobRequest_StringInput{
			StringInput: &translationv1.StringTranslationJobInput{
				SourceText:    "Hello",
				SourceLocale:  "en",
				TargetLocales: []string{"fr"},
			},
		},
	})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}
	if record.Status != store.JobStatusQueued {
		t.Fatalf("expected queued job, got %s", record.Status)
	}

	outboxCount, err := db.NewSelect().Model((*store.OutboxEventModel)(nil)).Count(context.Background())
	if err != nil {
		t.Fatalf("count outbox events: %v", err)
	}
	if outboxCount != 1 {
		t.Fatalf("expected 1 outbox event, got %d", outboxCount)
	}

	event := &store.OutboxEventModel{}
	if err := db.NewSelect().Model(event).Limit(1).Scan(context.Background()); err != nil {
		t.Fatalf("select outbox event: %v", err)
	}
	if event.Status != store.OutboxStatusPending {
		t.Fatalf("expected pending execution status, got %s", event.Status)
	}
	if event.DeliveryStatus != store.OutboxDeliveryStatusPending {
		t.Fatalf("expected pending delivery status, got %s", event.DeliveryStatus)
	}
	if event.Topic != "translation.job.queued" {
		t.Fatalf("unexpected topic: %s", event.Topic)
	}
}

func TestCreateFileUploadFinalizeAndCreateFileJob(t *testing.T) {
	t.Parallel()

	sqldb, err := sql.Open(sqliteshim.ShimName, "file::memory:?cache=shared")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() {
		_ = sqldb.Close()
	})

	db := bun.NewDB(sqldb, sqlitedialect.New())
	t.Cleanup(func() {
		_ = db.Close()
	})

	if err := createTranslationTables(t, db); err != nil {
		t.Fatalf("create translation tables: %v", err)
	}

	repository := store.NewRepository(db)
	memStore := objectstore.NewMemoryStore()
	service := NewService(repository, "stub", "memory", memStore, "translations")
	service.clock = func() time.Time { return time.Unix(1700000000, 0).UTC() }

	uploadID, uploadURL, expiresAt, err := service.CreateFileUpload(context.Background(), &translationv1.CreateTranslationFileUploadRequest{
		ProjectId:    "proj-1",
		Path:         "content/messages.json",
		FileFormat:   translationv1.FileTranslationJobInput_FILE_FORMAT_JSON,
		SourceLocale: "en",
		ContentType:  "application/json",
	})
	if err != nil {
		t.Fatalf("CreateFileUpload returned error: %v", err)
	}
	if uploadID == "" || uploadURL == "" || expiresAt.IsZero() {
		t.Fatalf("unexpected upload response: %q %q %s", uploadID, uploadURL, expiresAt)
	}
	if err := memStore.PutObject(context.Background(), objectstore.PutRequest{
		Object: objectstore.ObjectRef{
			Driver: "memory",
			Bucket: "translations",
			Key:    "projects/proj-1/source/" + uploadID + "/content/messages.json",
		},
		ContentType: "application/json",
		Body:        []byte(`{"hello":"Hello"}`),
	}); err != nil {
		t.Fatalf("seed uploaded object: %v", err)
	}

	file, err := service.FinalizeFileUpload(context.Background(), "proj-1", uploadID)
	if err != nil {
		t.Fatalf("FinalizeFileUpload returned error: %v", err)
	}
	if file.Path != "content/messages.json" {
		t.Fatalf("unexpected file path: %s", file.Path)
	}

	nodes, err := service.ListFileTree(context.Background(), "proj-1", "content")
	if err != nil {
		t.Fatalf("ListFileTree returned error: %v", err)
	}
	if len(nodes) == 0 {
		t.Fatal("expected tree nodes")
	}

	downloadURL, _, err := service.GetFileDownload(context.Background(), "proj-1", file.ID, "")
	if err != nil {
		t.Fatalf("GetFileDownload returned error: %v", err)
	}
	if downloadURL == "" {
		t.Fatal("expected download URL")
	}

	job, err := service.CreateJob(context.Background(), &translationv1.CreateTranslationJobRequest{
		ProjectId: "proj-1",
		Input: &translationv1.CreateTranslationJobRequest_FileInput{
			FileInput: &translationv1.FileTranslationJobInput{
				SourceFileId:  file.ID,
				FileFormat:    translationv1.FileTranslationJobInput_FILE_FORMAT_JSON,
				SourceLocale:  "en",
				TargetLocales: []string{"fr"},
			},
		},
	})
	if err != nil {
		t.Fatalf("CreateJob(file) returned error: %v", err)
	}
	if job.Type != store.JobTypeFile {
		t.Fatalf("expected file job type, got %s", job.Type)
	}
}

func TestFinalizeFileUploadRejectsMissingObject(t *testing.T) {
	t.Parallel()

	sqldb, err := sql.Open(sqliteshim.ShimName, "file::memory:?cache=shared")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() {
		_ = sqldb.Close()
	})

	db := bun.NewDB(sqldb, sqlitedialect.New())
	t.Cleanup(func() {
		_ = db.Close()
	})

	if err := createTranslationTables(t, db); err != nil {
		t.Fatalf("create translation tables: %v", err)
	}

	repository := store.NewRepository(db)
	service := NewService(repository, "stub", "memory", objectstore.NewMemoryStore(), "translations")
	service.clock = func() time.Time { return time.Unix(1700000000, 0).UTC() }

	uploadID, _, _, err := service.CreateFileUpload(context.Background(), &translationv1.CreateTranslationFileUploadRequest{
		ProjectId:    "proj-1",
		Path:         "content/messages.json",
		FileFormat:   translationv1.FileTranslationJobInput_FILE_FORMAT_JSON,
		SourceLocale: "en",
		ContentType:  "application/json",
	})
	if err != nil {
		t.Fatalf("CreateFileUpload returned error: %v", err)
	}

	_, err = service.FinalizeFileUpload(context.Background(), "proj-1", uploadID)
	if err == nil || !strings.Contains(err.Error(), "uploaded object is missing") {
		t.Fatalf("expected missing uploaded object error, got %v", err)
	}
}

func createTranslationTables(t *testing.T, db *bun.DB) error {
	t.Helper()

	statements := []string{
		`CREATE TABLE IF NOT EXISTS translation_jobs (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL,
			type TEXT NOT NULL,
			status TEXT NOT NULL,
			input_kind TEXT NOT NULL,
			input_payload TEXT NOT NULL,
			checkpoint_payload TEXT,
			outcome_kind TEXT,
			outcome_payload TEXT,
			last_error TEXT,
			created_at TIMESTAMP NOT NULL,
			updated_at TIMESTAMP NOT NULL,
			completed_at TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS outbox_events (
			id TEXT PRIMARY KEY,
			topic TEXT NOT NULL,
			aggregate_id TEXT NOT NULL,
			payload TEXT NOT NULL,
			headers TEXT NOT NULL,
			status TEXT NOT NULL,
			attempt_count INTEGER NOT NULL,
			max_attempts INTEGER NOT NULL,
			next_attempt_at TIMESTAMP NOT NULL,
			last_error TEXT,
			claimed_by TEXT,
			claimed_at TIMESTAMP,
			claim_expires_at TIMESTAMP,
			created_at TIMESTAMP NOT NULL,
			updated_at TIMESTAMP NOT NULL,
			processed_at TIMESTAMP,
			dead_lettered_at TIMESTAMP,
			delivery_status TEXT NOT NULL,
			delivery_attempt_count INTEGER NOT NULL,
			delivery_max_attempts INTEGER NOT NULL,
			delivery_next_attempt_at TIMESTAMP NOT NULL,
			delivery_last_error TEXT,
			delivery_claimed_by TEXT,
			delivery_claimed_at TIMESTAMP,
			delivery_claim_expires_at TIMESTAMP,
			published_at TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS translation_file_uploads (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL,
			path TEXT NOT NULL,
			file_format TEXT NOT NULL,
			source_locale TEXT NOT NULL,
			content_type TEXT NOT NULL,
			size_bytes INTEGER,
			checksum_sha256 TEXT NOT NULL,
			storage_driver TEXT NOT NULL,
			bucket TEXT NOT NULL,
			object_key TEXT NOT NULL,
			status TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL,
			updated_at TIMESTAMP NOT NULL,
			expires_at TIMESTAMP NOT NULL,
			finalized_at TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS translation_files (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL,
			path TEXT NOT NULL,
			file_format TEXT NOT NULL,
			source_locale TEXT NOT NULL,
			content_type TEXT NOT NULL,
			size_bytes INTEGER NOT NULL,
			checksum_sha256 TEXT NOT NULL,
			storage_driver TEXT NOT NULL,
			bucket TEXT NOT NULL,
			object_key TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL,
			updated_at TIMESTAMP NOT NULL,
			UNIQUE(project_id, path)
		)`,
		`CREATE TABLE IF NOT EXISTS translation_file_variants (
			id TEXT PRIMARY KEY,
			file_id TEXT NOT NULL,
			locale TEXT NOT NULL,
			path TEXT NOT NULL,
			content_type TEXT NOT NULL,
			size_bytes INTEGER NOT NULL,
			checksum_sha256 TEXT NOT NULL,
			storage_driver TEXT NOT NULL,
			bucket TEXT NOT NULL,
			object_key TEXT NOT NULL,
			last_job_id TEXT NOT NULL,
			status TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL,
			updated_at TIMESTAMP NOT NULL,
			UNIQUE(file_id, locale)
		)`,
	}

	for _, statement := range statements {
		if _, err := db.ExecContext(context.Background(), statement); err != nil {
			return err
		}
	}
	return nil
}
