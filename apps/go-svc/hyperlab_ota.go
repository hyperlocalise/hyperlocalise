package main

import (
	"context"
	"net/http"
	"strings"
)

func publicOtaFormat(format string) string {
	switch strings.ReplaceAll(format, "_", "-") {
	case "android-xml":
		return "android-xml"
	case "ios-strings":
		return "ios-strings"
	default:
		return "json"
	}
}

func (h *handler) listHyperlabOtaDistributions(r *http.Request, actor workspaceActor) (any, int, error) {
	rows, err := h.workspace.pool.Query(r.Context(), `
		select d.id, d.name, d.public_hash, d.branch_name, d.format, d.project_id, p.name
		from ota_distributions d
		inner join projects p on p.id = d.project_id
		where d.organization_id=$1 and d.revoked_at is null
		order by p.name, d.name`, actor.organizationID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	distributions := []any{}
	for rows.Next() {
		var id, name, hash, branch, format, projectID, projectName string
		if err := rows.Scan(&id, &name, &hash, &branch, &format, &projectID, &projectName); err != nil {
			return nil, 0, err
		}
		distributions = append(distributions, map[string]any{
			"id": id, "name": name, "hash": hash, "branch": branch,
			"format": publicOtaFormat(format), "projectId": projectID, "projectName": projectName,
		})
	}
	return map[string]any{"distributions": distributions}, http.StatusOK, rows.Err()
}

func (h *handler) upsertHyperlabVariantOta(r *http.Request, actor workspaceActor) (any, int, error) {
	variantID, err := pathUUID(r, "variantId")
	if err != nil {
		return nil, 0, err
	}
	if _, _, err = h.findOwnedVariant(r.Context(), actor.organizationID, variantID); err != nil {
		return nil, 0, err
	}
	fields, err := readWorkspaceObject(r)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_variant_ota_payload", "Request payload is invalid")
	}
	distributionID, err := optionalUUID(fields, "distributionId")
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_variant_ota_payload", "Request payload is invalid")
	}
	if distributionID == nil {
		if _, err = h.workspace.pool.Exec(r.Context(), `
			delete from ota_experiment_bindings where organization_id=$1 and variant_id=$2`,
			actor.organizationID, variantID); err != nil {
			return nil, 0, err
		}
		return map[string]any{"ota": nil}, http.StatusOK, nil
	}
	var boundID, name, hash, branch, format string
	err = h.workspace.pool.QueryRow(r.Context(), `
		select id, name, public_hash, branch_name, format
		from ota_distributions
		where id=$1 and organization_id=$2 and revoked_at is null`, *distributionID, actor.organizationID).
		Scan(&boundID, &name, &hash, &branch, &format)
	if isNoRows(err) {
		return nil, 0, workspaceFailure(404, "ota_distribution_not_found", "CDN distribution was not found.")
	}
	if err != nil {
		return nil, 0, err
	}
	if _, err = h.workspace.pool.Exec(r.Context(), `
		insert into ota_experiment_bindings (organization_id, variant_id, distribution_id, created_by_user_id)
		values ($1,$2,$3,$4)
		on conflict (variant_id) do update
		set distribution_id=excluded.distribution_id, updated_at=now()`,
		actor.organizationID, variantID, boundID, actor.userID); err != nil {
		return nil, 0, err
	}
	return map[string]any{"ota": map[string]any{
		"distributionId": boundID, "hash": hash, "branch": branch,
		"format": publicOtaFormat(format), "name": name,
	}}, http.StatusOK, nil
}

func (h *handler) otaBindingsByVariant(ctx context.Context, organizationID string, variants []hyperlabVariant) (map[string]any, error) {
	out := map[string]any{}
	if len(variants) == 0 {
		return out, nil
	}
	ids := make([]string, len(variants))
	for i, variant := range variants {
		ids[i] = variant.ID
	}
	rows, err := h.workspace.pool.Query(ctx, `
		select b.variant_id, d.id, d.public_hash, d.branch_name, d.format, d.name
		from ota_experiment_bindings b
		inner join ota_distributions d on d.id = b.distribution_id
		where b.organization_id=$1 and b.variant_id = any($2::uuid[])`, organizationID, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var variantID, distributionID, hash, branch, format, name string
		if err := rows.Scan(&variantID, &distributionID, &hash, &branch, &format, &name); err != nil {
			return nil, err
		}
		out[variantID] = map[string]any{
			"distributionId": distributionID, "hash": hash, "branch": branch,
			"format": publicOtaFormat(format), "name": name,
		}
	}
	return out, rows.Err()
}
