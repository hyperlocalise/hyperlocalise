package crowdin

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSourceFilesService_ListDirectories(t *testing.T) {
	client, mux, teatdown := setupClient()
	defer teatdown()

	const path = "/api/v2/projects/1/directories"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, path, r.RequestURI)

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": 4,
						"projectId": 2,
						"branchId": 34,
						"directoryId": null,
						"name": "main",
						"title": "Description materials",
						"exportPattern": "/localization/%locale%/file_name",
						"path": "/main",
						"priority": "normal",
						"createdAt": "2024-04-18T14:14:00+00:00",
						"updatedAt": "2024-04-18T14:14:00+00:00"
					}
				}
			],
			"pagination": {
				"offset": 10,
				"limit": 25
			}
		}`)
	})

	directories, resp, err := client.SourceFiles.ListDirectories(context.Background(), 1, nil)
	require.NoError(t, err)

	expected := []*model.Directory{
		{
			ID:            4,
			ProjectID:     2,
			BranchID:      ToPtr(34),
			DirectoryID:   nil,
			Name:          "main",
			Title:         "Description materials",
			ExportPattern: "/localization/%locale%/file_name",
			Path:          "/main",
			Priority:      "normal",
			CreatedAt:     "2024-04-18T14:14:00+00:00",
			UpdatedAt:     "2024-04-18T14:14:00+00:00",
		},
	}
	assert.Equal(t, expected, directories)

	expectedPagination := model.Pagination{Offset: 10, Limit: 25}
	assert.Equal(t, expectedPagination, resp.Pagination)
}

func TestSourceFilesService_ListDirectories_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/directories", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.SourceFiles.ListDirectories(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestSourceFilesService_ListDirectories_WithQueryParams(t *testing.T) {
	client, mux, teatdown := setupClient()
	defer teatdown()

	cases := []struct {
		name   string
		opts   *model.DirectoryListOptions
		expect string
	}{
		{
			name:   "Nil query params",
			opts:   nil,
			expect: "",
		},
		{
			name: "With query params",
			opts: &model.DirectoryListOptions{
				OrderBy:  "createdAt desc",
				BranchID: 1,
				ListOptions: model.ListOptions{
					Limit: 10,
				},
			},
			expect: "?branchId=1&limit=10&orderBy=createdAt+desc",
		},
		{
			name: "With all query params",
			opts: &model.DirectoryListOptions{
				OrderBy:     "createdAt desc,name,id",
				BranchID:    1,
				DirectoryID: 2,
				Filter:      "name",
				Recursion:   "true",
				ListOptions: model.ListOptions{
					Limit:  25,
					Offset: 10,
				},
			},
			expect: "?branchId=1&directoryId=2&filter=name&limit=25&offset=10&orderBy=createdAt+desc%2Cname%2Cid&recursion=true",
		},
	}

	for i, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/projects/%d/directories", i)
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, http.MethodGet, r.Method)
				assert.Equal(t, path+tt.expect, r.RequestURI)

				fmt.Fprint(w, `{}`)
			})

			_, _, err := client.SourceFiles.ListDirectories(context.Background(), i, tt.opts)
			require.NoError(t, err)
		})
	}
}

func TestSourceFilesService_GetDirectory(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/directories/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, path, r.RequestURI)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"projectId": 1,
				"branchId": 34,
				"directoryId": null,
				"name": "main",
				"title": "Description materials",
				"exportPattern": "/localization/%locale%/file_name",
				"path": "/main",
				"priority": "normal",
				"createdAt": "2024-04-18T14:14:00+00:00",
				"updatedAt": "2024-04-18T14:14:00+00:00"
			}
		}`)
	})

	directory, resp, err := client.SourceFiles.GetDirectory(context.Background(), 1, 2)
	require.NoError(t, err)

	expected := &model.Directory{
		ID:            2,
		ProjectID:     1,
		BranchID:      ToPtr(34),
		DirectoryID:   nil,
		Name:          "main",
		Title:         "Description materials",
		ExportPattern: "/localization/%locale%/file_name",
		Path:          "/main",
		Priority:      "normal",
		CreatedAt:     "2024-04-18T14:14:00+00:00",
		UpdatedAt:     "2024-04-18T14:14:00+00:00",
	}
	assert.Equal(t, expected, directory)
	assert.NotNil(t, resp)
}

func TestSourceFilesService_AddDirectory(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/directories"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, path, r.RequestURI)

		expectedReqBody := `{"name":"main","branchId":34,"title":"Description materials","exportPattern":"/localization/%locale%/file_name","priority":"normal"}` + "\n"
		testBody(t, r, expectedReqBody)

		fmt.Fprint(w, `{
			"data": {
				"id": 5,
				"projectId": 1,
				"branchId": 34,
				"directoryId": null,
				"name": "new_directory",
				"title": "New Directory",
				"exportPattern": "/localization/%locale%/new_file_name",
				"path": "/new_directory",
				"priority": "normal",
				"createdAt": "2024-04-18T14:14:00+00:00",
				"updatedAt": "2024-04-18T14:14:00+00:00"
			}
		}`)
	})

	req := &model.DirectoryAddRequest{
		Name:          "main",
		BranchID:      34,
		Title:         "Description materials",
		ExportPattern: "/localization/%locale%/file_name",
		Priority:      "normal",
	}
	directory, resp, err := client.SourceFiles.AddDirectory(context.Background(), 1, req)
	require.NoError(t, err)

	expected := &model.Directory{
		ID:            5,
		ProjectID:     1,
		BranchID:      ToPtr(34),
		DirectoryID:   nil,
		Name:          "new_directory",
		Title:         "New Directory",
		ExportPattern: "/localization/%locale%/new_file_name",
		Path:          "/new_directory",
		Priority:      "normal",
		CreatedAt:     "2024-04-18T14:14:00+00:00",
		UpdatedAt:     "2024-04-18T14:14:00+00:00",
	}
	assert.Equal(t, expected, directory)
	assert.NotNil(t, resp)
}

func TestSourceFilesService_AddDirectory_WithRequiredFields(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/directories"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testBody(t, r, `{"name":"main"}`+"\n")

		fmt.Fprint(w, `{}`)
	})

	req := &model.DirectoryAddRequest{Name: "main"}
	_, _, err := client.SourceFiles.AddDirectory(context.Background(), 1, req)
	require.NoError(t, err)
}

func TestSourceFilesService_EditDirectory(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/directories/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPatch, r.Method)
		assert.Equal(t, path, r.RequestURI)

		expectedReqBody := `[{"op":"replace","path":"/branchId","value":34}]` + "\n"
		testBody(t, r, expectedReqBody)

		fmt.Fprint(w, `{
			"data": {
				"id": 4,
				"projectId": 1,
				"branchId": 34,
				"directoryId": null,
				"name": "new_name",
				"title": "Description materials",
				"exportPattern": "/localization/%locale%/file_name",
				"path": "/main",
				"priority": "normal",
				"createdAt": "2024-04-18T14:14:00+00:00",
				"updatedAt": "2024-04-18T14:14:00+00:00"
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/branchId",
			Value: 34,
		},
	}
	directory, resp, err := client.SourceFiles.EditDirectory(context.Background(), 1, 2, req)
	require.NoError(t, err)

	expected := &model.Directory{
		ID:            4,
		ProjectID:     1,
		BranchID:      ToPtr(34),
		DirectoryID:   nil,
		Name:          "new_name",
		Title:         "Description materials",
		ExportPattern: "/localization/%locale%/file_name",
		Path:          "/main",
		Priority:      "normal",
		CreatedAt:     "2024-04-18T14:14:00+00:00",
		UpdatedAt:     "2024-04-18T14:14:00+00:00",
	}
	assert.Equal(t, expected, directory)
	assert.NotNil(t, resp)
}

func TestSourceFilesService_DeleteDirectory(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/directories/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodDelete, r.Method)
		assert.Equal(t, path, r.RequestURI)

		w.WriteHeader(http.StatusNoContent)
		fmt.Fprint(w, `{}`)
	})

	resp, err := client.SourceFiles.DeleteDirectory(context.Background(), 1, 2)
	require.NoError(t, err)

	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
	assert.NotNil(t, resp)
}

func TestSourceFilesService_ListFiles(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/files"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, path, r.RequestURI)

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": 44,
						"projectId": 2,
						"branchId": 34,
						"directoryId": 4,
						"name": "umbrella_app.xliff",
						"title": "source_app_info",
						"context": "Context for translators",
						"type": "xliff",
						"path": "/directory1/directory2/filename.extension",
						"status": "active",
						"fields": {
							"key_1": "value_1",
							"key_2": 2,
							"key_3": true,
							"key_4": ["en", "uk"]
						}
					}
				},
				{
					"data": {
						"id": 45,
						"projectId": 2,
						"branchId": 34,
						"directoryId": 4,
						"name": "umbrella_app.xliff",
						"title": "source_app_info",
						"context": "Context for translators",
						"type": "xliff",
						"path": "/directory1/directory2/filename.extension",
						"status": "active",
						"fields": []
					}
				},
				{
					"data": {
						"id": 46,
						"projectId": 2,
						"branchId": 34,
						"directoryId": 4,
						"name": "umbrella_app.xliff",
						"title": "source_app_info",
						"context": "Context for translators",
						"type": "xliff",
						"path": "/directory1/directory2/filename.extension",
						"status": "active",
						"fields": {}
					}
				}
			],
			"pagination": {
				"offset": 10,
				"limit": 2
			}
		}`)
	})

	files, resp, err := client.SourceFiles.ListFiles(context.Background(), 2, nil)
	require.NoError(t, err)

	expected := []*model.File{
		{
			ID:          44,
			ProjectID:   2,
			BranchID:    ToPtr(34),
			DirectoryID: ToPtr(4),
			Name:        "umbrella_app.xliff",
			Title:       ToPtr("source_app_info"),
			Context:     ToPtr("Context for translators"),
			Type:        "xliff",
			Path:        "/directory1/directory2/filename.extension",
			Status:      "active",
			Fields: map[string]any{
				"key_1": "value_1",
				"key_2": float64(2),
				"key_3": true,
				"key_4": []interface{}{"en", "uk"},
			},
		},
		{
			ID:          45,
			ProjectID:   2,
			BranchID:    ToPtr(34),
			DirectoryID: ToPtr(4),
			Name:        "umbrella_app.xliff",
			Title:       ToPtr("source_app_info"),
			Context:     ToPtr("Context for translators"),
			Type:        "xliff",
			Path:        "/directory1/directory2/filename.extension",
			Status:      "active",
			Fields:      []any{},
		},
		{
			ID:          46,
			ProjectID:   2,
			BranchID:    ToPtr(34),
			DirectoryID: ToPtr(4),
			Name:        "umbrella_app.xliff",
			Title:       ToPtr("source_app_info"),
			Context:     ToPtr("Context for translators"),
			Type:        "xliff",
			Path:        "/directory1/directory2/filename.extension",
			Status:      "active",
			Fields:      map[string]any{},
		},
	}
	assert.Equal(t, expected, files)

	expectedPagination := model.Pagination{Offset: 10, Limit: 2}
	assert.Equal(t, expectedPagination, resp.Pagination)
}

func TestSourceFilesService_ListFiles_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/files", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.SourceFiles.ListFiles(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestSourceFilesService_ListFiles_WithQueryParams(t *testing.T) {
	client, mux, teatdown := setupClient()
	defer teatdown()

	cases := []struct {
		name   string
		opts   *model.FileListOptions
		expect string
	}{
		{
			name:   "Nil query params",
			opts:   nil,
			expect: "",
		},
		{
			name: "With query params",
			opts: &model.FileListOptions{
				OrderBy:  "createdAt desc",
				BranchID: 1,
				ListOptions: model.ListOptions{
					Limit: 10,
				},
			},
			expect: "?branchId=1&limit=10&orderBy=createdAt+desc",
		},
		{
			name: "With all query params",
			opts: &model.FileListOptions{
				OrderBy:     "createdAt desc,name,id",
				BranchID:    1,
				DirectoryID: 2,
				Filter:      "name",
				Recursion:   "true",
				ListOptions: model.ListOptions{
					Limit:  25,
					Offset: 10,
				},
			},
			expect: "?branchId=1&directoryId=2&filter=name&limit=25&offset=10&orderBy=createdAt+desc%2Cname%2Cid&recursion=true",
		},
	}

	for i, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/projects/%d/files", i)
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, http.MethodGet, r.Method)
				assert.Equal(t, path+tt.expect, r.RequestURI)

				fmt.Fprint(w, `{}`)
			})

			_, _, err := client.SourceFiles.ListFiles(context.Background(), i, tt.opts)
			require.NoError(t, err)
		})
	}
}

func TestSourceFilesService_GetFile(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/files/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, path, r.RequestURI)

		fmt.Fprint(w, `{
			"data": {
				"id": 44,
				"projectId": 2,
				"branchId": 34,
				"directoryId": 4,
				"name": "umbrella_app.xliff",
				"title": "source_app_info",
				"context": "Context for translators",
				"type": "xliff",
				"path": "/directory1/directory2/filename.extension",
				"status": "active",
				"fields": {
					"fieldSlug": "fieldValue"
				}
			}
		}`)
	})

	file, resp, err := client.SourceFiles.GetFile(context.Background(), 1, 2)
	require.NoError(t, err)

	expected := &model.File{
		ID:          44,
		ProjectID:   2,
		BranchID:    ToPtr(34),
		DirectoryID: ToPtr(4),
		Name:        "umbrella_app.xliff",
		Title:       ToPtr("source_app_info"),
		Context:     ToPtr("Context for translators"),
		Type:        "xliff",
		Path:        "/directory1/directory2/filename.extension",
		Status:      "active",
		Fields:      map[string]any{"fieldSlug": "fieldValue"},
	}
	assert.Equal(t, expected, file)
	assert.NotNil(t, resp)
}

func TestSourceFilesService_AddFile(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/files"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, path, r.RequestURI)

		expectedReqBody := `{
			"storageId": 61,
			"name": "umbrella_app.xliff",
			"branchId": 34,
			"title": "source_app_info",
			"context": "Additional context valuable for translators",
			"type": "xliff",
			"parserVersion": 1,
			"importOptions": {
				"firstLineContainsHeader": true,
				"importHiddenSheets": false,
				"contentSegmentation": false,
				"scheme": {
					"identifier": 0,
					"sourcePhrase": 1,
					"en": 2,
					"de": 3
				}
			},
			"exportOptions": {
				"exportPattern": "/localization/%locale%/new_file_name"
			},
			"excludedTargetLanguages": ["en", "es", "pl"],
			"attachLabelIds": [1],
			"fields": {
				"key_1": "value_1",
				"key_2": 2,
				"key_3": true,
				"key_4": ["en", "uk"]
			}
		}`
		testJSONBody(t, r, expectedReqBody)

		fmt.Fprint(w, `{
			"data": {
				"id": 5
			}
		}`)
	})

	req := &model.FileAddRequest{
		StorageID:     61,
		Name:          "umbrella_app.xliff",
		BranchID:      34,
		Title:         "source_app_info",
		Context:       "Additional context valuable for translators",
		Type:          "xliff",
		ParserVersion: 1,
		ImportOptions: &model.SpreadsheetFileImportOptions{
			FirstLineContainsHeader: ToPtr(true),
			ImportHiddenSheets:      ToPtr(false),
			CommonFileImportOptions: model.CommonFileImportOptions{
				ContentSegmentation: ToPtr(false),
			},
			Scheme: map[string]int{
				"identifier":   0,
				"sourcePhrase": 1,
				"en":           2,
				"de":           3,
			},
		},
		ExportOptions: &model.GeneralFileExportOptions{
			ExportPattern: "/localization/%locale%/new_file_name",
		},
		ExcludedTargetLanguages: []string{"en", "es", "pl"},
		AttachLabelIDs:          []int{1},
		Fields: map[string]any{
			"key_1": "value_1",
			"key_2": 2,
			"key_3": true,
			"key_4": []interface{}{"en", "uk"},
		},
	}
	file, resp, err := client.SourceFiles.AddFile(context.Background(), 1, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	assert.IsType(t, &model.File{}, file)
	assert.Equal(t, 5, file.ID)
}

func TestSourceFilesService_AddFile_WithRequiredFields(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/files"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testBody(t, r, `{"storageId":61,"name":"umbrella_app.xliff"}`+"\n")

		fmt.Fprint(w, `{}`)
	})

	req := &model.FileAddRequest{
		StorageID: 61,
		Name:      "umbrella_app.xliff",
	}
	_, _, err := client.SourceFiles.AddFile(context.Background(), 1, req)
	require.NoError(t, err)
}

func TestSourceFilesService_EditFile(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/files/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPatch, r.Method)
		assert.Equal(t, path, r.RequestURI)

		expectedReqBody := `[{"op":"replace","path":"/branchId","value":34}]` + "\n"
		testBody(t, r, expectedReqBody)

		fmt.Fprint(w, `{
			"data": {
				"id": 4,
				"branchId": 34
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/branchId",
			Value: 34,
		},
	}
	file, resp, err := client.SourceFiles.EditFile(context.Background(), 1, 2, req)
	require.NoError(t, err)

	assert.Equal(t, 4, file.ID)
	assert.Equal(t, ToPtr(34), file.BranchID)
	assert.NotNil(t, resp)
}

func TestSourceFilesService_UpdateFile(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/files/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPut, r.Method)
		assert.Equal(t, path, r.RequestURI)

		expectedReqBody := `{
			"storageId": 61,
			"name": "umbrella_app.xliff",
			"updateOption": "clear_translations_and_approvals",
			"importOptions": {
				"importKeyAsSource": true
			},
			"exportOptions": {
				"exportPattern": "/localization/%locale%/new_file_name"
			},
			"attachLabelIds": [1],
			"detachLabelIds": [2],
			"replaceModifiedContext": false
		}`
		testJSONBody(t, r, expectedReqBody)

		fmt.Fprint(w, `{
			"data": {
				"id": 4
			}
		}`)
	})

	req := &model.FileUpdateRestoreRequest{
		StorageID:    61,
		Name:         "umbrella_app.xliff",
		UpdateOption: "clear_translations_and_approvals",
		ImportOptions: &model.StringCatalogFileImportOptions{
			ImportKeyAsSource: ToPtr(true),
		},
		ExportOptions: &model.GeneralFileExportOptions{
			ExportPattern: "/localization/%locale%/new_file_name",
		},
		AttachLabelIDs:         []int{1},
		DetachLabelIDs:         []int{2},
		ReplaceModifiedContext: ToPtr(false),
	}
	file, resp, err := client.SourceFiles.UpdateOrRestoreFile(context.Background(), 1, 2, req)
	require.NoError(t, err)

	assert.Equal(t, 4, file.ID)
	assert.NotNil(t, resp)
}

func TestSourceFilesService_RestoreFile(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/files/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPut, r.Method)
		assert.Equal(t, path, r.RequestURI)

		expectedReqBody := `{"revisionId":1}` + "\n"
		testBody(t, r, expectedReqBody)

		fmt.Fprint(w, `{
			"data": {
				"id": 4
			}
		}`)
	})

	req := &model.FileUpdateRestoreRequest{
		RevisionID: 1,
	}
	file, resp, err := client.SourceFiles.UpdateOrRestoreFile(context.Background(), 1, 2, req)
	require.NoError(t, err)

	assert.IsType(t, &model.File{}, file)
	assert.Equal(t, 4, file.ID)
	assert.NotNil(t, resp)
}

func TestSourceFilesService_DeleteFile(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/files/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodDelete, r.Method)
		assert.Equal(t, path, r.RequestURI)

		w.WriteHeader(http.StatusNoContent)
		fmt.Fprint(w, `{}`)
	})

	resp, err := client.SourceFiles.DeleteFile(context.Background(), 1, 2)
	require.NoError(t, err)
	assert.NotNil(t, resp)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestSourceFilesService_DownloadFilePreview(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/files/2/preview"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, path, r.RequestURI)

		fmt.Fprint(w, `{
			"data": {
				"url": "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff?response-content-disposition",
				"expireIn": "2023-09-20T10:31:21+00:00"
			}
		}`)
	})

	downloadLink, resp, err := client.SourceFiles.DownloadFilePreview(context.Background(), 1, 2)
	require.NoError(t, err)

	expected := &model.DownloadLink{
		URL:      "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff?response-content-disposition",
		ExpireIn: "2023-09-20T10:31:21+00:00",
	}
	assert.Equal(t, expected, downloadLink)
	assert.NotNil(t, resp)
}

func TestSourceFilesService_DownloadFile(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/files/2/download"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, path, r.RequestURI)

		fmt.Fprint(w, `{
			"data": {
				"url": "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff?response-content-disposition",
				"expireIn": "2023-09-20T10:31:21+00:00"
			}
		}`)
	})

	downloadLink, resp, err := client.SourceFiles.DownloadFile(context.Background(), 1, 2)
	require.NoError(t, err)

	expected := &model.DownloadLink{
		URL:      "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff?response-content-disposition",
		ExpireIn: "2023-09-20T10:31:21+00:00",
	}
	assert.Equal(t, expected, downloadLink)
	assert.NotNil(t, resp)
}

func TestSourceFilesService_ListFileRevisions(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/files/2/revisions"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, path+"?limit=25&offset=10", r.RequestURI)

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": 2,
						"projectId": 2,
						"fileId": 248,
						"restoreToRevision": null,
						"info": {
							"added": {
								"strings": 17,
								"words": 43
							},
							"deleted": {
								"strings": 17,
								"words": 43
							},
							"updated": {
								"strings": 17,
								"words": 43
							}
						},
						"date": "2023-09-20T09:08:16+00:00"
					}
				}
			],
			"pagination": {
				"offset": 10,
				"limit": 25
			}
		}`)
	})

	revisions, resp, err := client.SourceFiles.ListFileRevisions(context.Background(), 1, 2, &model.ListOptions{Limit: 25, Offset: 10})
	require.NoError(t, err)

	expected := []*model.FileRevision{
		{
			ID:                2,
			ProjectID:         2,
			FileID:            248,
			RestoreToRevision: nil,
			Info: struct {
				Added   model.RevisionInfo `json:"added"`
				Deleted model.RevisionInfo `json:"deleted"`
				Updated model.RevisionInfo `json:"updated"`
			}{
				Added: model.RevisionInfo{
					Strings: 17,
					Words:   43,
				},
				Deleted: model.RevisionInfo{
					Strings: 17,
					Words:   43,
				},
				Updated: model.RevisionInfo{
					Strings: 17,
					Words:   43,
				},
			},
			Date: "2023-09-20T09:08:16+00:00",
		},
	}
	assert.Equal(t, expected, revisions)

	expectedPagination := model.Pagination{Offset: 10, Limit: 25}
	assert.Equal(t, expectedPagination, resp.Pagination)
}

func TestSourceFilesService_ListFileRevisions_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/files/2/revisions", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.SourceFiles.ListFileRevisions(context.Background(), 1, 2, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestSourceFilesService_GetFileRevision(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/files/2/revisions/3"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, path, r.RequestURI)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"projectId": 2,
				"fileId": 248,
				"restoreToRevision": null,
				"info": {
					"added": {
						"strings": 17,
						"words": 43
					},
					"deleted": {
						"strings": 17,
						"words": 43
					},
					"updated": {
						"strings": 17,
						"words": 43
					}
				},
				"date": "2023-09-20T09:08:16+00:00"
			}
		}`)
	})

	fileRevision, resp, err := client.SourceFiles.GetFileRevision(context.Background(), 1, 2, 3)
	require.NoError(t, err)

	expected := &model.FileRevision{
		ID:                2,
		ProjectID:         2,
		FileID:            248,
		RestoreToRevision: nil,
		Info: struct {
			Added   model.RevisionInfo `json:"added"`
			Deleted model.RevisionInfo `json:"deleted"`
			Updated model.RevisionInfo `json:"updated"`
		}{
			Added: model.RevisionInfo{
				Strings: 17,
				Words:   43,
			},
			Deleted: model.RevisionInfo{
				Strings: 17,
				Words:   43,
			},
			Updated: model.RevisionInfo{
				Strings: 17,
				Words:   43,
			},
		},
		Date: "2023-09-20T09:08:16+00:00",
	}
	assert.Equal(t, expected, fileRevision)
	assert.NotNil(t, resp)
}

func TestSourceFilesService_ListReviewedBuilds(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	cases := []struct {
		name   string
		opts   *model.ReviewedBuildListOptions
		expect string
	}{
		{
			name:   "Nil query params",
			opts:   nil,
			expect: "",
		},
		{
			name: "With query params",
			opts: &model.ReviewedBuildListOptions{
				BranchID:    1,
				ListOptions: model.ListOptions{Limit: 25, Offset: 10},
			},
			expect: "?branchId=1&limit=25&offset=10",
		},
	}

	for i, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/projects/%d/strings/reviewed-builds", i)
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, http.MethodGet, r.Method)
				assert.Equal(t, path+tt.expect, r.RequestURI)

				fmt.Fprint(w, `{
					"data": [
						{
							"data": {
								"id": 2,
								"projectId": 1,
								"status": "finished",
								"progress": 100,
								"attributes": {
									"branchId": 1,
									"targetLanguageId": "en"
								}
							}
						}
					],
					"pagination": {
						"offset": 10,
						"limit": 2
					}
				}`)
			})

			builds, resp, err := client.SourceFiles.ListReviewedBuilds(context.Background(), i, tt.opts)
			require.NoError(t, err)

			expected := []*model.ReviewedBuild{
				{
					ID:        2,
					ProjectID: 1,
					Status:    "finished",
					Progress:  100,
					Attributes: struct {
						BranchID         *int   `json:"branchId,omitempty"`
						TargetLanguageID string `json:"targetLanguageId"`
					}{
						BranchID:         ToPtr(1),
						TargetLanguageID: "en",
					},
				},
			}
			assert.Equal(t, expected, builds)

			expectedPagination := model.Pagination{Offset: 10, Limit: 2}
			assert.Equal(t, expectedPagination, resp.Pagination)
		})
	}
}

func TestSourceFilesService_ListReviewedBuilds_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/strings/reviewed-builds", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.SourceFiles.ListReviewedBuilds(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestSourceFilesService_CheckReviewedBuildStatus(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/strings/reviewed-builds/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, path, r.RequestURI)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"projectId": 1,
				"status": "finished",
				"progress": 100,
				"attributes": {
					"branchId": 1,
					"targetLanguageId": "en"
				}
			}
		}`)
	})

	reviewedBuild, resp, err := client.SourceFiles.CheckReviewedBuildStatus(context.Background(), 1, 2)
	require.NoError(t, err)

	expected := &model.ReviewedBuild{
		ID:        2,
		ProjectID: 1,
		Status:    "finished",
		Progress:  100,
		Attributes: struct {
			BranchID         *int   `json:"branchId,omitempty"`
			TargetLanguageID string `json:"targetLanguageId"`
		}{
			BranchID:         ToPtr(1),
			TargetLanguageID: "en",
		},
	}
	assert.Equal(t, expected, reviewedBuild)
	assert.NotNil(t, resp)
}

func TestSourceFilesService_DownloadReviewedBuild(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/strings/reviewed-builds/2/download"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, path, r.RequestURI)

		fmt.Fprint(w, `{
			"data": {
				"url": "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff?response-content-disposition=attachment",
				"expireIn": "2019-09-20T10:31:21+00:00"
			}
		}`)
	})

	downloadLink, resp, err := client.SourceFiles.DownloadReviewedBuild(context.Background(), 1, 2)
	require.NoError(t, err)

	expected := &model.DownloadLink{
		URL:      "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff?response-content-disposition=attachment",
		ExpireIn: "2019-09-20T10:31:21+00:00",
	}
	assert.Equal(t, expected, downloadLink)
	assert.NotNil(t, resp)
}

func TestSourceFilesService_BuildReviewedFiles(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/strings/reviewed-builds"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, path, r.RequestURI)

		testBody(t, r, `{"branchId":1}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"projectId": 1,
				"status": "finished",
				"progress": 100,
				"attributes": {
					"branchId": 1,
					"targetLanguageId": "en"
				}
			}
		}`)
	})

	req := &model.ReviewedBuildRequest{BranchID: 1}
	build, resp, err := client.SourceFiles.BuildReviewedFiles(context.Background(), 1, req)
	require.NoError(t, err)

	expected := &model.ReviewedBuild{
		ID:        2,
		ProjectID: 1,
		Status:    "finished",
		Progress:  100,
		Attributes: struct {
			BranchID         *int   `json:"branchId,omitempty"`
			TargetLanguageID string `json:"targetLanguageId"`
		}{
			BranchID:         ToPtr(1),
			TargetLanguageID: "en",
		},
	}
	assert.Equal(t, expected, build)
	assert.NotNil(t, resp)
}
