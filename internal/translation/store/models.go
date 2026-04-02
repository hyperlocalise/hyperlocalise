package store

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/hyperlocalise/rain-orm/pkg/rain"
	"github.com/hyperlocalise/rain-orm/pkg/schema"
)

const (
	JobTypeString = "string"
	JobTypeFile   = "file"
)

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

type translationProjectsTable struct {
	schema.TableModel
	ID                 *schema.Column[string]
	Name               *schema.Column[string]
	Description        *schema.Column[string]
	TranslationContext *schema.Column[string]
	CreatedAt          *schema.Column[time.Time]
	UpdatedAt          *schema.Column[time.Time]
}

type translationJobsTable struct {
	schema.TableModel
	ID                *schema.Column[string]
	ProjectID         *schema.Column[string]
	Type              *schema.Column[string]
	Status            *schema.Column[string]
	InputKind         *schema.Column[string]
	InputPayload      *schema.Column[any]
	CheckpointPayload *schema.Column[any]
	OutcomeKind       *schema.Column[string]
	OutcomePayload    *schema.Column[any]
	LastError         *schema.Column[string]
	CreatedAt         *schema.Column[time.Time]
	UpdatedAt         *schema.Column[time.Time]
	CompletedAt       *schema.Column[time.Time]
}

type outboxEventsTable struct {
	schema.TableModel
	ID                     *schema.Column[string]
	Topic                  *schema.Column[string]
	AggregateID            *schema.Column[string]
	Payload                *schema.Column[any]
	Headers                *schema.Column[any]
	Status                 *schema.Column[string]
	AttemptCount           *schema.Column[int32]
	MaxAttempts            *schema.Column[int32]
	NextAttemptAt          *schema.Column[time.Time]
	LastError              *schema.Column[string]
	ClaimedBy              *schema.Column[string]
	ClaimedAt              *schema.Column[time.Time]
	ClaimExpiresAt         *schema.Column[time.Time]
	CreatedAt              *schema.Column[time.Time]
	UpdatedAt              *schema.Column[time.Time]
	ProcessedAt            *schema.Column[time.Time]
	DeadLetteredAt         *schema.Column[time.Time]
	DeliveryStatus         *schema.Column[string]
	DeliveryAttemptCount   *schema.Column[int32]
	DeliveryMaxAttempts    *schema.Column[int32]
	DeliveryNextAttemptAt  *schema.Column[time.Time]
	DeliveryLastError      *schema.Column[string]
	DeliveryClaimedBy      *schema.Column[string]
	DeliveryClaimedAt      *schema.Column[time.Time]
	DeliveryClaimExpiresAt *schema.Column[time.Time]
	PublishedAt            *schema.Column[time.Time]
}

type translationFileUploadsTable struct {
	schema.TableModel
	ID             *schema.Column[string]
	ProjectID      *schema.Column[string]
	Path           *schema.Column[string]
	FileFormat     *schema.Column[string]
	SourceLocale   *schema.Column[string]
	ContentType    *schema.Column[string]
	SizeBytes      *schema.Column[int64]
	ChecksumSHA256 *schema.Column[string]
	StorageDriver  *schema.Column[string]
	Bucket         *schema.Column[string]
	ObjectKey      *schema.Column[string]
	Status         *schema.Column[string]
	CreatedAt      *schema.Column[time.Time]
	UpdatedAt      *schema.Column[time.Time]
	ExpiresAt      *schema.Column[time.Time]
	FinalizedAt    *schema.Column[time.Time]
}

type translationFilesTable struct {
	schema.TableModel
	ID             *schema.Column[string]
	ProjectID      *schema.Column[string]
	Path           *schema.Column[string]
	FileFormat     *schema.Column[string]
	SourceLocale   *schema.Column[string]
	ContentType    *schema.Column[string]
	SizeBytes      *schema.Column[int64]
	ChecksumSHA256 *schema.Column[string]
	StorageDriver  *schema.Column[string]
	Bucket         *schema.Column[string]
	ObjectKey      *schema.Column[string]
	CreatedAt      *schema.Column[time.Time]
	UpdatedAt      *schema.Column[time.Time]
}

type translationFileVariantsTable struct {
	schema.TableModel
	ID             *schema.Column[string]
	FileID         *schema.Column[string]
	Locale         *schema.Column[string]
	Path           *schema.Column[string]
	ContentType    *schema.Column[string]
	SizeBytes      *schema.Column[int64]
	ChecksumSHA256 *schema.Column[string]
	StorageDriver  *schema.Column[string]
	Bucket         *schema.Column[string]
	ObjectKey      *schema.Column[string]
	LastJobID      *schema.Column[string]
	Status         *schema.Column[string]
	CreatedAt      *schema.Column[time.Time]
	UpdatedAt      *schema.Column[time.Time]
}

type translationGlossaryTermsTable struct {
	schema.TableModel
	ID           *schema.Column[string]
	ProjectID    *schema.Column[string]
	SourceLocale *schema.Column[string]
	TargetLocale *schema.Column[string]
	SourceTerm   *schema.Column[string]
	TargetTerm   *schema.Column[string]
	Description  *schema.Column[string]
	PartOfSpeech *schema.Column[string]
	SearchVector *schema.Column[string]
	CreatedAt    *schema.Column[time.Time]
	UpdatedAt    *schema.Column[time.Time]
}

var TranslationProjects = schema.Define("translation_projects", func(t *translationProjectsTable) {
	t.ID = t.Text("id").PrimaryKey()
	t.Name = t.Text("name").NotNull()
	t.Description = t.Text("description").NotNull()
	t.TranslationContext = t.Text("translation_context").NotNull()
	t.CreatedAt = t.TimestampTZ("created_at").NotNull()
	t.UpdatedAt = t.TimestampTZ("updated_at").NotNull()
	t.Index("translation_projects_created_at_idx").On(t.CreatedAt.Desc())
})

var TranslationJobs = schema.Define("translation_jobs", func(t *translationJobsTable) {
	t.ID = t.Text("id").PrimaryKey()
	t.ProjectID = t.Text("project_id").NotNull().References(TranslationProjects.ID)
	t.Type = t.Text("type").NotNull()
	t.Status = t.Text("status").NotNull()
	t.InputKind = t.Text("input_kind").NotNull()
	t.InputPayload = t.JSONB("input_payload").NotNull()
	t.CheckpointPayload = t.JSONB("checkpoint_payload")
	t.OutcomeKind = t.Text("outcome_kind")
	t.OutcomePayload = t.JSONB("outcome_payload")
	t.LastError = t.Text("last_error")
	t.CreatedAt = t.TimestampTZ("created_at").NotNull()
	t.UpdatedAt = t.TimestampTZ("updated_at").NotNull()
	t.CompletedAt = t.TimestampTZ("completed_at")
	t.Index("translation_jobs_project_created_at_idx").On(t.ProjectID, t.CreatedAt.Desc(), t.ID.Desc())
	t.Index("translation_jobs_project_status_idx").On(t.ProjectID, t.Status)
	t.Index("translation_jobs_project_type_idx").On(t.ProjectID, t.Type)
})

var OutboxEvents = schema.Define("outbox_events", func(t *outboxEventsTable) {
	t.ID = t.Text("id").PrimaryKey()
	t.Topic = t.Text("topic").NotNull()
	t.AggregateID = t.Text("aggregate_id").NotNull()
	t.Payload = t.JSONB("payload").NotNull()
	t.Headers = t.JSONB("headers").NotNull()
	t.Status = t.Text("status").NotNull()
	t.AttemptCount = t.Integer("attempt_count").NotNull()
	t.MaxAttempts = t.Integer("max_attempts").NotNull()
	t.NextAttemptAt = t.TimestampTZ("next_attempt_at").NotNull()
	t.LastError = t.Text("last_error")
	t.ClaimedBy = t.Text("claimed_by")
	t.ClaimedAt = t.TimestampTZ("claimed_at")
	t.ClaimExpiresAt = t.TimestampTZ("claim_expires_at")
	t.CreatedAt = t.TimestampTZ("created_at").NotNull()
	t.UpdatedAt = t.TimestampTZ("updated_at").NotNull()
	t.ProcessedAt = t.TimestampTZ("processed_at")
	t.DeadLetteredAt = t.TimestampTZ("dead_lettered_at")
	t.DeliveryStatus = t.Text("delivery_status").NotNull()
	t.DeliveryAttemptCount = t.Integer("delivery_attempt_count").NotNull()
	t.DeliveryMaxAttempts = t.Integer("delivery_max_attempts").NotNull()
	t.DeliveryNextAttemptAt = t.TimestampTZ("delivery_next_attempt_at").NotNull()
	t.DeliveryLastError = t.Text("delivery_last_error")
	t.DeliveryClaimedBy = t.Text("delivery_claimed_by")
	t.DeliveryClaimedAt = t.TimestampTZ("delivery_claimed_at")
	t.DeliveryClaimExpiresAt = t.TimestampTZ("delivery_claim_expires_at")
	t.PublishedAt = t.TimestampTZ("published_at")
	t.Index("outbox_events_next_attempt_idx").On(t.Status, t.NextAttemptAt, t.CreatedAt)
	t.Index("outbox_events_delivery_next_attempt_idx").On(t.DeliveryStatus, t.DeliveryNextAttemptAt, t.CreatedAt)
})

var TranslationFileUploads = schema.Define("translation_file_uploads", func(t *translationFileUploadsTable) {
	t.ID = t.Text("id").PrimaryKey()
	t.ProjectID = t.Text("project_id").NotNull().References(TranslationProjects.ID)
	t.Path = t.Text("path").NotNull()
	t.FileFormat = t.Text("file_format").NotNull()
	t.SourceLocale = t.Text("source_locale").NotNull()
	t.ContentType = t.Text("content_type").NotNull()
	t.SizeBytes = t.BigInt("size_bytes")
	t.ChecksumSHA256 = t.Text("checksum_sha256")
	t.StorageDriver = t.Text("storage_driver").NotNull()
	t.Bucket = t.Text("bucket").NotNull()
	t.ObjectKey = t.Text("object_key").NotNull()
	t.Status = t.Text("status").NotNull()
	t.CreatedAt = t.TimestampTZ("created_at").NotNull()
	t.UpdatedAt = t.TimestampTZ("updated_at").NotNull()
	t.ExpiresAt = t.TimestampTZ("expires_at").NotNull()
	t.FinalizedAt = t.TimestampTZ("finalized_at")
	t.Index("translation_file_uploads_project_created_at_idx").On(t.ProjectID, t.CreatedAt)
})

var TranslationFiles = schema.Define("translation_files", func(t *translationFilesTable) {
	t.ID = t.Text("id").PrimaryKey()
	t.ProjectID = t.Text("project_id").NotNull().References(TranslationProjects.ID)
	t.Path = t.Text("path").NotNull()
	t.FileFormat = t.Text("file_format").NotNull()
	t.SourceLocale = t.Text("source_locale").NotNull()
	t.ContentType = t.Text("content_type").NotNull()
	t.SizeBytes = t.BigInt("size_bytes").NotNull()
	t.ChecksumSHA256 = t.Text("checksum_sha256")
	t.StorageDriver = t.Text("storage_driver").NotNull()
	t.Bucket = t.Text("bucket").NotNull()
	t.ObjectKey = t.Text("object_key").NotNull()
	t.CreatedAt = t.TimestampTZ("created_at").NotNull()
	t.UpdatedAt = t.TimestampTZ("updated_at").NotNull()
	t.Unique("translation_files_project_path_key").On(t.ProjectID, t.Path)
	t.Index("translation_files_project_path_idx").On(t.ProjectID, t.Path)
})

var TranslationFileVariants = schema.Define("translation_file_variants", func(t *translationFileVariantsTable) {
	t.ID = t.Text("id").PrimaryKey()
	t.FileID = t.Text("file_id").NotNull().References(TranslationFiles.ID)
	t.Locale = t.Text("locale").NotNull()
	t.Path = t.Text("path").NotNull()
	t.ContentType = t.Text("content_type").NotNull()
	t.SizeBytes = t.BigInt("size_bytes").NotNull()
	t.ChecksumSHA256 = t.Text("checksum_sha256")
	t.StorageDriver = t.Text("storage_driver").NotNull()
	t.Bucket = t.Text("bucket").NotNull()
	t.ObjectKey = t.Text("object_key").NotNull()
	t.LastJobID = t.Text("last_job_id").NotNull()
	t.Status = t.Text("status").NotNull()
	t.CreatedAt = t.TimestampTZ("created_at").NotNull()
	t.UpdatedAt = t.TimestampTZ("updated_at").NotNull()
	t.Unique("translation_file_variants_file_locale_key").On(t.FileID, t.Locale)
	t.Index("translation_file_variants_file_locale_idx").On(t.FileID, t.Locale)
})

var TranslationGlossaryTerms = schema.Define("translation_glossary_terms", func(t *translationGlossaryTermsTable) {
	t.ID = t.Text("id").PrimaryKey()
	t.ProjectID = t.Text("project_id").NotNull().References(TranslationProjects.ID)
	t.SourceLocale = t.Text("source_locale").NotNull()
	t.TargetLocale = t.Text("target_locale").NotNull()
	t.SourceTerm = t.Text("source_term").NotNull()
	t.TargetTerm = t.Text("target_term").NotNull()
	t.Description = t.Text("description").NotNull()
	t.PartOfSpeech = t.Text("part_of_speech").NotNull()
	t.SearchVector = t.Text("search_vector")
	t.CreatedAt = t.TimestampTZ("created_at").NotNull()
	t.UpdatedAt = t.TimestampTZ("updated_at").NotNull()
	t.Unique("translation_glossary_terms_project_source_target_term_key").On(t.ProjectID, t.SourceLocale, t.TargetLocale, t.SourceTerm)
	t.Index("translation_glossary_terms_project_updated_at_idx").On(t.ProjectID, t.UpdatedAt.Desc(), t.ID.Desc())
})

// TranslationProjectModel stores the parent resource for jobs and files.
type TranslationProjectModel struct {
	ID                 string    `db:"id"`
	Name               string    `db:"name"`
	Description        string    `db:"description"`
	TranslationContext string    `db:"translation_context"`
	CreatedAt          time.Time `db:"created_at"`
	UpdatedAt          time.Time `db:"updated_at"`
}

// TranslationJobModel stores the canonical async translation job resource.
type TranslationJobModel struct {
	ID                string     `db:"id"`
	ProjectID         string     `db:"project_id"`
	Type              string     `db:"type"`
	Status            string     `db:"status"`
	InputKind         string     `db:"input_kind"`
	InputPayload      []byte     `db:"input_payload"`
	CheckpointPayload []byte     `db:"checkpoint_payload"`
	OutcomeKind       string     `db:"outcome_kind"`
	OutcomePayload    []byte     `db:"outcome_payload"`
	LastError         string     `db:"last_error"`
	CreatedAt         time.Time  `db:"created_at"`
	UpdatedAt         time.Time  `db:"updated_at"`
	CompletedAt       *time.Time `db:"completed_at"`
}

// OutboxEventModel stores messages to be published to and executed from the async queue.
type OutboxEventModel struct {
	ID                     string     `db:"id"`
	Topic                  string     `db:"topic"`
	AggregateID            string     `db:"aggregate_id"`
	Payload                []byte     `db:"payload"`
	Headers                []byte     `db:"headers"`
	Status                 string     `db:"status"`
	AttemptCount           int        `db:"attempt_count"`
	MaxAttempts            int        `db:"max_attempts"`
	NextAttemptAt          time.Time  `db:"next_attempt_at"`
	LastError              string     `db:"last_error"`
	ClaimedBy              string     `db:"claimed_by"`
	ClaimedAt              *time.Time `db:"claimed_at"`
	ClaimExpiresAt         *time.Time `db:"claim_expires_at"`
	CreatedAt              time.Time  `db:"created_at"`
	UpdatedAt              time.Time  `db:"updated_at"`
	ProcessedAt            *time.Time `db:"processed_at"`
	DeadLetteredAt         *time.Time `db:"dead_lettered_at"`
	DeliveryStatus         string     `db:"delivery_status"`
	DeliveryAttemptCount   int        `db:"delivery_attempt_count"`
	DeliveryMaxAttempts    int        `db:"delivery_max_attempts"`
	DeliveryNextAttemptAt  time.Time  `db:"delivery_next_attempt_at"`
	DeliveryLastError      string     `db:"delivery_last_error"`
	DeliveryClaimedBy      string     `db:"delivery_claimed_by"`
	DeliveryClaimedAt      *time.Time `db:"delivery_claimed_at"`
	DeliveryClaimExpiresAt *time.Time `db:"delivery_claim_expires_at"`
	PublishedAt            *time.Time `db:"published_at"`
}

// TranslationFileUploadModel stores pending direct-upload sessions.
type TranslationFileUploadModel struct {
	ID             string     `db:"id"`
	ProjectID      string     `db:"project_id"`
	Path           string     `db:"path"`
	FileFormat     string     `db:"file_format"`
	SourceLocale   string     `db:"source_locale"`
	ContentType    string     `db:"content_type"`
	SizeBytes      *int64     `db:"size_bytes"`
	ChecksumSHA256 string     `db:"checksum_sha256"`
	StorageDriver  string     `db:"storage_driver"`
	Bucket         string     `db:"bucket"`
	ObjectKey      string     `db:"object_key"`
	Status         string     `db:"status"`
	CreatedAt      time.Time  `db:"created_at"`
	UpdatedAt      time.Time  `db:"updated_at"`
	ExpiresAt      time.Time  `db:"expires_at"`
	FinalizedAt    *time.Time `db:"finalized_at"`
}

// TranslationFileModel stores the canonical source file record for a project path.
type TranslationFileModel struct {
	ID             string    `db:"id"`
	ProjectID      string    `db:"project_id"`
	Path           string    `db:"path"`
	FileFormat     string    `db:"file_format"`
	SourceLocale   string    `db:"source_locale"`
	ContentType    string    `db:"content_type"`
	SizeBytes      int64     `db:"size_bytes"`
	ChecksumSHA256 string    `db:"checksum_sha256"`
	StorageDriver  string    `db:"storage_driver"`
	Bucket         string    `db:"bucket"`
	ObjectKey      string    `db:"object_key"`
	CreatedAt      time.Time `db:"created_at"`
	UpdatedAt      time.Time `db:"updated_at"`
}

// TranslationFileVariantModel stores the current translated file for a locale.
type TranslationFileVariantModel struct {
	ID             string    `db:"id"`
	FileID         string    `db:"file_id"`
	Locale         string    `db:"locale"`
	Path           string    `db:"path"`
	ContentType    string    `db:"content_type"`
	SizeBytes      int64     `db:"size_bytes"`
	ChecksumSHA256 string    `db:"checksum_sha256"`
	StorageDriver  string    `db:"storage_driver"`
	Bucket         string    `db:"bucket"`
	ObjectKey      string    `db:"object_key"`
	LastJobID      string    `db:"last_job_id"`
	Status         string    `db:"status"`
	CreatedAt      time.Time `db:"created_at"`
	UpdatedAt      time.Time `db:"updated_at"`
}

// TranslationGlossaryTermModel stores project-scoped glossary terms used for retrieval augmentation.
type TranslationGlossaryTermModel struct {
	ID           string    `db:"id"`
	ProjectID    string    `db:"project_id"`
	SourceLocale string    `db:"source_locale"`
	TargetLocale string    `db:"target_locale"`
	SourceTerm   string    `db:"source_term"`
	TargetTerm   string    `db:"target_term"`
	Description  string    `db:"description"`
	PartOfSpeech string    `db:"part_of_speech"`
	CreatedAt    time.Time `db:"created_at"`
	UpdatedAt    time.Time `db:"updated_at"`
}

type queryExecutor interface {
	Select() *rain.SelectQuery
	Insert() *rain.InsertQuery
	Update() *rain.UpdateQuery
	Delete() *rain.DeleteQuery
}

func mustBindModels() {
	rain.MustBindTableModel[TranslationProjectModel](TranslationProjects)
	rain.MustBindTableModel[TranslationJobModel](TranslationJobs)
	rain.MustBindTableModel[OutboxEventModel](OutboxEvents)
	rain.MustBindTableModel[TranslationFileUploadModel](TranslationFileUploads)
	rain.MustBindTableModel[TranslationFileModel](TranslationFiles)
	rain.MustBindTableModel[TranslationFileVariantModel](TranslationFileVariants)
	rain.MustBindTableModel[TranslationGlossaryTermModel](TranslationGlossaryTerms)
}

func init() {
	mustBindModels()
}

func rowsAffected(result sql.Result, op string) (int64, error) {
	affected, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("count %s rows affected: %w", op, err)
	}
	return affected, nil
}
