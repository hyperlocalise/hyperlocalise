package tmscatalog

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
)

// Smartling projects, files and their strings, as the web's
// smartling-provider.ts reads them. Each source string is also a "key"
// resource under its file.

const (
	smartlingAccountsAPI    = "/accounts-api/v2"
	smartlingFilesAPI       = "/files-api/v2"
	smartlingStringsAPI     = "/strings-api/v2"
	smartlingListPageLimit  = 500
	smartlingDetailParallel = 15
	// smartlingStringsParallel is how many files' strings are listed at once.
	smartlingStringsParallel = 8
)

type smartlingProjectDetails struct {
	AccountUID      string  `json:"accountUid"`
	ProjectID       string  `json:"projectId"`
	ProjectName     string  `json:"projectName"`
	SourceLocaleID  string  `json:"sourceLocaleId"`
	Archived        bool    `json:"archived"`
	ProjectTypeCode *string `json:"projectTypeCode"`
	TargetLocales   []struct {
		LocaleID string `json:"localeId"`
		Enabled  *bool  `json:"enabled"`
	} `json:"targetLocales"`
}

type smartlingFile struct {
	FileURI      string  `json:"fileUri"`
	FileType     *string `json:"fileType"`
	LastUploaded *string `json:"lastUploaded"`
}

type smartlingSourceString struct {
	Hashcode   string  `json:"hashcode"`
	StringText *string `json:"stringText"`
}

func (s *smartling) projectDetails(ctx context.Context, projectID string) (smartlingProjectDetails, error) {
	var details smartlingProjectDetails
	err := s.doData(ctx, http.MethodGet, smartlingProjectsAPI+"/projects/"+url.PathEscape(projectID), nil, &details)
	return details, err
}

// ListProjects lists the account's projects, or the one synced project when
// the account UID is unknown, each with its target locales.
func (s *smartling) ListProjects(ctx context.Context) ([]Project, error) {
	if s.accountUID == "" && strings.TrimSpace(s.credentials.ProjectID) != "" {
		details, err := s.projectDetails(ctx, s.credentials.ProjectID)
		if err != nil {
			return nil, err
		}
		return []Project{smartlingProject(details, "")}, nil
	}
	account, err := s.account(ctx)
	if err != nil {
		return nil, err
	}
	summaries, err := smartlingList[smartlingProjectDetails](ctx, s, smartlingAccountsAPI+"/accounts/"+url.PathEscape(account)+"/projects", nil, smartlingListPageLimit)
	if err != nil {
		return nil, err
	}
	return mapConcurrent(ctx, summaries, smartlingDetailParallel, func(ctx context.Context, summary smartlingProjectDetails) (Project, error) {
		if len(summary.TargetLocales) > 0 {
			return smartlingProject(summary, ""), nil
		}
		details, err := s.projectDetails(ctx, summary.ProjectID)
		if err != nil {
			var providerErr *ProviderError
			if errors.As(err, &providerErr) && providerErr.Status == http.StatusUnauthorized {
				return Project{}, err
			}
			return smartlingProject(summary, err.Error()), nil
		}
		return smartlingProject(details, ""), nil
	})
}

func (s *smartling) GetProject(ctx context.Context, externalID string) (*Project, error) {
	externalID = strings.TrimSpace(externalID)
	if externalID == "" {
		return nil, nil
	}
	details, err := s.projectDetails(ctx, externalID)
	if err != nil {
		var providerErr *ProviderError
		if errors.As(err, &providerErr) && providerErr.Status == http.StatusNotFound {
			return nil, nil
		}
		return nil, err
	}
	project := smartlingProject(details, "")
	return &project, nil
}

func smartlingProject(details smartlingProjectDetails, syncWarning string) Project {
	projectURL := "https://dashboard.smartling.com/app/accounts/" + encodeURIComponent(details.AccountUID) + "/project/" + encodeURIComponent(details.ProjectID) + "/dashboard"
	metadata := map[string]any{
		"accountUid":      details.AccountUID,
		"projectTypeCode": details.ProjectTypeCode,
	}
	if syncWarning != "" {
		metadata["syncWarning"] = syncWarning
	}
	return Project{
		ExternalID:    details.ProjectID,
		Name:          details.ProjectName,
		SourceLocale:  stringPtr(details.SourceLocaleID),
		TargetLocales: smartlingTargets(details),
		URL:           &projectURL,
		IsActive:      !details.Archived,
		Metadata:      metadata,
	}
}

func smartlingTargets(details smartlingProjectDetails) []string {
	targets := []string{}
	for _, locale := range details.TargetLocales {
		if locale.Enabled == nil || *locale.Enabled {
			targets = append(targets, locale.LocaleID)
		}
	}
	return targets
}

// ListBranches: Smartling has no branches.
func (s *smartling) ListBranches(context.Context, string) ([]Branch, error) {
	return []Branch{}, nil
}

// ListFiles lists the project's files, then each file's source strings as keys.
// Smartling's strings API needs a fileUri, so keys cost one listing per file:
// those run smartlingStringsParallel at a time, in file order, and stop once
// limit resources are listed, since the caller drops the rest.
func (s *smartling) ListFiles(ctx context.Context, project Project, _ string, limit int) ([]File, error) {
	projectID := strings.TrimSpace(project.ExternalID)
	if projectID == "" {
		return nil, errors.New("smartling: invalid project id")
	}
	details, err := s.projectDetails(ctx, projectID)
	if err != nil {
		return nil, err
	}
	targetLocales := smartlingTargets(details)
	sourceLocale := stringPtr(details.SourceLocaleID)
	projectPath := "/projects/" + url.PathEscape(projectID)
	files, err := smartlingList[smartlingFile](ctx, s, smartlingFilesAPI+projectPath+"/files/list", nil, smartlingListPageLimit)
	if err != nil {
		return nil, err
	}

	out := make([]File, 0, len(files))
	fileURLs := make([]*string, len(files))
	for index, file := range files {
		fileURL := "https://dashboard.smartling.com/app/accounts/" + encodeURIComponent(details.AccountUID) + "/project/" + encodeURIComponent(projectID) + "/files?" + url.Values{"fileUri": {file.FileURI}}.Encode()
		fileURLs[index] = &fileURL
		out = append(out, File{
			ExternalResourceID: file.FileURI,
			ResourceType:       "file",
			SourcePath:         file.FileURI,
			DisplayName:        lastPathSegment(file.FileURI),
			Format:             trimmedPtr(file.FileType),
			Revision:           trimmedPtr(file.LastUploaded),
			ExternalURL:        &fileURL,
			SyncState:          "synced",
			SourceLocale:       sourceLocale,
			TargetLocales:      targetLocales,
		})
	}

	full := func() bool { return limit > 0 && len(out) >= limit }
	for start := 0; start < len(files) && !full(); start += smartlingStringsParallel {
		batch := files[start:min(start+smartlingStringsParallel, len(files))]
		keys, err := mapConcurrent(ctx, batch, smartlingStringsParallel, func(ctx context.Context, file smartlingFile) ([]File, error) {
			return s.fileKeys(ctx, projectPath, file)
		})
		if err != nil {
			return nil, err
		}
		for offset, fileKeys := range keys {
			placeholderPath := batch[offset].FileURI + "/keys"
			for index := range fileKeys {
				// The placeholder for a file whose strings failed has no link, as on the web.
				if fileKeys[index].SourcePath != placeholderPath {
					fileKeys[index].ExternalURL = fileURLs[start+offset]
				}
				fileKeys[index].SourceLocale = sourceLocale
				fileKeys[index].TargetLocales = targetLocales
			}
			out = append(out, fileKeys...)
		}
	}
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

// fileKeys lists one file's source strings as key resources. A failure other
// than a refused token becomes a single placeholder row, as in the web app.
func (s *smartling) fileKeys(ctx context.Context, projectPath string, file smartlingFile) ([]File, error) {
	strs, err := smartlingList[smartlingSourceString](ctx, s, smartlingStringsAPI+projectPath+"/source-strings", url.Values{"fileUri": {file.FileURI}}, smartlingListPageLimit)
	if err != nil {
		var providerErr *ProviderError
		if errors.As(err, &providerErr) && providerErr.Status == http.StatusUnauthorized {
			return nil, err
		}
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return []File{{
			ExternalResourceID: file.FileURI,
			ResourceType:       "key",
			SourcePath:         file.FileURI + "/keys",
			DisplayName:        lastPathSegment(file.FileURI) + " keys",
			SyncState:          "synced",
		}}, nil
	}
	keys := make([]File, 0, len(strs))
	for _, str := range strs {
		displayName := str.Hashcode
		if str.StringText != nil && *str.StringText != "" {
			displayName = *str.StringText
		}
		keys = append(keys, File{
			ExternalResourceID: file.FileURI + "::" + str.Hashcode,
			ResourceType:       "key",
			SourcePath:         file.FileURI + "/keys/" + str.Hashcode,
			DisplayName:        displayName,
			SyncState:          "synced",
		})
	}
	return keys, nil
}

// FileProgress: the web app reads per-file progress from Crowdin only.
func (s *smartling) FileProgress(context.Context, string, string) ([]FileProgress, error) {
	return []FileProgress{}, nil
}

// HiddenFileIDs: the web app reads hidden files from Crowdin only.
func (s *smartling) HiddenFileIDs(context.Context, string) ([]string, error) {
	return []string{}, nil
}
