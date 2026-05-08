package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Translation Memory (TM) is a vault of translations that were previously
// made in other projects. Those translations can be reused to speed up the
// translation process. Every translation made in the project is automatically
// added to the project Translation Memory.
//
// Use API to create, upload, download, or remove specific TM.
// Translation Memory export and import are asynchronous operations and shall be
// completed with sequence of API methods.
type TranslationMemoryService struct {
	client *Client
}

// GetTM returns a specific translation memory by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.tms.get
func (s *TranslationMemoryService) GetTM(ctx context.Context, tmID int) (*model.TranslationMemory, *Response, error) {
	res := new(model.TranslationMemoryResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/tms/%d", tmID), nil, res)

	return res.Data, resp, err
}

// ListTMs returns a list of translation memories.
//
// https://developer.crowdin.com/api/v2/#operation/api.tms.getMany
func (s *TranslationMemoryService) ListTMs(ctx context.Context, opts *model.TranslationMemoriesListOptions) (
	[]*model.TranslationMemory, *Response, error,
) {
	res := new(model.TranslationMemoriesListResponse)
	resp, err := s.client.Get(ctx, "/api/v2/tms", opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.TranslationMemory, 0, len(res.Data))
	for _, tm := range res.Data {
		list = append(list, tm.Data)
	}

	return list, resp, err
}

// AddTM creates a new translation memory.
//
// https://developer.crowdin.com/api/v2/#operation/api.tms.post
func (s *TranslationMemoryService) AddTM(ctx context.Context, req *model.TranslationMemoryAddRequest) (
	*model.TranslationMemory, *Response, error,
) {
	res := new(model.TranslationMemoryResponse)
	resp, err := s.client.Post(ctx, "/api/v2/tms", req, res)

	return res.Data, resp, err
}

// EditTM updates a specific translation memory by its identifier.
//
// Request body:
// - op (string): Operation to perform. Enum: replace, test.
// - path (string): JSON Pointer to the field to update as defined in RFC 6901.
// - value (string): Value to set.
//
// https://developer.crowdin.com/api/v2/#operation/api.tms.patch
func (s *TranslationMemoryService) EditTM(ctx context.Context, tmID int, req []*model.UpdateRequest) (
	*model.TranslationMemory, *Response, error,
) {
	res := new(model.TranslationMemoryResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/tms/%d", tmID), req, res)

	return res.Data, resp, err
}

// DeleteTM removes a specific translation memory by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.tms.delete
func (s *TranslationMemoryService) DeleteTM(ctx context.Context, tmID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/tms/%d", tmID), nil)
}

// ExportTM creates a new translation memory export.
//
// https://developer.crowdin.com/api/v2/#operation/api.tms.exports.post
func (s *TranslationMemoryService) ExportTM(ctx context.Context, tmID int, req *model.TranslationMemoryExportRequest) (
	*model.TranslationMemoryExport, *Response, error,
) {
	res := new(model.TranslationMemoryExportResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/tms/%d/exports", tmID), req, res)

	return res.Data, resp, err
}

// CheckTMExportStatus returns the status of a specific translation memory export.
//
// https://developer.crowdin.com/api/v2/#operation/api.tms.exports.get
func (s *TranslationMemoryService) CheckTMExportStatus(ctx context.Context, tmID int, exportID string) (
	*model.TranslationMemoryExport, *Response, error,
) {
	res := new(model.TranslationMemoryExportResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/tms/%d/exports/%s", tmID, exportID), nil, res)

	return res.Data, resp, err
}

// DownloadTM returns a download link for a specific translation memory export.
//
// https://developer.crowdin.com/api/v2/#operation/api.tms.exports.download.download
func (s *TranslationMemoryService) DownloadTM(ctx context.Context, tmID int, exportID string) (
	*model.DownloadLink, *Response, error,
) {
	res := new(model.DownloadLinkResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/tms/%d/exports/%s/download", tmID, exportID), nil, res)

	return res.Data, resp, err
}

// ImportTM creates a new translation memory import.
//
// https://developer.crowdin.com/api/v2/#operation/api.tms.imports.post
func (s *TranslationMemoryService) ImportTM(ctx context.Context, tmID int, req *model.TranslationMemoryImportRequest) (
	*model.TranslationMemoryImport, *Response, error,
) {
	res := new(model.TranslationMemoryImportResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/tms/%d/imports", tmID), req, res)

	return res.Data, resp, err
}

// CheckTMImportStatus returns the status of a specific translation memory import.
//
// https://developer.crowdin.com/api/v2/#operation/api.tms.imports.get
func (s *TranslationMemoryService) CheckTMImportStatus(ctx context.Context, tmID int, importID string) (
	*model.TranslationMemoryImport, *Response, error,
) {
	res := new(model.TranslationMemoryImportResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/tms/%d/imports/%s", tmID, importID), nil, res)

	return res.Data, resp, err
}

// ConcordanceSearch searches for concordance in a translation memory.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.tms.concordance.post
func (s *TranslationMemoryService) ConcordanceSearch(ctx context.Context, projectID int, req *model.TMConcordanceSearchRequest) (
	[]*model.TMConcordanceSearch, *Response, error,
) {
	res := new(model.TMConcordanceSearchResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/tms/concordance", projectID), req, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.TMConcordanceSearch, 0, len(res.Data))
	for _, tm := range res.Data {
		list = append(list, tm.Data)
	}

	return list, resp, err
}

// GetTMSegment returns a specific translation memory segment by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.tms.segments.get
func (s *TranslationMemoryService) GetTMSegment(ctx context.Context, tmID, segmentID int) (
	*model.TMSegment, *Response, error,
) {
	res := new(model.TMSegmentResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/tms/%d/segments/%d", tmID, segmentID), nil, res)

	return res.Data, resp, err
}

// ListTMSegments returns a list of translation memory segments.
//
// https://developer.crowdin.com/api/v2/#operation/api.tms.segments.getMany
func (s *TranslationMemoryService) ListTMSegments(ctx context.Context, tmID int, opts *model.TMSegmentsListOptions) (
	[]*model.TMSegment, *Response, error,
) {
	res := new(model.TMSegmentsListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/tms/%d/segments", tmID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.TMSegment, 0, len(res.Data))
	for _, tms := range res.Data {
		list = append(list, tms.Data)
	}

	return list, resp, err
}

// CreateTMSegment creates a new translation memory segment.
//
// https://developer.crowdin.com/api/v2/#operation/api.tms.segments.post
func (s *TranslationMemoryService) CreateTMSegment(ctx context.Context, tmID int, req *model.TMSegmentCreateRequest) (
	*model.TMSegment, *Response, error,
) {
	res := new(model.TMSegmentResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/tms/%d/segments", tmID), req, res)

	return res.Data, resp, err
}

// EditTMSegment updates a specific translation memory segment by its identifier.
//
// Request body:
// 1. TMSegmentRecordOperationAdd: Add a new record to the segment.
//   - op (string): Value: "add".
//   - path (string): "/records/-".
//   - value (object): Possible fields: text, languageId.
//     Example: {"text":"string","languageId":"string"}
//
// 2. TMSegmentRecordOperationReplace: Replace the text of a specific record.
//   - op (string): Value: "replace".
//   - path (string): "/records/{recordId}/text".
//   - value (string): Value to set.
//
// 3. TMSegmentRecordOperationRemove: Remove a specific record.
//   - op (string): Value: "remove".
//   - path (string): "/records/{recordId}".
//
// https://developer.crowdin.com/api/v2/#operation/api.tms.segments.patch
func (s *TranslationMemoryService) EditTMSegment(ctx context.Context, tmID, segmentID int, req []*model.UpdateRequest) (
	*model.TMSegment, *Response, error,
) {
	res := new(model.TMSegmentResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/tms/%d/segments/%d", tmID, segmentID), req, res)

	return res.Data, resp, err
}

// DeleteTMSegment removes a specific translation memory segment by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.tms.segments.delete
func (s *TranslationMemoryService) DeleteTMSegment(ctx context.Context, tmID, segmentID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/tms/%d/segments/%d", tmID, segmentID), nil)
}

// ClearTM removes all segments from a specific translation memory.
//
// https://developer.crowdin.com/api/v2/#operation/api.tms.segments.clear
func (s *TranslationMemoryService) ClearTM(ctx context.Context, tmID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/tms/%d/segments", tmID), nil)
}
