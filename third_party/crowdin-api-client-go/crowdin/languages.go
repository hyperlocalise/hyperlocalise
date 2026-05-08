package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Crowdin supports more than 300 world languages and custom languages created in the system.
// Use API to get the list of all supported languages and retrieve additional details
// (e.g. text direction, internal code) on specific language.
//
// https://developer.crowdin.com/api/v2/#tag/Languages
type LanguagesService struct {
	client *Client
}

// List returns a list of all supported languages.
//
// https://developer.crowdin.com/api/v2/#operation/api.languages.getMany
func (s *LanguagesService) List(ctx context.Context, opts *model.ListOptions) ([]*model.Language, *Response, error) {
	res := new(model.LanguagesListResponse)
	resp, err := s.client.Get(ctx, "/api/v2/languages", opts, res)
	if err != nil {
		return nil, resp, err
	}

	langs := make([]*model.Language, 0, len(res.Data))
	for _, lang := range res.Data {
		langs = append(langs, lang.Data)
	}

	return langs, resp, nil
}

// Get returns a language by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.languages.get
func (s *LanguagesService) Get(ctx context.Context, id string) (*model.Language, *Response, error) {
	res := new(model.LanguagesGetResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/languages/%s", id), nil, res)

	return res.Data, resp, err
}

// Add adds a new custom language.
//
// https://developer.crowdin.com/api/v2/#operation/api.languages.post
func (s *LanguagesService) Add(ctx context.Context, req *model.AddLanguageRequest) (*model.Language, *Response, error) {
	res := new(model.LanguagesGetResponse)
	resp, err := s.client.Post(ctx, "/api/v2/languages", req, res)

	return res.Data, resp, err
}

// Edit updates a custom language by its identifier.
//
// Request body:
//   - op: The operation to perform. Enum: replace, test
//   - path: A JSON Pointer as defined in RFC 6901.
//     Enum: "/name" "/textDirection" "/pluralCategoryNames" "/threeLettersCode" "/localeCode" "/dialectOf"
//   - value: The value to be used within the operations. The value must be one of string or array of strings.
//
// https://developer.crowdin.com/api/v2/#operation/api.languages.patch
func (s *LanguagesService) Edit(ctx context.Context, id string, req []*model.UpdateRequest) (*model.Language, *Response, error) {
	res := new(model.LanguagesGetResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/languages/%s", id), req, res)

	return res.Data, resp, err
}

// Delete deletes a custom language by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.languages.delete
func (s *LanguagesService) Delete(ctx context.Context, id string) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/languages/%s", id), nil)
}
