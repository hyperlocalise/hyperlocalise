package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const (
	googleDriveAPIBase     = "https://www.googleapis.com/drive/v3"
	googleDriveFolderMIME  = "application/vnd.google-apps.folder"
	googleDriveHTTPTimeout = 20 * time.Second
)

type googleDriveHTTP interface {
	Do(req *http.Request) (*http.Response, error)
}

type googleDriveFolderRecord struct {
	ID                      string  `json:"id"`
	OrganizationID          string  `json:"organizationId"`
	ConnectedByWorkosUserID string  `json:"connectedByWorkosUserId"`
	DriveID                 *string `json:"driveId"`
	FolderID                string  `json:"folderId"`
	Name                    string  `json:"name"`
	PathLabel               string  `json:"pathLabel"`
	CreatedAt               string  `json:"createdAt"`
	MimeType                *string `json:"mimeType"`
	IsFolder                bool    `json:"isFolder"`
}

type googleDriveChild struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	MimeType string `json:"mimeType"`
	IsFolder bool   `json:"isFolder"`
}

type googleDriveFileMeta struct {
	ID       string
	Name     string
	MimeType string
	DriveID  string
}

func (api *pipesAPI) registerGoogleDrive(mux *http.ServeMux, verifier SessionVerifier) {
	base := orgRoutePrefix + "/pipes/google-drive"
	route := func(pattern string, fn func(*http.Request, pipesActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	route("GET "+base+"/drives", api.listGoogleDrives)
	route("GET "+base+"/children", api.listGoogleDriveChildren)
	route("GET "+base+"/folders", api.listGoogleDriveFolders)
	route("POST "+base+"/folders", api.addGoogleDriveFolder)
	route("DELETE "+base+"/folders/{folderRecordId}", api.deleteGoogleDriveFolder)
}

func (api *pipesAPI) driveClient() googleDriveHTTP {
	if api.driveHTTP != nil {
		return api.driveHTTP
	}
	return &http.Client{Timeout: googleDriveHTTPTimeout}
}

func (api *pipesAPI) listGoogleDrives(r *http.Request, actor pipesActor) (any, int, error) {
	token, err := api.pipeAccessToken(r.Context(), actor, "google-drive")
	if err != nil {
		return nil, 0, err
	}
	drives, err := api.googleListSharedDrives(r.Context(), token)
	if err != nil {
		return nil, 0, err
	}
	out := []map[string]string{{"id": "root", "name": "My Drive", "kind": "my_drive"}}
	for _, drive := range drives {
		out = append(out, map[string]string{"id": drive.ID, "name": drive.Name, "kind": "shared_drive"})
	}
	return map[string]any{"drives": out}, http.StatusOK, nil
}

func (api *pipesAPI) listGoogleDriveChildren(r *http.Request, actor pipesActor) (any, int, error) {
	folderID := strings.TrimSpace(r.URL.Query().Get("folderId"))
	if folderID == "" {
		return nil, 0, pipesFailure(http.StatusBadRequest, "invalid_query", "folderId is required")
	}
	token, err := api.pipeAccessToken(r.Context(), actor, "google-drive")
	if err != nil {
		return nil, 0, err
	}
	items, next, err := api.googleListFolderChildren(r.Context(), token, folderID, r.URL.Query().Get("driveId"), r.URL.Query().Get("pageToken"))
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"items": items, "nextPageToken": next}, http.StatusOK, nil
}

func (api *pipesAPI) listGoogleDriveFolders(r *http.Request, actor pipesActor) (any, int, error) {
	rows, err := api.pool.Query(r.Context(), `
        select id, organization_id, connected_by_workos_user_id, drive_id, folder_id, name, path_label, created_at
        from google_drive_folders
        where organization_id=$1
        order by path_label`, actor.organizationID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	folders := make([]googleDriveFolderRecord, 0)
	for rows.Next() {
		var folder googleDriveFolderRecord
		var created time.Time
		if err := rows.Scan(&folder.ID, &folder.OrganizationID, &folder.ConnectedByWorkosUserID, &folder.DriveID, &folder.FolderID, &folder.Name, &folder.PathLabel, &created); err != nil {
			return nil, 0, err
		}
		folder.CreatedAt = formatPipesTime(created)
		mime := googleDriveFolderMIME
		folder.MimeType = &mime
		folder.IsFolder = true
		folders = append(folders, folder)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{"folders": folders}, http.StatusOK, nil
}

func (api *pipesAPI) addGoogleDriveFolder(r *http.Request, actor pipesActor) (any, int, error) {
	var body struct {
		DriveID   *string `json:"driveId"`
		FolderID  string  `json:"folderId"`
		Name      string  `json:"name"`
		PathLabel string  `json:"pathLabel"`
	}
	if err := readPipesJSON(r, &body); err != nil {
		return nil, 0, err
	}
	folderID := strings.TrimSpace(body.FolderID)
	if folderID == "" {
		return nil, 0, pipesFailure(http.StatusBadRequest, "invalid_payload", "Folder payload is invalid.")
	}
	token, err := api.pipeAccessToken(r.Context(), actor, "google-drive")
	if err != nil {
		return nil, 0, err
	}
	meta, err := api.googleGetFile(r.Context(), token, folderID)
	if err != nil {
		return nil, 0, err
	}
	if meta.MimeType != googleDriveFolderMIME && folderID != "root" {
		return nil, 0, pipesFailure(http.StatusBadRequest, "invalid_payload", "Folder id must reference a folder.")
	}
	pathLabel := strings.TrimSpace(body.PathLabel)
	segments := strings.FieldsFunc(pathLabel, func(r rune) bool { return r == '/' })
	if len(segments) > 0 {
		segments[len(segments)-1] = meta.Name
		pathLabel = strings.Join(segments, "/")
	} else {
		pathLabel = meta.Name
	}
	driveID := strings.TrimSpace(ptrString(body.DriveID))
	if driveID == "" {
		driveID = strings.TrimSpace(meta.DriveID)
	}
	var driveValue any
	if driveID != "" && driveID != "root" {
		driveValue = driveID
	}
	var (
		id          string
		createdAt   time.Time
		storedDrive *string
	)
	err = api.pool.QueryRow(r.Context(), `
        insert into google_drive_folders (
            organization_id, connected_by_workos_user_id, drive_id, folder_id, name, path_label
        ) values ($1, $2, $3, $4, $5, $6)
        on conflict (organization_id, folder_id) do nothing
        returning id, drive_id, created_at`,
		actor.organizationID, actor.workosUserID, driveValue, folderID, meta.Name, pathLabel,
	).Scan(&id, &storedDrive, &createdAt)
	if isNoRows(err) || err == pgx.ErrNoRows {
		return map[string]any{"folder": nil, "alreadyExists": true}, http.StatusOK, nil
	}
	if err != nil {
		return nil, 0, err
	}
	mime := googleDriveFolderMIME
	return map[string]any{
		"folder": googleDriveFolderRecord{
			ID:                      id,
			OrganizationID:          actor.organizationID,
			ConnectedByWorkosUserID: actor.workosUserID,
			DriveID:                 storedDrive,
			FolderID:                folderID,
			Name:                    meta.Name,
			PathLabel:               pathLabel,
			CreatedAt:               formatPipesTime(createdAt),
			MimeType:                &mime,
			IsFolder:                true,
		},
		"alreadyExists": false,
	}, http.StatusCreated, nil
}

func (api *pipesAPI) deleteGoogleDriveFolder(r *http.Request, actor pipesActor) (any, int, error) {
	folderRecordID := strings.TrimSpace(r.PathValue("folderRecordId"))
	if _, err := uuid.Parse(folderRecordID); err != nil {
		return nil, 0, pipesFailure(http.StatusBadRequest, "invalid_folder_id", "Folder id is invalid.")
	}
	_, err := api.pool.Exec(r.Context(), `
        delete from google_drive_folders where organization_id=$1 and id=$2`,
		actor.organizationID, folderRecordID)
	if err != nil {
		return nil, 0, err
	}
	return nil, http.StatusNoContent, nil
}

func (api *pipesAPI) googleListSharedDrives(ctx context.Context, token string) ([]googleDriveChild, error) {
	query := url.Values{}
	query.Set("pageSize", "100")
	query.Set("fields", "nextPageToken,drives(id,name)")
	body, err := api.googleGET(ctx, token, "/drives?"+query.Encode())
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Drives []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"drives"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, pipesFailure(http.StatusServiceUnavailable, "google_drive_api_error", "Google Drive did not return drives.")
	}
	out := make([]googleDriveChild, 0, len(parsed.Drives))
	for _, drive := range parsed.Drives {
		if strings.TrimSpace(drive.ID) == "" {
			continue
		}
		out = append(out, googleDriveChild{ID: drive.ID, Name: strings.TrimSpace(drive.Name)})
	}
	return out, nil
}

func (api *pipesAPI) googleListFolderChildren(ctx context.Context, token, folderID, driveID, pageToken string) ([]googleDriveChild, *string, error) {
	q := fmt.Sprintf("'%s' in parents and mimeType='%s' and trashed=false", escapeGoogleDriveQuery(folderID), googleDriveFolderMIME)
	values := url.Values{
		"q":                         {q},
		"fields":                    {"nextPageToken,files(id,name,mimeType)"},
		"pageSize":                  {"100"},
		"supportsAllDrives":         {"true"},
		"includeItemsFromAllDrives": {"true"},
	}
	if pageToken != "" {
		values.Set("pageToken", pageToken)
	}
	if driveID != "" && driveID != "root" {
		values.Set("corpora", "drive")
		values.Set("driveId", driveID)
	}
	body, err := api.googleGET(ctx, token, "/files?"+values.Encode())
	if err != nil {
		return nil, nil, err
	}
	var parsed struct {
		Files []struct {
			ID       string `json:"id"`
			Name     string `json:"name"`
			MimeType string `json:"mimeType"`
		} `json:"files"`
		NextPageToken string `json:"nextPageToken"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, nil, pipesFailure(http.StatusServiceUnavailable, "google_drive_api_error", "Google Drive did not return folders.")
	}
	items := make([]googleDriveChild, 0, len(parsed.Files))
	for _, file := range parsed.Files {
		if strings.TrimSpace(file.ID) == "" {
			continue
		}
		items = append(items, googleDriveChild{
			ID:       file.ID,
			Name:     strings.TrimSpace(file.Name),
			MimeType: file.MimeType,
			IsFolder: file.MimeType == googleDriveFolderMIME,
		})
	}
	var next *string
	if parsed.NextPageToken != "" {
		token := parsed.NextPageToken
		next = &token
	}
	return items, next, nil
}

func (api *pipesAPI) googleGetFile(ctx context.Context, token, fileID string) (googleDriveFileMeta, error) {
	values := url.Values{
		"fields":            {"id,name,mimeType,driveId"},
		"supportsAllDrives": {"true"},
	}
	body, err := api.googleGET(ctx, token, "/files/"+url.PathEscape(fileID)+"?"+values.Encode())
	if err != nil {
		return googleDriveFileMeta{}, err
	}
	var parsed struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		MimeType string `json:"mimeType"`
		DriveID  string `json:"driveId"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil || strings.TrimSpace(parsed.ID) == "" {
		return googleDriveFileMeta{}, pipesFailure(http.StatusServiceUnavailable, "google_drive_api_error", "Google Drive did not return that folder.")
	}
	return googleDriveFileMeta{ID: parsed.ID, Name: parsed.Name, MimeType: parsed.MimeType, DriveID: parsed.DriveID}, nil
}

func (api *pipesAPI) googleGET(ctx context.Context, token, path string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, googleDriveAPIBase+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := api.driveClient().Do(req)
	if err != nil {
		return nil, pipesFailure(http.StatusServiceUnavailable, "google_drive_api_error", "Could not reach Google Drive.")
	}
	defer func() { _ = resp.Body.Close() }()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode == http.StatusNotFound {
		return nil, pipesFailure(http.StatusNotFound, "google_drive_folder_not_found", "That Google Drive folder was not found.")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, pipesFailure(http.StatusServiceUnavailable, "google_drive_api_error", "Google Drive rejected the request.")
	}
	return body, nil
}

func escapeGoogleDriveQuery(value string) string {
	return strings.ReplaceAll(value, `'`, `\'`)
}

func ptrString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
