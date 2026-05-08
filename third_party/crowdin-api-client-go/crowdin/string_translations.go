package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Use API to add or remove strings translations, approvals, and votes.
//
// Crowdin API docs: https://developer.crowdin.com/api/v2/#tag/String-Translations
type StringTranslationsService struct {
	client *Client
}

// ListApprovals returns a list of translation approvals.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.approvals.getMany
func (s *StringTranslationsService) ListApprovals(ctx context.Context, projectID int, opts *model.ApprovalsListOptions) (
	[]*model.Approval, *Response, error,
) {
	res := new(model.ApprovalsListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/approvals", projectID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Approval, 0, len(res.Data))
	for _, approval := range res.Data {
		list = append(list, approval.Data)
	}

	return list, resp, nil
}

// GetApproval returns a single translation approval by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.approvals.get
func (s *StringTranslationsService) GetApproval(ctx context.Context, projectID, approvalID int) (*model.Approval, *Response, error) {
	res := new(model.ApprovalsGetResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/approvals/%d", projectID, approvalID), nil, res)

	return res.Data, resp, err
}

// AddApproval adds a new translation approval.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.approvals.post
func (s *StringTranslationsService) AddApproval(ctx context.Context, projectID, translationID int) (
	*model.Approval, *Response, error,
) {
	req := struct {
		TranslationID int `json:"translationId"`
	}{TranslationID: translationID}

	res := new(model.ApprovalsGetResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/approvals", projectID), req, res)

	return res.Data, resp, err
}

// Approval Batch Operations
//
// Request body:
//   - op: The operation to perform. Enum: remove, add.
//   - path: A JSON Pointer as defined by RFC 6901. Example: "/{approvalId}".
//
// https://support.crowdin.com/developer/api/v2/#tag/String-Translations/operation/api.projects.approvals.patch
func (s *StringTranslationsService) ApprovalBatchOperations(ctx context.Context, projectID int, req []*model.UpdateRequest) (
	[]*model.Approval, *Response, error,
) {
	res := new(model.ApprovalsListResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/projects/%d/approvals", projectID), req, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Approval, 0, len(res.Data))
	for _, approval := range res.Data {
		list = append(list, approval.Data)
	}

	return list, resp, nil
}

// Translation Batch Operations
//
// Request body:
//   - op: The operation to perform. Enum: remove, add.
//   - path: A JSON Pointer as defined by RFC 6901. Example: "/{translationId}".
//
// https://support.crowdin.com/developer/api/v2/#tag/String-Translations/operation/api.projects.translations.patch
func (s *StringTranslationsService) TranslationBatchOperations(ctx context.Context, projectID int, req []*model.UpdateRequest) (
	[]*model.Translation, *Response, error,
) {
	res := new(model.TranslationsListResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/projects/%d/translations", projectID), req, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Translation, 0, len(res.Data))
	for _, translation := range res.Data {
		list = append(list, translation.Data)
	}

	return list, resp, nil
}

// RemoveStringApprovals removes translation approvals by its string identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.approvals.deleteMany
func (s *StringTranslationsService) RemoveStringApprovals(ctx context.Context, projectID, stringID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/approvals?stringId=%d", projectID, stringID), nil)
}

// RemoveApproval removes a translation approval by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.approvals.delete
func (s *StringTranslationsService) RemoveApproval(ctx context.Context, projectID, approvalID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/approvals/%d", projectID, approvalID), nil)
}

// TranslationAlignment aligns translations.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.translations.alignment.post
func (s *StringTranslationsService) TranslationAlignment(ctx context.Context, projectID int, req *model.TranslationAlignmentRequest) (
	*model.TranslationAlignment, *Response, error,
) {
	res := new(model.TranslationAlignmentResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/translations/alignment", projectID), req, res)

	return res.Data, resp, err
}

// ListLanguageTranslations returns a list of translations for a specific language.
//
// Note: For instant translation delivery to your mobile, web, server, or desktop apps,
// it is recommended to use OTA.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.languages.translations.getMany
func (s *StringTranslationsService) ListLanguageTranslations(
	ctx context.Context,
	projectID int,
	languageID string,
	opts *model.LanguageTranslationsListOptions) (
	[]*model.LanguageTranslation, *Response, error,
) {
	res := new(model.LanguageTranslationsListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/languages/%s/translations", projectID, languageID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.LanguageTranslation, 0, len(res.Data))
	for _, translation := range res.Data {
		list = append(list, translation.Data)
	}

	return list, resp, nil
}

// ListStringTranslations returns a list of string translations.
//
// Note: For instant translation delivery to your mobile, web, server, or desktop apps,
// it is recommended to use OTA.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.translations.getMany
func (s *StringTranslationsService) ListStringTranslations(ctx context.Context, projectID int, opts *model.StringTranslationsListOptions) (
	[]*model.Translation, *Response, error,
) {
	res := new(model.TranslationsListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/translations", projectID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Translation, 0, len(res.Data))
	for _, translation := range res.Data {
		list = append(list, translation.Data)
	}

	return list, resp, nil
}

// DeleteStringTranslations deletes string translations by its identifiers.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.translations.deleteMany
func (s *StringTranslationsService) DeleteStringTranslations(ctx context.Context, projectID, stringID int, languageID *string) (
	*Response, error,
) {
	path := fmt.Sprintf("/api/v2/projects/%d/translations?stringId=%d", projectID, stringID)

	if languageID != nil {
		path += fmt.Sprintf("&languageId=%s", *languageID)
	}

	return s.client.Delete(ctx, path, nil)
}

// GetTranslation returns a single string translation by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.translations.get
func (s *StringTranslationsService) GetTranslation(ctx context.Context, projectID, translationID int, opts *model.TranslationGetOptions) (
	*model.Translation, *Response, error,
) {
	res := new(model.TranslationGetResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/translations/%d", projectID, translationID), opts, res)

	return res.Data, resp, err
}

// AddTranslation adds a new string translation.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.translations.post
func (s *StringTranslationsService) AddTranslation(ctx context.Context, projectID int, req *model.TranslationAddRequest) (
	*model.Translation, *Response, error,
) {
	res := new(model.TranslationGetResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/translations", projectID), req, res)

	return res.Data, resp, err
}

// RestoreTranslation restores a translation by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.translations.put
func (s *StringTranslationsService) RestoreTranslation(ctx context.Context, projectID, translationID int) (
	*model.Translation, *Response, error,
) {
	res := new(model.TranslationGetResponse)
	resp, err := s.client.Put(ctx, fmt.Sprintf("/api/v2/projects/%d/translations/%d", projectID, translationID), nil, res)

	return res.Data, resp, err
}

// DeleteTranslation deletes a translation by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.translations.delete
func (s *StringTranslationsService) DeleteTranslation(ctx context.Context, projectID, translationID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/translations/%d", projectID, translationID), nil)
}

// ListVotes lists translation votes.
//
// Note: Either `translationId` OR `fileId` OR `labelIds` OR `excludeLabelIds` with
// `languageId` OR `stringId` with `languageId` are required
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.votes.getMany
func (s *StringTranslationsService) ListVotes(ctx context.Context, projectID int, opts *model.VotesListOptions) (
	[]*model.Vote, *Response, error,
) {
	res := new(model.VotesListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/votes", projectID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Vote, 0, len(res.Data))
	for _, vote := range res.Data {
		list = append(list, vote.Data)
	}

	return list, resp, nil
}

// GetVote gets a single translation vote by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.votes.get
func (s *StringTranslationsService) GetVote(ctx context.Context, projectID, voteID int) (*model.Vote, *Response, error) {
	res := new(model.VoteGetResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/votes/%d", projectID, voteID), nil, res)

	return res.Data, resp, err
}

// AddVote adds a vote for a translation.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.votes.post
func (s *StringTranslationsService) AddVote(ctx context.Context, projectID int, req *model.VoteAddRequest) (
	*model.Vote, *Response, error,
) {
	res := new(model.VoteGetResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/votes", projectID), req, res)

	return res.Data, resp, err
}

// CancelVote cancels a vote for a translation by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.votes.delete
func (s *StringTranslationsService) CancelVote(ctx context.Context, projectID, voteID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/votes/%d", projectID, voteID), nil)
}
