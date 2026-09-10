package lokalise

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

var (
	lokaliseListPageLimit = glossaryLanguagePageLimit
	lokaliseListMaxPages  = lokaliseMaxLanguagePages
)

// LocaleListInput identifies a Lokalise project whose languages should be listed.
type LocaleListInput struct {
	ProjectID string
	Branch    string
}

// LocaleListItem is one project language from GET /projects/{id}/languages.
// Official fields only: lang_id, lang_iso, lang_name. There is no is_default.
type LocaleListItem struct {
	LanguageID   int64  `json:"lang_id"`
	LanguageISO  string `json:"lang_iso"`
	LanguageName string `json:"lang_name,omitempty"`
}

// FileListInput lists files in a Lokalise project.
type FileListInput struct {
	ProjectID      string
	Branch         string
	FilterFilename string
}

// FileListItem is one file from GET /projects/{id}/files.
// Keys with no file association use filename __unassigned__ (file_id may be -1).
type FileListItem struct {
	FileID   int64  `json:"file_id"`
	Filename string `json:"filename"`
	KeyCount int    `json:"key_count"`
}

type projectFilesResponse struct {
	Files []FileListItem `json:"files"`
	Items []FileListItem `json:"items"`
	Data  []FileListItem `json:"data"`
}

// ListProjectLanguages pages GET /projects/{id}/languages.
func (c *HTTPClient) ListProjectLanguages(ctx context.Context, in LocaleListInput) ([]LocaleListItem, error) {
	if c == nil || c.httpClient == nil {
		return nil, fmt.Errorf("lokalise locales list: client is nil")
	}
	projectID := strings.TrimSpace(in.ProjectID)
	if projectID == "" {
		return nil, fmt.Errorf("lokalise locales list: project id is required")
	}
	if strings.TrimSpace(c.apiToken) == "" {
		return nil, fmt.Errorf("lokalise locales list: api token is required")
	}

	limit := lokaliseListPageLimit
	if limit <= 0 {
		limit = glossaryLanguagePageLimit
	}
	maxPages := lokaliseListMaxPages
	if maxPages <= 0 {
		maxPages = lokaliseMaxLanguagePages
	}

	out := make([]LocaleListItem, 0)
	for page := 1; ; page++ {
		if page > maxPages {
			return nil, fmt.Errorf("lokalise locales list: pagination exceeded %d pages", maxPages)
		}
		endpoint, err := url.Parse(c.baseURL + "/projects/" + lokaliseProjectPathSegment(projectID, in.Branch) + "/languages")
		if err != nil {
			return nil, fmt.Errorf("lokalise locales list: build URL: %w", err)
		}
		q := endpoint.Query()
		q.Set("limit", fmt.Sprintf("%d", limit))
		q.Set("page", fmt.Sprintf("%d", page))
		endpoint.RawQuery = q.Encode()

		var resp projectLanguagesResponse
		if _, err := c.doLokaliseJSON(ctx, http.MethodGet, endpoint.String(), &resp); err != nil {
			return nil, fmt.Errorf("lokalise locales list: %w", err)
		}
		languages := resp.Languages
		if len(languages) == 0 && len(resp.Items) > 0 {
			languages = resp.Items
		}
		if len(languages) == 0 && len(resp.Data) > 0 {
			languages = resp.Data
		}
		if len(languages) == 0 {
			break
		}
		for _, lang := range languages {
			out = append(out, LocaleListItem{
				LanguageID:   lang.LanguageID,
				LanguageISO:  strings.TrimSpace(lang.LanguageISO),
				LanguageName: strings.TrimSpace(lang.LanguageName),
			})
		}
		if len(languages) < limit {
			break
		}
	}
	return out, nil
}

// ListFiles pages GET /projects/{id}/files.
func (c *HTTPClient) ListFiles(ctx context.Context, in FileListInput) ([]FileListItem, error) {
	if c == nil || c.httpClient == nil {
		return nil, fmt.Errorf("lokalise files list: client is nil")
	}
	projectID := strings.TrimSpace(in.ProjectID)
	if projectID == "" {
		return nil, fmt.Errorf("lokalise files list: project id is required")
	}
	if strings.TrimSpace(c.apiToken) == "" {
		return nil, fmt.Errorf("lokalise files list: api token is required")
	}

	limit := lokaliseListPageLimit
	if limit <= 0 {
		limit = glossaryLanguagePageLimit
	}
	maxPages := lokaliseListMaxPages
	if maxPages <= 0 {
		maxPages = lokaliseMaxLanguagePages
	}

	out := make([]FileListItem, 0)
	for page := 1; ; page++ {
		if page > maxPages {
			return nil, fmt.Errorf("lokalise files list: pagination exceeded %d pages", maxPages)
		}
		endpoint, err := url.Parse(c.baseURL + "/projects/" + lokaliseProjectPathSegment(projectID, in.Branch) + "/files")
		if err != nil {
			return nil, fmt.Errorf("lokalise files list: build URL: %w", err)
		}
		q := endpoint.Query()
		q.Set("limit", fmt.Sprintf("%d", limit))
		q.Set("page", fmt.Sprintf("%d", page))
		if filter := strings.TrimSpace(in.FilterFilename); filter != "" {
			q.Set("filter_filename", filter)
		}
		endpoint.RawQuery = q.Encode()

		var resp projectFilesResponse
		if _, err := c.doLokaliseJSON(ctx, http.MethodGet, endpoint.String(), &resp); err != nil {
			return nil, fmt.Errorf("lokalise files list: %w", err)
		}
		files := resp.Files
		if len(files) == 0 && len(resp.Items) > 0 {
			files = resp.Items
		}
		if len(files) == 0 && len(resp.Data) > 0 {
			files = resp.Data
		}
		if len(files) == 0 {
			break
		}
		for _, file := range files {
			out = append(out, FileListItem{
				FileID:   file.FileID,
				Filename: strings.TrimSpace(file.Filename),
				KeyCount: file.KeyCount,
			})
		}
		if len(files) < limit {
			break
		}
	}
	return out, nil
}
