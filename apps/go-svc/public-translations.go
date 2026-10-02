package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	publicTranslationsRequestTimeout = 30 * time.Second
	publicTranslationProjectIDMax    = 128
	publicTranslationSourcePathMax   = 2048
	publicTranslationLocaleMax       = 32
	publicTranslationsContentType    = "application/json; charset=utf-8"
)

type publicTranslationsAPI struct {
	auth *publicAPIAuth
}

func (api *publicTranslationsAPI) register(mux *http.ServeMux) {
	download := api.auth.middleware(api.auth.requirePermission("files:read", http.HandlerFunc(api.download)))
	mux.Handle("GET /v1/projects/{projectId}/translations/download", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		ctx, cancel := context.WithTimeout(r.Context(), publicTranslationsRequestTimeout)
		defer cancel()
		download.ServeHTTP(w, r.WithContext(ctx))
	}))
}

func (api *publicTranslationsAPI) download(w http.ResponseWriter, r *http.Request) {
	principal, ok := publicAPIPrincipalFrom(r.Context())
	if !ok {
		api.auth.writeError(w, r, "auth", publicAPIFailure(http.StatusUnauthorized, "unauthorized", "Authentication required"))
		return
	}
	projectID := normalizeDictionaryProjectID(r.PathValue("projectId"))
	if projectID == "" || utf16Length(projectID) > publicTranslationProjectIDMax {
		api.auth.writeError(w, r, "params", publicTranslationProjectNotFound())
		return
	}
	sourcePath, locale, ok := parsePublicTranslationDownloadQuery(r)
	if !ok {
		api.auth.writeError(w, r, "query", publicAPIFailure(http.StatusBadRequest, "invalid_translation_payload", ""))
		return
	}

	body, filename, err := api.load(r.Context(), principal, projectID, sourcePath, locale)
	if err != nil {
		api.auth.writeError(w, r, "load", err)
		return
	}

	w.Header().Set("Content-Type", publicTranslationsContentType)
	w.Header().Set("Content-Disposition", publicTranslationContentDisposition(filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func parsePublicTranslationDownloadQuery(r *http.Request) (sourcePath, locale string, ok bool) {
	values := r.URL.Query()
	single := func(name string, max int) (string, bool) {
		raw := values[name]
		if len(raw) != 1 {
			return "", false
		}
		value := trimDictionaryInput(raw[0])
		length := utf16Length(value)
		return value, length >= 1 && length <= max
	}
	sourcePath, sourceOK := single("sourcePath", publicTranslationSourcePathMax)
	locale, localeOK := single("locale", publicTranslationLocaleMax)
	return sourcePath, locale, sourceOK && localeOK
}

func publicTranslationProjectNotFound() error {
	return publicAPIFailure(http.StatusNotFound, "project_not_found", "")
}

func (api *publicTranslationsAPI) load(ctx context.Context, principal publicAPIPrincipal, projectID, sourcePath, locale string) ([]byte, string, error) {
	pool := api.auth.pool
	if pool == nil {
		return nil, "", publicAPIFailure(http.StatusServiceUnavailable, "public_api_unavailable", "Public API is unavailable")
	}

	// Projects with no team_id belong to the workspace default team.
	var found string
	err := pool.QueryRow(ctx, `select p.id from projects p
        where p.id=$1 and p.organization_id=$2
        and ($3 or exists(select 1 from team_memberships m join teams t on t.id=m.team_id
            where m.user_id=$4 and t.organization_id=$2 and (t.id=p.team_id or (p.team_id is null and t.slug='default'))))`,
		projectID, principal.organizationID, hasOrganizationCapability(principal.role, "teams:write"), principal.userID).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", publicTranslationProjectNotFound()
	}
	if err != nil {
		return nil, "", publicAPIInternalFailure(fmt.Errorf("find project: %w", err))
	}

	var sourceFileID string
	err = pool.QueryRow(ctx, `select id from repository_source_files
        where organization_id=$1 and project_id=$2 and source_path=$3
        limit 1`, principal.organizationID, projectID, sourcePath).Scan(&sourceFileID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", publicAPIFailure(http.StatusNotFound, "source_file_not_found", "Source file not found")
	}
	if err != nil {
		return nil, "", publicAPIInternalFailure(fmt.Errorf("find source file: %w", err))
	}

	object, loaded, err := api.loadTranslations(ctx, principal.organizationID, projectID, sourceFileID, locale)
	if err != nil {
		return nil, "", publicAPIInternalFailure(err)
	}
	if loaded == 0 {
		return nil, "", publicAPIFailure(http.StatusNotFound, "translations_not_found", "No translations are available for this source file and locale.")
	}
	if isLottieTranslationSource(sourcePath, object.orderedKeys()) {
		return nil, "", publicAPIFailure(http.StatusNotImplemented, "not_implemented", "Lottie translation download is not available on the native Go service yet")
	}
	return object.marshal(), publicTranslationFilename(sourcePath, locale), nil
}

func (api *publicTranslationsAPI) loadTranslations(ctx context.Context, organizationID, projectID, sourceFileID, locale string) (*publicTranslationObject, int, error) {
	rows, err := api.auth.pool.Query(ctx, `select k.key, k.source_text, k.is_hidden, t.text, t.status::text
        from project_translation_keys k
        left join project_translations t on t.translation_key_id=k.id
            and t.organization_id=$1 and t.project_id=$2 and t.target_locale=$4
        where k.organization_id=$1 and k.project_id=$2 and k.repository_source_file_id=$3
        order by k.key asc, k.id asc`, organizationID, projectID, sourceFileID, locale)
	if err != nil {
		return nil, 0, fmt.Errorf("load translation keys: %w", err)
	}
	defer rows.Close()

	object := newPublicTranslationObject()
	loaded := 0
	for rows.Next() {
		var (
			key, sourceText string
			hidden          bool
			text, status    *string
		)
		if err := rows.Scan(&key, &sourceText, &hidden, &text, &status); err != nil {
			return nil, 0, fmt.Errorf("scan translation key: %w", err)
		}
		object.set(key, publicTranslationValue(sourceText, hidden, text, status))
		loaded++
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("load translation keys: %w", err)
	}
	return object, loaded, nil
}

func publicTranslationValue(sourceText string, hidden bool, text, status *string) string {
	ready := text != nil && (status == nil || *status != "rejected") && trimDictionaryInput(*text) != ""
	if !ready {
		return sourceText
	}
	if !hidden && status != nil && *status == "needs_review" && isSameAsSourcePrefill(sourceText, *text) {
		return sourceText
	}
	return *text
}

func isSameAsSourcePrefill(sourceText, targetText string) bool {
	source := trimDictionaryInput(sourceText)
	if source == "" || source != trimDictionaryInput(targetText) {
		return false
	}
	return len(strings.FieldsFunc(source, isDictionaryTrimRune)) >= 2
}
