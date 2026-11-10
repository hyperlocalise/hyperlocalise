package tmscatalog

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// Crowdin projects, files, branches, file progress and hidden files, as the
// web's crowdin-provider.ts and tms-provider-live.ts read them.

const (
	crowdinProjectsOrderBy = "lastActivity desc"
	// crowdinHiddenScanMax caps the hidden strings scanned for candidate files.
	crowdinHiddenScanMax       = 5000
	crowdinHiddenProbeParallel = 5
)

var safeDataImage = regexp.MustCompile(`^data:image/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$`)

type crowdinProject struct {
	ID                int      `json:"id"`
	Identifier        string   `json:"identifier"`
	Name              string   `json:"name"`
	Description       *string  `json:"description"`
	SourceLanguageID  string   `json:"sourceLanguageId"`
	TargetLanguageIDs []string `json:"targetLanguageIds"`
	WebURL            *string  `json:"webUrl"`
	IsSuspended       bool     `json:"isSuspended"`
	Logo              *string  `json:"logo"`
	LastActivity      *string  `json:"lastActivity"`
}

type crowdinBranch struct {
	ID    int     `json:"id"`
	Name  string  `json:"name"`
	Title *string `json:"title"`
}

type crowdinDirectory struct {
	ID          int    `json:"id"`
	DirectoryID *int   `json:"directoryId"`
	Name        string `json:"name"`
}

type crowdinFile struct {
	ID          int     `json:"id"`
	BranchID    *int    `json:"branchId"`
	DirectoryID *int    `json:"directoryId"`
	Name        string  `json:"name"`
	Title       *string `json:"title"`
	Type        string  `json:"type"`
	RevisionID  int     `json:"revisionId"`
	Status      string  `json:"status"`
}

func crowdinList[T any](ctx context.Context, c *crowdin, path string) ([]T, error) {
	items := []T{}
	separator := "?"
	if strings.Contains(path, "?") {
		separator = "&"
	}
	for offset := 0; ; offset += crowdinPageLimit {
		var page struct {
			Data []struct {
				Data T `json:"data"`
			} `json:"data"`
		}
		query := separator + "limit=" + strconv.Itoa(crowdinPageLimit) + "&offset=" + strconv.Itoa(offset)
		if err := c.doJSON(ctx, http.MethodGet, path+query, nil, &page); err != nil {
			return nil, err
		}
		for _, item := range page.Data {
			items = append(items, item.Data)
		}
		if len(page.Data) < crowdinPageLimit {
			return items, nil
		}
	}
}

func (c *crowdin) ListProjects(ctx context.Context) ([]Project, error) {
	projects, err := crowdinList[crowdinProject](ctx, c, "/projects?orderBy="+url.QueryEscape(crowdinProjectsOrderBy))
	if err != nil {
		return nil, err
	}
	out := make([]Project, 0, len(projects))
	for _, project := range projects {
		out = append(out, crowdinProjectMetadata(project))
	}
	return out, nil
}

func (c *crowdin) GetProject(ctx context.Context, externalID string) (*Project, error) {
	projectID, ok := crowdinProjectID(externalID)
	if !ok {
		return nil, nil
	}
	var body struct {
		Data crowdinProject `json:"data"`
	}
	if err := c.doJSON(ctx, http.MethodGet, "/projects/"+strconv.Itoa(projectID), nil, &body); err != nil {
		var providerErr *ProviderError
		if errors.As(err, &providerErr) && providerErr.Status == http.StatusNotFound {
			return nil, nil
		}
		return nil, err
	}
	project := crowdinProjectMetadata(body.Data)
	return &project, nil
}

func crowdinProjectMetadata(project crowdinProject) Project {
	out := Project{
		ExternalID:     strconv.Itoa(project.ID),
		Name:           project.Name,
		SourceLocale:   stringPtr(project.SourceLanguageID),
		TargetLocales:  nonNil(project.TargetLanguageIDs),
		IsActive:       !project.IsSuspended,
		LastActivityAt: trimmedPtr(project.LastActivity),
		Metadata:       map[string]any{"identifier": project.Identifier},
		URL:            trimmedPtr(project.WebURL),
		Description:    trimmedPtr(project.Description),
	}
	if project.Logo != nil {
		out.LogoURL = safeLogoURL(*project.Logo)
	}
	return out
}

func (c *crowdin) ListBranches(ctx context.Context, externalID string) ([]Branch, error) {
	projectID, ok := crowdinProjectID(externalID)
	if !ok {
		return []Branch{}, nil
	}
	branches, err := crowdinList[crowdinBranch](ctx, c, "/projects/"+strconv.Itoa(projectID)+"/branches")
	if err != nil {
		return nil, err
	}
	out := make([]Branch, 0, len(branches))
	for _, branch := range branches {
		out = append(out, Branch{Name: branch.Name, Title: trimmedPtr(branch.Title)})
	}
	return out, nil
}

// ListFiles walks the root and every branch (or just branch), resolving each
// file's branch and directories into a source path.
func (c *crowdin) ListFiles(ctx context.Context, project Project, branch string, _ int) ([]File, error) {
	projectID, ok := crowdinProjectID(project.ExternalID)
	if !ok {
		return nil, fmt.Errorf("crowdin: invalid project id %q", project.ExternalID)
	}
	projectPath := "/projects/" + strconv.Itoa(projectID)
	branches, err := crowdinList[crowdinBranch](ctx, c, projectPath+"/branches")
	if err != nil {
		return nil, err
	}
	branchNames := map[int]string{0: ""}
	for _, item := range branches {
		branchNames[item.ID] = item.Name
	}
	directoryPaths := map[int]string{}
	files := []crowdinFile{}

	addScope := func(branchID *int) error {
		query := ""
		if branchID != nil {
			query = "?branchId=" + strconv.Itoa(*branchID)
		}
		directories, err := crowdinList[crowdinDirectory](ctx, c, projectPath+"/directories"+query)
		if err != nil {
			return err
		}
		crowdinDirectoryPaths(directories, directoryPaths)
		scopeFiles, err := crowdinList[crowdinFile](ctx, c, projectPath+"/files"+query)
		if err != nil {
			return err
		}
		if branchID == nil {
			for _, file := range scopeFiles {
				if file.BranchID == nil {
					files = append(files, file)
				}
			}
			return nil
		}
		files = append(files, scopeFiles...)
		return nil
	}

	if branch = strings.TrimSpace(branch); branch != "" {
		var target *crowdinBranch
		for index := range branches {
			if branches[index].Name == branch {
				target = &branches[index]
				break
			}
		}
		if target == nil {
			return []File{}, nil
		}
		if err := addScope(&target.ID); err != nil {
			return nil, err
		}
	} else {
		// Root directories first, then each branch, then root files: the web's order.
		rootDirectories, err := crowdinList[crowdinDirectory](ctx, c, projectPath+"/directories")
		if err != nil {
			return nil, err
		}
		crowdinDirectoryPaths(rootDirectories, directoryPaths)
		for index := range branches {
			if err := addScope(&branches[index].ID); err != nil {
				return nil, err
			}
		}
		if err := addScope(nil); err != nil {
			return nil, err
		}
	}

	webOrigin := crowdinWebOrigin(c.credentials.BaseURL)
	out := make([]File, 0, len(files))
	for _, file := range files {
		syncState := "pending"
		if file.Status == "active" {
			syncState = "synced"
		}
		displayName := file.Name
		if file.Title != nil && strings.TrimSpace(*file.Title) != "" {
			displayName = *file.Title
		}
		revision := strconv.Itoa(file.RevisionID)
		externalURL := fmt.Sprintf("%s/project/%d/files/%d", webOrigin, projectID, file.ID)
		out = append(out, File{
			ExternalResourceID: strconv.Itoa(file.ID),
			ResourceType:       "file",
			SourcePath:         crowdinSourcePath(file, branchNames, directoryPaths),
			DisplayName:        displayName,
			Format:             stringPtr(file.Type),
			Revision:           &revision,
			ExternalURL:        &externalURL,
			SyncState:          syncState,
			SourceLocale:       project.SourceLocale,
			TargetLocales:      project.TargetLocales,
		})
	}
	return out, nil
}

func crowdinDirectoryPaths(directories []crowdinDirectory, paths map[int]string) {
	byID := make(map[int]crowdinDirectory, len(directories))
	for _, directory := range directories {
		byID[directory.ID] = directory
	}
	for _, directory := range directories {
		parts := []string{}
		visited := map[int]bool{}
		current := &directory.ID
		for current != nil && !visited[*current] {
			visited[*current] = true
			info, ok := byID[*current]
			if !ok {
				break
			}
			parts = append([]string{info.Name}, parts...)
			current = info.DirectoryID
		}
		if len(parts) > 0 {
			paths[directory.ID] = strings.Join(parts, "/") + "/"
		} else {
			paths[directory.ID] = ""
		}
	}
}

func crowdinSourcePath(file crowdinFile, branchNames map[int]string, directoryPaths map[int]string) string {
	branchName := ""
	if file.BranchID != nil && *file.BranchID != 0 {
		branchName = branchNames[*file.BranchID]
		if branchName == "" {
			branchName = fmt.Sprintf("__hl-branch-id-%d__", *file.BranchID)
		}
	}
	directoryPath := ""
	if file.DirectoryID != nil && *file.DirectoryID != 0 {
		directoryPath = directoryPaths[*file.DirectoryID]
	}
	if branchName != "" {
		return branchName + "/" + directoryPath + file.Name
	}
	return directoryPath + file.Name
}

// crowdinWebOrigin turns the API base (…/api/v2) into the web app origin.
func crowdinWebOrigin(baseURL string) string {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://api.crowdin.com/api/v2"
	}
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return "https://crowdin.com"
	}
	if parsed.Hostname() == "api.crowdin.com" {
		parsed.Host = strings.Replace(parsed.Host, "api.crowdin.com", "crowdin.com", 1)
	}
	parsed.Path, parsed.RawQuery, parsed.Fragment = "", "", ""
	return strings.TrimRight(parsed.String(), "/")
}

func (c *crowdin) FileProgress(ctx context.Context, externalID, locale string) ([]FileProgress, error) {
	projectID, ok := crowdinProjectID(externalID)
	if !ok || strings.TrimSpace(locale) == "" {
		return []FileProgress{}, nil
	}
	type row struct {
		FileID              *int   `json:"fileId"`
		TranslationProgress int    `json:"translationProgress"`
		ApprovalProgress    int    `json:"approvalProgress"`
		Phrases             Counts `json:"phrases"`
	}
	rows, err := crowdinList[row](ctx, c, "/projects/"+strconv.Itoa(projectID)+"/languages/"+url.PathEscape(locale)+"/progress")
	if err != nil {
		return nil, err
	}
	out := []FileProgress{}
	for _, item := range rows {
		if item.FileID == nil {
			continue
		}
		out = append(out, FileProgress{
			ExternalResourceID:  strconv.Itoa(*item.FileID),
			TranslationProgress: item.TranslationProgress,
			ApprovalProgress:    item.ApprovalProgress,
			Phrases:             item.Phrases,
		})
	}
	return out, nil
}

// HiddenFileIDs finds files whose every string is hidden: Crowdin files carry
// no hidden flag, so files owning a hidden string are probed for a visible one.
func (c *crowdin) HiddenFileIDs(ctx context.Context, externalID string) ([]string, error) {
	projectID, ok := crowdinProjectID(externalID)
	if !ok {
		return []string{}, nil
	}
	hidden, err := c.sourceStringFileIDs(ctx, projectID, "is hidden", crowdinHiddenScanMax)
	if err != nil {
		return nil, err
	}
	seen := map[int]bool{}
	candidates := []int{}
	for _, fileID := range hidden {
		if !seen[fileID] {
			seen[fileID] = true
			candidates = append(candidates, fileID)
		}
	}
	probed, err := mapConcurrent(ctx, candidates, crowdinHiddenProbeParallel, func(ctx context.Context, fileID int) (string, error) {
		visible, err := c.sourceStringFileIDs(ctx, projectID, fmt.Sprintf("id of file = %d and not is hidden", fileID), 1)
		if err != nil {
			return "", err
		}
		if len(visible) == 0 {
			return strconv.Itoa(fileID), nil
		}
		return "", nil
	})
	if err != nil {
		return nil, err
	}
	out := []string{}
	for _, fileID := range probed {
		if fileID != "" {
			out = append(out, fileID)
		}
	}
	return out, nil
}

// sourceStringFileIDs pages /strings with a CroQL filter, returning each
// string's file id (nil file ids skipped), up to maxItems strings.
func (c *crowdin) sourceStringFileIDs(ctx context.Context, projectID int, croql string, maxItems int) ([]int, error) {
	fileIDs := []int{}
	seenStrings := 0
	for offset := 0; seenStrings < maxItems; {
		limit := min(maxItems-seenStrings, crowdinPageLimit)
		params := url.Values{}
		params.Set("limit", strconv.Itoa(limit))
		params.Set("offset", strconv.Itoa(offset))
		params.Set("croql", croql)
		var page struct {
			Data []struct {
				Data struct {
					FileID *int `json:"fileId"`
				} `json:"data"`
			} `json:"data"`
		}
		if err := c.doJSON(ctx, http.MethodGet, "/projects/"+strconv.Itoa(projectID)+"/strings?"+params.Encode(), nil, &page); err != nil {
			return nil, err
		}
		for _, item := range page.Data {
			if item.Data.FileID != nil {
				fileIDs = append(fileIDs, *item.Data.FileID)
			}
		}
		seenStrings += len(page.Data)
		offset += len(page.Data)
		if len(page.Data) < limit {
			break
		}
	}
	return fileIDs, nil
}

func crowdinProjectID(externalID string) (int, bool) {
	projectID, err := strconv.Atoi(strings.TrimSpace(externalID))
	return projectID, err == nil && projectID > 0
}

func trimmedPtr(value *string) *string {
	if value == nil {
		return nil
	}
	return stringPtr(*value)
}

// safeLogoURL keeps http(s) logos and small inline images, as the web does.
func safeLogoURL(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	if strings.HasPrefix(value, "data:image/") {
		if safeDataImage.MatchString(value) {
			return &value
		}
		return nil
	}
	parsed, err := url.Parse(value)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil {
		return nil
	}
	parsed.Fragment = ""
	clean := parsed.String()
	return &clean
}
