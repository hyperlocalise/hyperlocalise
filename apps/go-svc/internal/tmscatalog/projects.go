package tmscatalog

import (
	"context"
	"strings"
	"sync"
)

// Live TMS projects and their source files, read straight from the provider,
// as the web app does in tms-provider-live.ts. Nothing is stored: each call
// spends a freshly minted token.

// Project is one project in the TMS.
type Project struct {
	ExternalID     string
	Name           string
	Description    *string
	SourceLocale   *string
	TargetLocales  []string
	URL            *string
	IsActive       bool
	LogoURL        *string
	LastActivityAt *string
	Metadata       map[string]any
}

// File is one source file, or one key the TMS exposes as its own resource
// (Phrase keys, Smartling strings), in the tree a project's files make.
type File struct {
	ExternalResourceID string
	// ResourceType is "file" or "key".
	ResourceType  string
	SourcePath    string
	DisplayName   string
	Format        *string
	Revision      *string
	ExternalURL   *string
	SyncState     string
	SourceLocale  *string
	TargetLocales []string
}

// Counts is total, translated and approved strings or words.
type Counts struct {
	Total      int `json:"total"`
	Translated int `json:"translated"`
	Approved   int `json:"approved"`
}

// FileProgress is one file's progress in one target locale.
type FileProgress struct {
	ExternalResourceID  string
	TranslationProgress int
	ApprovalProgress    int
	Phrases             Counts
}

// Branch is a TMS branch a project's files can be scoped to.
type Branch struct {
	Name  string
	Title *string
}

// ProjectReader reads a TMS's projects and their files.
type ProjectReader interface {
	ListProjects(ctx context.Context) ([]Project, error)
	// GetProject returns nil when the TMS has no such project.
	GetProject(ctx context.Context, externalID string) (*Project, error)
	// ListFiles lists a project's files, in one branch when branch is set.
	// limit caps the result (0 for no cap), so readers can skip work past it.
	ListFiles(ctx context.Context, project Project, branch string, limit int) ([]File, error)
	ListBranches(ctx context.Context, externalID string) ([]Branch, error)
	// FileProgress is per-file progress for one locale; empty where the TMS has none.
	FileProgress(ctx context.Context, externalID, locale string) ([]FileProgress, error)
	// HiddenFileIDs are files whose strings are all hidden; empty where the TMS has none.
	HiddenFileIDs(ctx context.Context, externalID string) ([]string, error)
}

// ProjectsSupported reports whether NewProjectReader can read providerKind.
func ProjectsSupported(providerKind string) bool {
	switch strings.ToLower(providerKind) {
	case "crowdin", "phrase", "lokalise", "smartling":
		return true
	default:
		return false
	}
}

// NewProjectReader returns the ProjectReader for providerKind, or ErrUnsupported.
// Phrase files come from Phrase Strings, so a Phrase TMS (OAuth) connection is
// unsupported, as it is in the web app.
func NewProjectReader(providerKind string, credentials Credentials, httpClient HTTPDoer) (ProjectReader, error) {
	if httpClient == nil {
		return nil, ErrUnsupported
	}
	switch strings.ToLower(providerKind) {
	case "crowdin":
		return newCrowdin(credentials, httpClient), nil
	case "phrase":
		if strings.EqualFold(strings.TrimSpace(credentials.AuthMode), phraseOAuthMode) {
			return nil, ErrUnsupported
		}
		credentials.BaseURL = strings.TrimRight(strings.TrimSpace(credentials.BaseURL), "/")
		return &phraseStrings{client: phraseClient{credentials: credentials, http: httpClient}}, nil
	case "lokalise":
		return newLokalise(credentials, httpClient), nil
	case "smartling":
		return newSmartling(credentials, httpClient), nil
	default:
		return nil, ErrUnsupported
	}
}

// mapConcurrent runs fn over items with at most limit in flight, keeping order.
// The first error wins.
func mapConcurrent[T, R any](ctx context.Context, items []T, limit int, fn func(context.Context, T) (R, error)) ([]R, error) {
	results := make([]R, len(items))
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	var (
		wg       sync.WaitGroup
		once     sync.Once
		firstErr error
		slots    = make(chan struct{}, max(limit, 1))
	)
	for index, item := range items {
		select {
		case <-ctx.Done():
		case slots <- struct{}{}:
			wg.Add(1)
			go func() {
				defer wg.Done()
				defer func() { <-slots }()
				result, err := fn(ctx, item)
				if err != nil {
					once.Do(func() { firstErr = err; cancel() })
					return
				}
				results[index] = result
			}()
		}
	}
	wg.Wait()
	if firstErr != nil {
		return nil, firstErr
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return results, nil
}

func stringPtr(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}

func lastPathSegment(path string) string {
	parts := strings.Split(path, "/")
	for index := len(parts) - 1; index >= 0; index-- {
		if strings.TrimSpace(parts[index]) != "" {
			return parts[index]
		}
	}
	return path
}
