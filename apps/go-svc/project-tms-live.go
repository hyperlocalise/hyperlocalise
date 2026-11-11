package main

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/tmscatalog"
)

// Live TMS projects, read from the connected provider with a token minted by
// the web app (tmsauth), the way the web's tms-provider-live.ts serves them.
// A live project's id is ext:{providerKind}:{externalProjectId}; the project
// routes below branch on that prefix, as the web routes do.

const (
	liveProjectIDPrefix   = "ext:"
	tmsLiveRequestTimeout = 2 * time.Minute
)

type liveProjectID struct {
	providerKind, externalProjectID string
}

// parseLiveProjectID reads ext:{kind}:{id}; ok is false for native ids.
func parseLiveProjectID(raw string) (liveProjectID, bool) {
	raw = strings.TrimSpace(raw)
	if !strings.HasPrefix(raw, liveProjectIDPrefix) {
		return liveProjectID{}, false
	}
	kind, externalID, found := strings.Cut(strings.TrimPrefix(raw, liveProjectIDPrefix), ":")
	if !found || strings.TrimSpace(externalID) == "" || !tmscatalog.ProjectsSupported(kind) {
		return liveProjectID{}, false
	}
	return liveProjectID{providerKind: strings.ToLower(kind), externalProjectID: externalID}, true
}

func encodeLiveProjectID(providerKind, externalProjectID string) string {
	return liveProjectIDPrefix + providerKind + ":" + externalProjectID
}

type liveJobID struct {
	liveProjectID
	externalJobID string
}

// parseLiveJobID reads ext:{kind}:{project}:{job}; the job id is after the last colon.
func parseLiveJobID(raw string) (liveJobID, bool) {
	project, ok := parseLiveProjectID(raw)
	if !ok {
		return liveJobID{}, false
	}
	last := strings.LastIndex(project.externalProjectID, ":")
	if last < 1 {
		return liveJobID{}, false
	}
	externalProjectID := strings.TrimSpace(project.externalProjectID[:last])
	externalJobID := strings.TrimSpace(project.externalProjectID[last+1:])
	if externalProjectID == "" || externalJobID == "" {
		return liveJobID{}, false
	}
	return liveJobID{
		liveProjectID: liveProjectID{providerKind: project.providerKind, externalProjectID: externalProjectID},
		externalJobID: externalJobID,
	}, true
}

func encodeLiveJobID(providerKind, externalProjectID, externalJobID string) string {
	return encodeLiveProjectID(providerKind, externalProjectID) + ":" + externalJobID
}

func liveTMSRequest(r *http.Request) bool {
	if strings.Contains(r.URL.Path, "/tms/") {
		return true
	}
	if _, ok := parseLiveProjectID(r.PathValue("projectId")); ok {
		return true
	}
	_, ok := parseLiveJobID(r.PathValue("jobId"))
	return ok
}

type liveProjectRecord struct {
	ID                   string         `json:"id"`
	OrganizationID       string         `json:"organizationId"`
	TeamID               *string        `json:"teamId"`
	Name                 string         `json:"name"`
	Identifier           *string        `json:"identifier"`
	Description          *string        `json:"description"`
	TranslationContext   *string        `json:"translationContext"`
	Source               string         `json:"source"`
	ExternalProviderKind string         `json:"externalProviderKind"`
	ExternalProjectID    string         `json:"externalProjectId"`
	SourceLocale         *string        `json:"sourceLocale"`
	TargetLocales        []string       `json:"targetLocales"`
	ExternalProjectURL   *string        `json:"externalProjectUrl"`
	IsActive             bool           `json:"isActive"`
	LogoURL              *string        `json:"logoUrl"`
	LastActivityAt       *string        `json:"lastActivityAt"`
	LastSyncedAt         *string        `json:"lastSyncedAt"`
	CreatedAt            string         `json:"createdAt"`
	UpdatedAt            string         `json:"updatedAt"`
	OpenJobCount         int            `json:"openJobCount"`
	Metadata             map[string]any `json:"metadata"`
}

type liveFileProvider struct {
	Kind               string         `json:"kind"`
	ResourceType       string         `json:"resourceType"`
	ExternalProjectID  string         `json:"externalProjectId"`
	ExternalResourceID string         `json:"externalResourceId"`
	ExternalURL        *string        `json:"externalUrl"`
	SyncState          string         `json:"syncState"`
	SourceLocale       *string        `json:"sourceLocale"`
	TargetLocales      []string       `json:"targetLocales"`
	LocaleReadiness    map[string]any `json:"localeReadiness"`
	Revision           *string        `json:"revision"`
	Format             *string        `json:"format"`
	LastSyncedAt       *string        `json:"lastSyncedAt"`
}

type liveFileRecord struct {
	Origin       string           `json:"origin"`
	SourcePath   string           `json:"sourcePath"`
	Filename     string           `json:"filename"`
	ByteSize     *int64           `json:"byteSize"`
	UploadedAt   string           `json:"uploadedAt"`
	StoredFileID *string          `json:"storedFileId"`
	IngestState  *string          `json:"ingestState"`
	IngestError  *string          `json:"ingestError"`
	IsHidden     bool             `json:"isHidden"`
	LatestJob    any              `json:"latestJob"`
	Provider     liveFileProvider `json:"provider"`
}

type liveFileProgressRecord struct {
	ExternalResourceID  string            `json:"externalResourceId"`
	TranslationProgress int               `json:"translationProgress"`
	ApprovalProgress    int               `json:"approvalProgress"`
	Phrases             tmscatalog.Counts `json:"phrases"`
}

type liveBranchRecord struct {
	Name  string  `json:"name"`
	Title *string `json:"title"`
}

// liveReader returns the reader for the workspace's active TMS. With a
// projectID it also checks the project belongs to that TMS.
func (api *projectAPI) liveReader(ctx context.Context, actor projectActor, project *liveProjectID) (tmscatalog.ProjectReader, tmsConnection, error) {
	if api.tms == nil {
		return nil, tmsConnection{}, projectFailure(http.StatusServiceUnavailable, "tms_unavailable", "TMS projects are unavailable on this server")
	}
	conn, err := activeTMSConnection(ctx, api.pool, actor.organizationID)
	if err != nil {
		return nil, tmsConnection{}, err
	}
	if conn == nil {
		return nil, tmsConnection{}, projectFailure(http.StatusConflict, "tms_not_connected", "Connect a TMS in Integrations to see its projects")
	}
	if project != nil && !strings.EqualFold(conn.ProviderKind, project.providerKind) {
		return nil, tmsConnection{}, projectFailure(http.StatusConflict, "provider_project_unavailable", "This project's TMS is no longer connected to this workspace")
	}
	if !tmscatalog.ProjectsSupported(conn.ProviderKind) {
		return nil, tmsConnection{}, projectFailure(http.StatusNotImplemented, "tms_provider_unsupported", "Projects from "+conn.DisplayName+" aren't supported yet")
	}
	credentials, err := api.tms.credentials(ctx, api.pool, *conn, actor.organizationID, actor.userID)
	if err != nil {
		return nil, tmsConnection{}, asProjectFailure(err)
	}
	reader, err := tmscatalog.NewProjectReader(conn.ProviderKind, credentials, api.tms.http)
	if errors.Is(err, tmscatalog.ErrUnsupported) {
		return nil, tmsConnection{}, projectFailure(http.StatusNotImplemented, "tms_provider_unsupported", "Projects from "+conn.DisplayName+" aren't supported with this connection")
	}
	if err != nil {
		return nil, tmsConnection{}, err
	}
	return reader, *conn, nil
}

func asProjectFailure(err error) error {
	var failure *tmsFailure
	if errors.As(err, &failure) {
		return projectFailure(failure.status, failure.code, failure.message)
	}
	return err
}

func liveProviderFailure(conn tmsConnection, err error) error {
	if errors.Is(err, context.DeadlineExceeded) {
		return projectFailure(http.StatusGatewayTimeout, "tms_timeout", conn.DisplayName+" took too long to answer")
	}
	return asProjectFailure(tmsProviderFailure(conn, err))
}

// liveGet serves GET …/projects/ext:…: one live TMS project, the same
// envelope native getHandler returns so Iris can resolve either kind by id.
func (api *projectAPI) liveGet(r *http.Request, actor projectActor, id liveProjectID) (any, int, error) {
	ctx, cancel := context.WithTimeout(r.Context(), tmsLiveRequestTimeout)
	defer cancel()
	reader, conn, err := api.liveReader(ctx, actor, &id)
	if err != nil {
		return nil, 0, err
	}
	project, err := reader.GetProject(ctx, id.externalProjectID)
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	if project == nil {
		return nil, 0, projectNotFound()
	}
	return map[string]any{"project": liveProject(actor.organizationID, conn.ProviderKind, *project)}, http.StatusOK, nil
}

// liveLocaleProgress serves GET …/projects/ext:…/locale-progress by summing
// the TMS's per-file phrase counts for each target locale.
func (api *projectAPI) liveLocaleProgress(r *http.Request, actor projectActor, id liveProjectID) (any, int, error) {
	ctx, cancel := context.WithTimeout(r.Context(), tmsLiveRequestTimeout)
	defer cancel()
	reader, conn, err := api.liveReader(ctx, actor, &id)
	if err != nil {
		return nil, 0, err
	}
	project, err := reader.GetProject(ctx, id.externalProjectID)
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	if project == nil {
		return nil, 0, projectNotFound()
	}
	byLocale := make(map[string][]tmscatalog.FileProgress, len(project.TargetLocales))
	for _, locale := range project.TargetLocales {
		rows, progressErr := reader.FileProgress(ctx, id.externalProjectID, locale)
		if progressErr != nil {
			logRequestFailure(r, "tms_live_locale_progress_failed", "locale_progress", progressErr, "provider", conn.ProviderKind, "locale", locale)
			byLocale[locale] = nil
			continue
		}
		byLocale[locale] = rows
	}
	return map[string]any{"locales": liveLocaleProgressRows(*project, byLocale)}, http.StatusOK, nil
}

func liveLocaleProgressRows(project tmscatalog.Project, byLocale map[string][]tmscatalog.FileProgress) []localeProgressRow {
	rows := make([]localeProgressRow, 0, len(project.TargetLocales))
	for _, locale := range project.TargetLocales {
		phrases := localeProgressCounts{}
		for _, file := range byLocale[locale] {
			phrases.Total += file.Phrases.Total
			phrases.Translated += file.Phrases.Translated
			phrases.Approved += file.Phrases.Approved
		}
		rows = append(rows, localeProgressRow{
			Locale:              locale,
			TranslationProgress: progressPercent(phrases.Translated, phrases.Total),
			ApprovalProgress:    progressPercent(phrases.Approved, phrases.Total),
			Words:               localeProgressCounts{},
			Phrases:             phrases,
			LastActivityAt:      project.LastActivityAt,
		})
	}
	return rows
}

// liveProjectsHandler lists the active TMS's projects, archived ones left out.
func (api *projectAPI) liveProjectsHandler(r *http.Request, actor projectActor) (any, int, error) {
	ctx, cancel := context.WithTimeout(r.Context(), tmsLiveRequestTimeout)
	defer cancel()
	reader, conn, err := api.liveReader(ctx, actor, nil)
	if err != nil {
		return nil, 0, err
	}
	projects, err := reader.ListProjects(ctx)
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	records := []liveProjectRecord{}
	for _, project := range projects {
		if !project.IsActive {
			continue
		}
		records = append(records, liveProject(actor.organizationID, conn.ProviderKind, project))
	}
	return map[string]any{"projects": records}, http.StatusOK, nil
}

func liveProject(organizationID, providerKind string, project tmscatalog.Project) liveProjectRecord {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	sourceLocale := project.SourceLocale
	if sourceLocale == nil {
		fallback := "en"
		sourceLocale = &fallback
	}
	updatedAt := now
	if project.LastActivityAt != nil {
		updatedAt = *project.LastActivityAt
	}
	metadata := project.Metadata
	if metadata == nil {
		metadata = map[string]any{}
	}
	targets := project.TargetLocales
	if targets == nil {
		targets = []string{}
	}
	record := liveProjectRecord{
		ID:                   encodeLiveProjectID(providerKind, project.ExternalID),
		OrganizationID:       organizationID,
		Name:                 project.Name,
		Description:          project.Description,
		Source:               "external_tms",
		ExternalProviderKind: providerKind,
		ExternalProjectID:    project.ExternalID,
		SourceLocale:         sourceLocale,
		TargetLocales:        targets,
		ExternalProjectURL:   project.URL,
		IsActive:             project.IsActive,
		LogoURL:              project.LogoURL,
		LastActivityAt:       project.LastActivityAt,
		CreatedAt:            now,
		UpdatedAt:            updatedAt,
		Metadata:             metadata,
	}
	if identifier, ok := metadata["identifier"].(string); ok && strings.TrimSpace(identifier) != "" {
		trimmed := strings.TrimSpace(identifier)
		record.Identifier = &trimmed
	}
	return record
}

// liveFiles serves GET …/projects/ext:…/files: the project's files in the TMS,
// in one branch when ?branch= is set, capped at ?limit= (500 by default).
func (api *projectAPI) liveFiles(r *http.Request, actor projectActor, id liveProjectID) (any, int, error) {
	limit := projectFilesDefaultLimit
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > projectFilesMaxLimit {
			return nil, 0, invalidProjectPayload()
		}
		limit = parsed
	}
	ctx, cancel := context.WithTimeout(r.Context(), tmsLiveRequestTimeout)
	defer cancel()
	reader, conn, err := api.liveReader(ctx, actor, &id)
	if err != nil {
		return nil, 0, err
	}
	project, err := reader.GetProject(ctx, id.externalProjectID)
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	if project == nil {
		return map[string]any{"files": []liveFileRecord{}}, http.StatusOK, nil
	}
	files, err := reader.ListFiles(ctx, *project, r.URL.Query().Get("branch"), limit)
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	if len(files) > limit {
		files = files[:limit]
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	records := make([]liveFileRecord, 0, len(files))
	for _, file := range files {
		records = append(records, liveFile(conn.ProviderKind, id.externalProjectID, file, now))
	}
	return map[string]any{"files": records}, http.StatusOK, nil
}

func liveFile(providerKind, externalProjectID string, file tmscatalog.File, now string) liveFileRecord {
	filename := strings.TrimSpace(file.DisplayName)
	if filename == "" {
		parts := strings.Split(strings.Trim(file.SourcePath, "/"), "/")
		filename = parts[len(parts)-1]
	}
	if filename == "" {
		filename = file.SourcePath
	}
	syncState := file.SyncState
	if syncState == "" {
		syncState = "synced"
	}
	targets := file.TargetLocales
	if targets == nil {
		targets = []string{}
	}
	return liveFileRecord{
		Origin:     "provider",
		SourcePath: file.SourcePath,
		Filename:   filename,
		UploadedAt: now,
		Provider: liveFileProvider{
			Kind:               providerKind,
			ResourceType:       file.ResourceType,
			ExternalProjectID:  externalProjectID,
			ExternalResourceID: file.ExternalResourceID,
			ExternalURL:        file.ExternalURL,
			SyncState:          syncState,
			SourceLocale:       file.SourceLocale,
			TargetLocales:      targets,
			LocaleReadiness:    map[string]any{},
			Revision:           file.Revision,
			Format:             file.Format,
		},
	}
}

// liveFileProgress serves GET …/projects/ext:…/file-progress?locale=. It only
// decorates the file tree, so a provider failure answers an empty list.
func (api *projectAPI) liveFileProgress(r *http.Request, actor projectActor, id liveProjectID) (any, int, error) {
	locale := strings.TrimSpace(r.URL.Query().Get("locale"))
	if locale == "" || len(locale) > maxFileProgressLocaleLength {
		return nil, 0, invalidProjectPayload()
	}
	ctx, cancel := context.WithTimeout(r.Context(), tmsLiveRequestTimeout)
	defer cancel()
	reader, conn, err := api.liveReader(ctx, actor, &id)
	if err != nil {
		return nil, 0, err
	}
	rows, err := reader.FileProgress(ctx, id.externalProjectID, locale)
	records := []liveFileProgressRecord{}
	if err != nil {
		logRequestFailure(r, "tms_live_file_progress_failed", "file_progress", err, "provider", conn.ProviderKind)
		return map[string]any{"files": records}, http.StatusOK, nil
	}
	for _, row := range rows {
		records = append(records, liveFileProgressRecord(row))
	}
	return map[string]any{"files": records}, http.StatusOK, nil
}

// hiddenFilesHandler serves GET …/hidden-files: provider files whose strings
// are all hidden. Native files carry isHidden on the file list instead.
func (api *projectAPI) hiddenFilesHandler(r *http.Request, actor projectActor) (any, int, error) {
	records := []map[string]string{}
	id, live := parseLiveProjectID(r.PathValue("projectId"))
	if !live {
		if _, err := normalizedNativeProjectID(r.PathValue("projectId")); err != nil {
			return nil, 0, err
		}
		return map[string]any{"files": records}, http.StatusOK, nil
	}
	ctx, cancel := context.WithTimeout(r.Context(), tmsLiveRequestTimeout)
	defer cancel()
	reader, conn, err := api.liveReader(ctx, actor, &id)
	if err != nil {
		return nil, 0, err
	}
	ids, err := reader.HiddenFileIDs(ctx, id.externalProjectID)
	if err != nil {
		// Hidden flags only decorate the tree; never fail it over them.
		logRequestFailure(r, "tms_live_hidden_files_failed", "hidden_files", err, "provider", conn.ProviderKind)
		return map[string]any{"files": records}, http.StatusOK, nil
	}
	for _, externalID := range ids {
		records = append(records, map[string]string{"externalResourceId": externalID})
	}
	return map[string]any{"files": records}, http.StatusOK, nil
}

// fileBranchesHandler serves GET …/files/branches. Native projects have none.
func (api *projectAPI) fileBranchesHandler(r *http.Request, actor projectActor) (any, int, error) {
	records := []liveBranchRecord{}
	id, live := parseLiveProjectID(r.PathValue("projectId"))
	if !live {
		if _, err := normalizedNativeProjectID(r.PathValue("projectId")); err != nil {
			return nil, 0, err
		}
		return map[string]any{"branches": records}, http.StatusOK, nil
	}
	ctx, cancel := context.WithTimeout(r.Context(), tmsLiveRequestTimeout)
	defer cancel()
	reader, conn, err := api.liveReader(ctx, actor, &id)
	if err != nil {
		return nil, 0, err
	}
	branches, err := reader.ListBranches(ctx, id.externalProjectID)
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	for _, branch := range branches {
		records = append(records, liveBranchRecord(branch))
	}
	return map[string]any{"branches": records}, http.StatusOK, nil
}
