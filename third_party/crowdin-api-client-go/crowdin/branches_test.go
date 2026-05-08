package crowdin

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"testing"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

func TestBranchesService_List(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/branches", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, "/api/v2/projects/2/branches")
		fmt.Fprint(w, `{
			"data": [
			  	{
					"data": {
						"id": 34,
						"projectId": 2,
						"name": "develop-master",
						"title": "Master branch",
						"createdAt": "2023-09-16T13:48:04+00:00",
						"updatedAt": "2023-09-19T13:25:27+00:00",
						"exportPattern": "%_three_letters_code%",
						"priority": "normal"
					}
				}
			],
			"pagination": {
			  	"offset": 0,
			  	"limit": 25
			}
		}`)
	})

	branches, resp, err := client.Branches.List(context.Background(), 2, nil)
	if err != nil {
		t.Errorf("Branches.List returned error: %v", err)
	}

	want := []*model.Branch{
		{
			ID:            34,
			ProjectID:     2,
			Name:          "develop-master",
			Title:         "Master branch",
			CreatedAt:     "2023-09-16T13:48:04+00:00",
			UpdatedAt:     "2023-09-19T13:25:27+00:00",
			ExportPattern: ToPtr("%_three_letters_code%"),
			Priority:      ToPtr("normal"),
		},
	}
	if !reflect.DeepEqual(branches, want) {
		t.Errorf("Branches.List returned %+v, want %+v", branches, want)
	}

	expectedPagination := model.Pagination{Offset: 0, Limit: 25}
	if !reflect.DeepEqual(resp.Pagination, expectedPagination) {
		t.Errorf("Branches.List returned %+v, want %+v", resp.Pagination, expectedPagination)
	}
}

func TestBranchesService_ListWithQueryParams(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/branches", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, "/api/v2/projects/2/branches?limit=100&name=develop-master&offset=1&orderBy=createdAt+desc%2Cname%2Cpriority+asc%2Ctitle+desc")
		fmt.Fprint(w, `{
			"data": [
			  	{
					"data": {
						"id": 34,
						"projectId": 2,
						"name": "develop-master",
						"title": "Master branch",
						"createdAt": "2023-09-16T13:48:04+00:00",
						"updatedAt": "2023-09-19T13:25:27+00:00",
						"exportPattern": "%_three_letters_code%",
						"priority": "normal"
					}
				}
			],
			"pagination": {
			  	"offset": 1,
			  	"limit": 100
			}
		}`)
	})

	branches, _, err := client.Branches.List(context.Background(), 2, &model.BranchesListOptions{
		ListOptions: model.ListOptions{Limit: 100, Offset: 1},
		OrderBy:     "createdAt desc,name,priority asc,title desc",
		Name:        "develop-master",
	})
	if err != nil {
		t.Errorf("Branches.List returned error: %v", err)
	}

	want := []*model.Branch{
		{
			ID:            34,
			ProjectID:     2,
			Name:          "develop-master",
			Title:         "Master branch",
			CreatedAt:     "2023-09-16T13:48:04+00:00",
			UpdatedAt:     "2023-09-19T13:25:27+00:00",
			ExportPattern: ToPtr("%_three_letters_code%"),
			Priority:      ToPtr("normal"),
		},
	}
	if !reflect.DeepEqual(branches, want) {
		t.Errorf("Branches.List returned %+v, want %+v", branches, want)
	}
}

func TestBranchesService_Get(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/branches/34", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, "/api/v2/projects/2/branches/34")
		fmt.Fprint(w, `{
			"data": {
				"id": 34,
				"projectId": 2,
				"name": "develop-master",
				"title": "Master branch",
				"createdAt": "2023-09-16T13:48:04+00:00",
				"updatedAt": "2023-09-19T13:25:27+00:00",
				"exportPattern": "%_three_letters_code%",
				"priority": "normal"
			}
		}`)
	})

	branch, _, err := client.Branches.Get(context.Background(), 2, 34)
	if err != nil {
		t.Errorf("Branches.Get returned error: %v", err)
	}

	want := &model.Branch{
		ID:            34,
		ProjectID:     2,
		Name:          "develop-master",
		Title:         "Master branch",
		CreatedAt:     "2023-09-16T13:48:04+00:00",
		UpdatedAt:     "2023-09-19T13:25:27+00:00",
		ExportPattern: ToPtr("%_three_letters_code%"),
		Priority:      ToPtr("normal"),
	}
	if !reflect.DeepEqual(branch, want) {
		t.Errorf("Branches.Get returned %+v, want %+v", branch, want)
	}
}

func TestBranchesService_GetByIDNotFound(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/branches/1", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		http.Error(w, `{"error": {"code": 404, "message": "Branch Not Found"}}`, http.StatusNotFound)
	})

	branch, resp, err := client.Branches.Get(context.Background(), 2, 1)
	if err == nil {
		t.Error("Branches.Get expected error, got nil")
	}
	if branch != nil {
		t.Errorf("Branches.Get expected nil, got %+v", branch)
	}
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("Branches.Get expected status 404, got %v", resp.StatusCode)
	}

	var e *model.ErrorResponse
	if !errors.As(err, &e) {
		t.Errorf("Branches.Get expected *model.ErrorResponse, got %+v", e)
	}
}

func TestBranchesService_Add(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/branches", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, "/api/v2/projects/2/branches")
		testBody(t, r, `{"name":"develop-master","title":"Master branch","exportPattern":"%_three_letters_code%","priority":"normal"}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 34,
				"projectId": 2,
				"name": "develop-master",
				"title": "Master branch",
				"createdAt": "2023-09-16T13:48:04+00:00",
				"updatedAt": "2023-09-19T13:25:27+00:00",
				"exportPattern": "%_three_letters_code%",
				"priority": "normal"
			}
		}`)
	})

	branch, _, err := client.Branches.Add(context.Background(), 2, &model.BranchesAddRequest{
		Name:          "develop-master",
		Title:         "Master branch",
		ExportPattern: "%_three_letters_code%",
		Priority:      "normal",
	})
	if err != nil {
		t.Errorf("Branches.Add returned error: %v", err)
	}

	want := &model.Branch{
		ID:            34,
		ProjectID:     2,
		Name:          "develop-master",
		Title:         "Master branch",
		CreatedAt:     "2023-09-16T13:48:04+00:00",
		UpdatedAt:     "2023-09-19T13:25:27+00:00",
		ExportPattern: ToPtr("%_three_letters_code%"),
		Priority:      ToPtr("normal"),
	}
	if !reflect.DeepEqual(branch, want) {
		t.Errorf("Branches.Add returned %+v, want %+v", branch, want)
	}
}

func TestBranchesService_AddWithRequiredBodyParams(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/branches", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testBody(t, r, `{"name":"develop-master"}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 34,
				"projectId": 2,
				"name": "develop-master",
				"title": "Master branch",
				"createdAt": "2023-09-16T13:48:04+00:00",
				"updatedAt": "2023-09-19T13:25:27+00:00",
				"exportPattern": "%_three_letters_code%",
				"priority": "normal"
			}
		}`)
	})

	branch, _, err := client.Branches.Add(context.Background(), 2, &model.BranchesAddRequest{
		Name: "develop-master",
	})
	if err != nil {
		t.Errorf("Branches.Add returned error: %v", err)
	}

	want := &model.Branch{
		ID:            34,
		ProjectID:     2,
		Name:          "develop-master",
		Title:         "Master branch",
		CreatedAt:     "2023-09-16T13:48:04+00:00",
		UpdatedAt:     "2023-09-19T13:25:27+00:00",
		ExportPattern: ToPtr("%_three_letters_code%"),
		Priority:      ToPtr("normal"),
	}
	if !reflect.DeepEqual(branch, want) {
		t.Errorf("Branches.Add returned %+v, want %+v", branch, want)
	}
}

func TestBranchesService_Edit(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/branches/34", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, "/api/v2/projects/2/branches/34")
		testBody(t, r, `[{"op":"replace","path":"/name","value":"develop-master"}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 34,
				"projectId": 2,
				"name": "develop-master",
				"title": "Master branch",
				"createdAt": "2023-09-16T13:48:04+00:00",
				"updatedAt": "2023-09-19T13:25:27+00:00",
				"exportPattern": "%_three_letters_code%",
				"priority": "normal"
			}
		}`)
	})

	branch, _, err := client.Branches.Edit(context.Background(), 2, 34, []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/name",
			Value: "develop-master",
		},
	})
	if err != nil {
		t.Errorf("Branches.Edit returned error: %v", err)
	}

	want := "develop-master"
	if branch.Name != want {
		t.Errorf("Branches.Edit returned %+v, want %+v", branch.Name, want)
	}
}

func TestBranchesService_Delete(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/branches/34", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, "/api/v2/projects/2/branches/34")
		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Branches.Delete(context.Background(), 2, 34)
	if err != nil {
		t.Errorf("Branches.Delete returned error: %v", err)
	}

	want := http.StatusNoContent
	if resp.StatusCode != want {
		t.Errorf("Branches.Delete returned status %v, want %v", resp.StatusCode, want)
	}
}

func TestBranchesService_Merge(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	projectID := 1
	branchID := 2

	mux.HandleFunc(fmt.Sprintf("/api/v2/projects/%d/branches/%d/merges", projectID, branchID), func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, fmt.Sprintf("/api/v2/projects/%d/branches/%d/merges", projectID, branchID))
		testBody(t, r, `{"sourceBranchId":38,"deleteAfterMerge":false,"acceptSourceChanges":true,"dryRun":true}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"identifier": "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
				"status": "finished",
				"progress": 100,
				"attributes": {
					"sourceBranchId": 38,
					"deleteAfterMerge": false,
					"acceptSourceChanges": true
				},
				"createdAt": "2023-09-23T11:26:54+00:00",
				"updatedAt": "2023-09-23T11:26:54+00:00",
				"startedAt": "2023-09-23T11:26:54+00:00",
				"finishedAt": "2023-09-23T11:26:54+00:00"
			}
		}`)
	})

	req := &model.BranchesMergeRequest{
		SourceBranchID:      38,
		DeleteAfterMerge:    ToPtr(false),
		DryRun:              ToPtr(true),
		AcceptSourceChanges: ToPtr(true),
	}
	merge, _, err := client.Branches.Merge(context.Background(), projectID, branchID, req)
	if err != nil {
		t.Errorf("Branches.Merge returned error: %v", err)
	}

	want := &model.BranchMerge{
		Identifier: "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
		Status:     "finished",
		Progress:   100,
		Attributes: struct {
			SourceBranchID      int  `json:"sourceBranchId"`
			DeleteAfterMerge    bool `json:"deleteAfterMerge"`
			AcceptSourceChanges bool `json:"acceptSourceChanges,omitempty"`
		}{
			SourceBranchID:      38,
			DeleteAfterMerge:    false,
			AcceptSourceChanges: true,
		},
		CreatedAt:  "2023-09-23T11:26:54+00:00",
		UpdatedAt:  "2023-09-23T11:26:54+00:00",
		StartedAt:  "2023-09-23T11:26:54+00:00",
		FinishedAt: "2023-09-23T11:26:54+00:00",
	}
	if !reflect.DeepEqual(merge, want) {
		t.Errorf("Branches.Merge returned %+v, want %+v", merge, want)
	}
}

func TestBranchesService_MergeWithRequiredBodyParams(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/branches/2/merges", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testBody(t, r, `{"sourceBranchId":38}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"identifier": "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
				"status": "finished",
				"progress": 100,
				"attributes": {
					"sourceBranchId": 38,
					"deleteAfterMerge": false
				},
				"createdAt": "2023-09-23T11:26:54+00:00",
				"updatedAt": "2023-09-23T11:26:54+00:00",
				"startedAt": "2023-09-23T11:26:54+00:00",
				"finishedAt": "2023-09-23T11:26:54+00:00"
			}
		}`)
	})

	req := &model.BranchesMergeRequest{SourceBranchID: 38}
	_, _, err := client.Branches.Merge(context.Background(), 1, 2, req)
	if err != nil {
		t.Errorf("Branches.Merge returned error: %v", err)
	}
}

func TestBranchesService_CheckMergeStatus(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/branches/34/merges/50fb3506-4127-4ba8-8296-f97dc7e3e0c3", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, "/api/v2/projects/2/branches/34/merges/50fb3506-4127-4ba8-8296-f97dc7e3e0c3")
		fmt.Fprint(w, `{
			"data": {
				"identifier": "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
				"status": "finished",
				"progress": 100,
				"attributes": {
					"sourceBranchId": 38,
					"deleteAfterMerge": false,
					"acceptSourceChanges": true
				},
				"createdAt": "2023-09-23T11:26:54+00:00",
				"updatedAt": "2023-09-23T11:26:54+00:00",
				"startedAt": "2023-09-23T11:26:54+00:00",
				"finishedAt": "2023-09-23T11:26:54+00:00"
			}
		}`)
	})

	status, _, err := client.Branches.CheckMergeStatus(context.Background(), 2, 34, "50fb3506-4127-4ba8-8296-f97dc7e3e0c3")
	if err != nil {
		t.Errorf("Branches.CheckMergeStatus returned error: %v", err)
	}

	want := &model.BranchMerge{
		Identifier: "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
		Status:     "finished",
		Progress:   100,
		Attributes: struct {
			SourceBranchID      int  `json:"sourceBranchId"`
			DeleteAfterMerge    bool `json:"deleteAfterMerge"`
			AcceptSourceChanges bool `json:"acceptSourceChanges,omitempty"`
		}{
			SourceBranchID:      38,
			DeleteAfterMerge:    false,
			AcceptSourceChanges: true,
		},
		CreatedAt:  "2023-09-23T11:26:54+00:00",
		UpdatedAt:  "2023-09-23T11:26:54+00:00",
		StartedAt:  "2023-09-23T11:26:54+00:00",
		FinishedAt: "2023-09-23T11:26:54+00:00",
	}
	if !reflect.DeepEqual(status, want) {
		t.Errorf("Branches.CheckMergeStatus returned %+v, want %+v", status, want)
	}
}

func TestBranchesService_GetMergeSummary(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/branches/34/merges/50fb3506-4127-4ba8-8296-f97dc7e3e0c3/summary", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, "/api/v2/projects/2/branches/34/merges/50fb3506-4127-4ba8-8296-f97dc7e3e0c3/summary")
		fmt.Fprint(w, `{
			"data": {
				"status": "merged",
				"sourceBranchId": 100,
				"targetBranchId": 100,
				"dryRun": false,
				"details": {
					"added": 1,
					"deleted": 2,
					"updated": 3,
					"conflicted": 7
				}
			}
		}`)
	})

	summary, _, err := client.Branches.GetMergeSummary(context.Background(), 2, 34, "50fb3506-4127-4ba8-8296-f97dc7e3e0c3")
	if err != nil {
		t.Errorf("Branches.GetMergeSummary returned error: %v", err)
	}

	want := &model.BranchMergeSummary{
		Status:         "merged",
		SourceBranchID: 100,
		TargetBranchID: 100,
		DryRun:         false,
		Details: map[string]int{
			"added":      1,
			"deleted":    2,
			"updated":    3,
			"conflicted": 7,
		},
	}
	if !reflect.DeepEqual(summary, want) {
		t.Errorf("Branches.GetMergeSummary returned %+v, want %+v", summary, want)
	}
}

func TestBranchesService_Clone(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/branches/34/clones", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, "/api/v2/projects/2/branches/34/clones")
		testBody(t, r, `{"name":"develop-master","title":"Master branch"}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"identifier": "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
				"status": "finished",
				"progress": 100,
				"attributes": {},
				"createdAt": "2023-09-23T11:26:54+00:00",
				"updatedAt": "2023-09-23T11:26:54+00:00",
				"startedAt": "2023-09-23T11:26:54+00:00",
				"finishedAt": "2023-09-23T11:26:54+00:00"
			}
		}`)
	})

	req := &model.BranchesCloneRequest{
		Name:  "develop-master",
		Title: "Master branch",
	}
	clone, _, err := client.Branches.Clone(context.Background(), 2, 34, req)
	if err != nil {
		t.Errorf("Branches.Clone returned error: %v", err)
	}

	want := &model.BranchMerge{
		Identifier: "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
		Status:     "finished",
		Progress:   100,
		CreatedAt:  "2023-09-23T11:26:54+00:00",
		UpdatedAt:  "2023-09-23T11:26:54+00:00",
		StartedAt:  "2023-09-23T11:26:54+00:00",
		FinishedAt: "2023-09-23T11:26:54+00:00",
	}
	if !reflect.DeepEqual(clone, want) {
		t.Errorf("Branches.Clone returned %+v, want %+v", clone, want)
	}
}

func TestBranchesService_CloneWithRequiredBodyParams(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/branches/34/clones", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, "/api/v2/projects/2/branches/34/clones")
		testBody(t, r, `{"name":"develop-master"}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"identifier": "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
				"status": "finished",
				"progress": 100,
				"attributes": {},
				"createdAt": "2023-09-23T11:26:54+00:00",
				"updatedAt": "2023-09-23T11:26:54+00:00",
				"startedAt": "2023-09-23T11:26:54+00:00",
				"finishedAt": "2023-09-23T11:26:54+00:00"
			}
		}`)
	})

	req := &model.BranchesCloneRequest{Name: "develop-master"}
	_, _, err := client.Branches.Clone(context.Background(), 2, 34, req)
	if err != nil {
		t.Errorf("Branches.Clone returned error: %v", err)
	}
}

func TestBranchesService_GetClone(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/branches/34/clones/50fb3506-4127-4ba8-8296-f97dc7e3e0c3/branch", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, "/api/v2/projects/2/branches/34/clones/50fb3506-4127-4ba8-8296-f97dc7e3e0c3/branch")
		fmt.Fprint(w, `{
			"data": {
				"id": 34,
				"projectId": 2,
				"name": "develop-master",
				"title": "Master branch",
				"createdAt": "2023-09-16T13:48:04+00:00",
				"updatedAt": "2023-09-19T13:25:27+00:00"
			}
		}`)
	})

	clone, _, err := client.Branches.GetClone(context.Background(), 2, 34, "50fb3506-4127-4ba8-8296-f97dc7e3e0c3")
	if err != nil {
		t.Errorf("Branches.GetClone returned error: %v", err)
	}

	want := &model.Branch{
		ID:        34,
		ProjectID: 2,
		Name:      "develop-master",
		Title:     "Master branch",
		CreatedAt: "2023-09-16T13:48:04+00:00",
		UpdatedAt: "2023-09-19T13:25:27+00:00",
	}
	if !reflect.DeepEqual(clone, want) {
		t.Errorf("Branches.GetClone returned %+v, want %+v", clone, want)
	}
}

func TestBranchesService_CheckCloneStatus(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/branches/34/clones/50fb3506-4127-4ba8-8296-f97dc7e3e0c3", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, "/api/v2/projects/2/branches/34/clones/50fb3506-4127-4ba8-8296-f97dc7e3e0c3")
		fmt.Fprint(w, `{
			"data": {
				"identifier": "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
				"status": "finished",
				"progress": 100,
				"attributes": {},
				"createdAt": "2023-09-23T11:26:54+00:00",
				"updatedAt": "2023-09-23T11:26:54+00:00",
				"startedAt": "2023-09-23T11:26:54+00:00",
				"finishedAt": "2023-09-23T11:26:54+00:00"
			}
		}`)
	})

	status, _, err := client.Branches.CheckCloneStatus(context.Background(), 2, 34, "50fb3506-4127-4ba8-8296-f97dc7e3e0c3")
	if err != nil {
		t.Errorf("Branches.CheckCloneStatus returned error: %v", err)
	}

	want := &model.BranchMerge{
		Identifier: "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
		Status:     "finished",
		Progress:   100,
		CreatedAt:  "2023-09-23T11:26:54+00:00",
		UpdatedAt:  "2023-09-23T11:26:54+00:00",
		StartedAt:  "2023-09-23T11:26:54+00:00",
		FinishedAt: "2023-09-23T11:26:54+00:00",
	}
	if !reflect.DeepEqual(status, want) {
		t.Errorf("Branches.CheckCloneStatus returned %+v, want %+v", status, want)
	}
}
