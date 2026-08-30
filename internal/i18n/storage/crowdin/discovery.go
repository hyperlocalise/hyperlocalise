package crowdin

import (
	"context"
	"fmt"
	"strings"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// ProjectFile is a source file in a Crowdin project.
type ProjectFile struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`
}

// ProjectLanguage is a language available to the project or account.
type ProjectLanguage struct {
	ID     string `json:"id"`
	Name   string `json:"name,omitempty"`
	Locale string `json:"locale,omitempty"`
}

// GlossarySummary is a Crowdin glossary identifier and name.
type GlossarySummary struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// TranslationMemorySummary is a Crowdin translation memory identifier and name.
type TranslationMemorySummary struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// ListProjectFiles returns source files, optionally scoped to a Crowdin branch name.
func (c *HTTPClient) ListProjectFiles(ctx context.Context, projectID, branch string) ([]ProjectFile, error) {
	if c == nil || c.client == nil {
		return nil, fmt.Errorf("crowdin file list: client is nil")
	}
	projectInt, err := parseProjectID(projectID)
	if err != nil {
		return nil, fmt.Errorf("crowdin file list: %w", err)
	}
	branchID := 0
	if strings.TrimSpace(branch) != "" {
		branchID, err = c.ResolveBranch(ctx, projectID, branch)
		if err != nil {
			return nil, err
		}
	}

	if branchID > 0 {
		return c.listProjectFilesPaged(ctx, projectInt, &model.FileListOptions{
			BranchID:  branchID,
			Recursion: true,
		})
	}

	// Crowdin only honors recursion with directoryId or branchId. On the default
	// branch, list root files plus recursive files under each top-level directory.
	out, err := c.listProjectFilesPaged(ctx, projectInt, &model.FileListOptions{})
	if err != nil {
		return nil, err
	}
	seen := make(map[int]struct{}, len(out))
	for _, file := range out {
		seen[file.ID] = struct{}{}
	}
	directories, err := c.listProjectDirectoriesPaged(ctx, projectInt, &model.DirectoryListOptions{})
	if err != nil {
		return nil, err
	}
	for _, directory := range directories {
		if directory == nil || directory.ID <= 0 {
			continue
		}
		nested, err := c.listProjectFilesPaged(ctx, projectInt, &model.FileListOptions{
			DirectoryID: directory.ID,
			Recursion:   true,
		})
		if err != nil {
			return nil, err
		}
		for _, file := range nested {
			if _, ok := seen[file.ID]; ok {
				continue
			}
			seen[file.ID] = struct{}{}
			out = append(out, file)
		}
	}
	return out, nil
}

func (c *HTTPClient) listProjectFilesPaged(ctx context.Context, projectID int, opts *model.FileListOptions) ([]ProjectFile, error) {
	if opts == nil {
		opts = &model.FileListOptions{}
	}
	out := make([]ProjectFile, 0)
	offset := 0
	for {
		pageOpts := *opts
		pageOpts.ListOptions = model.ListOptions{
			Limit:  pageLimit,
			Offset: offset,
		}
		files, _, err := c.client.SourceFiles.ListFiles(ctx, projectID, &pageOpts)
		if err != nil {
			return nil, fmt.Errorf("list crowdin files: %w", err)
		}
		for _, file := range files {
			if file == nil {
				continue
			}
			out = append(out, ProjectFile{ID: file.ID, Name: file.Name, Path: file.Path})
		}
		if len(files) < pageLimit {
			break
		}
		offset += pageLimit
	}
	return out, nil
}

func (c *HTTPClient) listProjectDirectoriesPaged(ctx context.Context, projectID int, opts *model.DirectoryListOptions) ([]*model.Directory, error) {
	if opts == nil {
		opts = &model.DirectoryListOptions{}
	}
	out := make([]*model.Directory, 0)
	offset := 0
	for {
		pageOpts := *opts
		pageOpts.ListOptions = model.ListOptions{
			Limit:  pageLimit,
			Offset: offset,
		}
		directories, _, err := c.client.SourceFiles.ListDirectories(ctx, projectID, &pageOpts)
		if err != nil {
			return nil, fmt.Errorf("list crowdin directories: %w", err)
		}
		out = append(out, directories...)
		if len(directories) < pageLimit {
			break
		}
		offset += pageLimit
	}
	return out, nil
}

// ListProjectLanguages returns target languages for the project.
func (c *HTTPClient) ListProjectLanguages(ctx context.Context, projectID string) ([]ProjectLanguage, error) {
	if c == nil || c.client == nil {
		return nil, fmt.Errorf("crowdin language list: client is nil")
	}
	projectInt, err := parseProjectID(projectID)
	if err != nil {
		return nil, fmt.Errorf("crowdin language list: %w", err)
	}
	project, _, err := c.client.Projects.Get(ctx, projectInt)
	if err != nil {
		return nil, fmt.Errorf("get crowdin project: %w", err)
	}
	if project == nil {
		return nil, fmt.Errorf("get crowdin project: empty response")
	}

	out := make([]ProjectLanguage, 0, len(project.TargetLanguageIDs)+len(project.TargetLanguages))
	seen := make(map[string]struct{})
	byID := make(map[string]*model.Language, len(project.TargetLanguages))
	for _, language := range project.TargetLanguages {
		if language == nil || strings.TrimSpace(language.ID) == "" {
			continue
		}
		byID[language.ID] = language
	}
	for _, languageID := range project.TargetLanguageIDs {
		languageID = strings.TrimSpace(languageID)
		if languageID == "" {
			continue
		}
		if _, ok := seen[languageID]; ok {
			continue
		}
		seen[languageID] = struct{}{}
		row := ProjectLanguage{ID: languageID}
		if language, ok := byID[languageID]; ok {
			row.Name = language.Name
			row.Locale = language.Locale
		}
		out = append(out, row)
	}
	if len(out) == 0 {
		for _, language := range project.TargetLanguages {
			if language == nil {
				continue
			}
			languageID := strings.TrimSpace(language.ID)
			if languageID == "" {
				continue
			}
			if _, ok := seen[languageID]; ok {
				continue
			}
			seen[languageID] = struct{}{}
			out = append(out, ProjectLanguage{
				ID:     languageID,
				Name:   language.Name,
				Locale: language.Locale,
			})
		}
	}
	return out, nil
}

// ListAllLanguages returns account-supported Crowdin languages.
func (c *HTTPClient) ListAllLanguages(ctx context.Context) ([]ProjectLanguage, error) {
	if c == nil || c.client == nil {
		return nil, fmt.Errorf("crowdin language list: client is nil")
	}
	out := make([]ProjectLanguage, 0)
	offset := 0
	for {
		languages, _, err := c.client.Languages.List(ctx, &model.ListOptions{
			Limit:  pageLimit,
			Offset: offset,
		})
		if err != nil {
			return nil, fmt.Errorf("list crowdin languages: %w", err)
		}
		for _, language := range languages {
			if language == nil {
				continue
			}
			out = append(out, ProjectLanguage{
				ID:     language.ID,
				Name:   language.Name,
				Locale: language.Locale,
			})
		}
		if len(languages) < pageLimit {
			break
		}
		offset += pageLimit
	}
	return out, nil
}

// ListGlossaries returns glossaries assigned to the Crowdin project.
func (c *HTTPClient) ListGlossaries(ctx context.Context, projectID string) ([]GlossarySummary, error) {
	if c == nil || c.client == nil {
		return nil, fmt.Errorf("crowdin glossary list: client is nil")
	}
	projectInt, err := parseProjectID(projectID)
	if err != nil {
		return nil, fmt.Errorf("crowdin glossary list: %w", err)
	}
	out := make([]GlossarySummary, 0)
	offset := 0
	for {
		glossaries, _, err := c.client.Glossaries.ListGlossaries(ctx, &model.GlossariesListOptions{
			ListOptions: model.ListOptions{
				Limit:  pageLimit,
				Offset: offset,
			},
		})
		if err != nil {
			return nil, fmt.Errorf("list crowdin glossaries: %w", err)
		}
		for _, glossary := range glossaries {
			if glossary == nil || !assignedToCrowdinProject(projectInt, glossary.DefaultProjectIDs, glossary.ProjectIDs) {
				continue
			}
			out = append(out, GlossarySummary{ID: glossary.ID, Name: glossary.Name})
		}
		if len(glossaries) < pageLimit {
			break
		}
		offset += pageLimit
	}
	return out, nil
}

// ListTranslationMemories returns translation memories assigned to the Crowdin project.
func (c *HTTPClient) ListTranslationMemories(ctx context.Context, projectID string) ([]TranslationMemorySummary, error) {
	if c == nil || c.client == nil {
		return nil, fmt.Errorf("crowdin translation memory list: client is nil")
	}
	projectInt, err := parseProjectID(projectID)
	if err != nil {
		return nil, fmt.Errorf("crowdin translation memory list: %w", err)
	}
	out := make([]TranslationMemorySummary, 0)
	offset := 0
	for {
		memories, _, err := c.client.TranslationMemory.ListTMs(ctx, &model.TranslationMemoriesListOptions{
			ListOptions: model.ListOptions{
				Limit:  pageLimit,
				Offset: offset,
			},
		})
		if err != nil {
			return nil, fmt.Errorf("list crowdin translation memories: %w", err)
		}
		for _, memory := range memories {
			if memory == nil || !assignedToCrowdinProject(projectInt, memory.DefaultProjectIDs, memory.ProjectIDs) {
				continue
			}
			out = append(out, TranslationMemorySummary{ID: memory.ID, Name: memory.Name})
		}
		if len(memories) < pageLimit {
			break
		}
		offset += pageLimit
	}
	return out, nil
}

func assignedToCrowdinProject(projectID int, defaultProjectIDs, projectIDs []int) bool {
	if len(defaultProjectIDs) == 0 && len(projectIDs) == 0 {
		return true
	}
	for _, id := range defaultProjectIDs {
		if id == projectID {
			return true
		}
	}
	for _, id := range projectIDs {
		if id == projectID {
			return true
		}
	}
	return false
}
