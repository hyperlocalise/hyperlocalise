package storage

import (
	"context"
	"encoding/json"
	"time"
)

const (
	OriginLLM      = "llm"
	OriginHuman    = "human"
	OriginImported = "imported"
	OriginUnknown  = "unknown"

	StateDraft   = "draft"
	StateCurated = "curated"
)

// Entry is the normalized translation item exchanged across local storage and remote providers.
type Entry struct {
	Key        string            `json:"key"`
	Context    string            `json:"context,omitempty"`
	Locale     string            `json:"locale"`
	Value      string            `json:"value"`
	Namespace  string            `json:"namespace,omitempty"`
	Provenance EntryProvenance   `json:"provenance,omitempty"`
	Remote     RemoteMeta        `json:"remote,omitempty"`
	Metadata   map[string]string `json:"metadata,omitempty"`
}

// EntryProvenance stores local state for LLM vs human-curated flows.
type EntryProvenance struct {
	Origin    string    `json:"origin,omitempty"`
	State     string    `json:"state,omitempty"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
	UpdatedBy string    `json:"updated_by,omitempty"`
}

// RemoteMeta stores remote adapter metadata for an entry.
type RemoteMeta struct {
	Adapter   string    `json:"adapter,omitempty"`
	Revision  string    `json:"revision,omitempty"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

// EntryID is the stable identity for a translation entry.
type EntryID struct {
	Key     string `json:"key"`
	Context string `json:"context,omitempty"`
	Locale  string `json:"locale"`
}

func (e Entry) ID() EntryID {
	return EntryID{
		Key:     e.Key,
		Context: e.Context,
		Locale:  e.Locale,
	}
}

// CatalogSnapshot is a provider/local snapshot at a point in time.
type CatalogSnapshot struct {
	Entries     []Entry    `json:"entries"`
	Revision    string     `json:"revision,omitempty"`
	RetrievedAt *time.Time `json:"retrieved_at,omitempty"`
}

// PullRequest downloads entries from a remote storage provider.
type PullRequest struct {
	Locales       []string          `json:"locales,omitempty"`
	Namespaces    []string          `json:"namespaces,omitempty"`
	KeyPrefixes   []string          `json:"key_prefixes,omitempty"`
	EntryIDs      []EntryID         `json:"entry_ids,omitempty"`
	AdapterConfig json.RawMessage   `json:"-"`
	Options       map[string]string `json:"options,omitempty"`
}

// PullResult returns downloaded remote entries and adapter warnings.
type PullResult struct {
	Snapshot CatalogSnapshot `json:"snapshot"`
	Warnings []Warning       `json:"warnings,omitempty"`
}

// PushRequest uploads entries to a remote storage provider.
type PushRequest struct {
	Entries       []Entry            `json:"entries"`
	Locales       []string           `json:"locales,omitempty"`
	AdapterConfig json.RawMessage    `json:"-"`
	Options       map[string]string  `json:"options,omitempty"`
	Baseline      map[EntryID]string `json:"baseline,omitempty"`
}

// PushResult returns provider apply summary and warnings.
type PushResult struct {
	Applied   []EntryID  `json:"applied,omitempty"`
	Skipped   []EntryID  `json:"skipped,omitempty"`
	Conflicts []Conflict `json:"conflicts,omitempty"`
	Warnings  []Warning  `json:"warnings,omitempty"`
	Revision  string     `json:"revision,omitempty"`
}

type Warning struct {
	Code    string `json:"code,omitempty"`
	Message string `json:"message"`
}

type Conflict struct {
	ID          EntryID `json:"id"`
	Reason      string  `json:"reason"`
	LocalValue  string  `json:"local_value,omitempty"`
	RemoteValue string  `json:"remote_value,omitempty"`
	LocalState  string  `json:"local_state,omitempty"`
	RemoteState string  `json:"remote_state,omitempty"`
}

// Capabilities describe remote adapter features.
type Capabilities struct {
	SupportsContext    bool `json:"supports_context"`
	SupportsVersions   bool `json:"supports_versions"`
	SupportsDeletes    bool `json:"supports_deletes"`
	SupportsNamespaces bool `json:"supports_namespaces"`
}

// FileWorkflowCapabilities describe provider file-mode support.
type FileWorkflowCapabilities struct {
	SupportsSourceUpload      bool `json:"supports_source_upload"`
	SupportsTranslationUpload bool `json:"supports_translation_upload"`
	SupportsTranslationExport bool `json:"supports_translation_export"`
}

// FileExportOptions define file-mode export behavior for a translation group.
type FileExportOptions struct {
	SkipUntranslatedStrings *bool `json:"skip_untranslated_strings,omitempty"`
	SkipUntranslatedFiles   *bool `json:"skip_untranslated_files,omitempty"`
	ExportOnlyApproved      *bool `json:"export_only_approved,omitempty"`
}

// FileGroupSpec is the normalized file-mode description for one translation group.
type FileGroupSpec struct {
	Source                  string                       `json:"source"`
	Translation             string                       `json:"translation"`
	LanguagesMapping        map[string]map[string]string `json:"languages_mapping,omitempty"`
	ExcludedTargetLanguages []string                     `json:"excluded_target_languages,omitempty"`
	Export                  FileExportOptions            `json:"export,omitempty"`
}

// FileWorkflowConfig is the normalized config consumed by file-mode adapters.
type FileWorkflowConfig struct {
	ProjectID         string          `json:"project_id"`
	APIToken          string          `json:"-"`
	APIBaseURL        string          `json:"api_base_url,omitempty"`
	BasePath          string          `json:"base_path,omitempty"`
	PreserveHierarchy bool            `json:"preserve_hierarchy,omitempty"`
	Files             []FileGroupSpec `json:"files"`
}

// FileUploadSourcesRequest uploads source files defined in a file-mode config.
type FileUploadSourcesRequest struct {
	Config FileWorkflowConfig `json:"config"`
}

// FileUploadTranslationsRequest uploads local translation files.
type FileUploadTranslationsRequest struct {
	Config    FileWorkflowConfig `json:"config"`
	Languages []string           `json:"languages,omitempty"`
}

// FileDownloadTranslationsRequest downloads translated files into the workspace.
type FileDownloadTranslationsRequest struct {
	Config    FileWorkflowConfig `json:"config"`
	Languages []string           `json:"languages,omitempty"`
}

// FileOperationResult returns normalized file-mode execution details.
type FileOperationResult struct {
	Processed []string  `json:"processed,omitempty"`
	Skipped   []string  `json:"skipped,omitempty"`
	Warnings  []Warning `json:"warnings,omitempty"`
}

// StorageAdapter is the remote translation storage integration contract.
type StorageAdapter interface {
	Name() string
	Capabilities() Capabilities
	Pull(ctx context.Context, req PullRequest) (PullResult, error)
	Push(ctx context.Context, req PushRequest) (PushResult, error)
}

// FileWorkflowAdapter is the parallel provider contract for file-oriented workflows.
type FileWorkflowAdapter interface {
	Name() string
	FileWorkflowCapabilities() FileWorkflowCapabilities
	UploadSources(ctx context.Context, req FileUploadSourcesRequest) (FileOperationResult, error)
	UploadTranslations(ctx context.Context, req FileUploadTranslationsRequest) (FileOperationResult, error)
	DownloadTranslations(ctx context.Context, req FileDownloadTranslationsRequest) (FileOperationResult, error)
}
