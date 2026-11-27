package main

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"path"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
	"github.com/jackc/pgx/v5"
)

func (api *editorCatAPI) registerProjectTranslationDownload(mux *http.ServeMux, verifier SessionVerifier) {
	pattern := "GET " + orgRoutePrefix + "/projects/{projectId}/files/translations/download"
	registerAuthenticated(mux, verifier, pattern, http.HandlerFunc(api.serveProjectTranslationDownload))
}

func (api *editorCatAPI) serveProjectTranslationDownload(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if api.pool == nil {
		writeEditorCatError(w, r, "availability", editorCatFailure(503, "editor_unavailable", "Editor service unavailable"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), editorCatRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)

	claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
	if !ok {
		writeEditorCatError(w, r, "auth", editorCatFailure(401, "unauthorized", "Authentication required"))
		return
	}
	actor, err := api.actorFor(ctx, claims, r.PathValue("organizationSlug"), true)
	if err != nil {
		writeEditorCatError(w, r, "resolve_actor", err)
		return
	}
	if !actor.canRead() {
		writeEditorCatError(w, r, "forbidden", editorCatFailure(403, "forbidden", "Insufficient permissions"))
		return
	}
	project, err := api.ownedProject(ctx, actor, r.PathValue("projectId"))
	if err != nil {
		writeEditorCatError(w, r, "resolve_project", err)
		return
	}
	sourcePath := strings.TrimSpace(r.URL.Query().Get("sourcePath"))
	targetLocale := strings.TrimSpace(r.URL.Query().Get("locale"))
	if sourcePath == "" || targetLocale == "" {
		writeEditorCatError(w, r, "query", editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload"))
		return
	}
	content, contentType, filename, overflow, err := api.buildEditorCatTranslationDownload(ctx, actor, project, sourcePath, targetLocale)
	if err != nil {
		writeEditorCatError(w, r, "download", err)
		return
	}
	if content == nil {
		writeEditorCatError(w, r, "missing", editorCatFailure(404, "source_file_not_found", "Source file not found"))
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", `attachment; filename*=UTF-8''`+url.PathEscape(filename))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if len(overflow) > 0 {
		w.Header().Set("X-Hyperlocalise-Overflow-Keys", strings.Join(overflow, ","))
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(content)
}

func (api *editorCatAPI) buildEditorCatTranslationDownload(
	ctx context.Context,
	actor editorCatActor,
	project editorCatProject,
	sourcePath, targetLocale string,
) (content []byte, contentType, filename string, overflow []string, err error) {
	ext := strings.ToLower(path.Ext(sourcePath))
	if ext == ".pdf" {
		return api.buildEditorCatPdfTranslationDownload(ctx, actor, project, sourcePath, targetLocale)
	}
	if isOfficeTranslationSource(sourcePath) {
		return api.buildEditorCatOfficeTranslationDownload(ctx, actor, project, sourcePath, targetLocale)
	}
	if ext == ".html" || ext == ".htm" {
		return api.buildEditorCatHtmlTranslationDownload(ctx, actor, project, sourcePath, targetLocale)
	}
	return nil, "", "", nil, editorCatFailure(404, "source_file_not_found", "Source file not found")
}

func (api *editorCatAPI) buildEditorCatHtmlTranslationDownload(
	ctx context.Context,
	actor editorCatActor,
	project editorCatProject,
	sourcePath, targetLocale string,
) ([]byte, string, string, []string, error) {
	sourceFileID, err := api.sourceFileIDFromQuery(ctx, actor, project, sourcePath, "")
	if err != nil {
		return nil, "", "", nil, err
	}
	if sourceFileID == "" {
		return nil, "", "", nil, editorCatFailure(404, "source_file_not_found", "Source file not found")
	}
	values, loaded, err := api.loadEditorCatReadyTranslationValues(ctx, actor.organizationID, project.ID, sourceFileID, targetLocale)
	if err != nil {
		return nil, "", "", nil, err
	}
	if loaded == 0 {
		return nil, "", "", nil, nil
	}
	var storedFileID string
	err = api.pool.QueryRow(ctx, `
        select v.stored_file_id
        from repository_source_file_versions v
        where v.organization_id=$1 and v.project_id=$2 and v.repository_source_file_id=$3
        order by v.created_at desc, v.id desc
        limit 1`, actor.organizationID, project.ID, sourceFileID).Scan(&storedFileID)
	if errors.Is(err, pgx.ErrNoRows) || storedFileID == "" {
		return nil, "", "", nil, editorCatFailure(404, "source_content_not_found", "Source content not found")
	}
	if err != nil {
		return nil, "", "", nil, err
	}
	template, _, _, err := api.readEditorCatStoredFileForProject(ctx, actor.organizationID, project.ID, storedFileID)
	if err != nil {
		return nil, "", "", nil, err
	}
	out, _ := translationfileparser.MarshalHTML(template, values)
	ext := ".html"
	if strings.HasSuffix(strings.ToLower(sourcePath), ".htm") {
		ext = ".htm"
	}
	return out, "text/html; charset=utf-8", officeDownloadFilename(sourcePath, ext), nil, nil
}

func (api *editorCatAPI) buildEditorCatOfficeTranslationDownload(
	ctx context.Context,
	actor editorCatActor,
	project editorCatProject,
	sourcePath, targetLocale string,
) ([]byte, string, string, []string, error) {
	sourceFileID, err := api.sourceFileIDFromQuery(ctx, actor, project, sourcePath, "")
	if err != nil {
		return nil, "", "", nil, err
	}
	if sourceFileID == "" {
		return nil, "", "", nil, editorCatFailure(404, "source_file_not_found", "Source file not found")
	}
	values, loaded, err := api.loadEditorCatReadyTranslationValues(ctx, actor.organizationID, project.ID, sourceFileID, targetLocale)
	if err != nil {
		return nil, "", "", nil, err
	}
	if loaded == 0 {
		return nil, "", "", nil, nil
	}
	var storedFileID string
	err = api.pool.QueryRow(ctx, `
        select v.stored_file_id
        from repository_source_file_versions v
        where v.organization_id=$1 and v.project_id=$2 and v.repository_source_file_id=$3
        order by v.created_at desc, v.id desc
        limit 1`, actor.organizationID, project.ID, sourceFileID).Scan(&storedFileID)
	if errors.Is(err, pgx.ErrNoRows) || storedFileID == "" {
		return nil, "", "", nil, editorCatFailure(404, "source_content_not_found", "Source content not found")
	}
	if err != nil {
		return nil, "", "", nil, err
	}
	template, _, _, err := api.readEditorCatStoredFileForProject(ctx, actor.organizationID, project.ID, storedFileID)
	if err != nil {
		return nil, "", "", nil, err
	}
	ext := strings.ToLower(path.Ext(sourcePath))
	var out []byte
	switch ext {
	case ".docx":
		out, err = translationfileparser.MarshalDOCX(template, values)
		if err != nil {
			return nil, "", "", nil, editorCatFailure(500, "office_export_failed", "Could not write translations into the Office file.")
		}
		return out, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", officeDownloadFilename(sourcePath, ".docx"), nil, nil
	case ".pptx":
		out, err = translationfileparser.MarshalPPTX(template, values)
		if err != nil {
			return nil, "", "", nil, editorCatFailure(500, "office_export_failed", "Could not write translations into the Office file.")
		}
		return out, "application/vnd.openxmlformats-officedocument.presentationml.presentation", officeDownloadFilename(sourcePath, ".pptx"), nil, nil
	case ".xlsx", ".xls":
		out, err = translationfileparser.MarshalXLSX(template, values, "", targetLocale)
		if err != nil {
			return nil, "", "", nil, editorCatFailure(500, "xlsx_export_failed", "Could not write translations into the Excel workbook.")
		}
		return out, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", officeDownloadFilename(sourcePath, ".xlsx"), nil, nil
	default:
		return nil, "", "", nil, nil
	}
}

func (api *editorCatAPI) buildEditorCatPdfTranslationDownload(
	ctx context.Context,
	actor editorCatActor,
	project editorCatProject,
	sourcePath, targetLocale string,
) ([]byte, string, string, []string, error) {
	sourceFileID, err := api.sourceFileIDFromQuery(ctx, actor, project, sourcePath, "")
	if err != nil {
		return nil, "", "", nil, err
	}
	if sourceFileID == "" {
		return nil, "", "", nil, editorCatFailure(404, "source_file_not_found", "Source file not found")
	}
	values, loaded, err := api.loadEditorCatReadyTranslationValues(ctx, actor.organizationID, project.ID, sourceFileID, targetLocale)
	if err != nil {
		return nil, "", "", nil, err
	}
	if loaded == 0 {
		return nil, "", "", nil, nil
	}
	var storedFileID string
	err = api.pool.QueryRow(ctx, `
        select v.stored_file_id
        from repository_source_file_versions v
        where v.organization_id=$1 and v.project_id=$2 and v.repository_source_file_id=$3
        order by v.created_at desc, v.id desc
        limit 1`, actor.organizationID, project.ID, sourceFileID).Scan(&storedFileID)
	if errors.Is(err, pgx.ErrNoRows) || storedFileID == "" {
		return nil, "", "", nil, editorCatFailure(404, "source_content_not_found", "Source content not found")
	}
	if err != nil {
		return nil, "", "", nil, err
	}
	template, _, _, err := api.readEditorCatStoredFileForProject(ctx, actor.organizationID, project.ID, storedFileID)
	if err != nil {
		return nil, "", "", nil, err
	}
	out, overflow, err := translationfileparser.MarshalPDF(template, values)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "script") {
			return nil, "", "", nil, editorCatFailure(422, "pdf_script_unsupported", "The target text uses a script this PDF export does not support.")
		}
		return nil, "", "", nil, editorCatFailure(500, "pdf_export_failed", "Could not write translations into the PDF.")
	}
	return out, "application/pdf", officeDownloadFilename(sourcePath, ".pdf"), overflow, nil
}

func officeDownloadFilename(sourcePath, ext string) string {
	base := path.Base(sourcePath)
	dot := strings.LastIndexByte(base, '.')
	if dot > 0 {
		base = base[:dot]
	}
	return base + ext
}

func (api *editorCatAPI) loadEditorCatReadyTranslationValues(ctx context.Context, organizationID, projectID, sourceFileID, targetLocale string) (map[string]string, int, error) {
	rows, err := api.pool.Query(ctx, `
        select k.key, k.source_text, k.is_hidden, t.text, t.status::text
        from project_translation_keys k
        left join project_translations t
          on t.translation_key_id=k.id and t.organization_id=$1 and t.project_id=$2 and t.target_locale=$4
        where k.organization_id=$1 and k.project_id=$2 and k.repository_source_file_id=$3
        order by k.key asc, k.id asc`, organizationID, projectID, sourceFileID, targetLocale)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	values := map[string]string{}
	loaded := 0
	for rows.Next() {
		var key, sourceText string
		var hidden bool
		var text, status *string
		if err := rows.Scan(&key, &sourceText, &hidden, &text, &status); err != nil {
			return nil, 0, err
		}
		loaded++
		if text == nil || strings.TrimSpace(*text) == "" {
			continue
		}
		if status != nil && *status == "rejected" {
			continue
		}
		values[key] = *text
	}
	return values, loaded, rows.Err()
}

func (api *editorCatAPI) sourceFileIDFromQuery(ctx context.Context, actor editorCatActor, project editorCatProject, sourcePath, branch string) (string, error) {
	branch = strings.TrimSpace(branch)
	if branch == "" {
		branch = "main"
	}
	var id string
	err := api.pool.QueryRow(ctx, `
        select id from repository_source_files
        where organization_id=$1 and project_id=$2 and source_path=$3 and branch_name=$4
        limit 1`, actor.organizationID, project.ID, sourcePath, branch).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return id, err
}
