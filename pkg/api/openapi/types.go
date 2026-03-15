package openapi

const (
	ProjectsPath          = "/v1/projects"
	ResourcesPath         = "/v1/resources"
	TranslationJobsPath   = "/v1/translation-jobs"
	TranslationMemoryPath = "/v1/translation-memory"
	GlossariesPath        = "/v1/glossaries"
	WorkflowsPath         = "/v1/workflows"
)

type Project struct {
	ID            string   `json:"id"`
	Key           string   `json:"key"`
	Name          string   `json:"name"`
	SourceLocale  string   `json:"sourceLocale"`
	TargetLocales []string `json:"targetLocales,omitempty"`
}

type Resource struct {
	ID        string `json:"id"`
	ProjectID string `json:"projectId"`
	Path      string `json:"path"`
	Format    string `json:"format"`
}

type TranslationMemoryEntry struct {
	ID           string `json:"id"`
	SourceLocale string `json:"sourceLocale"`
	TargetLocale string `json:"targetLocale"`
	SourceText   string `json:"sourceText"`
	TargetText   string `json:"targetText"`
}

type Glossary struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	SourceLocale string `json:"sourceLocale"`
}

type Workflow struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	State string `json:"state"`
}

type ProjectListResponse struct {
	Items []Project `json:"items"`
}

type ResourceListResponse struct {
	Items []Resource `json:"items"`
}

type TranslationMemoryListResponse struct {
	Items []TranslationMemoryEntry `json:"items"`
}

type GlossaryListResponse struct {
	Items []Glossary `json:"items"`
}

type WorkflowListResponse struct {
	Items []Workflow `json:"items"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

type TranslationJob struct {
	ID             string                     `json:"id"`
	Status         string                     `json:"status"`
	SourceLocale   string                     `json:"sourceLocale"`
	TargetLocale   string                     `json:"targetLocale"`
	Error          *TranslationJobError       `json:"error,omitempty"`
	InlineResult   *TranslationInlineResult   `json:"inlineResult,omitempty"`
	ArtifactResult *TranslationArtifactResult `json:"artifactResult,omitempty"`
	CreatedAt      string                     `json:"createdAt"`
	UpdatedAt      string                     `json:"updatedAt"`
}

type TranslationJobError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type TranslationInlineResult struct {
	Items []TranslationInlineOutput `json:"items"`
}

type TranslationArtifactResult struct {
	OutputArtifactURI string `json:"outputArtifactUri"`
}

type TranslationInlineOutput struct {
	Key  string `json:"key"`
	Text string `json:"text"`
}

type CreateTranslationJobRequest struct {
	ProjectID       string                      `json:"projectId"`
	SourceLocale    string                      `json:"sourceLocale"`
	TargetLocale    string                      `json:"targetLocale"`
	ProviderProfile string                      `json:"providerProfile,omitempty"`
	GlossaryID      string                      `json:"glossaryId,omitempty"`
	StyleGuideID    string                      `json:"styleGuideId,omitempty"`
	IdempotencyKey  string                      `json:"idempotencyKey,omitempty"`
	Labels          map[string]string           `json:"labels,omitempty"`
	InlinePayload   *TranslationInlinePayload   `json:"inlinePayload,omitempty"`
	ArtifactPayload *TranslationArtifactPayload `json:"artifactPayload,omitempty"`
}

type TranslationInlinePayload struct {
	Items []TranslationInlineItem `json:"items"`
}

type TranslationInlineItem struct {
	Key       string            `json:"key"`
	Text      string            `json:"text"`
	Context   string            `json:"context,omitempty"`
	MaxLength int               `json:"maxLength,omitempty"`
	Metadata  map[string]string `json:"metadata,omitempty"`
}

type TranslationArtifactPayload struct {
	InputURI    string `json:"inputUri"`
	ContentType string `json:"contentType"`
	ParserHint  string `json:"parserHint,omitempty"`
	Path        string `json:"path,omitempty"`
}

type TranslationJobListResponse struct {
	Items []TranslationJob `json:"items"`
}
