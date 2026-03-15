package store

import "time"

import "github.com/uptrace/bun"

const (
	JobTypeString = "string"
	JobTypeFile   = "file"
)

const (
	JobStatusQueued    = "queued"
	JobStatusRunning   = "running"
	JobStatusSucceeded = "succeeded"
	JobStatusFailed    = "failed"
)

const (
	OutboxStatusPending   = "pending"
	OutboxStatusProcessed = "processed"
)

// TranslationJobModel stores the canonical async translation job resource.
type TranslationJobModel struct {
	bun.BaseModel `bun:"table:translation_jobs,alias:tj"`

	ID             string     `bun:"id,pk"`
	ProjectID      string     `bun:"project_id,notnull"`
	Type           string     `bun:"type,notnull"`
	Status         string     `bun:"status,notnull"`
	InputKind      string     `bun:"input_kind,notnull"`
	InputPayload   []byte     `bun:"input_payload,type:jsonb,notnull"`
	OutcomeKind    string     `bun:"outcome_kind"`
	OutcomePayload []byte     `bun:"outcome_payload,type:jsonb"`
	CreatedAt      time.Time  `bun:"created_at,notnull"`
	UpdatedAt      time.Time  `bun:"updated_at,notnull"`
	CompletedAt    *time.Time `bun:"completed_at"`
}

// OutboxEventModel stores messages to be published to the async queue.
type OutboxEventModel struct {
	bun.BaseModel `bun:"table:outbox_events,alias:oe"`

	ID          string     `bun:"id,pk"`
	Topic       string     `bun:"topic,notnull"`
	AggregateID string     `bun:"aggregate_id,notnull"`
	Payload     []byte     `bun:"payload,type:jsonb,notnull"`
	Headers     []byte     `bun:"headers,type:jsonb,notnull"`
	Status      string     `bun:"status,notnull"`
	CreatedAt   time.Time  `bun:"created_at,notnull"`
	UpdatedAt   time.Time  `bun:"updated_at,notnull"`
	ProcessedAt *time.Time `bun:"processed_at"`
}
