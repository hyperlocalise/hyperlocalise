package translation

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"

	translationapp "github.com/quiet-circles/hyperlocalise/internal/translation/app"
	"github.com/quiet-circles/hyperlocalise/internal/translation/objectstore"
	"github.com/quiet-circles/hyperlocalise/internal/translation/store"
	commonv1 "github.com/quiet-circles/hyperlocalise/pkg/api/proto/hyperlocalise/common/v1"
	translationv1 "github.com/quiet-circles/hyperlocalise/pkg/api/proto/hyperlocalise/translation/v1"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/sqlitedialect"
	"github.com/uptrace/bun/driver/sqliteshim"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestListTranslationJobsPaginatesWithOpaqueCursor(t *testing.T) {
	t.Parallel()

	svc, db := newTranslationTestService(t)
	base := time.Unix(1700000000, 0).UTC()
	seedTranslationJob(t, db, "job-c", "proj-1", store.JobTypeString, store.JobStatusQueued, base.Add(2*time.Minute))
	seedTranslationJob(t, db, "job-b", "proj-1", store.JobTypeString, store.JobStatusQueued, base.Add(1*time.Minute))
	seedTranslationJob(t, db, "job-a", "proj-1", store.JobTypeString, store.JobStatusQueued, base.Add(1*time.Minute))

	firstPage, err := svc.ListTranslationJobs(context.Background(), &translationv1.ListTranslationJobsRequest{
		ProjectId: "proj-1",
		Page:      &commonv1.PageRequest{PageSize: 2},
	})
	if err != nil {
		t.Fatalf("ListTranslationJobs(first page) returned error: %v", err)
	}
	if got := jobIDs(firstPage.Jobs); len(got) != 2 || got[0] != "job-c" || got[1] != "job-b" {
		t.Fatalf("unexpected first page jobs: %v", got)
	}
	if firstPage.GetPage().GetNextPageToken() == "" {
		t.Fatal("expected next_page_token on first page")
	}

	secondPage, err := svc.ListTranslationJobs(context.Background(), &translationv1.ListTranslationJobsRequest{
		ProjectId: "proj-1",
		Page: &commonv1.PageRequest{
			PageSize:  2,
			PageToken: firstPage.GetPage().GetNextPageToken(),
		},
	})
	if err != nil {
		t.Fatalf("ListTranslationJobs(second page) returned error: %v", err)
	}
	if got := jobIDs(secondPage.Jobs); len(got) != 1 || got[0] != "job-a" {
		t.Fatalf("unexpected second page jobs: %v", got)
	}
	if secondPage.GetPage().GetNextPageToken() != "" {
		t.Fatalf("expected final page to have empty next_page_token, got %q", secondPage.GetPage().GetNextPageToken())
	}
}

func TestListTranslationJobsRejectsMalformedPageToken(t *testing.T) {
	t.Parallel()

	svc, _ := newTranslationTestService(t)

	_, err := svc.ListTranslationJobs(context.Background(), &translationv1.ListTranslationJobsRequest{
		ProjectId: "proj-1",
		Page: &commonv1.PageRequest{
			PageSize:  2,
			PageToken: "not-base64",
		},
	})
	if err == nil {
		t.Fatal("expected invalid page token error")
	}
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("expected InvalidArgument, got %v", status.Code(err))
	}
}

func TestListTranslationJobsRejectsPageTokenForDifferentFilters(t *testing.T) {
	t.Parallel()

	svc, db := newTranslationTestService(t)
	base := time.Unix(1700000000, 0).UTC()
	seedTranslationJob(t, db, "job-2", "proj-1", store.JobTypeString, store.JobStatusQueued, base.Add(2*time.Minute))
	seedTranslationJob(t, db, "job-1", "proj-1", store.JobTypeString, store.JobStatusQueued, base.Add(1*time.Minute))

	firstPage, err := svc.ListTranslationJobs(context.Background(), &translationv1.ListTranslationJobsRequest{
		ProjectId: "proj-1",
		Type:      translationv1.TranslationJob_TYPE_STRING,
		Page:      &commonv1.PageRequest{PageSize: 1},
	})
	if err != nil {
		t.Fatalf("ListTranslationJobs(seed page) returned error: %v", err)
	}

	_, err = svc.ListTranslationJobs(context.Background(), &translationv1.ListTranslationJobsRequest{
		ProjectId: "proj-1",
		Type:      translationv1.TranslationJob_TYPE_FILE,
		Page: &commonv1.PageRequest{
			PageSize:  1,
			PageToken: firstPage.GetPage().GetNextPageToken(),
		},
	})
	if err == nil {
		t.Fatal("expected invalid page token error for mismatched filters")
	}
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("expected InvalidArgument, got %v", status.Code(err))
	}
}

func newTranslationTestService(t *testing.T) (*Service, *bun.DB) {
	t.Helper()

	dsn := fmt.Sprintf("file:%s-%d?mode=memory&cache=shared", t.Name(), time.Now().UnixNano())
	sqldb, err := sql.Open(sqliteshim.ShimName, dsn)
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
	seedTranslationProject(t, db, "proj-1")

	repository := store.NewRepository(db)
	app := translationapp.NewService(repository, "stub", "memory", objectstore.NewMemoryStore(), "translations")
	return NewService(app), db
}

func createTranslationTables(t *testing.T, db *bun.DB) error {
	t.Helper()

	statements := []string{
		`PRAGMA foreign_keys = ON`,
		`CREATE TABLE IF NOT EXISTS translation_projects (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT NOT NULL,
			translation_context TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL,
			updated_at TIMESTAMP NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS translation_jobs (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL REFERENCES translation_projects(id) ON DELETE CASCADE,
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
			project_id TEXT NOT NULL REFERENCES translation_projects(id) ON DELETE CASCADE,
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
			project_id TEXT NOT NULL REFERENCES translation_projects(id) ON DELETE CASCADE,
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
			file_id TEXT NOT NULL REFERENCES translation_files(id) ON DELETE CASCADE,
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

func seedTranslationProject(t *testing.T, db *bun.DB, id string) {
	t.Helper()

	now := time.Unix(1700000000, 0).UTC()
	project := &store.TranslationProjectModel{
		ID:          id,
		Name:        "Test Project",
		Description: "test",
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if _, err := db.NewInsert().Model(project).Exec(context.Background()); err != nil {
		t.Fatalf("insert translation project %s: %v", id, err)
	}
}

func seedTranslationJob(t *testing.T, db *bun.DB, id, projectID, jobType, jobStatus string, createdAt time.Time) {
	t.Helper()

	inputPayload, err := translationapp.EncodeProto(&translationv1.StringTranslationJobInput{
		SourceText:    "hello",
		SourceLocale:  "en",
		TargetLocales: []string{"fr"},
	})
	if err != nil {
		t.Fatalf("encode string input payload: %v", err)
	}

	job := &store.TranslationJobModel{
		ID:        id,
		ProjectID: projectID,
		Type:      jobType,
		Status:    jobStatus,
		InputKind: store.JobTypeString,
		CreatedAt: createdAt,
		UpdatedAt: createdAt,
	}
	if _, err := db.ExecContext(
		context.Background(),
		`INSERT INTO translation_jobs
			(id, project_id, type, status, input_kind, input_payload, checkpoint_payload, outcome_kind, outcome_payload, last_error, created_at, updated_at, completed_at)
		VALUES (?, ?, ?, ?, ?, ?, NULL, '', NULL, '', ?, ?, NULL)`,
		job.ID,
		job.ProjectID,
		job.Type,
		job.Status,
		job.InputKind,
		string(inputPayload),
		job.CreatedAt,
		job.UpdatedAt,
	); err != nil {
		t.Fatalf("insert translation job %s: %v", id, err)
	}
}

func jobIDs(jobs []*translationv1.TranslationJob) []string {
	ids := make([]string, 0, len(jobs))
	for _, job := range jobs {
		ids = append(ids, job.GetId())
	}
	return ids
}
