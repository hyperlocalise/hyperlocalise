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

func TestGraphQLClient_Query(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/graphql"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"query":"\n\t\tquery Test($limit: Int!) {\n\t\t\tviewer {\n\t\t\t\tprojects(first: $limit) {\n\t\t\t\t\tedges {\n\t\t\t\t\t\tnode {\n\t\t\t\t\t\t\tid\n\t\t\t\t\t\t\tname\n\t\t\t\t\t\t\tdescription\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\t\t\t\t\ttotalCount\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t","variables":{"limit":2}}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"viewer": {
					"projects": {
						"edges": [
							{
								"node": {
									"id": 1,
									"name": "demo",
									"description": null
								}
							}
						],
						"totalCount": 1
					}
				}
			}
		}`)
	})

	req := client.GraphQL.NewRequest(`
		query Test($limit: Int!) {
			viewer {
				projects(first: $limit) {
					edges {
						node {
							id
							name
							description
						}
					}
					totalCount
				}
			}
		}
	`)
	req.Var("limit", 2)

	var resp map[string]any
	err := client.GraphQL.Query(context.Background(), req, &resp)
	require.NoError(t, err)

	expected := map[string]any{
		"data": map[string]any{
			"viewer": map[string]any{
				"projects": map[string]any{
					"edges": []any{
						map[string]any{
							"node": map[string]any{
								"id":          float64(1),
								"name":        "demo",
								"description": nil,
							},
						},
					},
					"totalCount": float64(1),
				},
			},
		},
	}
	assert.Equal(t, expected, resp)
}

func TestGraphQLClient_QueryBadRequestError(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/graphql"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)

		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, `{
			"errors": [{
				"message": "Cannot query field \"test\" on type \"Project\".",
				"extensions": {"category": "graphql"},
				"locations": [{"line": 7, "column": 8}]
			}]
		}`)
	})

	req := client.GraphQL.NewRequest(`
		query {
			viewer {
				projects(first: 1) {
					edges {
						node {
							test
						}
					}
				}
			}
		}
	`)
	var resp map[string]any
	err := client.GraphQL.Query(context.Background(), req, &resp)

	require.Error(t, err)
	assert.Equal(t, "Cannot query field \"test\" on type \"Project\"., Locations: [{Line:7 Column:8}]", err.Error())
	assert.IsType(t, &model.GraphQLErrorResponse{}, err)
}

func TestGraphQLRequest_AddVar(t *testing.T) {
	req := &Request{}

	req.Var("var1", "value1")
	assert.Equal(t, "value1", req.vars["var1"])

	req.Var("var2", 123)
	assert.Equal(t, 123, req.vars["var2"])

	req.Var("var3", true)
	assert.Equal(t, true, req.vars["var3"])

	req.Var("var1", "newValue")
	assert.Equal(t, "newValue", req.vars["var1"])
}

func TestGraphQLRequest_SetOperation(t *testing.T) {
	req := &Request{}

	req.Operation("operation")
	assert.Equal(t, "operation", req.opName)
}
