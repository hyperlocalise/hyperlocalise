package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Glossaries help to explain some specific terms or the ones often used
// in the project so that they can be properly and consistently translated.
//
// Use API to manage glossaries or specific terms. Glossary export and import
// are asynchronous operations and shall be completed with sequence of API methods.
//
// Crowdin API docs: https://developer.crowdin.com/api/v2/#tag/Glossaries
type GlossariesService struct {
	client *Client
}

// GetConcept returns a specific concept from a glossary by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.concepts.get
func (s *GlossariesService) GetConcept(ctx context.Context, glossaryID, conceptID int) (
	*model.Concept, *Response, error,
) {
	res := new(model.ConceptResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/glossaries/%d/concepts/%d", glossaryID, conceptID), nil, res)

	return res.Data, resp, err
}

// ListConcepts returns a list of concepts from a glossary.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.concepts.getMany
func (s *GlossariesService) ListConcepts(ctx context.Context, glossaryID int, opts *model.ConceptsListOptions) (
	[]*model.Concept, *Response, error,
) {
	res := new(model.ConceptsListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/glossaries/%d/concepts", glossaryID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Concept, 0, len(res.Data))
	for _, concept := range res.Data {
		list = append(list, concept.Data)
	}

	return list, resp, err
}

// UpdateConcept updates a specific concept in a glossary.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.concepts.put
func (s *GlossariesService) UpdateConcept(ctx context.Context, glossaryID, conceptID int, req *model.ConceptUpdateRequest) (
	*model.Concept, *Response, error,
) {
	res := new(model.ConceptResponse)
	resp, err := s.client.Put(ctx, fmt.Sprintf("/api/v2/glossaries/%d/concepts/%d", glossaryID, conceptID), req, res)

	return res.Data, resp, err
}

// DeleteConcept deletes a specific concept from a glossary.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.concepts.delete
func (s *GlossariesService) DeleteConcept(ctx context.Context, glossaryID, conceptID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/glossaries/%d/concepts/%d", glossaryID, conceptID), nil)
}

// GetGlossary returns a specific glossary by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.get
func (s *GlossariesService) GetGlossary(ctx context.Context, glossaryID int) (*model.Glossary, *Response, error) {
	res := new(model.GlossaryResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/glossaries/%d", glossaryID), nil, res)

	return res.Data, resp, err
}

// ListGlossaries returns a list of glossaries.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.getMany
func (s *GlossariesService) ListGlossaries(ctx context.Context, opts *model.GlossariesListOptions) (
	[]*model.Glossary, *Response, error,
) {
	res := new(model.GlossariesListResponse)
	resp, err := s.client.Get(ctx, "/api/v2/glossaries", opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Glossary, 0, len(res.Data))
	for _, glossary := range res.Data {
		list = append(list, glossary.Data)
	}

	return list, resp, err
}

// AddGlossary creates a new glossary.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.post
func (s *GlossariesService) AddGlossary(ctx context.Context, req *model.GlossaryAddRequest) (
	*model.Glossary, *Response, error,
) {
	res := new(model.GlossaryResponse)
	resp, err := s.client.Post(ctx, "/api/v2/glossaries", req, res)

	return res.Data, resp, err
}

// EditGlossary updates a specific glossary.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.patch
func (s *GlossariesService) EditGlossary(ctx context.Context, glossaryID int, req []*model.UpdateRequest) (
	*model.Glossary, *Response, error,
) {
	res := new(model.GlossaryResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/glossaries/%d", glossaryID), req, res)

	return res.Data, resp, err
}

// DeleteGlossary deletes a specific glossary.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.delete
func (s *GlossariesService) DeleteGlossary(ctx context.Context, glossaryID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/glossaries/%d", glossaryID), nil)
}

// ExportGlossary performs an export of a glossary.
// The export operation is asynchronous and returns the status of the export process.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.exports.post
func (s *GlossariesService) ExportGlossary(ctx context.Context, glossaryID int, req *model.GlossaryExportRequest) (
	*model.GlossaryExport, *Response, error,
) {
	res := new(model.GlossaryExportResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/glossaries/%d/exports", glossaryID), req, res)

	return res.Data, resp, err
}

// CheckGlossaryExportStatus returns the status of a glossary export.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.exports.get
func (s *GlossariesService) CheckGlossaryExportStatus(ctx context.Context, glossaryID int, exportID string) (
	*model.GlossaryExport, *Response, error,
) {
	res := new(model.GlossaryExportResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/glossaries/%d/exports/%s", glossaryID, exportID), nil, res)

	return res.Data, resp, err
}

// DownloadGlossary returns a download link for a glossary export.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.exports.download.download
func (s *GlossariesService) DownloadGlossary(ctx context.Context, glossaryID int, exportID string) (
	*model.DownloadLink, *Response, error,
) {
	res := new(model.DownloadLinkResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/glossaries/%d/exports/%s/download", glossaryID, exportID), nil, res)

	return res.Data, resp, err
}

// ImportGlossary performs an import of a glossary.
// The import operation is asynchronous and returns the status of the import process.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.imports.post
func (s *GlossariesService) ImportGlossary(ctx context.Context, glossaryID int, req *model.GlossaryImportRequest) (
	*model.GlossaryImport, *Response, error,
) {
	res := new(model.GlossaryImportResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/glossaries/%d/imports", glossaryID), req, res)

	return res.Data, resp, err
}

// CheckGlossaryImportStatus returns the status of a glossary import.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.imports.get
func (s *GlossariesService) CheckGlossaryImportStatus(ctx context.Context, glossaryID, importID int) (
	*model.GlossaryImport, *Response, error,
) {
	res := new(model.GlossaryImportResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/glossaries/%d/imports/%d", glossaryID, importID), nil, res)

	return res.Data, resp, err
}

// ConcordanceSearch searches for concordance in the glossary.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.glossaries.concordance.post
func (s *GlossariesService) ConcordanceSearch(ctx context.Context, projectID int, req *model.GlossaryConcordanceSearchRequest) (
	[]*model.ConcordanceSearch, *Response, error,
) {
	res := new(model.GlossaryConcordanceSearchResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/glossaries/concordance", projectID), req, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.ConcordanceSearch, 0, len(res.Data))
	for _, search := range res.Data {
		list = append(list, search.Data)
	}

	return list, resp, err
}

// GetTerm returns a specific term from a glossary by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.terms.get
func (s *GlossariesService) GetTerm(ctx context.Context, glossaryID, termID int) (
	*model.Term, *Response, error,
) {
	res := new(model.TermResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/glossaries/%d/terms/%d", glossaryID, termID), nil, res)

	return res.Data, resp, err
}

// ListTerms returns a list of terms from a glossary.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.terms.getMany
func (s *GlossariesService) ListTerms(ctx context.Context, glossaryID int, opts *model.TermsListOptions) (
	[]*model.Term, *Response, error,
) {
	res := new(model.TermsListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/glossaries/%d/terms", glossaryID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Term, 0, len(res.Data))
	for _, term := range res.Data {
		list = append(list, term.Data)
	}

	return list, resp, err
}

// AddTerm adds a new term to a glossary.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.terms.post
func (s *GlossariesService) AddTerm(ctx context.Context, glossaryID int, req *model.TermAddRequest) (
	*model.Term, *Response, error,
) {
	res := new(model.TermResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/glossaries/%d/terms", glossaryID), req, res)

	return res.Data, resp, err
}

// EditTerm updates a specific term.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.terms.patch
func (s *GlossariesService) EditTerm(ctx context.Context, glossaryID, termID int, req []*model.UpdateRequest) (
	*model.Term, *Response, error,
) {
	res := new(model.TermResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/glossaries/%d/terms/%d", glossaryID, termID), req, res)

	return res.Data, resp, err
}

// ClearGlossary deletes all terms from a glossary.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.terms.deleteMany
func (s *GlossariesService) ClearGlossary(ctx context.Context, glossaryID int, opts *model.ClearGlossaryOptions) (
	*Response, error,
) {
	path := fmt.Sprintf("/api/v2/glossaries/%d/terms", glossaryID)
	if v, ok := opts.Values(); ok {
		path += "?" + v.Encode()
	}

	return s.client.Delete(ctx, path, nil)
}

// DeleteTerm deletes a specific term from a glossary.
//
// https://developer.crowdin.com/api/v2/#operation/api.glossaries.terms.delete
func (s *GlossariesService) DeleteTerm(ctx context.Context, glossaryID, termID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/glossaries/%d/terms/%d", glossaryID, termID), nil)
}
