package crowdin

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path"
	"reflect"
	"testing"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStoragesService_List(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/storages", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, "/api/v2/storages")
		fmt.Fprint(w, `{
			"data": [
			  	{
					"data": {
						"id": 1,
						"fileName": "umbrella_app.xliff"
					}
				}
			],
			"pagination": {
				"offset": 0,
				"limit": 25
			}
		}`)
	})

	storages, resp, err := client.Storages.List(context.Background(), nil)
	if err != nil {
		t.Errorf("Storages.List returned error: %v", err)
	}

	want := []*model.Storage{
		{
			ID:       1,
			FileName: "umbrella_app.xliff",
		},
	}
	if !reflect.DeepEqual(storages, want) {
		t.Errorf("Storages.List returned %+v, want %+v", storages, want)
	}

	expectedPagination := model.Pagination{Offset: 0, Limit: 25}
	if !reflect.DeepEqual(resp.Pagination, expectedPagination) {
		t.Errorf("Storages.List pagination returned %+v, want %+v", resp.Pagination, expectedPagination)
	}
}

func TestStoragesService_List_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/storages", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Storages.List(context.Background(), nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestStoragesService_Get(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/storages/1", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, "/api/v2/storages/1")
		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"fileName": "umbrella_app.xlif"
			}
		}`)
	})

	storage, _, err := client.Storages.Get(context.Background(), 1)
	if err != nil {
		t.Errorf("Storages.Get returned error: %v", err)
	}

	want := &model.Storage{
		ID:       1,
		FileName: "umbrella_app.xlif",
	}
	if !reflect.DeepEqual(storage, want) {
		t.Errorf("Storages.Get returned %+v, want %+v", storage, want)
	}
}

func TestStorageService_Delete(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/storages/1", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "DELETE")
		testURL(t, r, "/api/v2/storages/1")

		fmt.Fprint(w, `{}`)
	})

	_, err := client.Storages.Delete(context.Background(), 1)
	if err != nil {
		t.Errorf("Storages.Delete returned error: %v", err)
	}
}

func TestStorageService_Add(t *testing.T) {
	defaultMediaType := "application/octet-stream"
	uploads := []struct {
		fileName          string
		expectedMediaType string
	}{
		{"upload.txt", "text/plain; charset=utf-8"},
		// No media type for unknown file types
		{"upload.xlif", defaultMediaType},
	}

	for _, tt := range uploads {
		client, mux, teardown := setupClient()
		defer teardown()

		mux.HandleFunc("/api/v2/storages", func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, "POST")
			testURL(t, r, "/api/v2/storages")
			testHeader(t, r, "Content-Type", tt.expectedMediaType)
			testHeader(t, r, "Crowdin-API-FileName", tt.fileName)

			fmt.Fprint(w, `{
				"data": {
					"id": 1,
					"fileName": "upload.txt"
				}
			}`)
		})

		file, dir, err := openFile(tt.fileName, "file content\n")
		if err != nil {
			t.Fatalf("Storages.Add failed to open temp file: %v", err)
		}
		defer os.RemoveAll(dir)
		defer file.Close()

		storage, _, err := client.Storages.Add(context.Background(), file)
		if err != nil {
			t.Errorf("Storages.Add returned error: %v", err)
		}

		want := &model.Storage{
			ID:       1,
			FileName: "upload.txt",
		}
		if !reflect.DeepEqual(storage, want) {
			t.Errorf("Storages.Add returned %+v, want %+v", storage, want)
		}

		_, _, err = client.Storages.Add(context.Background(), nil)
		if err == nil {
			t.Errorf("Storages.Add should return an error, got nil")
		}
	}
}

func openFile(name, content string) (*os.File, string, error) {
	dir, err := os.MkdirTemp("", "crowdin")
	if err != nil {
		return nil, dir, err
	}

	file, err := os.OpenFile(path.Join(dir, name), os.O_RDWR|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return nil, dir, err
	}

	fmt.Fprint(file, content)

	file.Close()
	file, err = os.Open(file.Name())
	if err != nil {
		return nil, dir, err
	}

	return file, dir, nil
}
