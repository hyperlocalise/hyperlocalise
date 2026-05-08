package crowdin

import (
	"context"
	"errors"
	"fmt"
	"mime"
	"net/url"
	"os"
	"path/filepath"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Storages is a separate container for each file. You need to use Add method before
// adding files to your projects via API. Files that should be uploaded into storage
// include files for localization, screenshots, Glossaries, and Translation Memories.
// Storage `id` is the identifier of the file uploaded to the Storage.
//
//	Note: Files uploaded to the storage are kept during the next 24 hours.
//
// Crowdin API docs:
// https://developer.crowdin.com/api/v2/#tag/Storage
type StorageService struct {
	client *Client
}

// Add adds a new file to the storage.
//
// `file` is the file to be uploaded. It should be an os.File.
// ZIP files are not supported.
//
// https://developer.crowdin.com/api/v2/#operation/api.storages.post
func (s *StorageService) Add(ctx context.Context, file *os.File) (*model.Storage, *Response, error) {
	if file == nil {
		return nil, nil, errors.New("file is required")
	}

	res := new(model.StorageGetResponse)
	resp, err := s.client.Upload(ctx, "/api/v2/storages", file, res,
		Header("Content-Type", mime.TypeByExtension(filepath.Ext(file.Name()))),
		Header("Crowdin-API-FileName", url.QueryEscape(filepath.Base(file.Name()))),
	)

	return res.Data, resp, err
}

// List returns a list of storages.
// opts (model.ListOptions) can be used to control pagination. If nil, default values will be used.
//
//	limit: A maximum number of items to retrieve (default 25, max 500).
//	offset: A starting offset in the collection of items (default 0).
//
// https://developer.crowdin.com/api/v2/#operation/api.storages.getMany
func (s *StorageService) List(ctx context.Context, opts *model.ListOptions) ([]*model.Storage, *Response, error) {
	res := new(model.StorageListResponse)
	resp, err := s.client.Get(ctx, "/api/v2/storages", opts, res)
	if err != nil {
		return nil, resp, err
	}

	storages := make([]*model.Storage, 0, len(res.Data))
	for _, stor := range res.Data {
		storages = append(storages, stor.Data)
	}

	return storages, resp, nil
}

// Get returns a file in the storage by its identifier.
// https://developer.crowdin.com/api/v2/#operation/api.storages.get
func (s *StorageService) Get(ctx context.Context, id int) (*model.Storage, *Response, error) {
	res := new(model.StorageGetResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/storages/%d", id), nil, res)

	return res.Data, resp, err
}

// Delete deletes a file from the storage by its identifier.
// https://developer.crowdin.com/api/v2/#operation/api.storages.delete
func (s *StorageService) Delete(ctx context.Context, id int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/storages/%d", id), nil)
}
