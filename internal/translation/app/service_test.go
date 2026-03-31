package app

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/translation/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/translation/store"
	translationv1 "github.com/hyperlocalise/hyperlocalise/pkg/api/proto/hyperlocalise/translation/v1"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/sqlitedialect"
	"github.com/uptrace/bun/driver/sqliteshim"
)

func TestCreateJobPersistsOutboxWithoutPublishingInline(t *testing.T) {
	t.Parallel()

	sqldb, err := sql.Open(sqliteshim.ShimName, testSQLiteDSN(t))
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
	projectID := createProjectForTest(t, service, "Project 1")

	record, err := service.CreateJob(context.Background(), &translationv1.CreateTranslationJobRequest{
		ProjectId: projectID,
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

	sqldb, err := sql.Open(sqliteshim.ShimName, testSQLiteDSN(t))
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
	projectID := createProjectForTest(t, service, "Project 1")

	uploadID, uploadURL, expiresAt, err := service.CreateFileUpload(context.Background(), &translationv1.CreateTranslationFileUploadRequest{
		ProjectId:    projectID,
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
			Key:    "projects/" + projectID + "/source/" + uploadID + "/content/messages.json",
		},
		ContentType: "application/json",
		Body:        []byte(`{"hello":"Hello"}`),
	}); err != nil {
		t.Fatalf("seed uploaded object: %v", err)
	}

	file, err := service.FinalizeFileUpload(context.Background(), projectID, uploadID)
	if err != nil {
		t.Fatalf("FinalizeFileUpload returned error: %v", err)
	}
	if file.Path != "content/messages.json" {
		t.Fatalf("unexpected file path: %s", file.Path)
	}

	nodes, err := service.ListFileTree(context.Background(), projectID, "content")
	if err != nil {
		t.Fatalf("ListFileTree returned error: %v", err)
	}
	if len(nodes) == 0 {
		t.Fatal("expected tree nodes")
	}

	downloadURL, _, err := service.GetFileDownload(context.Background(), projectID, file.ID, "")
	if err != nil {
		t.Fatalf("GetFileDownload returned error: %v", err)
	}
	if downloadURL == "" {
		t.Fatal("expected download URL")
	}

	job, err := service.CreateJob(context.Background(), &translationv1.CreateTranslationJobRequest{
		ProjectId: projectID,
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

	sqldb, err := sql.Open(sqliteshim.ShimName, testSQLiteDSN(t))
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
	projectID := createProjectForTest(t, service, "Project 1")

	uploadID, _, _, err := service.CreateFileUpload(context.Background(), &translationv1.CreateTranslationFileUploadRequest{
		ProjectId:    projectID,
		Path:         "content/messages.json",
		FileFormat:   translationv1.FileTranslationJobInput_FILE_FORMAT_JSON,
		SourceLocale: "en",
		ContentType:  "application/json",
	})
	if err != nil {
		t.Fatalf("CreateFileUpload returned error: %v", err)
	}

	_, err = service.FinalizeFileUpload(context.Background(), projectID, uploadID)
	if err == nil || !strings.Contains(err.Error(), "uploaded object is missing") {
		t.Fatalf("expected missing uploaded object error, got %v", err)
	}
}

func TestProjectCRUDAndChildValidation(t *testing.T) {
	t.Parallel()

	sqldb, err := sql.Open(sqliteshim.ShimName, testSQLiteDSN(t))
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

	if _, err := service.CreateJob(context.Background(), &translationv1.CreateTranslationJobRequest{
		ProjectId: "proj_missing",
		Input: &translationv1.CreateTranslationJobRequest_StringInput{
			StringInput: &translationv1.StringTranslationJobInput{
				SourceText:    "Hello",
				SourceLocale:  "en",
				TargetLocales: []string{"fr"},
			},
		},
	}); err == nil || !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected missing project error when creating job, got %v", err)
	}

	project, err := service.CreateProject(context.Background(), &translationv1.CreateProjectRequest{
		Name:               "Project 1",
		Description:        stringPtr("Original"),
		TranslationContext: stringPtr("Formal UI strings for finance users"),
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	if project.ID == "" {
		t.Fatal("expected project id")
	}

	fetched, err := service.GetProject(context.Background(), project.ID)
	if err != nil {
		t.Fatalf("GetProject returned error: %v", err)
	}
	if fetched.Name != "Project 1" {
		t.Fatalf("unexpected fetched project name: %s", fetched.Name)
	}
	if fetched.TranslationContext != "Formal UI strings for finance users" {
		t.Fatalf("unexpected fetched translation context: %q", fetched.TranslationContext)
	}

	updated, err := service.UpdateProject(context.Background(), &translationv1.UpdateProjectRequest{
		Id:                 project.ID,
		Name:               stringPtr("Project Renamed"),
		Description:        stringPtr(""),
		TranslationContext: stringPtr(""),
	})
	if err != nil {
		t.Fatalf("UpdateProject returned error: %v", err)
	}
	if updated.Name != "Project Renamed" {
		t.Fatalf("unexpected updated project name: %s", updated.Name)
	}
	if updated.Description != "" {
		t.Fatalf("expected cleared description, got %q", updated.Description)
	}
	if updated.TranslationContext != "" {
		t.Fatalf("expected cleared translation context, got %q", updated.TranslationContext)
	}

	projects, err := service.ListProjects(context.Background(), 50)
	if err != nil {
		t.Fatalf("ListProjects returned error: %v", err)
	}
	if len(projects) != 1 {
		t.Fatalf("expected 1 project, got %d", len(projects))
	}

	if err := service.DeleteProject(context.Background(), project.ID); err != nil {
		t.Fatalf("DeleteProject returned error: %v", err)
	}

	if _, err := service.GetProject(context.Background(), project.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected deleted project to be missing, got %v", err)
	}
}

func TestGlossaryTermCRUDAndBulkOperations(t *testing.T) {
	t.Parallel()

	sqldb, err := sql.Open(sqliteshim.ShimName, testSQLiteDSN(t))
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
	projectID := createProjectForTest(t, service, "Project 1")

	created, err := service.CreateGlossaryTerm(context.Background(), &translationv1.CreateGlossaryTermRequest{
		ProjectId: projectID,
		Term: &translationv1.GlossaryTermInput{
			SourceLocale: "en",
			TargetLocale: "fr",
			SourceTerm:   "account balance",
			TargetTerm:   "solde du compte",
			Description:  ptr("Banking UI label"),
			PartOfSpeech: ptr("noun"),
		},
	})
	if err != nil {
		t.Fatalf("CreateGlossaryTerm returned error: %v", err)
	}

	got, err := service.GetGlossaryTerm(context.Background(), projectID, created.ID)
	if err != nil {
		t.Fatalf("GetGlossaryTerm returned error: %v", err)
	}
	if got.TargetTerm != "solde du compte" {
		t.Fatalf("unexpected target term: %q", got.TargetTerm)
	}

	listed, err := service.ListGlossaryTerms(context.Background(), projectID, "en", "fr", 50, nil)
	if err != nil {
		t.Fatalf("ListGlossaryTerms returned error: %v", err)
	}
	if len(listed.Terms) != 1 {
		t.Fatalf("expected 1 listed term, got %d", len(listed.Terms))
	}

	updated, err := service.UpdateGlossaryTerm(context.Background(), &translationv1.UpdateGlossaryTermRequest{
		ProjectId:    projectID,
		Id:           created.ID,
		TargetTerm:   ptr("solde disponible"),
		Description:  ptr("Updated"),
		PartOfSpeech: ptr("noun"),
	})
	if err != nil {
		t.Fatalf("UpdateGlossaryTerm returned error: %v", err)
	}
	if updated.TargetTerm != "solde disponible" {
		t.Fatalf("unexpected updated target term: %q", updated.TargetTerm)
	}

	terms, err := service.BulkUpsertGlossaryTerms(context.Background(), projectID, []*translationv1.GlossaryTermInput{
		{
			SourceLocale: "en",
			TargetLocale: "fr",
			SourceTerm:   "account balance",
			TargetTerm:   "solde courant",
		},
		{
			SourceLocale: "en",
			TargetLocale: "fr",
			SourceTerm:   "statement",
			TargetTerm:   "releve",
		},
	})
	if err != nil {
		t.Fatalf("BulkUpsertGlossaryTerms returned error: %v", err)
	}
	if len(terms) != 2 {
		t.Fatalf("expected 2 upserted terms, got %d", len(terms))
	}

	refetched, err := service.GetGlossaryTerm(context.Background(), projectID, created.ID)
	if err != nil {
		t.Fatalf("GetGlossaryTerm after upsert returned error: %v", err)
	}
	if refetched.TargetTerm != "solde courant" {
		t.Fatalf("expected natural-key upsert to update existing term, got %q", refetched.TargetTerm)
	}

	deletedIDs, err := service.BulkDeleteGlossaryTerms(context.Background(), projectID, []string{created.ID, "missing"})
	if err != nil {
		t.Fatalf("BulkDeleteGlossaryTerms returned error: %v", err)
	}
	if len(deletedIDs) != 1 || deletedIDs[0] != created.ID {
		t.Fatalf("unexpected deleted ids: %v", deletedIDs)
	}

	if err := service.DeleteGlossaryTerm(context.Background(), projectID, terms[1].ID); err != nil {
		t.Fatalf("DeleteGlossaryTerm returned error: %v", err)
	}
	if _, err := service.GetGlossaryTerm(context.Background(), projectID, terms[1].ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected deleted glossary term to be missing, got %v", err)
	}
}

func TestCreateFileUploadRequiresExistingProject(t *testing.T) {
	t.Parallel()

	sqldb, err := sql.Open(sqliteshim.ShimName, testSQLiteDSN(t))
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

	_, _, _, err = service.CreateFileUpload(context.Background(), &translationv1.CreateTranslationFileUploadRequest{
		ProjectId:    "proj_missing",
		Path:         "content/messages.json",
		FileFormat:   translationv1.FileTranslationJobInput_FILE_FORMAT_JSON,
		SourceLocale: "en",
		ContentType:  "application/json",
	})
	if err == nil || !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected missing project error when creating upload, got %v", err)
	}
}

func TestDeleteProjectRemovesProjectObjects(t *testing.T) {
	t.Parallel()

	sqldb, err := sql.Open(sqliteshim.ShimName, testSQLiteDSN(t))
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

	projectID := createProjectForTest(t, service, "Project 1")
	uploadID, _, _, err := service.CreateFileUpload(context.Background(), &translationv1.CreateTranslationFileUploadRequest{
		ProjectId:    projectID,
		Path:         "content/messages.json",
		FileFormat:   translationv1.FileTranslationJobInput_FILE_FORMAT_JSON,
		SourceLocale: "en",
		ContentType:  "application/json",
	})
	if err != nil {
		t.Fatalf("CreateFileUpload returned error: %v", err)
	}

	sourceRef := objectstore.ObjectRef{
		Driver: "memory",
		Bucket: "translations",
		Key:    "projects/" + projectID + "/source/" + uploadID + "/content/messages.json",
	}
	if err := memStore.PutObject(context.Background(), objectstore.PutRequest{
		Object:      sourceRef,
		ContentType: "application/json",
		Body:        []byte(`{"hello":"Hello"}`),
	}); err != nil {
		t.Fatalf("seed source object: %v", err)
	}

	file, err := service.FinalizeFileUpload(context.Background(), projectID, uploadID)
	if err != nil {
		t.Fatalf("FinalizeFileUpload returned error: %v", err)
	}

	variantRef := objectstore.ObjectRef{
		Driver: "memory",
		Bucket: "translations",
		Key:    "projects/" + projectID + "/variants/" + file.ID + "/fr/content/messages.json",
	}
	if err := memStore.PutObject(context.Background(), objectstore.PutRequest{
		Object:      variantRef,
		ContentType: "application/json",
		Body:        []byte(`{"hello":"Bonjour"}`),
	}); err != nil {
		t.Fatalf("seed variant object: %v", err)
	}
	if err := repository.SaveFileVariant(context.Background(), &store.TranslationFileVariantModel{
		ID:             "variant_1",
		FileID:         file.ID,
		Locale:         "fr",
		Path:           "content/messages.fr.json",
		ContentType:    "application/json",
		SizeBytes:      int64(len(`{"hello":"Bonjour"}`)),
		ChecksumSHA256: "",
		StorageDriver:  "memory",
		Bucket:         "translations",
		ObjectKey:      variantRef.Key,
		LastJobID:      "job_1",
		Status:         store.FileVariantStatusReady,
		CreatedAt:      time.Unix(1700000000, 0).UTC(),
		UpdatedAt:      time.Unix(1700000000, 0).UTC(),
	}); err != nil {
		t.Fatalf("SaveFileVariant returned error: %v", err)
	}

	if err := service.DeleteProject(context.Background(), projectID); err != nil {
		t.Fatalf("DeleteProject returned error: %v", err)
	}

	if _, err := service.GetProject(context.Background(), projectID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected deleted project to be missing, got %v", err)
	}
	if _, err := memStore.StatObject(context.Background(), objectstore.StatRequest{Object: sourceRef}); !errors.Is(err, objectstore.ErrObjectNotFound) {
		t.Fatalf("expected source object to be deleted, got %v", err)
	}
	if _, err := memStore.StatObject(context.Background(), objectstore.StatRequest{Object: variantRef}); !errors.Is(err, objectstore.ErrObjectNotFound) {
		t.Fatalf("expected variant object to be deleted, got %v", err)
	}
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
		if _, err := db.ExecContext(context.Background(), statement); err != nil {
			return err
		}
	}
	return nil
}

func ptr(value string) *string {
	return &value
}

func createProjectForTest(t *testing.T, service *Service, name string) string {
	t.Helper()

	project, err := service.CreateProject(context.Background(), &translationv1.CreateProjectRequest{Name: name})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	return project.ID
}

func stringPtr(value string) *string {
	return &value
}

func testSQLiteDSN(t *testing.T) string {
	t.Helper()

	return "file:" + strings.ReplaceAll(t.Name(), "/", "_") + "?mode=memory&cache=shared"
}
