package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDecodeGuidelineProjectAttach(t *testing.T) {
	t.Parallel()
	id, err := decodeGuidelineProjectAttach(httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"projectId":"  proj_1  "}`)))
	require.NoError(t, err)
	require.Equal(t, "proj_1", id)

	for _, body := range []string{`{`, `{}`, `{"projectId":""}`, `{"projectId":"   "}`, `{"projectId":"` + strings.Repeat("a", 257) + `"}`} {
		_, err := decodeGuidelineProjectAttach(httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body)))
		var failure *knowledgeMemoryError
		require.ErrorAs(t, err, &failure, body)
		require.Equal(t, http.StatusBadRequest, failure.status, body)
		require.Equal(t, "invalid_guideline_project_assignment", failure.code, body)
	}
}

func TestGuidelineDocumentProjectAssignment(t *testing.T) {
	env := newGuidelineTestEnv(t, "admin")
	assignedID := env.scope.MustProject(t, env.scope.ProjectID, "Assigned")
	otherID := env.scope.MustProject(t, "project_other_"+env.scope.Slug, "Other")
	path := env.scope.OrgPath("/guidelines/documents")

	created := env.upload(t, http.MethodPost, path, "tone.md", []byte("Use vous."), nil)
	require.Equal(t, http.StatusAccepted, created.Code, created.Body.String())
	doc := decodeGuidelineDocument(t, created)
	projectsPath := path + "/" + doc.ID + "/projects"

	listed := env.json(http.MethodGet, projectsPath, "")
	require.Equal(t, http.StatusOK, listed.Code, listed.Body.String())
	require.JSONEq(t, `{"projects":[]}`, listed.Body.String())

	invalid := env.json(http.MethodPost, projectsPath, `{"projectId":""}`)
	require.Equal(t, http.StatusBadRequest, invalid.Code, invalid.Body.String())
	require.Contains(t, invalid.Body.String(), "invalid_guideline_project_assignment")

	missing := env.json(http.MethodPost, projectsPath, `{"projectId":"project_missing"}`)
	require.Equal(t, http.StatusNotFound, missing.Code, missing.Body.String())
	require.Contains(t, missing.Body.String(), "project_not_found")

	foreign := newGuidelineTestEnv(t, "admin")
	foreignID := foreign.scope.MustProject(t, foreign.scope.ProjectID, "Foreign")
	crossOrg := env.json(http.MethodPost, projectsPath, `{"projectId":"`+foreignID+`"}`)
	require.Equal(t, http.StatusNotFound, crossOrg.Code, crossOrg.Body.String())

	attached := env.json(http.MethodPost, projectsPath, `{"projectId":"`+assignedID+`"}`)
	require.Equal(t, http.StatusOK, attached.Code, attached.Body.String())
	again := env.json(http.MethodPost, projectsPath, `{"projectId":"`+assignedID+`"}`)
	require.Equal(t, http.StatusOK, again.Code, again.Body.String())
	var body struct {
		Projects []guidelineProjectAssignment `json:"projects"`
	}
	require.NoError(t, json.Unmarshal(again.Body.Bytes(), &body))
	require.Len(t, body.Projects, 1)
	require.Equal(t, assignedID, body.Projects[0].ProjectID)
	require.Equal(t, "Assigned", body.Projects[0].ProjectName)

	env.json(http.MethodPost, projectsPath, `{"projectId":"`+otherID+`"}`)
	all := env.json(http.MethodGet, path+"/assignments", "")
	require.Equal(t, http.StatusOK, all.Code, all.Body.String())
	var assignments struct {
		Assignments []struct {
			DocumentID string   `json:"documentId"`
			ProjectIDs []string `json:"projectIds"`
		} `json:"assignments"`
	}
	require.NoError(t, json.Unmarshal(all.Body.Bytes(), &assignments))
	require.Len(t, assignments.Assignments, 1)
	require.Equal(t, doc.ID, assignments.Assignments[0].DocumentID)
	require.ElementsMatch(t, []string{assignedID, otherID}, assignments.Assignments[0].ProjectIDs)

	detached := env.json(http.MethodDelete, projectsPath+"/"+otherID, "")
	require.Equal(t, http.StatusNoContent, detached.Code, detached.Body.String())
	require.Equal(t, http.StatusNotFound, env.json(http.MethodDelete, projectsPath+"/project_missing", "").Code)

	env.handler.workspace.membership = env.scope.Membership("member")
	forbidden := env.json(http.MethodPost, projectsPath, `{"projectId":"`+assignedID+`"}`)
	require.Equal(t, http.StatusForbidden, forbidden.Code, forbidden.Body.String())
	readable := env.json(http.MethodGet, projectsPath, "")
	require.Equal(t, http.StatusOK, readable.Code, readable.Body.String())
}

func TestGuidelineDocumentAssignmentRejectsProjectOwnedDocuments(t *testing.T) {
	env := newGuidelineTestEnv(t, "admin")
	projectID := env.scope.MustProject(t, env.scope.ProjectID, "Project")
	created := env.upload(t, http.MethodPost, env.scope.OrgPath("/projects/"+projectID+"/guidelines/documents"), "local.md", []byte("Project only."), nil)
	require.Equal(t, http.StatusAccepted, created.Code, created.Body.String())
	doc := decodeGuidelineDocument(t, created)

	rec := env.json(http.MethodPost, env.scope.OrgPath("/guidelines/documents/"+doc.ID+"/projects"), `{"projectId":"`+projectID+`"}`)
	require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "guideline_document_not_found")
}
