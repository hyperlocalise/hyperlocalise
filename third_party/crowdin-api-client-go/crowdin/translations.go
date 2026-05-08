package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Translators can work with entirely untranslated project or you can pre-translate the files
// to ease the translations process.
// Use API to pre-translate files via Machine Translation (MT) or Translation Memory (TM),
// upload your existing translations, and download translations correspondingly. Pre-translate
// and build are asynchronous operations and shall be completed with sequence of API methods.
//
// Note: If there are no new translations or changes in build parameters, Crowdin will return
// the current build for such requests.
type TranslationsService struct {
	client *Client
}

// PreTranslationStatus returns a pre-translation status for project by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.pre-translations.get
func (s *TranslationsService) PreTranslationStatus(ctx context.Context, projectID int, preTranslationID string) (
	*model.PreTranslation, *Response, error,
) {
	res := new(model.PreTranslationsResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/pre-translations/%s", projectID, preTranslationID), nil, res)

	return res.Data, resp, err
}

// List Pre-Translations returns a list of pre-translations for a specific project.
//
// https://support.crowdin.com/developer/api/v2/#tag/Translations/operation/api.projects.pre-translations.getMany
func (s *TranslationsService) ListPreTranslations(ctx context.Context, projectID int, opts *model.ListOptions) (
	[]*model.PreTranslation, *Response, error,
) {
	res := new(model.PreTranslationsListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/pre-translations", projectID), opts, res)

	list := make([]*model.PreTranslation, 0, len(res.Data))
	for _, preTranslation := range res.Data {
		list = append(list, preTranslation.Data)
	}

	return list, resp, err
}

// Edit Pre-Translation updates a specific pre-translation by its identifier.
//
// Request body:
// - op (string): Operation to perform. Enum: replace, test.
// - path (string): JSON Pointer to the field to update as defined in RFC 6901.
// - value (string): Value to set.
//
// https://support.crowdin.com/developer/api/v2/#tag/Translations/operation/api.projects.pre-translations.patch
func (s *TranslationsService) EditPreTranslation(
	ctx context.Context, projectID int, preTranslationID string, req []*model.UpdateRequest,
) (*model.PreTranslation, *Response, error) {
	res := new(model.PreTranslationsResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/projects/%d/pre-translations/%s", projectID, preTranslationID), req, res)

	return res.Data, resp, err
}

// ApplyPreTranslation applies pre-translation to the project.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.pre-translations.post
func (s *TranslationsService) ApplyPreTranslation(ctx context.Context, projectID int, req *model.PreTranslationRequest) (
	*model.PreTranslation, *Response, error,
) {
	res := new(model.PreTranslationsResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/pre-translations", projectID), req, res)

	return res.Data, resp, err
}

// PreTranslationReport returns report data for a specific pre-translation.
//
// https://support.crowdin.com/developer/api/v2/#tag/Translations/operation/api.projects.pre-translations.report.getReport
func (s *TranslationsService) PreTranslationReport(
	ctx context.Context, projectID int, preTranslationID string,
) (*model.PreTranslationReport, *Response, error) {
	res := new(model.PreTranslationReportResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/pre-translations/%s/reports", projectID, preTranslationID), nil, res)

	return res.Data, resp, err
}

// BuildProjectDirectoryTranslation builds translations for a specific directory in the project.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.translations.builds.directories.post
func (s *TranslationsService) BuildProjectDirectoryTranslation(
	ctx context.Context,
	projectID, directoryID int,
	req *model.BuildProjectDirectoryTranslationRequest,
) (*model.BuildProjectDirectoryTranslation, *Response, error) {
	res := struct {
		Data *model.BuildProjectDirectoryTranslation `json:"data"`
	}{}
	path := fmt.Sprintf("/api/v2/projects/%d/translations/builds/directories/%d", projectID, directoryID)
	resp, err := s.client.Post(ctx, path, req, &res)

	return res.Data, resp, err
}

// BuildProjectFileTranslation builds translations for a specific file in the project.
//
// Note: Pass `etag` identifier to see whether any changes were applied to the file. If etag is not empty,
// it would be added to the If-None-Match request header.
// In case the file was changed it would be built. If not you'll receive a 304 (Not Modified) status code.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.translations.builds.files.post
func (s *TranslationsService) BuildProjectFileTranslation(
	ctx context.Context,
	projectID, fileID int,
	req *model.BuildProjectFileTranslationRequest,
	etag string,
) (*model.DownloadLink, *Response, error) {
	path := fmt.Sprintf("/api/v2/projects/%d/translations/builds/files/%d", projectID, fileID)
	res := new(model.DownloadLinkResponse)
	resp, err := s.client.Post(ctx, path, req, res, Header("If-None-Match", etag))

	return res.Data, resp, err
}

// ListProjectBuilds returns a list of builds for a specific project.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.translations.builds.getMany
func (s *TranslationsService) ListProjectBuilds(ctx context.Context, projectID int, opts *model.TranslationsBuildsListOptions) (
	[]*model.TranslationsProjectBuild, *Response, error,
) {
	res := new(model.TranslationsProjectBuildsListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/translations/builds", projectID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	builds := make([]*model.TranslationsProjectBuild, 0, len(res.Data))
	for _, build := range res.Data {
		builds = append(builds, build.Data)
	}

	return builds, resp, err
}

// BuildProjectTranslation builds project translations.
// Request body can be either `model.BuildProjectRequest` or `model.PseudoBuildProjectRequest`.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.translations.builds.post
func (s *TranslationsService) BuildProjectTranslation(ctx context.Context, projectID int, req model.BuildProjectTranslationRequester) (
	*model.TranslationsProjectBuild, *Response, error,
) {
	res := new(model.TranslationsProjectBuildResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/translations/builds", projectID), req, &res)

	return res.Data, resp, err
}

// UploadTranslations uploads translations for a specific language in the project.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.translations.postOnLanguage
func (s *TranslationsService) UploadTranslations(ctx context.Context, projectID int, languageID string, req *model.UploadTranslationsRequest) (
	*model.UploadTranslations, *Response, error,
) {
	res := new(model.UploadTranslationsResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/translations/%s", projectID, languageID), req, res)

	return res.Data, resp, err
}

// DownloadProjectTranslations returns a download link for a specific build.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.translations.builds.download.download
func (s *TranslationsService) DownloadProjectTranslations(ctx context.Context, projectID, buildID int) (
	*model.DownloadLink, *Response, error,
) {
	res := new(model.DownloadLinkResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/translations/builds/%d/download", projectID, buildID), nil, res)

	return res.Data, resp, err
}

// CheckBuildStatus checks the status of a project build by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.translations.builds.get
func (s *TranslationsService) CheckBuildStatus(ctx context.Context, projectID, buildID int) (
	*model.TranslationsProjectBuild, *Response, error,
) {
	res := new(model.TranslationsProjectBuildResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/translations/builds/%d", projectID, buildID), nil, res)

	return res.Data, resp, err
}

// CancelBuild cancels a build by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.translations.builds.delete
func (s *TranslationsService) CancelBuild(ctx context.Context, projectID, buildID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/translations/builds/%d", projectID, buildID), nil)
}

// ExportProjectTranslation exports project translations for a specific language.
//
// Note: For instant translation delivery to your mobile, web, server, or desktop apps,
// it is recommended to use OTA.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.translations.exports.post
func (s *TranslationsService) ExportProjectTranslation(ctx context.Context, projectID int, req *model.ExportTranslationRequest) (
	*model.DownloadLink, *Response, error,
) {
	res := new(model.DownloadLinkResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/translations/exports", projectID), req, res)

	return res.Data, resp, err
}
