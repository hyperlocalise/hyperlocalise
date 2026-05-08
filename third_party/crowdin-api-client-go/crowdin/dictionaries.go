package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Dictionaries allow you to create a storage of words that should be skipped
// by the spell checker.
//
// Use API to get the list of organization dictionaries and to edit a specific dictionary.
//
// https://developer.crowdin.com/api/v2/#tag/Dictionaries
type DictionariesService struct {
	client *Client
}

// List returns a list of organization dictionaries.
//
// https://developer.crowdin.com/api/v2/#tag/Dictionaries
func (s *DictionariesService) List(ctx context.Context, projectID int, opts *model.DictionariesListOptions) (
	[]*model.Dictionary, *Response, error,
) {
	res := new(model.DictionariesListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/dictionaries", projectID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Dictionary, 0, len(res.Data))
	for _, dict := range res.Data {
		list = append(list, dict.Data)
	}

	return list, resp, nil
}

// Edit updates a specific dictionary.
//
// Request body:
//   - Op (string) - operation to perform. Enum: remove, add.
//   - Path (string <json-pointer>) - a JSON Pointer as defined by RFC 6901. Value: "/words/{index}".
//     To delete multiple words with one request, please specify the word indexes in reverse order.
//   - Value (array) - value to set. Required for add operation.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.dictionaries.patch
func (s *DictionariesService) Edit(ctx context.Context, projectID int, languageID string, req []*model.UpdateRequest) (
	*model.Dictionary, *Response, error,
) {
	res := new(model.DictionaryResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/projects/%d/dictionaries/%s", projectID, languageID), req, res)

	return res.Data, resp, err
}
