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

func TestProjectsService_Get_Parity(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1", func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"name": "Project 1",
				"delayedWorkflowStart": true,
				"aiPreTranslate": {
					"enabled": true,
					"aiPrompts": [
						{
							"aiPromptId": 123,
							"languageIds": ["en"]
						}
					]
				}
			}
		}`)
	})

	project, _, err := client.Projects.Get(context.Background(), 1)
	require.NoError(t, err)

	// This should PASS now
	assert.True(t, project.DelayedWorkflowStart, "DelayedWorkflowStart should be true")
	assert.NotNil(t, project.AiPreTranslate, "AiPreTranslate should not be nil")
	assert.Equal(t, 123, project.AiPreTranslate.AiPrompts[0].AiPromptID)
}

func TestProjectsService_Add_Parity(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects", func(w http.ResponseWriter, r *http.Request) {
		testJSONBody(t, r, `{
			"name": "New Project",
			"sourceLanguageId": "en",
			"delayedWorkflowStart": true
		}`)
		fmt.Fprint(w, `{"data": {"id": 1}}`)
	})

	req := &model.ProjectsAddRequest{
		Name:                 "New Project",
		SourceLanguageID:     "en",
		DelayedWorkflowStart: ToPtr(true),
	}
	_, _, err := client.Projects.Add(context.Background(), req)
	require.NoError(t, err)
}
