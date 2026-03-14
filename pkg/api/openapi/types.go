package openapi

const (
	ProjectsPath          = "/v1/projects"
	ResourcesPath         = "/v1/resources"
	JobsPath              = "/v1/jobs"
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

type Job struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Status    string `json:"status"`
	ProjectID string `json:"projectId,omitempty"`
	CreatedAt string `json:"createdAt,omitempty"`
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

type CreateJobRequest struct {
	ProjectID   string   `json:"projectId"`
	Kind        string   `json:"kind"`
	ResourceIDs []string `json:"resourceIds,omitempty"`
}

type ProjectListResponse struct {
	Items []Project `json:"items"`
}

type ResourceListResponse struct {
	Items []Resource `json:"items"`
}

type JobListResponse struct {
	Items []Job `json:"items"`
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
