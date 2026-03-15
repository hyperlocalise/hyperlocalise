package translation

import "time"

const (
	ModeInline   = "inline"
	ModeArtifact = "artifact"
)

const (
	StatusQueued            = "queued"
	StatusRunning           = "running"
	StatusFinalizeQueued    = "finalize_queued"
	StatusCompleted         = "completed"
	StatusFailed            = "failed"
	StatusCanceled          = "canceled"
	StatusCancelRequested   = "cancel_requested"
	SegmentStatusPending    = "pending"
	SegmentStatusDispatched = "dispatched"
	SegmentStatusProcessing = "processing"
	SegmentStatusSucceeded  = "succeeded"
	SegmentStatusFailed     = "failed"
	AttemptStatusRunning    = "running"
	AttemptStatusSucceeded  = "succeeded"
	AttemptStatusFailed     = "failed"
)

type InlinePayload struct {
	Items []InlineItem
}

type InlineItem struct {
	Key       string
	Text      string
	Context   string
	MaxLength int
	Metadata  map[string]string
}

type ArtifactPayload struct {
	InputURI    string
	ContentType string
	ParserHint  string
	Path        string
}

type CreateJobInput struct {
	CallerScope         string
	ProjectID           string
	SourceLocale        string
	TargetLocale        string
	ProviderProfile     string
	GlossaryID          string
	StyleGuideID        string
	IdempotencyKey      string
	Labels              map[string]string
	InlinePayload       *InlinePayload
	ArtifactPayload     *ArtifactPayload
	ConfigSnapshotInput ConfigSnapshotInput
}

type ConfigSnapshotInput struct {
	ProviderFamily              string
	ModelID                     string
	PromptTemplateVersion       string
	GlossaryResolvedVersion     string
	StyleGuideResolvedVersion   string
	SegmentationStrategyVersion string
	ValidationPolicyVersion     string
	GenerationSettings          map[string]string
}

type ConfigSnapshot struct {
	ID                          string
	Checksum                    string
	ProviderProfile             string
	ProviderFamily              string
	ModelID                     string
	PromptTemplateVersion       string
	GlossaryResolvedVersion     string
	StyleGuideResolvedVersion   string
	SegmentationStrategyVersion string
	ValidationPolicyVersion     string
	GenerationSettings          map[string]string
	CreatedAt                   time.Time
}

type Job struct {
	ID                string
	ProjectID         string
	Status            string
	Mode              string
	SourceLocale      string
	TargetLocale      string
	ItemCount         int
	Progress          Progress
	SourceArtifactURI string
	OutputArtifactURI string
	InlineOutput      []InlineOutputItem
	ConfigSnapshotID  string
	ErrorCode         string
	ErrorMessage      string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type InlineOutputItem struct {
	Key  string
	Text string
}

type Progress struct {
	Total     int
	Succeeded int
	Failed    int
	Canceled  int
}

type JobFilter struct {
	ProjectID    string
	Status       string
	TargetLocale string
	CreatedAfter time.Time
	Limit        int
	Cursor       string
}

type JobInput struct {
	JobID                 string
	Mode                  string
	InlinePayloadChecksum string
	ArtifactInputURI      string
	ArtifactPath          string
	ArtifactContentType   string
	ParserHint            string
	CreatedAt             time.Time
}

type Segment struct {
	ID           string
	JobID        string
	SegmentKey   string
	SourceText   string
	Context      string
	OrderIndex   int
	Status       string
	OutputText   string
	ErrorCode    string
	ErrorMessage string
	DispatchedAt *time.Time
	CompletedAt  *time.Time
	UpdatedAt    time.Time
}

type SegmentAttempt struct {
	ID               string
	SegmentID        string
	RetryNumber      int
	Status           string
	ProviderProfile  string
	LatencyMS        int64
	TokenUsageInput  int
	TokenUsageOutput int
	ErrorCode        string
	ErrorMessage     string
	StartedAt        time.Time
	CompletedAt      *time.Time
}

type JobArtifact struct {
	JobID       string
	Kind        string
	URI         string
	Checksum    string
	ContentType string
	CreatedAt   time.Time
}

type ExecuteMessage struct {
	JobID             string
	SegmentID         string
	Attempt           int
	ProviderProfileID string
	SourceText        string
	Context           string
	SourceLocale      string
	TargetLocale      string
}
