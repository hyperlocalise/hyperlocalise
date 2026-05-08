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

func TestVendorsService_List(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/vendors", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, "/api/v2/vendors")

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": 52760,
						"name": "John Smith Translation Agency",
						"description": "John Smith Translation Agency provides services for software and game localization.",
						"status": "pending",
						"webUrl": "https://example.crowdin.com/u/vendors/1/rates"
					}
				},
				{
					"data": {
						"id": 52762,
						"name": "Translation Agency",
						"description": "John Smith Translation Agency.",
						"status": "pending",
						"webUrl": "https://example.crowdin.com/u/vendors/1/rates"
					}
				}
			],
			"pagination": {
				"offset": 10,
				"limit": 25
			}
		}`)
	})

	vendors, resp, err := client.Vendors.List(context.Background(), nil)
	require.NoError(t, err)

	expected := []*model.Vendor{
		{
			ID:          52760,
			Name:        "John Smith Translation Agency",
			Description: "John Smith Translation Agency provides services for software and game localization.",
			Status:      "pending",
			WebURL:      "https://example.crowdin.com/u/vendors/1/rates",
		},
		{
			ID:          52762,
			Name:        "Translation Agency",
			Description: "John Smith Translation Agency.",
			Status:      "pending",
			WebURL:      "https://example.crowdin.com/u/vendors/1/rates",
		},
	}
	assert.Equal(t, expected, vendors)

	assert.Equal(t, 10, resp.Pagination.Offset)
	assert.Equal(t, 25, resp.Pagination.Limit)
}

func TestVendorsService_List_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/vendors", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Vendors.List(context.Background(), nil)
	require.Error(t, err)
	assert.Nil(t, res)
}
