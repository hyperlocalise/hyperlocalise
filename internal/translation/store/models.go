package store

import (
	"time"

	"github.com/uptrace/bun"
)

const (
	JobTypeString = "string"
	JobTypeFile   = "file"
)

// TranslationProjectModel stores the parent resource for jobs and files.
type TranslationProjectModel struct {
	bun.BaseModel `bun:"table:translation_projects,alias:tp"`

	ID                 string    `bun:"id,pk"`
	Name               string    `bun:"name,notnull"`
	Description        string    `bun:"description,notnull"`
	TranslationContext string    `bun:"translation_context,notnull"`
	CreatedAt          time.Time `bun:"created_at,notnull"`
	UpdatedAt          time.Time `bun:"updated_at,notnull"`
}

const (
	FileUploadStatusPending   = "pending"
	FileUploadStatusFinalized = "finalized"
)

const (
	FileVariantStatusReady = "ready"
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

// TranslationFileUploadModel stores pending direct-upload sessions.
type TranslationFileUploadModel struct {
	bun.BaseModel `bun:"table:translation_file_uploads,alias:tfu"`

	ID             string     `bun:"id,pk"`
	ProjectID      string     `bun:"project_id,notnull"`
	Path           string     `bun:"path,notnull"`
	FileFormat     string     `bun:"file_format,notnull"`
	SourceLocale   string     `bun:"source_locale,notnull"`
	ContentType    string     `bun:"content_type,notnull"`
	SizeBytes      *int64     `bun:"size_bytes"`
	ChecksumSHA256 string     `bun:"checksum_sha256"`
	StorageDriver  string     `bun:"storage_driver,notnull"`
	Bucket         string     `bun:"bucket,notnull"`
	ObjectKey      string     `bun:"object_key,notnull"`
	Status         string     `bun:"status,notnull"`
	CreatedAt      time.Time  `bun:"created_at,notnull"`
	UpdatedAt      time.Time  `bun:"updated_at,notnull"`
	ExpiresAt      time.Time  `bun:"expires_at,notnull"`
	FinalizedAt    *time.Time `bun:"finalized_at"`
}

// TranslationFileModel stores the canonical source file record for a project path.
type TranslationFileModel struct {
	bun.BaseModel `bun:"table:translation_files,alias:tf"`

	ID             string    `bun:"id,pk"`
	ProjectID      string    `bun:"project_id,notnull"`
	Path           string    `bun:"path,notnull"`
	FileFormat     string    `bun:"file_format,notnull"`
	SourceLocale   string    `bun:"source_locale,notnull"`
	ContentType    string    `bun:"content_type,notnull"`
	SizeBytes      int64     `bun:"size_bytes,notnull"`
	ChecksumSHA256 string    `bun:"checksum_sha256"`
	StorageDriver  string    `bun:"storage_driver,notnull"`
	Bucket         string    `bun:"bucket,notnull"`
	ObjectKey      string    `bun:"object_key,notnull"`
	CreatedAt      time.Time `bun:"created_at,notnull"`
	UpdatedAt      time.Time `bun:"updated_at,notnull"`
}

// TranslationFileVariantModel stores the current translated file for a locale.
type TranslationFileVariantModel struct {
	bun.BaseModel `bun:"table:translation_file_variants,alias:tfv"`

	ID             string    `bun:"id,pk"`
	FileID         string    `bun:"file_id,notnull"`
	Locale         string    `bun:"locale,notnull"`
	Path           string    `bun:"path,notnull"`
	ContentType    string    `bun:"content_type,notnull"`
	SizeBytes      int64     `bun:"size_bytes,notnull"`
	ChecksumSHA256 string    `bun:"checksum_sha256"`
	StorageDriver  string    `bun:"storage_driver,notnull"`
	Bucket         string    `bun:"bucket,notnull"`
	ObjectKey      string    `bun:"object_key,notnull"`
	LastJobID      string    `bun:"last_job_id,notnull"`
	Status         string    `bun:"status,notnull"`
	CreatedAt      time.Time `bun:"created_at,notnull"`
	UpdatedAt      time.Time `bun:"updated_at,notnull"`
}

// TranslationGlossaryTermModel stores project-scoped glossary terms used for retrieval augmentation.
type TranslationGlossaryTermModel struct {
	bun.BaseModel `bun:"table:translation_glossary_terms,alias:tgt"`

	ID           string    `bun:"id,pk"`
	ProjectID    string    `bun:"project_id,notnull"`
	SourceLocale string    `bun:"source_locale,notnull"`
	TargetLocale string    `bun:"target_locale,notnull"`
	SourceTerm   string    `bun:"source_term,notnull"`
	TargetTerm   string    `bun:"target_term,notnull"`
	Description  string    `bun:"description,notnull"`
	PartOfSpeech string    `bun:"part_of_speech,notnull"`
	CreatedAt    time.Time `bun:"created_at,notnull"`
	UpdatedAt    time.Time `bun:"updated_at,notnull"`
}
