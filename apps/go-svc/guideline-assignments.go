package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
)

type guidelineProjectAssignment struct {
	ProjectID    string  `json:"projectId"`
	ProjectName  string  `json:"projectName"`
	SourceLocale *string `json:"sourceLocale,omitempty"`
}

type guidelineProjectAttachPayload struct {
	ProjectID string `json:"projectId"`
}

func decodeGuidelineProjectAttach(r *http.Request) (string, error) {
	var payload guidelineProjectAttachPayload
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&payload); err != nil {
		return "", knowledgeMemoryFailure(400, "invalid_guideline_project_assignment", "Project assignment is invalid")
	}
	id := strings.TrimSpace(payload.ProjectID)
	if id == "" || len(id) > 256 {
		return "", knowledgeMemoryFailure(400, "invalid_guideline_project_assignment", "Project assignment is invalid")
	}
	return id, nil
}

func ownedAssignmentProjectID(ctx context.Context, db dictionaryDB, actor workspaceActor, raw string) (string, error) {
	id := strings.TrimSpace(raw)
	if id == "" || len(id) > 256 {
		return "", knowledgeMemoryFailure(404, "project_not_found", "Project not found")
	}
	var found string
	err := db.QueryRow(ctx, `select p.id from projects p where p.id=$1 and p.organization_id=$2 and `+formatQaProjectTeamAccessSQL(3, 4, 2),
		id, actor.organizationID, actor.role == "admin" || actor.role == "localization_manager", actor.userID).Scan(&found)
	if err != nil {
		if isNoRows(err) {
			return "", knowledgeMemoryFailure(404, "project_not_found", "Project not found")
		}
		return "", err
	}
	return found, nil
}

func listGuidelineAssignmentProjects(ctx context.Context, db dictionaryDB, actor workspaceActor, organizationID string, table, joinColumn string, joinValue string) ([]guidelineProjectAssignment, error) {
	var rows pgx.Rows
	var err error
	if joinColumn == "" {
		rows, err = db.Query(ctx, `select p.id, p.name, p.source_locale from `+table+` a join projects p on p.id=a.project_id
			where a.organization_id=$1 and p.organization_id=$1 and `+formatQaProjectTeamAccessSQL(2, 3, 1)+` order by p.name, a.project_id`,
			organizationID, actor.role == "admin" || actor.role == "localization_manager", actor.userID)
	} else {
		rows, err = db.Query(ctx, `select p.id, p.name, p.source_locale from `+table+` a join projects p on p.id=a.project_id
			where a.organization_id=$1 and a.`+joinColumn+`=$2 and p.organization_id=$1 and `+formatQaProjectTeamAccessSQL(3, 4, 1)+` order by p.name, a.project_id`,
			organizationID, joinValue, actor.role == "admin" || actor.role == "localization_manager", actor.userID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []guidelineProjectAssignment{}
	for rows.Next() {
		var record guidelineProjectAssignment
		if err := rows.Scan(&record.ProjectID, &record.ProjectName, &record.SourceLocale); err != nil {
			return nil, err
		}
		result = append(result, record)
	}
	return result, rows.Err()
}

func (api *knowledgeMemoryAPI) listWorkspaceGuidelineProjects(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	projects, err := listGuidelineAssignmentProjects(r.Context(), api.workspace.pool, actor, actor.organizationID, "workspace_guideline_projects", "", "")
	if err != nil {
		return 0, nil, err
	}
	return http.StatusOK, map[string]any{"projects": projects}, nil
}

func (api *guidelineDocumentAPI) listAllDocumentAssignments(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	rows, err := api.knowledge.workspace.pool.Query(r.Context(), `select g.document_id::text, g.project_id from guideline_document_projects g
		join guideline_documents d on d.id = g.document_id
		where g.organization_id = $1 and d.organization_id = $1 and d.project_id is null`, actor.organizationID)
	if err != nil {
		return 0, nil, err
	}
	defer rows.Close()
	byDocument := map[string][]string{}
	for rows.Next() {
		var documentID, projectID string
		if err := rows.Scan(&documentID, &projectID); err != nil {
			return 0, nil, err
		}
		byDocument[documentID] = append(byDocument[documentID], projectID)
	}
	if err := rows.Err(); err != nil {
		return 0, nil, err
	}
	assignments := []map[string]any{}
	for documentID, projectIDs := range byDocument {
		assignments = append(assignments, map[string]any{"documentId": documentID, "projectIds": projectIDs})
	}
	return http.StatusOK, map[string]any{"assignments": assignments}, nil
}

func (api *knowledgeMemoryAPI) attachWorkspaceGuidelineProject(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	if !canUpdateKnowledgeMemory(actor.role) {
		return 0, nil, knowledgeMemoryFailure(403, "forbidden", "Only workspace admins can manage guideline assignments")
	}
	projectID, err := decodeGuidelineProjectAttach(r)
	if err != nil {
		return 0, nil, err
	}
	projectID, err = ownedAssignmentProjectID(r.Context(), api.workspace.pool, actor, projectID)
	if err != nil {
		return 0, nil, err
	}
	_, err = api.workspace.pool.Exec(r.Context(), `insert into workspace_guideline_projects (organization_id, project_id) values ($1,$2)
		on conflict (organization_id, project_id) do nothing`, actor.organizationID, projectID)
	if err != nil {
		return 0, nil, err
	}
	return api.listWorkspaceGuidelineProjects(nil, r, actor)
}

func (api *knowledgeMemoryAPI) detachWorkspaceGuidelineProject(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	if !canUpdateKnowledgeMemory(actor.role) {
		return 0, nil, knowledgeMemoryFailure(403, "forbidden", "Only workspace admins can manage guideline assignments")
	}
	projectID, err := ownedAssignmentProjectID(r.Context(), api.workspace.pool, actor, r.PathValue("projectId"))
	if err != nil {
		return 0, nil, err
	}
	_, err = api.workspace.pool.Exec(r.Context(), `delete from workspace_guideline_projects where organization_id=$1 and project_id=$2`,
		actor.organizationID, projectID)
	if err != nil {
		return 0, nil, err
	}
	return http.StatusNoContent, nil, nil
}

func (api *guidelineDocumentAPI) resolveOrgWideDocument(ctx context.Context, actor workspaceActor, rawID string) (guidelineDocumentRecord, error) {
	id, err := parseGuidelineDocumentID(rawID)
	if err != nil {
		return guidelineDocumentRecord{}, err
	}
	// Org-wide only: project_id IS NULL. Project-owned documents belong to one
	// project already and cannot be assigned.
	record, found, err := loadGuidelineDocument(ctx, api.knowledge.workspace.pool,
		guidelineDocumentScope{organizationID: actor.organizationID}, id, false)
	if err != nil {
		return guidelineDocumentRecord{}, err
	}
	if !found || record.ProjectID != nil {
		return guidelineDocumentRecord{}, guidelineDocumentNotFound()
	}
	return record, nil
}

func (api *guidelineDocumentAPI) listDocumentProjects(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	record, err := api.resolveOrgWideDocument(r.Context(), actor, r.PathValue("documentId"))
	if err != nil {
		return 0, nil, err
	}
	projects, err := listGuidelineAssignmentProjects(r.Context(), api.knowledge.workspace.pool, actor, actor.organizationID, "guideline_document_projects", "document_id", record.ID)
	if err != nil {
		return 0, nil, err
	}
	return http.StatusOK, map[string]any{"projects": projects}, nil
}

func (api *guidelineDocumentAPI) attachDocumentProject(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	if err := api.requireWriter(actor); err != nil {
		return 0, nil, err
	}
	record, err := api.resolveOrgWideDocument(r.Context(), actor, r.PathValue("documentId"))
	if err != nil {
		return 0, nil, err
	}
	projectID, err := decodeGuidelineProjectAttach(r)
	if err != nil {
		return 0, nil, err
	}
	projectID, err = ownedAssignmentProjectID(r.Context(), api.knowledge.workspace.pool, actor, projectID)
	if err != nil {
		return 0, nil, err
	}
	_, err = api.knowledge.workspace.pool.Exec(r.Context(), `insert into guideline_document_projects (organization_id, document_id, project_id)
		values ($1,$2,$3) on conflict (document_id, project_id) do nothing`, actor.organizationID, record.ID, projectID)
	if err != nil {
		return 0, nil, err
	}
	return api.listDocumentProjects(nil, r, actor)
}

func (api *guidelineDocumentAPI) detachDocumentProject(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	if err := api.requireWriter(actor); err != nil {
		return 0, nil, err
	}
	record, err := api.resolveOrgWideDocument(r.Context(), actor, r.PathValue("documentId"))
	if err != nil {
		return 0, nil, err
	}
	projectID, err := ownedAssignmentProjectID(r.Context(), api.knowledge.workspace.pool, actor, r.PathValue("projectId"))
	if err != nil {
		return 0, nil, err
	}
	_, err = api.knowledge.workspace.pool.Exec(r.Context(), `delete from guideline_document_projects where organization_id=$1 and document_id=$2 and project_id=$3`,
		actor.organizationID, record.ID, projectID)
	if err != nil {
		return 0, nil, err
	}
	return http.StatusNoContent, nil, nil
}
