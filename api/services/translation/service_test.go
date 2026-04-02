package translation

import (
	"context"
	"fmt"
	"testing"
	"time"

	translationapp "github.com/hyperlocalise/hyperlocalise/internal/translation/app"
	"github.com/hyperlocalise/hyperlocalise/internal/translation/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/translation/store"
	commonv1 "github.com/hyperlocalise/hyperlocalise/pkg/api/proto/hyperlocalise/common/v1"
	translationv1 "github.com/hyperlocalise/hyperlocalise/pkg/api/proto/hyperlocalise/translation/v1"
	"github.com/hyperlocalise/rain-orm/pkg/rain"
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

func TestGlossaryTermGRPCAndBulkEndpoints(t *testing.T) {
	t.Parallel()

	svc, _ := newTranslationTestService(t)

	createResp, err := svc.CreateGlossaryTerm(context.Background(), &translationv1.CreateGlossaryTermRequest{
		ProjectId: "proj-1",
		Term: &translationv1.GlossaryTermInput{
			SourceLocale: "en",
			TargetLocale: "fr",
			SourceTerm:   "balance",
			TargetTerm:   "solde",
		},
	})
	if err != nil {
		t.Fatalf("CreateGlossaryTerm returned error: %v", err)
	}
	if createResp.GetTerm().GetId() == "" {
		t.Fatal("expected created glossary term id")
	}

	_, err = svc.CreateGlossaryTerm(context.Background(), &translationv1.CreateGlossaryTermRequest{
		ProjectId: "proj-1",
		Term: &translationv1.GlossaryTermInput{
			SourceLocale: "en",
			TargetLocale: "fr",
			SourceTerm:   "balance",
			TargetTerm:   "solde",
		},
	})
	if err == nil || status.Code(err) != codes.AlreadyExists {
		t.Fatalf("expected AlreadyExists on duplicate create, got %v", err)
	}

	listResp, err := svc.ListGlossaryTerms(context.Background(), &translationv1.ListGlossaryTermsRequest{
		ProjectId:    "proj-1",
		SourceLocale: strPtr("en"),
		TargetLocale: strPtr("fr"),
		Page:         &commonv1.PageRequest{PageSize: 50},
	})
	if err != nil {
		t.Fatalf("ListGlossaryTerms returned error: %v", err)
	}
	if len(listResp.GetTerms()) != 1 {
		t.Fatalf("expected 1 glossary term, got %d", len(listResp.GetTerms()))
	}

	bulkResp, err := svc.BulkUpsertGlossaryTerms(context.Background(), &translationv1.BulkUpsertGlossaryTermsRequest{
		ProjectId: "proj-1",
		Terms: []*translationv1.GlossaryTermInput{
			{
				SourceLocale: "en",
				TargetLocale: "fr",
				SourceTerm:   "balance",
				TargetTerm:   "solde courant",
			},
			{
				SourceLocale: "en",
				TargetLocale: "fr",
				SourceTerm:   "statement",
				TargetTerm:   "releve",
			},
		},
	})
	if err != nil {
		t.Fatalf("BulkUpsertGlossaryTerms returned error: %v", err)
	}
	if len(bulkResp.GetTerms()) != 2 {
		t.Fatalf("expected 2 bulk upserted terms, got %d", len(bulkResp.GetTerms()))
	}

	deleteResp, err := svc.BulkDeleteGlossaryTerms(context.Background(), &translationv1.BulkDeleteGlossaryTermsRequest{
		ProjectId: "proj-1",
		Ids:       []string{createResp.GetTerm().GetId(), "missing"},
	})
	if err != nil {
		t.Fatalf("BulkDeleteGlossaryTerms returned error: %v", err)
	}
	if len(deleteResp.GetDeletedIds()) != 1 || deleteResp.GetDeletedIds()[0] != createResp.GetTerm().GetId() {
		t.Fatalf("unexpected deleted ids: %v", deleteResp.GetDeletedIds())
	}
}

func TestListGlossaryTermsPaginatesWithOpaqueCursor(t *testing.T) {
	t.Parallel()

	svc, _ := newTranslationTestService(t)
	ctx := context.Background()

	for _, sourceTerm := range []string{"alpha", "beta", "gamma"} {
		_, err := svc.CreateGlossaryTerm(ctx, &translationv1.CreateGlossaryTermRequest{
			ProjectId: "proj-1",
			Term: &translationv1.GlossaryTermInput{
				SourceLocale: "en",
				TargetLocale: "fr",
				SourceTerm:   sourceTerm,
				TargetTerm:   sourceTerm + "-fr",
			},
		})
		if err != nil {
			t.Fatalf("CreateGlossaryTerm(%s) returned error: %v", sourceTerm, err)
		}
	}

	firstPage, err := svc.ListGlossaryTerms(ctx, &translationv1.ListGlossaryTermsRequest{
		ProjectId:    "proj-1",
		SourceLocale: strPtr("en"),
		TargetLocale: strPtr("fr"),
		Page:         &commonv1.PageRequest{PageSize: 2},
	})
	if err != nil {
		t.Fatalf("ListGlossaryTerms(first page) returned error: %v", err)
	}
	if len(firstPage.GetTerms()) != 2 {
		t.Fatalf("expected 2 terms on first page, got %d", len(firstPage.GetTerms()))
	}
	if firstPage.GetPage().GetNextPageToken() == "" {
		t.Fatal("expected next_page_token on first page")
	}

	secondPage, err := svc.ListGlossaryTerms(ctx, &translationv1.ListGlossaryTermsRequest{
		ProjectId:    "proj-1",
		SourceLocale: strPtr("en"),
		TargetLocale: strPtr("fr"),
		Page: &commonv1.PageRequest{
			PageSize:  2,
			PageToken: firstPage.GetPage().GetNextPageToken(),
		},
	})
	if err != nil {
		t.Fatalf("ListGlossaryTerms(second page) returned error: %v", err)
	}
	if len(secondPage.GetTerms()) != 1 {
		t.Fatalf("expected 1 term on second page, got %d", len(secondPage.GetTerms()))
	}
	if secondPage.GetPage().GetNextPageToken() != "" {
		t.Fatalf("expected empty next_page_token on final page, got %q", secondPage.GetPage().GetNextPageToken())
	}
}

func newTranslationTestService(t *testing.T) (*Service, *rain.DB) {
	t.Helper()

	dsn := fmt.Sprintf("file:%s-%d?mode=memory&cache=shared", t.Name(), time.Now().UnixNano())
	db, err := rain.Open("sqlite", dsn)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
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

func createTranslationTables(t *testing.T, db *rain.DB) error {
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
		`CREATE TABLE IF NOT EXISTS translation_glossary_terms (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL REFERENCES translation_projects(id) ON DELETE CASCADE,
			source_locale TEXT NOT NULL,
			target_locale TEXT NOT NULL,
			source_term TEXT NOT NULL,
			target_term TEXT NOT NULL,
			description TEXT NOT NULL,
			part_of_speech TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL,
			updated_at TIMESTAMP NOT NULL,
			UNIQUE(project_id, source_locale, target_locale, source_term)
		)`,
	}

	for _, statement := range statements {
		if _, err := db.Exec(context.Background(), statement); err != nil {
			return err
		}
	}
	return nil
}

func strPtr(value string) *string {
	return &value
}

func seedTranslationProject(t *testing.T, db *rain.DB, id string) {
	t.Helper()

	now := time.Unix(1700000000, 0).UTC()
	project := &store.TranslationProjectModel{
		ID:                 id,
		Name:               "Test Project",
		Description:        "test",
		TranslationContext: "",
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	if _, err := db.Insert().Table(store.TranslationProjects).Model(project).Exec(context.Background()); err != nil {
		t.Fatalf("insert translation project %s: %v", id, err)
	}
}

func seedTranslationJob(t *testing.T, db *rain.DB, id, projectID, jobType, jobStatus string, createdAt time.Time) {
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
	if _, err := db.Exec(
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
