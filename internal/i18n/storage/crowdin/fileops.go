package crowdin

import (
	"context"
	"fmt"
	"path"
	"path/filepath"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

// ResolveProjectFile finds a Crowdin source file by branch-relative path.
func (c *HTTPClient) ResolveProjectFile(ctx context.Context, projectID, branch, crowdinPath string) (ProjectFile, error) {
	if c == nil || c.client == nil {
		return ProjectFile{}, fmt.Errorf("crowdin file: client is nil")
	}
	want := normalizeCrowdinPath(crowdinPath)
	if want == "" {
		return ProjectFile{}, fmt.Errorf("crowdin file: path is required")
	}
	files, err := c.ListProjectFiles(ctx, projectID, branch)
	if err != nil {
		return ProjectFile{}, err
	}
	pathMatches := make([]ProjectFile, 0)
	nameMatches := make([]ProjectFile, 0)
	for _, file := range files {
		if normalizeCrowdinPath(file.Path) == want {
			pathMatches = append(pathMatches, file)
			continue
		}
		if normalizeCrowdinPath(file.Name) == want {
			nameMatches = append(nameMatches, file)
		}
	}
	if len(pathMatches) == 1 {
		return pathMatches[0], nil
	}
	if len(pathMatches) > 1 {
		return ProjectFile{}, fmt.Errorf("crowdin file %q is ambiguous", crowdinPath)
	}
	if len(nameMatches) == 1 {
		return nameMatches[0], nil
	}
	if len(nameMatches) > 1 {
		return ProjectFile{}, fmt.Errorf("crowdin file %q is ambiguous", crowdinPath)
	}
	return ProjectFile{}, fmt.Errorf("crowdin file %q not found", crowdinPath)
}

// UploadProjectFile adds or updates one source file at a Crowdin destination path.
func (c *HTTPClient) UploadProjectFile(ctx context.Context, projectID, branch, dest, localPath string) (int, error) {
	if c == nil || c.client == nil {
		return 0, fmt.Errorf("crowdin file upload: client is nil")
	}
	if strings.TrimSpace(localPath) == "" {
		return 0, fmt.Errorf("crowdin file upload: input path is required")
	}
	dir, name, err := splitCrowdinDest(dest)
	if err != nil {
		return 0, fmt.Errorf("crowdin file upload: %w", err)
	}
	branchID, err := c.ResolveBranch(ctx, projectID, branch)
	if err != nil {
		return 0, err
	}
	directoryID := 0
	if dir != "" {
		directoryID, err = c.EnsureDirectory(ctx, projectID, branchID, dir)
		if err != nil {
			return 0, err
		}
	}
	return c.UpsertSourceFile(ctx, projectID, branchID, directoryID, name, localPath, storage.FileGroupSpec{})
}

// DownloadProjectFile downloads a source file, or a translation file when language is set.
func (c *HTTPClient) DownloadProjectFile(ctx context.Context, projectID, branch, crowdinPath, language string) ([]byte, error) {
	if c == nil || c.client == nil {
		return nil, fmt.Errorf("crowdin file download: client is nil")
	}
	file, err := c.ResolveProjectFile(ctx, projectID, branch, crowdinPath)
	if err != nil {
		return nil, err
	}
	language = strings.TrimSpace(language)
	if language == "" {
		return c.DownloadSourceFile(ctx, projectID, file.ID)
	}
	locales, err := c.ResolveLocales(ctx, projectID, []string{language})
	if err != nil {
		return nil, err
	}
	if len(locales) == 0 || strings.TrimSpace(locales[0].LanguageID) == "" {
		return nil, fmt.Errorf("crowdin file download: language %q not found", language)
	}
	payload, err := c.DownloadTranslationFile(ctx, projectID, file.ID, locales[0].LanguageID, storage.FileExportOptions{})
	if err != nil {
		return nil, err
	}
	if payload == nil {
		return nil, fmt.Errorf("crowdin file download: empty translation for %q language %s", crowdinPath, locales[0].LanguageID)
	}
	return payload, nil
}

// DeleteProjectFile deletes a source file identified by Crowdin path.
func (c *HTTPClient) DeleteProjectFile(ctx context.Context, projectID, branch, crowdinPath string) error {
	if c == nil || c.client == nil {
		return fmt.Errorf("crowdin file delete: client is nil")
	}
	file, err := c.ResolveProjectFile(ctx, projectID, branch, crowdinPath)
	if err != nil {
		return err
	}
	projectInt, err := parseProjectID(projectID)
	if err != nil {
		return fmt.Errorf("crowdin file delete: %w", err)
	}
	if _, err := c.client.SourceFiles.DeleteFile(ctx, projectInt, file.ID); err != nil {
		return fmt.Errorf("delete crowdin file %d: %w", file.ID, err)
	}
	return nil
}

func normalizeCrowdinPath(value string) string {
	return strings.Trim(strings.TrimSpace(filepath.ToSlash(value)), "/")
}

func splitCrowdinDest(dest string) (dir, name string, err error) {
	normalized := normalizeCrowdinPath(dest)
	if normalized == "" {
		return "", "", fmt.Errorf("destination path is required")
	}
	name = path.Base(normalized)
	if name == "" || name == "." || name == "/" {
		return "", "", fmt.Errorf("destination path %q has no file name", dest)
	}
	dir = path.Dir(normalized)
	if dir == "." {
		dir = ""
	}
	return dir, name, nil
}
