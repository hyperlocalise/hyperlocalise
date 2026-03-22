package app

import (
	"context"
	"database/sql"
	"testing"
	"time"

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
	service := NewService(repository, "stub")
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

func createTranslationTables(t *testing.T, db *bun.DB) error {
	t.Helper()

	statements := []string{
		`CREATE TABLE translation_jobs (
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
		`CREATE TABLE outbox_events (
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
	}

	for _, statement := range statements {
		if _, err := db.ExecContext(context.Background(), statement); err != nil {
			return err
		}
	}
	return nil
}
