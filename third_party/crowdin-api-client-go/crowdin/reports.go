package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Reports help to estimate costs, calculate translation costs, and identify the top members.
//
// Use API to generate Cost Estimate, Translation Cost, and Top Members reports.
// You can then export reports in .xlsx or .csv file formats. Report generation
// is an asynchronous operation and shall be completed with a sequence of API methods.
//
// API docs: https://developer.crowdin.com/api/v2/#tag/Reports
type ReportsService struct {
	client *Client
}

// ListArchives returns a list of report archives.
//
//	For the Enterprise client, set the userID to 0.
//
// https://developer.crowdin.com/api/v2/#operation/api.reports.archives.getMany
func (s *ReportsService) ListArchives(ctx context.Context, userID int, opts *model.ReportArchivesListOptions) (
	[]*model.ReportArchive, *Response, error,
) {
	res := new(model.ReportArchiveListResponse)
	resp, err := s.client.Get(ctx, s.getArchivePath("archives", userID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.ReportArchive, 0, len(res.Data))
	for _, archive := range res.Data {
		list = append(list, archive.Data)
	}

	return list, resp, err
}

// GetArchive returns a report archive by its identifier.
//
//	For the Enterprise client, set the userID to 0.
//
// https://developer.crowdin.com/api/v2/#operation/api.users.reports.archives.get
func (s *ReportsService) GetArchive(ctx context.Context, userID, archiveID int) (*model.ReportArchive, *Response, error) {
	path := s.getArchivePath(fmt.Sprintf("archives/%d", archiveID), userID)
	res := new(model.ReportArchiveResponse)
	resp, err := s.client.Get(ctx, path, nil, res)

	return res.Data, resp, err
}

// DeleteArchive deletes a report archive by its identifier.
//
//	For the Enterprise client, set the userID to 0.
//
// https://developer.crowdin.com/api/v2/#operation/api.users.reports.archives.delete
func (s *ReportsService) DeleteArchive(ctx context.Context, userID, archiveID int) (*Response, error) {
	return s.client.Delete(ctx, s.getArchivePath(fmt.Sprintf("archives/%d", archiveID), userID), nil)
}

// ExportArchive exports a report archive in the specified file format. If no format is provided,
// the default format is XLSX.
//
//	For the Enterprise client, set the userID to 0.
//
// https://developer.crowdin.com/api/v2/#operation/api.reports.archives.exports.post
func (s *ReportsService) ExportArchive(ctx context.Context, userID, archiveID int, req *model.ExportReportArchiveRequest) (
	*model.ReportStatus, *Response, error,
) {
	if req == nil || req.Format == "" {
		req = &model.ExportReportArchiveRequest{Format: model.ReportFormatXLSX}
	}

	path := s.getArchivePath(fmt.Sprintf("archives/%d/exports", archiveID), userID)
	res := new(model.ReportStatusResponse)
	resp, err := s.client.Post(ctx, path, req, res)

	return res.Data, resp, err
}

// CheckArchiveExportStatus returns the status of the report archive export.
//
//	For the Enterprise client, set the userID to 0.
//
// https://developer.crowdin.com/api/v2/#operation/api.users.reports.archives.exports.get
func (s *ReportsService) CheckArchiveExportStatus(ctx context.Context, userID, archiveID int, exportID string) (
	*model.ReportStatus, *Response, error,
) {
	path := s.getArchivePath(fmt.Sprintf("archives/%d/exports/%s", archiveID, exportID), userID)
	res := new(model.ReportStatusResponse)
	resp, err := s.client.Get(ctx, path, nil, res)

	return res.Data, resp, err
}

// DownloadArchive returns a download link for the report archive.
//
//	For the Enterprise client, set the userID to 0.
//
// https://developer.crowdin.com/api/v2/#operation/api.users.reports.archives.exports.download.get
func (s *ReportsService) DownloadArchive(ctx context.Context, userID, archiveID int, exportID string) (
	*model.DownloadLink, *Response, error,
) {
	path := s.getArchivePath(fmt.Sprintf("archives/%d/exports/%s/download", archiveID, exportID), userID)
	res := new(model.DownloadLinkResponse)
	resp, err := s.client.Get(ctx, path, nil, res)

	return res.Data, resp, err
}

// Generate generates a new report.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.reports.post
func (s *ReportsService) Generate(ctx context.Context, projectID int, req *model.ReportGenerateRequest) (
	*model.ReportStatus, *Response, error,
) {
	res := new(model.ReportStatusResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/reports", projectID), req, res)

	return res.Data, resp, err
}

// CheckStatus returns the status of the report generation.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.reports.get
func (s *ReportsService) CheckStatus(ctx context.Context, projectID int, reportID string) (
	*model.ReportStatus, *Response, error,
) {
	res := new(model.ReportStatusResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/reports/%s", projectID, reportID), nil, res)

	return res.Data, resp, err
}

// Download returns a download link for the report.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.reports.download.download
func (s *ReportsService) Download(ctx context.Context, projectID int, reportID string) (
	*model.DownloadLink, *Response, error,
) {
	res := new(model.DownloadLinkResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/reports/%s/download", projectID, reportID), nil, res)

	return res.Data, resp, err
}

// ListSettingsTemplates returns a list of report settings templates.
//
//	For the Enterprise client, set the projectID to 0.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.reports.settings-templates.getMany
func (s *ReportsService) ListSettingsTemplates(ctx context.Context, projectID int, opts *model.ReportSettingsTemplatesListOptions) (
	[]*model.ReportSettingsTemplate, *Response, error,
) {
	res := new(model.ReportSettingsTemplateListResponse)
	resp, err := s.client.Get(ctx, s.getSettingsTemplatePath(projectID, 0), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.ReportSettingsTemplate, 0, len(res.Data))
	for _, st := range res.Data {
		list = append(list, st.Data)
	}

	return list, resp, err
}

// GetSettingsTemplate returns a report settings template by its identifier.
//
//	For the Enterprise client, set the projectID to 0.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.reports.settings-templates.get
func (s *ReportsService) GetSettingsTemplate(ctx context.Context, projectID, settingsTemplateID int) (
	*model.ReportSettingsTemplate, *Response, error,
) {
	res := new(model.ReportSettingsTemplateResponse)
	resp, err := s.client.Get(ctx, s.getSettingsTemplatePath(projectID, settingsTemplateID), nil, res)

	return res.Data, resp, err
}

// AddSettingsTemplate creates a new report settings template.
//
//	For the Enterprise client, set the projectID to 0.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.reports.settings-templates.post
func (s *ReportsService) AddSettingsTemplate(ctx context.Context, projectID int, req *model.ReportSettingsTemplateAddRequest) (
	*model.ReportSettingsTemplate, *Response, error,
) {
	res := new(model.ReportSettingsTemplateResponse)
	resp, err := s.client.Post(ctx, s.getSettingsTemplatePath(projectID, 0), req, res)

	return res.Data, resp, err
}

// EditSettingsTemplate updates a report settings template.
//
//	For the Enterprise client, set the projectID to 0.
//
// Request body:
//   - Op (string): operation to perform. Enum: replace, test.
//   - Path (string <json-pointer>): path to the field to update. Enum: "/name", "/currency", "/unit",
//     "/mode", "/config", "/isPublic".
//   - Value (any): new value to set.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.reports.settings-templates.patch
func (s *ReportsService) EditSettingsTemplate(ctx context.Context, projectID, settingsTemplateID int, req []*model.UpdateRequest) (
	*model.ReportSettingsTemplate, *Response, error,
) {
	res := new(model.ReportSettingsTemplateResponse)
	resp, err := s.client.Patch(ctx, s.getSettingsTemplatePath(projectID, settingsTemplateID), req, res)

	return res.Data, resp, err
}

// DeleteSettingsTemplate removes a report settings template.
//
//	For the Enterprise client, set the projectID to 0.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.reports.settings-templates.delete
func (s *ReportsService) DeleteSettingsTemplate(ctx context.Context, projectID, settingsTemplateID int) (*Response, error) {
	return s.client.Delete(ctx, s.getSettingsTemplatePath(projectID, settingsTemplateID), nil)
}

// GenerateGroupReport generates a new group report.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.groups.reports.post
func (s *ReportsService) GenerateGroupReport(ctx context.Context, groupID int, req *model.GroupReportGenerateRequest) (
	*model.ReportStatus, *Response, error,
) {
	res := new(model.ReportStatusResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/groups/%d/reports", groupID), req, res)

	return res.Data, resp, err
}

// CheckGroupReportStatus returns the status of the group report generation.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.groups.reports.get
func (s *ReportsService) CheckGroupReportStatus(ctx context.Context, groupID int, reportID string) (
	*model.ReportStatus, *Response, error,
) {
	res := new(model.ReportStatusResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/groups/%d/reports/%s", groupID, reportID), nil, res)

	return res.Data, resp, err
}

// DownloadGroupReport returns a download link for the group report.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.groups.reports.download.download
func (s *ReportsService) DownloadGroupReport(ctx context.Context, groupID int, reportID string) (
	*model.DownloadLink, *Response, error,
) {
	res := new(model.DownloadLinkResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/groups/%d/reports/%s/download", groupID, reportID), nil, res)

	return res.Data, resp, err
}

// GenerateOrganizationReport generates a new organization report.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.reports.post
func (s *ReportsService) GenerateOrganizationReport(ctx context.Context, req *model.GroupReportGenerateRequest) (
	*model.ReportStatus, *Response, error,
) {
	res := new(model.ReportStatusResponse)
	resp, err := s.client.Post(ctx, "/api/v2/reports", req, res)

	return res.Data, resp, err
}

// CheckOrganizationReportStatus returns the status of the organization report generation.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.reports.get
func (s *ReportsService) CheckOrganizationReportStatus(ctx context.Context, reportID string) (*model.ReportStatus, *Response, error) {
	res := new(model.ReportStatusResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/reports/%s", reportID), nil, res)

	return res.Data, resp, err
}

// DownloadOrganizationReport returns a download link for the organization report.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.reports.download.download
func (s *ReportsService) DownloadOrganizationReport(ctx context.Context, reportID string) (*model.DownloadLink, *Response, error) {
	res := new(model.DownloadLinkResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/reports/%s/download", reportID), nil, res)

	return res.Data, resp, err
}

// ListUserSettingsTemplates returns a list of user report settings templates.
//
// https://support.crowdin.com/developer/api/v2/#tag/Reports/operation/api.users.reports.settings-templates.getMany
func (s *ReportsService) ListUserSettingsTemplates(ctx context.Context, userID int, opts *model.ListOptions) (
	[]*model.ReportSettingsTemplate, *Response, error,
) {
	res := new(model.ReportSettingsTemplateListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/users/%d/reports/settings-templates", userID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.ReportSettingsTemplate, 0, len(res.Data))
	for _, st := range res.Data {
		list = append(list, st.Data)
	}

	return list, resp, err
}

// GetUserSettingsTemplate returns a user report settings template by its identifier.
//
// https://support.crowdin.com/developer/api/v2/#tag/Reports/operation/api.users.reports.settings-templates.get
func (s *ReportsService) GetUserSettingsTemplate(ctx context.Context, userID, settingsTemplateID int) (
	*model.ReportSettingsTemplate, *Response, error,
) {
	res := new(model.ReportSettingsTemplateResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/users/%d/reports/settings-templates/%d", userID, settingsTemplateID), nil, res)

	return res.Data, resp, err
}

// AddUserSettingsTemplate creates a new user report settings template.
//
// https://support.crowdin.com/developer/api/v2/#tag/Reports/operation/api.users.reports.settings-templates.post
func (s *ReportsService) AddUserSettingsTemplate(ctx context.Context, userID int, req *model.ReportSettingsTemplateAddRequest) (
	*model.ReportSettingsTemplate, *Response, error,
) {
	res := new(model.ReportSettingsTemplateResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/users/%d/reports/settings-templates", userID), req, res)

	return res.Data, resp, err
}

// EditUserSettingsTemplate updates a user report settings template.
//
// Request body:
//   - Op (string): operation to perform. Enum: replace, test.
//   - Path (string <json-pointer>): path to the field to update. Enum: "/name", "/currency", "/unit", "/config".
//   - Value (string|int): new value to set.
//
// https://support.crowdin.com/developer/api/v2/#tag/Reports/operation/api.users.reports.settings-templates.patch
func (s *ReportsService) EditUserSettingsTemplate(ctx context.Context, userID, settingsTemplateID int, req []*model.UpdateRequest) (
	*model.ReportSettingsTemplate, *Response, error,
) {
	res := new(model.ReportSettingsTemplateResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/users/%d/reports/settings-templates/%d", userID, settingsTemplateID), req, res)

	return res.Data, resp, err
}

// DeleteUserSettingsTemplate removes a user report settings template.
// https://support.crowdin.com/developer/api/v2/#tag/Reports/operation/api.users.reports.settings-templates.delete
func (s *ReportsService) DeleteUserSettingsTemplate(ctx context.Context, userID, settingsTemplateID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/users/%d/reports/settings-templates/%d", userID, settingsTemplateID), nil)
}

// getArchivePath returns the path for the report archive.
// If userID is 0 and organization is set, the Enterprise API path is used.
func (s *ReportsService) getArchivePath(path string, userID int) string {
	if userID == 0 && s.client.organization != "" {
		return fmt.Sprintf("/api/v2/reports/%s", path)
	}

	return fmt.Sprintf("/api/v2/users/%d/reports/%s", userID, path)
}

// getSettingsTemplatePath returns the path for the report settings template.
// If projectID is 0 and organization is set, the Enterprise API path is used.
func (s *ReportsService) getSettingsTemplatePath(projectID, settingsTemplateID int) string {
	path := fmt.Sprintf("/api/v2/projects/%d/reports/settings-templates", projectID)
	if projectID == 0 && s.client.organization != "" {
		path = "/api/v2/reports/settings-templates"
	}
	if settingsTemplateID != 0 {
		path += fmt.Sprintf("/%d", settingsTemplateID)
	}

	return path
}
