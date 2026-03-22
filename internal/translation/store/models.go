package store

import (
	"time"

	"github.com/uptrace/bun"
)

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
	OutboxStatusPending      = "pending"
	OutboxStatusProcessing   = "processing"
	OutboxStatusProcessed    = "processed"
	OutboxStatusDeadLettered = "dead_lettered"
)

const (
	OutboxDeliveryStatusPending      = "pending"
	OutboxDeliveryStatusProcessing   = "processing"
	OutboxDeliveryStatusPublished    = "published"
	OutboxDeliveryStatusDeadLettered = "dead_lettered"
)

// TranslationJobModel stores the canonical async translation job resource.
type TranslationJobModel struct {
	bun.BaseModel `bun:"table:translation_jobs,alias:tj"`

	ID                string     `bun:"id,pk"`
	ProjectID         string     `bun:"project_id,notnull"`
	Type              string     `bun:"type,notnull"`
	Status            string     `bun:"status,notnull"`
	InputKind         string     `bun:"input_kind,notnull"`
	InputPayload      []byte     `bun:"input_payload,type:jsonb,notnull"`
	CheckpointPayload []byte     `bun:"checkpoint_payload,type:jsonb"`
	OutcomeKind       string     `bun:"outcome_kind"`
	OutcomePayload    []byte     `bun:"outcome_payload,type:jsonb"`
	LastError         string     `bun:"last_error"`
	CreatedAt         time.Time  `bun:"created_at,notnull"`
	UpdatedAt         time.Time  `bun:"updated_at,notnull"`
	CompletedAt       *time.Time `bun:"completed_at"`
}

// OutboxEventModel stores messages to be published to and executed from the async queue.
type OutboxEventModel struct {
	bun.BaseModel `bun:"table:outbox_events,alias:oe"`

	ID                     string     `bun:"id,pk"`
	Topic                  string     `bun:"topic,notnull"`
	AggregateID            string     `bun:"aggregate_id,notnull"`
	Payload                []byte     `bun:"payload,type:jsonb,notnull"`
	Headers                []byte     `bun:"headers,type:jsonb,notnull"`
	Status                 string     `bun:"status,notnull"`
	AttemptCount           int        `bun:"attempt_count,notnull"`
	MaxAttempts            int        `bun:"max_attempts,notnull"`
	NextAttemptAt          time.Time  `bun:"next_attempt_at,notnull"`
	LastError              string     `bun:"last_error"`
	ClaimedBy              string     `bun:"claimed_by"`
	ClaimedAt              *time.Time `bun:"claimed_at"`
	ClaimExpiresAt         *time.Time `bun:"claim_expires_at"`
	CreatedAt              time.Time  `bun:"created_at,notnull"`
	UpdatedAt              time.Time  `bun:"updated_at,notnull"`
	ProcessedAt            *time.Time `bun:"processed_at"`
	DeadLetteredAt         *time.Time `bun:"dead_lettered_at"`
	DeliveryStatus         string     `bun:"delivery_status,notnull"`
	DeliveryAttemptCount   int        `bun:"delivery_attempt_count,notnull"`
	DeliveryMaxAttempts    int        `bun:"delivery_max_attempts,notnull"`
	DeliveryNextAttemptAt  time.Time  `bun:"delivery_next_attempt_at,notnull"`
	DeliveryLastError      string     `bun:"delivery_last_error"`
	DeliveryClaimedBy      string     `bun:"delivery_claimed_by"`
	DeliveryClaimedAt      *time.Time `bun:"delivery_claimed_at"`
	DeliveryClaimExpiresAt *time.Time `bun:"delivery_claim_expires_at"`
	PublishedAt            *time.Time `bun:"published_at"`
}
