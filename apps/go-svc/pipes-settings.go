package main

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var brazeRestEndpoints = map[string]struct{}{
	"iad-01": {}, "iad-02": {}, "iad-03": {}, "iad-04": {},
	"iad-05": {}, "iad-06": {}, "iad-07": {}, "iad-08": {},
	"us-10": {}, "fra-01": {}, "fra-02": {}, "au-01": {},
	"id-01": {}, "jp-01": {}, "kr-01": {},
}

var pipesRegionSettings = map[string]struct{}{
	"us": {},
	"eu": {},
}

type pipesSettingsKind string

const (
	pipesSettingsBraze      pipesSettingsKind = "braze"
	pipesSettingsCustomerIo pipesSettingsKind = "customer-io"
	pipesSettingsIterable   pipesSettingsKind = "iterable"
	pipesSettingsLoops      pipesSettingsKind = "loops"
)

func pipesSettingsKindFor(provider string) (pipesSettingsKind, bool) {
	switch provider {
	case "braze":
		return pipesSettingsBraze, true
	case "customer-io":
		return pipesSettingsCustomerIo, true
	case "iterable":
		return pipesSettingsIterable, true
	case "loops":
		return pipesSettingsLoops, true
	default:
		return "", false
	}
}

func (api *pipesAPI) getSettings(r *http.Request, actor pipesActor) (any, int, error) {
	provider := r.PathValue("provider")
	kind, ok := pipesSettingsKindFor(provider)
	if !ok {
		return nil, 0, pipesFailure(http.StatusNotFound, "unknown_pipes_settings", "This provider has no extra settings")
	}
	status, err := api.connectionStatus(r.Context(), actor, provider)
	if err != nil {
		return nil, 0, err
	}
	if !status.Connected {
		if err := api.clearProviderSettings(r.Context(), actor, provider); err != nil {
			return nil, 0, err
		}
		return map[string]any{"settings": nil, "pipe": status}, http.StatusOK, nil
	}
	settings, err := api.loadProviderSettings(r.Context(), actor, kind)
	if err != nil {
		return nil, 0, err
	}
	if settings != nil {
		settings["apiKeyLast4"] = status.APIKeyLast4
	} else if kind == pipesSettingsLoops {
		settings = map[string]any{
			"connected":   true,
			"apiKeyLast4": status.APIKeyLast4,
		}
	}
	return map[string]any{"settings": settings, "pipe": status}, http.StatusOK, nil
}

func (api *pipesAPI) putSettings(r *http.Request, actor pipesActor) (any, int, error) {
	provider := r.PathValue("provider")
	kind, ok := pipesSettingsKindFor(provider)
	if !ok {
		return nil, 0, pipesFailure(http.StatusNotFound, "unknown_pipes_settings", "This provider has no extra settings")
	}
	var body struct {
		Secret       string `json:"secret"`
		RestEndpoint string `json:"restEndpoint"`
		Region       string `json:"region"`
	}
	if err := readPipesJSON(r, &body); err != nil {
		return nil, 0, err
	}
	status, err := api.connectionStatus(r.Context(), actor, provider)
	if err != nil {
		return nil, 0, err
	}
	secret := strings.TrimSpace(body.Secret)
	if !status.Connected && secret == "" {
		return nil, 0, pipesFailure(http.StatusBadRequest, "pipes_not_connected", "Paste an API key to connect.")
	}
	if secret != "" {
		status, err = api.upsertAPIKey(r.Context(), actor, provider, secret)
		if err != nil {
			return nil, 0, err
		}
	}
	switch kind {
	case pipesSettingsBraze:
		endpoint := strings.TrimSpace(body.RestEndpoint)
		if _, ok := brazeRestEndpoints[endpoint]; !ok {
			return nil, 0, pipesFailure(http.StatusBadRequest, "invalid_braze_endpoint", "Choose a Braze REST cluster from the allowlisted instances.")
		}
		if err := api.upsertNamedSettings(r.Context(), `
            insert into braze_connection_settings (organization_id, workos_user_id, rest_endpoint)
            values ($1, $2, $3)
            on conflict (organization_id, workos_user_id)
            do update set rest_endpoint=excluded.rest_endpoint, updated_at=now()`, actor, endpoint); err != nil {
			return nil, 0, err
		}
		return map[string]any{
			"settings": map[string]any{"restEndpoint": endpoint, "apiKeyLast4": status.APIKeyLast4},
			"pipe":     status,
		}, http.StatusOK, nil
	case pipesSettingsCustomerIo, pipesSettingsIterable:
		region := strings.TrimSpace(body.Region)
		if _, ok := pipesRegionSettings[region]; !ok {
			return nil, 0, pipesFailure(http.StatusBadRequest, "invalid_pipes_region", "Choose a supported region.")
		}
		table := "customer_io_connection_settings"
		if kind == pipesSettingsIterable {
			table = "iterable_connection_settings"
		}
		if err := api.upsertNamedSettings(r.Context(), `
            insert into `+table+` (organization_id, workos_user_id, region)
            values ($1, $2, $3)
            on conflict (organization_id, workos_user_id)
            do update set region=excluded.region, updated_at=now()`, actor, region); err != nil {
			return nil, 0, err
		}
		return map[string]any{
			"settings": map[string]any{"region": region, "apiKeyLast4": status.APIKeyLast4},
			"pipe":     status,
		}, http.StatusOK, nil
	default:
		return map[string]any{
			"settings": map[string]any{"connected": true, "apiKeyLast4": status.APIKeyLast4},
			"pipe":     status,
		}, http.StatusOK, nil
	}
}

func (api *pipesAPI) loadProviderSettings(ctx context.Context, actor pipesActor, kind pipesSettingsKind) (map[string]any, error) {
	switch kind {
	case pipesSettingsBraze:
		var endpoint string
		err := api.pool.QueryRow(ctx, `
            select rest_endpoint from braze_connection_settings
            where organization_id=$1 and workos_user_id=$2`, actor.organizationID, actor.workosUserID).Scan(&endpoint)
		if isNoRows(err) {
			return nil, nil
		}
		if err != nil {
			return nil, err
		}
		return map[string]any{"restEndpoint": endpoint}, nil
	case pipesSettingsCustomerIo, pipesSettingsIterable:
		table := "customer_io_connection_settings"
		if kind == pipesSettingsIterable {
			table = "iterable_connection_settings"
		}
		var region string
		err := api.pool.QueryRow(ctx, `select region from `+table+` where organization_id=$1 and workos_user_id=$2`,
			actor.organizationID, actor.workosUserID).Scan(&region)
		if isNoRows(err) {
			return nil, nil
		}
		if err != nil {
			return nil, err
		}
		return map[string]any{"region": region}, nil
	default:
		return nil, nil
	}
}

func (api *pipesAPI) upsertNamedSettings(ctx context.Context, query string, actor pipesActor, value string) error {
	_, err := api.pool.Exec(ctx, query, actor.organizationID, actor.workosUserID, value)
	return err
}

func (api *pipesAPI) clearProviderSettings(ctx context.Context, actor pipesActor, provider string) error {
	queries := map[string]string{
		"braze":       `delete from braze_connection_settings where organization_id=$1 and workos_user_id=$2`,
		"customer-io": `delete from customer_io_connection_settings where organization_id=$1 and workos_user_id=$2`,
		"iterable":    `delete from iterable_connection_settings where organization_id=$1 and workos_user_id=$2`,
	}
	query, ok := queries[provider]
	if !ok {
		return nil
	}
	_, err := api.pool.Exec(ctx, query, actor.organizationID, actor.workosUserID)
	if err != nil && !isNoRows(err) && err != pgx.ErrNoRows {
		return err
	}
	return nil
}

func formatPipesTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}
