package tmscatalog

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
)

// Phrase Strings projects, uploads and keys, as the web's phrase-provider.ts
// reads them. Uploads are files; every key is its own resource too.

const phraseLocaleParallel = 15

type phraseProject struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Slug       string  `json:"slug"`
	MainFormat *string `json:"main_format"`
	Account    *struct {
		ID   string `json:"id"`
		Slug string `json:"slug"`
	} `json:"account"`
}

type phraseLocale struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Code    *string `json:"code"`
	Default bool    `json:"default"`
}

type phraseUpload struct {
	ID        string  `json:"id"`
	Filename  string  `json:"filename"`
	Format    *string `json:"format"`
	State     *string `json:"state"`
	URL       *string `json:"url"`
	CreatedAt *string `json:"created_at"`
	UpdatedAt *string `json:"updated_at"`
}

type phraseKey struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	DataType  *string `json:"data_type"`
	CreatedAt *string `json:"created_at"`
	UpdatedAt *string `json:"updated_at"`
}

func (p *phraseStrings) ListProjects(ctx context.Context) ([]Project, error) {
	projects, err := phraseStringsList[phraseProject](ctx, p.client, "/projects")
	if err != nil {
		return nil, err
	}
	return mapConcurrent(ctx, projects, phraseLocaleParallel, func(ctx context.Context, project phraseProject) (Project, error) {
		return p.projectWithLocales(ctx, project)
	})
}

func (p *phraseStrings) GetProject(ctx context.Context, externalID string) (*Project, error) {
	externalID = strings.TrimSpace(externalID)
	if externalID == "" {
		return nil, nil
	}
	var project phraseProject
	if err := p.client.doJSON(ctx, http.MethodGet, "/projects/"+url.PathEscape(externalID), nil, &project); err != nil {
		var providerErr *ProviderError
		if errors.As(err, &providerErr) && providerErr.Status == http.StatusNotFound {
			return nil, nil
		}
		return nil, err
	}
	out, err := p.projectWithLocales(ctx, project)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// projectWithLocales adds the project's locales; when they can't be read the
// project still lists, without locales, unless the token was refused.
func (p *phraseStrings) projectWithLocales(ctx context.Context, project phraseProject) (Project, error) {
	out := Project{
		ExternalID:    project.ID,
		Name:          project.Name,
		TargetLocales: []string{},
		IsActive:      true,
		URL:           phraseProjectURL(project),
		Metadata: map[string]any{
			"slug":       project.Slug,
			"mainFormat": project.MainFormat,
		},
	}
	if project.Account != nil {
		out.Metadata["accountId"] = project.Account.ID
		out.Metadata["accountSlug"] = project.Account.Slug
	}
	locales, err := phraseStringsList[phraseLocale](ctx, p.client, "/projects/"+url.PathEscape(project.ID)+"/locales")
	if err != nil {
		var providerErr *ProviderError
		if errors.As(err, &providerErr) && providerErr.Status == http.StatusUnauthorized {
			return Project{}, err
		}
		out.Metadata["syncWarning"] = err.Error()
		return out, nil
	}
	out.SourceLocale, out.TargetLocales = phraseLocales(locales)
	return out, nil
}

func (p *phraseStrings) ListBranches(ctx context.Context, externalID string) ([]Branch, error) {
	if strings.TrimSpace(externalID) == "" {
		return []Branch{}, nil
	}
	branches, err := p.branchNames(ctx, externalID)
	if err != nil {
		return nil, err
	}
	out := make([]Branch, 0, len(branches))
	for _, name := range branches {
		out = append(out, Branch{Name: name})
	}
	return out, nil
}

func (p *phraseStrings) branchNames(ctx context.Context, externalID string) ([]string, error) {
	branches, err := phraseStringsList[struct {
		Name string `json:"name"`
	}](ctx, p.client, "/projects/"+url.PathEscape(externalID)+"/branches")
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(branches))
	for _, branch := range branches {
		names = append(names, branch.Name)
	}
	return names, nil
}

// ListFiles lists uploads and keys on the main line and in each branch (or in
// branch alone).
func (p *phraseStrings) ListFiles(ctx context.Context, project Project, branch string, _ int) ([]File, error) {
	projectID := strings.TrimSpace(project.ExternalID)
	if projectID == "" {
		return nil, errors.New("phrase: invalid project id")
	}
	projectPath := "/projects/" + url.PathEscape(projectID)
	locales, err := phraseStringsList[phraseLocale](ctx, p.client, projectPath+"/locales")
	if err != nil {
		return nil, err
	}
	sourceLocale, targetLocales := phraseLocales(locales)

	scopes := []string{}
	if branch = strings.TrimSpace(branch); branch != "" {
		scopes = append(scopes, branch)
	} else {
		names, err := p.branchNames(ctx, projectID)
		if err != nil {
			return nil, err
		}
		scopes = append(scopes, "")
		seen := map[string]bool{}
		for _, name := range names {
			if name = strings.TrimSpace(name); name != "" && !seen[name] {
				seen[name] = true
				scopes = append(scopes, name)
			}
		}
	}

	mainFormat, _ := project.Metadata["mainFormat"].(*string)
	accountSlug, _ := project.Metadata["accountSlug"].(string)
	projectSlug, _ := project.Metadata["slug"].(string)
	projectURL := phraseProjectURLFromSlugs(accountSlug, projectSlug)

	out := []File{}
	for _, scope := range scopes {
		query := ""
		if scope != "" {
			query = "?branch=" + url.QueryEscape(scope)
		}
		uploads, err := phraseStringsList[phraseUpload](ctx, p.client, projectPath+"/uploads"+query)
		if err != nil {
			return nil, err
		}
		keys, err := phraseStringsList[phraseKey](ctx, p.client, projectPath+"/keys"+query)
		if err != nil {
			return nil, err
		}
		for _, upload := range uploads {
			syncState := "pending"
			if upload.State != nil && *upload.State == "success" {
				syncState = "synced"
			}
			format := upload.Format
			if format == nil {
				format = mainFormat
			}
			externalURL := trimmedPtr(upload.URL)
			if externalURL == nil {
				externalURL = projectURL
			}
			out = append(out, File{
				ExternalResourceID: phraseScopedID(scope, upload.ID),
				ResourceType:       "file",
				SourcePath:         phraseUploadSourcePath(sourceLocale, upload.Filename, scope),
				DisplayName:        upload.Filename,
				Format:             format,
				Revision:           firstPtr(upload.UpdatedAt, upload.CreatedAt),
				ExternalURL:        externalURL,
				SyncState:          syncState,
				SourceLocale:       sourceLocale,
				TargetLocales:      targetLocales,
			})
		}
		for _, key := range keys {
			format := key.DataType
			if format == nil {
				format = mainFormat
			}
			out = append(out, File{
				ExternalResourceID: phraseScopedID(scope, key.ID),
				ResourceType:       "key",
				SourcePath:         phraseBranchScopedPath(scope, "keys/"+strings.TrimSpace(key.Name)),
				DisplayName:        key.Name,
				Format:             format,
				Revision:           firstPtr(key.UpdatedAt, key.CreatedAt),
				ExternalURL:        projectURL,
				SyncState:          "synced",
				SourceLocale:       sourceLocale,
				TargetLocales:      targetLocales,
			})
		}
	}
	return out, nil
}

// FileProgress: Phrase has no per-file progress in the web app either.
func (p *phraseStrings) FileProgress(context.Context, string, string) ([]FileProgress, error) {
	return []FileProgress{}, nil
}

// HiddenFileIDs: Phrase has no hidden strings.
func (p *phraseStrings) HiddenFileIDs(context.Context, string) ([]string, error) {
	return []string{}, nil
}

// phraseLocales splits the default (source) locale from the targets.
func phraseLocales(locales []phraseLocale) (*string, []string) {
	var source *string
	targets := []string{}
	for _, locale := range locales {
		identifier := phraseLocaleIdentifier(locale)
		if identifier == "" {
			continue
		}
		if locale.Default {
			if source == nil {
				source = &identifier
			}
			continue
		}
		targets = append(targets, identifier)
	}
	return source, targets
}

func phraseLocaleIdentifier(locale phraseLocale) string {
	if locale.Code != nil && strings.TrimSpace(*locale.Code) != "" {
		return strings.TrimSpace(*locale.Code)
	}
	return strings.TrimSpace(locale.Name)
}

func phraseProjectURL(project phraseProject) *string {
	if project.Account == nil {
		return nil
	}
	return phraseProjectURLFromSlugs(project.Account.Slug, project.Slug)
}

func phraseProjectURLFromSlugs(accountSlug, projectSlug string) *string {
	if accountSlug == "" || projectSlug == "" {
		return nil
	}
	value := "https://app.phrase.com/accounts/" + accountSlug + "/projects/" + projectSlug
	return &value
}

func phraseScopedID(branch, id string) string {
	id = strings.TrimSpace(id)
	if branch = strings.TrimSpace(branch); branch == "" {
		return id
	}
	return branch + "::" + id
}

func phraseBranchScopedPath(branch, relativePath string) string {
	if branch = strings.TrimSpace(branch); branch == "" {
		return relativePath
	}
	return "branches/" + encodeURIComponent(branch) + "/" + relativePath
}

func phraseUploadSourcePath(sourceLocale *string, filename, branch string) string {
	filename = strings.TrimSpace(filename)
	basePath := "uploads/" + filename
	if sourceLocale != nil && strings.TrimSpace(*sourceLocale) != "" {
		basePath = "locales/" + strings.TrimSpace(*sourceLocale) + "/" + filename
	}
	return phraseBranchScopedPath(branch, basePath)
}

func firstPtr(values ...*string) *string {
	for _, value := range values {
		if trimmed := trimmedPtr(value); trimmed != nil {
			return trimmed
		}
	}
	return nil
}

// encodeURIComponent matches JavaScript's, which the web app used to build
// these paths: spaces become %20 and !'()* stay as they are.
func encodeURIComponent(value string) string {
	escaped := strings.ReplaceAll(url.QueryEscape(value), "+", "%20")
	return strings.NewReplacer("%21", "!", "%27", "'", "%28", "(", "%29", ")", "%2A", "*").Replace(escaped)
}
