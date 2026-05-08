package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Using projects, you can keep your source files sorted.
// Use API to manage projects, change their settings, or remove them if required.
//
// Crowdin API docs:
// https://developer.crowdin.com/api/v2/#tag/Projects
type ProjectsService struct {
	client *Client
}

// List returns a list of projects.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.getMany
func (s *ProjectsService) List(ctx context.Context, opts *model.ProjectsListOptions) ([]*model.Project, *Response, error) {
	res := new(model.ProjectsListResponse)
	resp, err := s.client.Get(ctx, "/api/v2/projects", opts, res)
	if err != nil {
		return nil, resp, err
	}

	projects := make([]*model.Project, 0, len(res.Data))
	for _, project := range res.Data {
		projects = append(projects, project.Data)
	}

	return projects, resp, nil
}

// Get returns a project by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.get
func (s *ProjectsService) Get(ctx context.Context, id int) (*model.Project, *Response, error) {
	res := new(model.ProjectsGetResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d", id), nil, res)

	return res.Data, resp, err
}

// Add creates a new project.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.post
func (s *ProjectsService) Add(ctx context.Context, req *model.ProjectsAddRequest) (*model.Project, *Response, error) {
	res := new(model.ProjectsGetResponse)
	resp, err := s.client.Post(ctx, "/api/v2/projects", req, res)

	return res.Data, resp, err
}

// Edit updates a project by its identifier.
//
// Request body:
//   - op: The operation to perform. Enum: add, replace, remove, test
//   - path: A JSON Pointer as defined in RFC 6901.
//   - value: The value to be used within the operations. The value must be one of string, integer, boolean and object
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.patch
func (s *ProjectsService) Edit(ctx context.Context, id int, req []*model.UpdateRequest) (*model.Project, *Response, error) {
	res := new(model.ProjectsGetResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/projects/%d", id), req, res)

	return res.Data, resp, err
}

// Delete deletes a project by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.delete
func (s *ProjectsService) Delete(ctx context.Context, id int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d", id), nil)
}

// DownloadFileFormatSettingsCustomSegmentation returns a download link for custom segmentations
// by project and file format settings identifiers.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.file-format-settings.custom-segmentations.get
func (s *ProjectsService) DownloadFileFormatSettingsCustomSegmentation(ctx context.Context, projectID, settingsID int) (
	*model.DownloadLink, *Response, error,
) {
	path := fmt.Sprintf("/api/v2/projects/%d/file-format-settings/%d/custom-segmentations", projectID, settingsID)
	res := new(model.DownloadLinkResponse)
	resp, err := s.client.Get(ctx, path, nil, res)

	return res.Data, resp, err
}

// ResetFileFormatSettingsCustomSegmentation resets custom segmentations by project
// and file format settings identifiers.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.file-format-settings.custom-segmentations.delete
func (s *ProjectsService) ResetFileFormatSettingsCustomSegmentation(ctx context.Context, projectID, settingsID int) (*Response, error) {
	path := fmt.Sprintf("/api/v2/projects/%d/file-format-settings/%d/custom-segmentations", projectID, settingsID)
	return s.client.Delete(ctx, path, nil)
}

// ListFileFormatSettings returns a list of project file format settings by project identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.file-format-settings.getMany
func (s *ProjectsService) ListFileFormatSettings(ctx context.Context, projectID int) (
	[]*model.ProjectsFileFormatSettings, *Response, error,
) {
	path := fmt.Sprintf("/api/v2/projects/%d/file-format-settings", projectID)
	res := new(model.ProjectsFileFormatSettingsListResponse)
	resp, err := s.client.Get(ctx, path, nil, res)
	if err != nil {
		return nil, resp, err
	}

	settings := make([]*model.ProjectsFileFormatSettings, 0, len(res.Data))
	for _, fileFormatSetting := range res.Data {
		settings = append(settings, fileFormatSetting.Data)
	}

	return settings, resp, nil
}

// GetFileFormatSettings returns a project file format settings by project and file format settings identifiers.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.file-format-settings.get
func (s *ProjectsService) GetFileFormatSettings(ctx context.Context, projectID, settingsID int) (
	*model.ProjectsFileFormatSettings, *Response, error,
) {
	path := fmt.Sprintf("/api/v2/projects/%d/file-format-settings/%d", projectID, settingsID)
	res := new(model.ProjectsFileFormatSettingsResponse)
	resp, err := s.client.Get(ctx, path, nil, res)

	return res.Data, resp, err
}

// AddFileFormatSettings adds a new project file format settings by its project identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.file-format-settings.post
func (s *ProjectsService) AddFileFormatSettings(ctx context.Context, projectID int, req *model.ProjectsAddFileFormatSettingsRequest) (
	*model.ProjectsFileFormatSettings, *Response, error,
) {
	path := fmt.Sprintf("/api/v2/projects/%d/file-format-settings", projectID)
	res := new(model.ProjectsFileFormatSettingsResponse)
	resp, err := s.client.Post(ctx, path, req, res)

	return res.Data, resp, err
}

// EditFileFormatSettings updates a project file format settings by project and file format settings identifiers.
//
// Request body:
//   - op: The operation to perform. Possible values: replace, test
//   - path: A JSON Pointer as defined in RFC 6901. Possible values: /format, /settings
//   - value: The value to be used within the operations. The value must be one of string or array of strings.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.file-format-settings.patch
func (s *ProjectsService) EditFileFormatSettings(ctx context.Context, projectID, settingsID int, req []*model.UpdateRequest) (
	*model.ProjectsFileFormatSettings, *Response, error,
) {
	path := fmt.Sprintf("/api/v2/projects/%d/file-format-settings/%d", projectID, settingsID)
	res := new(model.ProjectsFileFormatSettingsResponse)
	resp, err := s.client.Patch(ctx, path, req, res)

	return res.Data, resp, err
}

// DeleteFileFormatSettings deletes a project file format settings by project and file format settings identifiers.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.file-format-settings.delete
func (s *ProjectsService) DeleteFileFormatSettings(ctx context.Context, projectID, settingsID int) (*Response, error) {
	path := fmt.Sprintf("/api/v2/projects/%d/file-format-settings/%d", projectID, settingsID)
	return s.client.Delete(ctx, path, nil)
}

// ListStringsExporterSettings returns a list of project strings exporter settings by project identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.strings-exporter-settings.getMany
func (s *ProjectsService) ListStringsExporterSettings(ctx context.Context, projectID int) (
	[]*model.ProjectsStringsExporterSettings, *Response, error,
) {
	path := fmt.Sprintf("/api/v2/projects/%d/strings-exporter-settings", projectID)
	res := new(model.ProjectsStringsExporterSettingsListResponse)
	resp, err := s.client.Get(ctx, path, nil, res)
	if err != nil {
		return nil, resp, err
	}

	settings := make([]*model.ProjectsStringsExporterSettings, 0, len(res.Data))
	for _, stringsExporterSetting := range res.Data {
		settings = append(settings, stringsExporterSetting.Data)
	}

	return settings, resp, nil
}

// GetStringsExporterSettings returns a project strings exporter settings by project
// and strings exporter settings identifiers.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.strings-exporter-settings.get
func (s *ProjectsService) GetStringsExporterSettings(ctx context.Context, projectID, settingsID int) (
	*model.ProjectsStringsExporterSettings, *Response, error,
) {
	path := fmt.Sprintf("/api/v2/projects/%d/strings-exporter-settings/%d", projectID, settingsID)
	res := new(model.ProjectsStringsExporterSettingsResponse)
	resp, err := s.client.Get(ctx, path, nil, res)

	return res.Data, resp, err
}

// AddStringsExporterSettings adds a new project strings exporter settings by its project identifier.
//
// Request body:
//
//	format: Enum: "android", "macosx", "xliff"
//	settings: One of convertPlaceholders, languagePairMapping
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.strings-exporter-settings.post
func (s *ProjectsService) AddStringsExporterSettings(
	ctx context.Context,
	projectID int,
	req *model.ProjectsStringsExporterSettingsRequest,
) (*model.ProjectsStringsExporterSettings, *Response, error,
) {
	path := fmt.Sprintf("/api/v2/projects/%d/strings-exporter-settings", projectID)
	res := new(model.ProjectsStringsExporterSettingsResponse)
	resp, err := s.client.Post(ctx, path, req, res)

	return res.Data, resp, err
}

// EditStringsExporterSettings updates a project strings exporter settings by project
// and strings exporter settings identifiers.
//
// Request body:
//
//	format: Enum: "android", "macosx", "xliff"
//	settings: One of convertPlaceholders, languagePairMapping
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.strings-exporter-settings.patch
func (s *ProjectsService) EditStringsExporterSettings(
	ctx context.Context,
	projectID, settingsID int,
	req *model.ProjectsStringsExporterSettingsRequest,
) (*model.ProjectsStringsExporterSettings, *Response, error,
) {
	path := fmt.Sprintf("/api/v2/projects/%d/strings-exporter-settings/%d", projectID, settingsID)
	res := new(model.ProjectsStringsExporterSettingsResponse)
	resp, err := s.client.Patch(ctx, path, req, res)

	return res.Data, resp, err
}

// DeleteStringsExporterSettings deletes a project strings exporter settings by project
// and strings exporter settings identifiers.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.strings-exporter-settings.delete
func (s *ProjectsService) DeleteStringsExporterSettings(ctx context.Context, projectID, settingsID int) (*Response, error) {
	path := fmt.Sprintf("/api/v2/projects/%d/strings-exporter-settings/%d", projectID, settingsID)
	return s.client.Delete(ctx, path, nil)
}
