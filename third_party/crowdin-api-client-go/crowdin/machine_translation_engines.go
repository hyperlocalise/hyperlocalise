package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Machine Translation Engines (MTE) are the sources for pre-translations.
// You can currently connect Google Translate, Microsoft Translator, Translate,
// DeepL Pro and Amazon Translate engines.
//
// Use API to add, update, and delete specific MTE.
//
// Crowdin API docs: https://developer.crowdin.com/api/v2/#tag/Machine-Translation-Engines
type MachineTranslationEnginesService struct {
	client *Client
}

// GetMT returns a specific machine translation by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.mts.get
func (s *MachineTranslationEnginesService) GetMT(ctx context.Context, mtID int) (
	*model.MachineTranslation, *Response, error,
) {
	res := new(model.MachineTranslationsResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/mts/%d", mtID), nil, res)

	return res.Data, resp, err
}

// ListMT returns a list of all machine translations.
//
// https://developer.crowdin.com/api/v2/#operation/api.mts.getMany
func (s *MachineTranslationEnginesService) ListMT(ctx context.Context, opts *model.MTListOptions) (
	[]*model.MachineTranslation, *Response, error,
) {
	res := new(model.MachineTranslationsListResponse)
	resp, err := s.client.Get(ctx, "/api/v2/mts", opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.MachineTranslation, 0, len(res.Data))
	for _, mt := range res.Data {
		list = append(list, mt.Data)
	}

	return list, resp, err
}

// AddMT creates a new machine translation.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.mts.post
func (s *MachineTranslationEnginesService) AddMT(ctx context.Context, req *model.MTAddRequest) (
	*model.MachineTranslation, *Response, error,
) {
	res := new(model.MachineTranslationsResponse)
	resp, err := s.client.Post(ctx, "/api/v2/mts", req, res)

	return res.Data, resp, err
}

// EditMT updates an existing machine translation.
//
// Request body:
//   - op (string): Operation to perform. Possible values: replace, test.
//   - path (string): Path to the field to update (a JSON Pointer as defined by RFC 6901).
//     Enum: /name, /type, /credentials, /enabledLanguageIds, /enabledProjectIds, /isEnabled.
//   - value (any): New value for the field. Value must be one of string or object.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.mts.patch
func (s *MachineTranslationEnginesService) EditMT(ctx context.Context, mtID int, req []*model.UpdateRequest) (
	*model.MachineTranslation, *Response, error,
) {
	res := new(model.MachineTranslationsResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/mts/%d", mtID), req, res)

	return res.Data, resp, err
}

// DeleteMT removes an existing machine translation.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.mts.delete
func (s *MachineTranslationEnginesService) DeleteMT(ctx context.Context, mtID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/mts/%d", mtID), nil)
}

// Translate translates strings using a specific MTE.
//
// https://developer.crowdin.com/api/v2/#operation/api.mts.translations.post
func (s *MachineTranslationEnginesService) Translate(ctx context.Context, mtID int, req *model.TranslateRequest) (
	*model.MTTranslation, *Response, error,
) {
	res := new(model.MTTranslationResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/mts/%d/translations", mtID), req, res)

	return res.Data, resp, err
}
