package crowdin

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"testing"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGroupService_List(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/groups", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, "/api/v2/groups")
		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": 1,
						"name": "KB materials",
						"description": "KB localization materials",
						"parentId": 2,
						"organizationId": 200000299,
						"userId": 6,
						"subgroupsCount": 0,
						"projectsCount": 1,
						"webUrl": "https://example.crowdin.com/u/groups/123",
						"createdAt": "2023-09-20T11:11:05+00:00",
						"updatedAt": "2023-09-20T12:22:20+00:00"
					}
				}
			],
			"pagination": {
				"offset": 0,
			  	"limit": 25
			}
		}`)
	})

	groups, resp, err := client.Groups.List(context.Background(), nil)
	if err != nil {
		t.Errorf("Groups.List returned error: %v", err)
	}

	want := []*model.Group{
		{
			ID:             1,
			Name:           "KB materials",
			Description:    "KB localization materials",
			ParentID:       2,
			OrganizationID: 200000299,
			UserID:         6,
			SubgroupsCount: 0,
			ProjectsCount:  1,
			WebURL:         "https://example.crowdin.com/u/groups/123",
			CreatedAt:      "2023-09-20T11:11:05+00:00",
			UpdatedAt:      "2023-09-20T12:22:20+00:00",
		},
	}
	if !reflect.DeepEqual(groups, want) {
		t.Errorf("Groups.List returned %+v, want %+v", groups, want)
	}

	expectedPagination := model.Pagination{Offset: 0, Limit: 25}
	if !reflect.DeepEqual(resp.Pagination, expectedPagination) {
		t.Errorf("Groups.List returned %+v, want %+v", resp.Pagination, expectedPagination)
	}
}

func TestGroupService_List_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/groups", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Groups.List(context.Background(), nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestGroupService_ListWithQueryParams(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/groups", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, "/api/v2/groups?limit=100&offset=1&parentId=1")
		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": 1,
						"name": "KB materials",
						"description": "KB localization materials",
						"parentId": 2,
						"organizationId": 200000299,
						"userId": 6,
						"subgroupsCount": 0,
						"projectsCount": 1,
						"webUrl": "https://example.crowdin.com/u/groups/123",
						"createdAt": "2023-09-20T11:11:05+00:00",
						"updatedAt": "2023-09-20T12:22:20+00:00"
					}
				}
			],
			"pagination": {
				"offset": 0,
			  	"limit": 25
			}
		}`)
	})

	groups, _, err := client.Groups.List(
		context.Background(),
		&model.GroupsListOptions{ParentID: 1, ListOptions: model.ListOptions{Limit: 100, Offset: 1}},
	)
	if err != nil {
		t.Errorf("Groups.List returned error: %v", err)
	}

	want := []*model.Group{
		{
			ID:             1,
			Name:           "KB materials",
			Description:    "KB localization materials",
			ParentID:       2,
			OrganizationID: 200000299,
			UserID:         6,
			SubgroupsCount: 0,
			ProjectsCount:  1,
			WebURL:         "https://example.crowdin.com/u/groups/123",
			CreatedAt:      "2023-09-20T11:11:05+00:00",
			UpdatedAt:      "2023-09-20T12:22:20+00:00",
		},
	}
	if !reflect.DeepEqual(groups, want) {
		t.Errorf("Groups.List returned %+v, want %+v", groups, want)
	}
}

func TestGroupService_Get(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/groups/1", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, "/api/v2/groups/1")
		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"name": "KB materials",
				"description": "KB localization materials",
				"parentId": 2,
				"organizationId": 200000299,
				"userId": 6,
				"subgroupsCount": 0,
				"projectsCount": 1,
				"webUrl": "https://example.crowdin.com/u/groups/123",
				"createdAt": "2023-09-20T11:11:05+00:00",
				"updatedAt": "2023-09-20T12:22:20+00:00"
			}
		}`)
	})

	group, _, err := client.Groups.Get(context.Background(), 1)
	if err != nil {
		t.Errorf("Groups.Get returned error: %v", err)
	}

	want := &model.Group{
		ID:             1,
		Name:           "KB materials",
		Description:    "KB localization materials",
		ParentID:       2,
		OrganizationID: 200000299,
		UserID:         6,
		SubgroupsCount: 0,
		ProjectsCount:  1,
		WebURL:         "https://example.crowdin.com/u/groups/123",
		CreatedAt:      "2023-09-20T11:11:05+00:00",
		UpdatedAt:      "2023-09-20T12:22:20+00:00",
	}
	if !reflect.DeepEqual(group, want) {
		t.Errorf("Groups.Get returned %+v, want %+v", group, want)
	}
}

func TestGroupService_GetByIDNotFound(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/groups/1", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, "/api/v2/groups/1")
		http.Error(w, `{"error": {"code": 404, "message": "Group Not Found"}}`, http.StatusNotFound)
	})

	group, resp, err := client.Groups.Get(context.Background(), 1)
	if err == nil {
		t.Error("Groups.Get expected an error, got nil")
	}
	if group != nil {
		t.Errorf("Groups.Get expected nil, got %+v", group)
	}
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("Groups.Get expected status %d, got %d", http.StatusNotFound, resp.StatusCode)
	}

	var e *model.ErrorResponse
	if !errors.As(err, &e) {
		t.Errorf("Groups.Get expected type *model.ErrorResponse, got %T", err)
	}
}

func TestGroupService_Add(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/groups", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, "/api/v2/groups")
		testBody(t, r, `{"name":"KB materials","parentId":2,"description":"KB localization materials"}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"name": "KB materials",
				"description": "KB localization materials",
				"parentId": 2,
				"organizationId": 200000299,
				"userId": 6,
				"subgroupsCount": 0,
				"projectsCount": 1,
				"webUrl": "https://example.crowdin.com/u/groups/123",
				"createdAt": "2023-09-20T11:11:05+00:00",
				"updatedAt": "2023-09-20T12:22:20+00:00"
			}
		}`)
	})

	group, _, err := client.Groups.Add(
		context.Background(),
		&model.GroupsAddRequest{Name: "KB materials", ParentID: 2, Description: "KB localization materials"},
	)
	if err != nil {
		t.Errorf("Groups.Add returned error: %v", err)
	}

	want := &model.Group{
		ID:             1,
		Name:           "KB materials",
		Description:    "KB localization materials",
		ParentID:       2,
		OrganizationID: 200000299,
		UserID:         6,
		SubgroupsCount: 0,
		ProjectsCount:  1,
		WebURL:         "https://example.crowdin.com/u/groups/123",
		CreatedAt:      "2023-09-20T11:11:05+00:00",
		UpdatedAt:      "2023-09-20T12:22:20+00:00",
	}
	if !reflect.DeepEqual(group, want) {
		t.Errorf("Groups.Add returned %+v, want %+v", group, want)
	}
}

func TestGroupService_AddWithEmptyRequest(t *testing.T) {
	client, _, teardown := setupClient()
	defer teardown()

	_, _, err := client.Groups.Add(context.Background(), nil)
	if !errors.Is(err, model.ErrNilRequest) {
		t.Errorf("Groups.Add expected error: %v, got: %v", model.ErrNilRequest, err)
	}
}

func TestGroupssService_Edit(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/groups/1", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "PATCH")
		testURL(t, r, "/api/v2/groups/1")

		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"name": "Test materials",
				"description": "KB localization materials",
				"parentId": 2,
				"organizationId": 200000299,
				"userId": 6,
				"subgroupsCount": 0,
				"projectsCount": 1,
				"webUrl": "https://example.crowdin.com/u/groups/123",
				"createdAt": "2023-09-20T11:11:05+00:00",
				"updatedAt": "2023-09-20T12:22:20+00:00"
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/name",
			Value: "Test materials",
		},
	}
	group, _, err := client.Groups.Edit(context.Background(), 1, req)
	if err != nil {
		t.Errorf("Groups.Edit returned error: %v", err)
	}

	want := "Test materials"
	if group.Name != want {
		t.Errorf("Groups.Edit returned %+v, want %+v", group.Name, want)
	}
}

func TestGroupService_Delete(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/groups/2", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "DELETE")
		testURL(t, r, "/api/v2/groups/2")
		w.WriteHeader(http.StatusNoContent)
	})

	_, err := client.Groups.Delete(context.Background(), 2)
	if err != nil {
		t.Errorf("Groups.Delete returned error: %v", err)
	}
}
