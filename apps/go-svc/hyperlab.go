package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/experiment"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const experimentBucketCount = 10000

var experimentFlagKeyPattern = regexp.MustCompile(`^[a-z0-9._-]+$`)

func (h *handler) registerHyperlab(mux *http.ServeMux, verifier SessionVerifier) {
	base := orgRoutePrefix + "/hyperlab"
	read := func(actor workspaceActor) bool { return actor.canReadExperiments() }
	write := func(actor workspaceActor) bool { return actor.canWriteExperiments() }
	route := func(pattern string, allow func(workspaceActor) bool, denied string, fn func(*http.Request, workspaceActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, h.workspaceHandle(workspaceHyperlabFlag, "Hyperlab is not enabled for this workspace", denied, allow, fn))
	}
	get := func(path string, fn func(*http.Request, workspaceActor) (any, int, error)) {
		route("GET "+base+path, read, "Missing experiments:read", fn)
	}
	post := func(path string, fn func(*http.Request, workspaceActor) (any, int, error)) {
		route("POST "+base+path, write, "Missing experiments:write", fn)
	}
	put := func(path string, fn func(*http.Request, workspaceActor) (any, int, error)) {
		route("PUT "+base+path, write, "Missing experiments:write", fn)
	}
	del := func(path string, fn func(*http.Request, workspaceActor) (any, int, error)) {
		route("DELETE "+base+path, write, "Missing experiments:write", fn)
	}
	get("/flags", h.listHyperlabFlags)
	post("/flags", h.createHyperlabFlag)
	get("/flags/{flagId}", h.getHyperlabFlag)
	put("/flags/{flagId}", h.updateHyperlabFlag)
	put("/flags/{flagId}/config", h.upsertHyperlabFlagConfig)
	del("/flags/{flagId}", h.deleteHyperlabFlag)
	get("/audiences", h.listHyperlabAudiences)
	post("/audiences", h.createHyperlabAudience)
	get("/audiences/{audienceId}", h.getHyperlabAudience)
	put("/audiences/{audienceId}", h.updateHyperlabAudience)
	del("/audiences/{audienceId}", h.deleteHyperlabAudience)
	get("/experiments", h.listHyperlabExperiments)
	post("/experiments", h.createHyperlabExperiment)
	get("/experiments/{experimentId}", h.getHyperlabExperiment)
	put("/experiments/{experimentId}", h.updateHyperlabExperiment)
	del("/experiments/{experimentId}", h.deleteHyperlabExperiment)
	post("/experiments/{experimentId}/variants", h.createHyperlabVariant)
	put("/experiments/{experimentId}/rollouts", h.updateHyperlabRollouts)
	put("/variants/{variantId}", h.updateHyperlabVariant)
	del("/variants/{variantId}", h.deleteHyperlabVariant)
	get("/assignments", h.listHyperlabAssignments)
	post("/assignments", h.createHyperlabAssignment)
	put("/assignments/{assignmentId}", h.updateHyperlabAssignment)
	del("/assignments/{assignmentId}", h.deleteHyperlabAssignment)
	get("/keys", h.listHyperlabKeys)
	post("/keys", h.createHyperlabKey)
	del("/keys/{keyId}", h.revokeHyperlabKey)
}

func (h *handler) listHyperlabFlags(r *http.Request, actor workspaceActor) (any, int, error) {
	rows, err := h.workspace.pool.Query(r.Context(), `
		select id, organization_id, key, description, kind, created_at, updated_at
		from experiment_flags where organization_id=$1 order by created_at desc`, actor.organizationID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	flags := []any{}
	for rows.Next() {
		flag, err := scanFlag(rows)
		if err != nil {
			return nil, 0, err
		}
		flags = append(flags, flag.public())
	}
	return map[string]any{"flags": flags}, http.StatusOK, rows.Err()
}

func (h *handler) createHyperlabFlag(r *http.Request, actor workspaceActor) (any, int, error) {
	fields, err := readWorkspaceObject(r)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_flag_payload", "Request payload is invalid")
	}
	key, err := requiredFlagKey(fields, "key")
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_flag_payload", "Request payload is invalid")
	}
	kind := "experiment"
	if raw, ok := fields["kind"]; ok {
		if err := json.Unmarshal(raw, &kind); err != nil || (kind != "experiment" && kind != "config") {
			return nil, 0, workspaceFailure(400, "invalid_flag_payload", "Request payload is invalid")
		}
	}
	description, err := optionalText(fields, "description", 2000)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_flag_payload", "Request payload is invalid")
	}
	row := h.workspace.pool.QueryRow(r.Context(), `
		insert into experiment_flags (organization_id, key, description, kind)
		values ($1,$2,$3,$4)
		returning id, organization_id, key, description, kind, created_at, updated_at`,
		actor.organizationID, key, description, kind)
	flag, err := scanFlag(row)
	if isUniqueViolation(err) {
		return nil, 0, workspaceFailure(409, "flag_key_taken", "A flag with this key already exists")
	}
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"flag": flag.public()}, http.StatusCreated, nil
}

func (h *handler) getHyperlabFlag(r *http.Request, actor workspaceActor) (any, int, error) {
	flagID, err := pathUUID(r, "flagId")
	if err != nil {
		return nil, 0, err
	}
	flag, err := h.findFlag(r.Context(), actor.organizationID, flagID)
	if err != nil {
		return nil, 0, err
	}
	var value json.RawMessage
	var created, updated *time.Time
	err = h.workspace.pool.QueryRow(r.Context(), `
		select value, created_at, updated_at from experiment_flag_configs where flag_id=$1`, flag.ID).Scan(&value, &created, &updated)
	config := map[string]any{"flagId": flag.ID, "value": nil, "createdAt": nil, "updatedAt": nil}
	if err == nil {
		config["value"] = jsonValue(value)
		config["createdAt"] = isoTime(created)
		config["updatedAt"] = isoTime(updated)
	} else if !isNoRows(err) {
		return nil, 0, err
	}
	return map[string]any{"flag": flag.public(), "config": config}, http.StatusOK, nil
}

func (h *handler) updateHyperlabFlag(r *http.Request, actor workspaceActor) (any, int, error) {
	flagID, err := pathUUID(r, "flagId")
	if err != nil {
		return nil, 0, err
	}
	fields, err := readWorkspaceObject(r)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_flag_payload", "Request payload is invalid")
	}
	description, err := optionalText(fields, "description", 2000)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_flag_payload", "Request payload is invalid")
	}
	var flag hyperlabFlag
	if _, ok := fields["description"]; ok {
		row := h.workspace.pool.QueryRow(r.Context(), `
			update experiment_flags set description=$3, updated_at=now()
			where id=$1 and organization_id=$2
			returning id, organization_id, key, description, kind, created_at, updated_at`,
			flagID, actor.organizationID, description)
		flag, err = scanFlag(row)
	} else {
		flag, err = h.findFlag(r.Context(), actor.organizationID, flagID)
	}
	if isNoRows(err) {
		return nil, 0, workspaceFailure(404, "flag_not_found", "Flag was not found.")
	}
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"flag": flag.public()}, http.StatusOK, nil
}

func (h *handler) upsertHyperlabFlagConfig(r *http.Request, actor workspaceActor) (any, int, error) {
	flagID, err := pathUUID(r, "flagId")
	if err != nil {
		return nil, 0, err
	}
	fields, err := readWorkspaceObject(r)
	if err != nil || fields["value"] == nil {
		return nil, 0, workspaceFailure(400, "invalid_flag_config_payload", "Request payload is invalid")
	}
	if !json.Valid(fields["value"]) {
		return nil, 0, workspaceFailure(400, "invalid_flag_config_payload", "Request payload is invalid")
	}
	flag, err := h.findFlag(r.Context(), actor.organizationID, flagID)
	if err != nil {
		return nil, 0, err
	}
	if flag.Kind != "config" {
		return nil, 0, workspaceFailure(400, "flag_not_config", "Only config flags have a JSON value")
	}
	var value json.RawMessage
	var created, updated time.Time
	err = h.workspace.pool.QueryRow(r.Context(), `
		insert into experiment_flag_configs (flag_id, value)
		values ($1, $2::jsonb)
		on conflict (flag_id) do update set value=excluded.value, updated_at=now()
		returning value, created_at, updated_at`, flag.ID, string(fields["value"])).Scan(&value, &created, &updated)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"config": map[string]any{
		"flagId": flag.ID, "value": jsonValue(value), "createdAt": isoTime(&created), "updatedAt": isoTime(&updated),
	}}, http.StatusOK, nil
}

func (h *handler) deleteHyperlabFlag(r *http.Request, actor workspaceActor) (any, int, error) {
	return h.deleteScoped(r, actor, "flagId", "flag_not_found", "Flag was not found.", `
		delete from experiment_flags where id=$1 and organization_id=$2`)
}

func (h *handler) listHyperlabAudiences(r *http.Request, actor workspaceActor) (any, int, error) {
	rows, err := h.workspace.pool.Query(r.Context(), `
		select id, organization_id, name, description, criterion, created_at, updated_at
		from experiment_audiences where organization_id=$1 order by created_at desc`, actor.organizationID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	audiences := []any{}
	for rows.Next() {
		audience, err := scanAudience(rows)
		if err != nil {
			return nil, 0, err
		}
		audiences = append(audiences, audience.public())
	}
	return map[string]any{"audiences": audiences}, http.StatusOK, rows.Err()
}

func (h *handler) createHyperlabAudience(r *http.Request, actor workspaceActor) (any, int, error) {
	fields, err := readWorkspaceObject(r)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_audience_payload", "Request payload is invalid")
	}
	name, err := requiredText(fields, "name", 255)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_audience_payload", "Request payload is invalid")
	}
	description, err := optionalText(fields, "description", 2000)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_audience_payload", "Request payload is invalid")
	}
	criterion, err := optionalCriterion(fields)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_audience_payload", "Request payload is invalid")
	}
	row := h.workspace.pool.QueryRow(r.Context(), `
		insert into experiment_audiences (organization_id, name, description, criterion)
		values ($1,$2,$3,$4::jsonb)
		returning id, organization_id, name, description, criterion, created_at, updated_at`,
		actor.organizationID, name, description, criterion)
	audience, err := scanAudience(row)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"audience": audience.public()}, http.StatusCreated, nil
}

func (h *handler) getHyperlabAudience(r *http.Request, actor workspaceActor) (any, int, error) {
	audienceID, err := pathUUID(r, "audienceId")
	if err != nil {
		return nil, 0, err
	}
	audience, err := h.findAudience(r.Context(), actor.organizationID, audienceID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"audience": audience.public()}, http.StatusOK, nil
}

func (h *handler) updateHyperlabAudience(r *http.Request, actor workspaceActor) (any, int, error) {
	audienceID, err := pathUUID(r, "audienceId")
	if err != nil {
		return nil, 0, err
	}
	fields, err := readWorkspaceObject(r)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_audience_payload", "Request payload is invalid")
	}
	update := sqlSet{}
	if _, ok := fields["name"]; ok {
		name, err := requiredText(fields, "name", 255)
		if err != nil {
			return nil, 0, workspaceFailure(400, "invalid_audience_payload", "Request payload is invalid")
		}
		update.set("name", name)
	}
	if _, ok := fields["description"]; ok {
		description, err := optionalText(fields, "description", 2000)
		if err != nil {
			return nil, 0, workspaceFailure(400, "invalid_audience_payload", "Request payload is invalid")
		}
		update.set("description", description)
	}
	if _, ok := fields["criterion"]; ok {
		criterion, err := optionalCriterion(fields)
		if err != nil {
			return nil, 0, workspaceFailure(400, "invalid_audience_payload", "Request payload is invalid")
		}
		update.setRaw("criterion", criterion)
	}
	audience, err := h.updateAudience(r.Context(), actor.organizationID, audienceID, update)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"audience": audience.public()}, http.StatusOK, nil
}

func (h *handler) deleteHyperlabAudience(r *http.Request, actor workspaceActor) (any, int, error) {
	return h.deleteScoped(r, actor, "audienceId", "audience_not_found", "Audience was not found.", `
		delete from experiment_audiences where id=$1 and organization_id=$2`)
}

func (h *handler) listHyperlabExperiments(r *http.Request, actor workspaceActor) (any, int, error) {
	rows, err := h.workspace.pool.Query(r.Context(), experimentSelect+` where organization_id=$1 order by created_at desc`, actor.organizationID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	experiments := []any{}
	for rows.Next() {
		item, err := scanExperiment(rows)
		if err != nil {
			return nil, 0, err
		}
		experiments = append(experiments, item.public())
	}
	return map[string]any{"experiments": experiments}, http.StatusOK, rows.Err()
}

func (h *handler) createHyperlabExperiment(r *http.Request, actor workspaceActor) (any, int, error) {
	fields, err := readWorkspaceObject(r)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_experiment_payload", "Request payload is invalid")
	}
	name, err := requiredText(fields, "name", 255)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_experiment_payload", "Request payload is invalid")
	}
	kind := "toggle"
	if raw, ok := fields["kind"]; ok {
		if err := json.Unmarshal(raw, &kind); err != nil || (kind != "toggle" && kind != "ab") {
			return nil, 0, workspaceFailure(400, "invalid_experiment_payload", "Request payload is invalid")
		}
	}
	audienceID, err := optionalUUID(fields, "audienceId")
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_experiment_payload", "Request payload is invalid")
	}
	if err := h.assertAudience(r.Context(), actor.organizationID, audienceID); err != nil {
		return nil, 0, err
	}
	rollout := 10000
	if _, ok := fields["rolloutPercentage"]; ok {
		rollout, err = requiredInt(fields, "rolloutPercentage", 0, 10000)
		if err != nil {
			return nil, 0, workspaceFailure(400, "invalid_experiment_payload", "Request payload is invalid")
		}
	}
	now := time.Now().UTC()
	startAt := now
	if raw, ok := fields["startAt"]; ok {
		startAt, err = requiredTime(raw)
		if err != nil {
			return nil, 0, workspaceFailure(400, "invalid_experiment_payload", "Request payload is invalid")
		}
	}
	endAt := now.AddDate(0, 3, 0)
	if raw, ok := fields["endAt"]; ok {
		endAt, err = requiredTime(raw)
		if err != nil {
			return nil, 0, workspaceFailure(400, "invalid_experiment_payload", "Request payload is invalid")
		}
	}
	if !endAt.After(startAt) {
		return nil, 0, workspaceFailure(400, "invalid_experiment_window", "endAt must be after startAt")
	}
	timezone := "UTC"
	if _, ok := fields["timezone"]; ok {
		timezone, err = requiredText(fields, "timezone", 64)
		if err != nil {
			return nil, 0, workspaceFailure(400, "invalid_experiment_payload", "Request payload is invalid")
		}
	}
	seed, err := newExperimentSeed()
	if err != nil {
		return nil, 0, err
	}
	controlRollout := 10000
	if kind != "toggle" {
		controlRollout = 5000
	}
	tx, err := h.workspace.pool.Begin(r.Context())
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	item, err := scanExperiment(tx.QueryRow(r.Context(), `
		insert into experiments (
			organization_id, name, kind, audience_id, rollout_percentage, seed, start_at, end_at, timezone
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		returning `+experimentColumns,
		actor.organizationID, name, kind, audienceID, rollout, seed, startAt, endAt, timezone))
	if err != nil {
		return nil, 0, err
	}
	if _, err = tx.Exec(r.Context(), `
		insert into experiment_variants (experiment_id, key, is_control, rollout_percentage)
		values ($1,'control',true,$2)`, item.ID, controlRollout); err != nil {
		return nil, 0, err
	}
	if err = recomputeExperimentAllocations(r.Context(), tx, item.ID); err != nil {
		return nil, 0, err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return nil, 0, err
	}
	return map[string]any{"experiment": item.public()}, http.StatusCreated, nil
}

func (h *handler) getHyperlabExperiment(r *http.Request, actor workspaceActor) (any, int, error) {
	experimentID, err := pathUUID(r, "experimentId")
	if err != nil {
		return nil, 0, err
	}
	item, err := h.findExperiment(r.Context(), actor.organizationID, experimentID)
	if err != nil {
		return nil, 0, err
	}
	variants, err := h.listVariants(r.Context(), item.ID)
	if err != nil {
		return nil, 0, err
	}
	allocations, err := h.listAllocations(r.Context(), variants)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{
		"experiment": item.public(), "variants": publicVariants(variants), "allocations": allocations,
	}, http.StatusOK, nil
}

func (h *handler) updateHyperlabExperiment(r *http.Request, actor workspaceActor) (any, int, error) {
	experimentID, err := pathUUID(r, "experimentId")
	if err != nil {
		return nil, 0, err
	}
	fields, err := readWorkspaceObject(r)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_experiment_payload", "Request payload is invalid")
	}
	current, err := h.findExperiment(r.Context(), actor.organizationID, experimentID)
	if err != nil {
		return nil, 0, err
	}
	if _, ok := fields["audienceId"]; ok {
		audienceID, err := optionalUUID(fields, "audienceId")
		if err != nil {
			return nil, 0, workspaceFailure(400, "invalid_experiment_payload", "Request payload is invalid")
		}
		if err := h.assertAudience(r.Context(), actor.organizationID, audienceID); err != nil {
			return nil, 0, err
		}
	}
	startAt, endAt := current.StartAt, current.EndAt
	if raw, ok := fields["startAt"]; ok {
		startAt, err = requiredTime(raw)
		if err != nil {
			return nil, 0, workspaceFailure(400, "invalid_experiment_payload", "Request payload is invalid")
		}
	}
	if raw, ok := fields["endAt"]; ok {
		endAt, err = requiredTime(raw)
		if err != nil {
			return nil, 0, workspaceFailure(400, "invalid_experiment_payload", "Request payload is invalid")
		}
	}
	if !endAt.After(startAt) {
		return nil, 0, workspaceFailure(400, "invalid_experiment_window", "endAt must be after startAt")
	}
	update := sqlSet{}
	if _, ok := fields["name"]; ok {
		name, err := requiredText(fields, "name", 255)
		if err != nil {
			return nil, 0, workspaceFailure(400, "invalid_experiment_payload", "Request payload is invalid")
		}
		update.set("name", name)
	}
	if raw, ok := fields["status"]; ok {
		var status string
		if err := json.Unmarshal(raw, &status); err != nil || (status != "draft" && status != "active" && status != "archived") {
			return nil, 0, workspaceFailure(400, "invalid_experiment_payload", "Request payload is invalid")
		}
		update.set("status", status)
		if status == "archived" {
			if current.ArchivedAt != nil {
				update.set("archived_at", *current.ArchivedAt)
			} else {
				update.set("archived_at", time.Now().UTC())
			}
		} else {
			update.set("archived_at", nil)
		}
	}
	if _, ok := fields["audienceId"]; ok {
		audienceID, _ := optionalUUID(fields, "audienceId")
		update.set("audience_id", audienceID)
	}
	recompute := false
	if _, ok := fields["rolloutPercentage"]; ok {
		rollout, err := requiredInt(fields, "rolloutPercentage", 0, 10000)
		if err != nil {
			return nil, 0, workspaceFailure(400, "invalid_experiment_payload", "Request payload is invalid")
		}
		update.set("rollout_percentage", rollout)
		recompute = true
	}
	if _, ok := fields["startAt"]; ok {
		update.set("start_at", startAt)
	}
	if _, ok := fields["endAt"]; ok {
		update.set("end_at", endAt)
	}
	if _, ok := fields["timezone"]; ok {
		timezone, err := requiredText(fields, "timezone", 64)
		if err != nil {
			return nil, 0, workspaceFailure(400, "invalid_experiment_payload", "Request payload is invalid")
		}
		update.set("timezone", timezone)
	}
	item, err := h.updateExperiment(r.Context(), current.ID, update)
	if err != nil {
		return nil, 0, err
	}
	if recompute {
		if err := recomputeExperimentAllocations(r.Context(), h.workspace.pool, item.ID); err != nil {
			return nil, 0, err
		}
	}
	return map[string]any{"experiment": item.public()}, http.StatusOK, nil
}

func (h *handler) deleteHyperlabExperiment(r *http.Request, actor workspaceActor) (any, int, error) {
	return h.deleteScoped(r, actor, "experimentId", "experiment_not_found", "Experiment was not found.", `
		delete from experiments where id=$1 and organization_id=$2`)
}

func (h *handler) createHyperlabVariant(r *http.Request, actor workspaceActor) (any, int, error) {
	experimentID, err := pathUUID(r, "experimentId")
	if err != nil {
		return nil, 0, err
	}
	if _, err = h.findExperiment(r.Context(), actor.organizationID, experimentID); err != nil {
		return nil, 0, err
	}
	fields, err := readWorkspaceObject(r)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_variant_payload", "Request payload is invalid")
	}
	key, err := requiredFlagKey(fields, "key")
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_variant_payload", "Request payload is invalid")
	}
	audienceID, err := optionalUUID(fields, "audienceId")
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_variant_payload", "Request payload is invalid")
	}
	if err = h.assertAudience(r.Context(), actor.organizationID, audienceID); err != nil {
		return nil, 0, err
	}
	rollout := 10000
	if _, ok := fields["rolloutPercentage"]; ok {
		rollout, err = requiredInt(fields, "rolloutPercentage", 0, 10000)
		if err != nil {
			return nil, 0, workspaceFailure(400, "invalid_variant_payload", "Request payload is invalid")
		}
	}
	isControl := false
	if raw, ok := fields["isControl"]; ok {
		if err = json.Unmarshal(raw, &isControl); err != nil {
			return nil, 0, workspaceFailure(400, "invalid_variant_payload", "Request payload is invalid")
		}
	}
	siblings, err := parseRollouts(fields["siblingRollouts"])
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_variant_payload", "Request payload is invalid")
	}
	existing, err := h.listVariants(r.Context(), experimentID)
	if err != nil {
		return nil, 0, err
	}
	if siblings != nil {
		if !rolloutsCover(existing, siblings) {
			return nil, 0, workspaceFailure(400, "invalid_variant_rollouts", "Sibling rollouts must include every existing variant once")
		}
		total := rollout
		for _, sibling := range siblings {
			total += sibling.percentage
		}
		if total != 10000 {
			return nil, 0, workspaceFailure(400, "invalid_variant_rollouts", "Variant rollouts must add up to 100%")
		}
	}
	tx, err := h.workspace.pool.Begin(r.Context())
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	variant, err := scanVariant(tx.QueryRow(r.Context(), `
		insert into experiment_variants (experiment_id, key, audience_id, rollout_percentage, is_control)
		values ($1,$2,$3,$4,$5)
		returning id, experiment_id, key, audience_id, rollout_percentage, is_control, created_at, updated_at`,
		experimentID, key, audienceID, rollout, isControl))
	if isUniqueViolation(err) {
		return nil, 0, workspaceFailure(409, "variant_key_taken", "A variant with this key already exists")
	}
	if err != nil {
		return nil, 0, err
	}
	for _, sibling := range siblings {
		if _, err = tx.Exec(r.Context(), `update experiment_variants set rollout_percentage=$2, updated_at=now() where id=$1`, sibling.id, sibling.percentage); err != nil {
			return nil, 0, err
		}
	}
	if err = recomputeExperimentAllocations(r.Context(), tx, experimentID); err != nil {
		return nil, 0, err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return nil, 0, err
	}
	return map[string]any{"variant": variant.public()}, http.StatusCreated, nil
}

func (h *handler) updateHyperlabRollouts(r *http.Request, actor workspaceActor) (any, int, error) {
	experimentID, err := pathUUID(r, "experimentId")
	if err != nil {
		return nil, 0, err
	}
	if _, err = h.findExperiment(r.Context(), actor.organizationID, experimentID); err != nil {
		return nil, 0, err
	}
	fields, err := readWorkspaceObject(r)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_variant_rollouts_payload", "Request payload is invalid")
	}
	rollouts, err := parseRollouts(fields["rollouts"])
	if err != nil || len(rollouts) == 0 {
		return nil, 0, workspaceFailure(400, "invalid_variant_rollouts_payload", "Request payload is invalid")
	}
	existing, err := h.listVariants(r.Context(), experimentID)
	if err != nil {
		return nil, 0, err
	}
	if !rolloutsCover(existing, rollouts) {
		return nil, 0, workspaceFailure(400, "invalid_variant_rollouts", "Rollouts must include every variant once")
	}
	total := 0
	for _, rollout := range rollouts {
		total += rollout.percentage
	}
	if total != 10000 {
		return nil, 0, workspaceFailure(400, "invalid_variant_rollouts", "Variant rollouts must add up to 100%")
	}
	tx, err := h.workspace.pool.Begin(r.Context())
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	updated := []any{}
	for _, rollout := range rollouts {
		variant, err := scanVariant(tx.QueryRow(r.Context(), `
			update experiment_variants set rollout_percentage=$2, updated_at=now() where id=$1
			returning id, experiment_id, key, audience_id, rollout_percentage, is_control, created_at, updated_at`,
			rollout.id, rollout.percentage))
		if err != nil {
			return nil, 0, err
		}
		updated = append(updated, variant.public())
	}
	if err = recomputeExperimentAllocations(r.Context(), tx, experimentID); err != nil {
		return nil, 0, err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return nil, 0, err
	}
	return map[string]any{"variants": updated}, http.StatusOK, nil
}

func (h *handler) updateHyperlabVariant(r *http.Request, actor workspaceActor) (any, int, error) {
	variantID, err := pathUUID(r, "variantId")
	if err != nil {
		return nil, 0, err
	}
	current, experimentID, err := h.findOwnedVariant(r.Context(), actor.organizationID, variantID)
	if err != nil {
		return nil, 0, err
	}
	fields, err := readWorkspaceObject(r)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_variant_payload", "Request payload is invalid")
	}
	if _, ok := fields["audienceId"]; ok {
		audienceID, err := optionalUUID(fields, "audienceId")
		if err != nil {
			return nil, 0, workspaceFailure(400, "invalid_variant_payload", "Request payload is invalid")
		}
		if err = h.assertAudience(r.Context(), actor.organizationID, audienceID); err != nil {
			return nil, 0, err
		}
	}
	update := sqlSet{}
	if _, ok := fields["audienceId"]; ok {
		audienceID, _ := optionalUUID(fields, "audienceId")
		update.set("audience_id", audienceID)
	}
	recompute := false
	if _, ok := fields["rolloutPercentage"]; ok {
		rollout, err := requiredInt(fields, "rolloutPercentage", 0, 10000)
		if err != nil {
			return nil, 0, workspaceFailure(400, "invalid_variant_payload", "Request payload is invalid")
		}
		update.set("rollout_percentage", rollout)
		recompute = true
	}
	if raw, ok := fields["isControl"]; ok {
		var isControl bool
		if err = json.Unmarshal(raw, &isControl); err != nil {
			return nil, 0, workspaceFailure(400, "invalid_variant_payload", "Request payload is invalid")
		}
		update.set("is_control", isControl)
	}
	variant := current
	if len(update.sets) > 0 {
		update.set("updated_at", time.Now().UTC())
		query := fmt.Sprintf(`update experiment_variants set %s where id=$%d returning id, experiment_id, key, audience_id, rollout_percentage, is_control, created_at, updated_at`, strings.Join(update.sets, ", "), len(update.args)+1)
		variant, err = scanVariant(h.workspace.pool.QueryRow(r.Context(), query, append(update.args, variantID)...))
		if err != nil {
			return nil, 0, err
		}
	}
	if recompute {
		if err = recomputeExperimentAllocations(r.Context(), h.workspace.pool, experimentID); err != nil {
			return nil, 0, err
		}
	}
	return map[string]any{"variant": variant.public()}, http.StatusOK, nil
}

func (h *handler) deleteHyperlabVariant(r *http.Request, actor workspaceActor) (any, int, error) {
	variantID, err := pathUUID(r, "variantId")
	if err != nil {
		return nil, 0, err
	}
	_, experimentID, err := h.findOwnedVariant(r.Context(), actor.organizationID, variantID)
	if err != nil {
		return nil, 0, err
	}
	if _, err = h.workspace.pool.Exec(r.Context(), `delete from experiment_variants where id=$1`, variantID); err != nil {
		return nil, 0, err
	}
	if err = recomputeExperimentAllocations(r.Context(), h.workspace.pool, experimentID); err != nil {
		return nil, 0, err
	}
	return nil, http.StatusNoContent, nil
}

func (h *handler) listHyperlabAssignments(r *http.Request, actor workspaceActor) (any, int, error) {
	flags, err := h.workspace.pool.Query(r.Context(), `select id from experiment_flags where organization_id=$1`, actor.organizationID)
	if err != nil {
		return nil, 0, err
	}
	defer flags.Close()
	ids := []string{}
	for flags.Next() {
		var id string
		if err = flags.Scan(&id); err != nil {
			return nil, 0, err
		}
		ids = append(ids, id)
	}
	if err = flags.Err(); err != nil || len(ids) == 0 {
		return map[string]any{"assignments": []any{}}, http.StatusOK, err
	}
	rows, err := h.workspace.pool.Query(r.Context(), `
		select id, flag_id, variant_id, enabled, payload, created_at, updated_at
		from experiment_flag_assignments where flag_id = any($1::uuid[])
		order by created_at desc`, ids)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	assignments := []any{}
	for rows.Next() {
		item, err := scanAssignment(rows)
		if err != nil {
			return nil, 0, err
		}
		assignments = append(assignments, item.public())
	}
	return map[string]any{"assignments": assignments}, http.StatusOK, rows.Err()
}

func (h *handler) createHyperlabAssignment(r *http.Request, actor workspaceActor) (any, int, error) {
	fields, err := readWorkspaceObject(r)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_assignment_payload", "Request payload is invalid")
	}
	flagID, err := requiredUUID(fields, "flagId")
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_assignment_payload", "Request payload is invalid")
	}
	variantID, err := requiredUUID(fields, "variantId")
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_assignment_payload", "Request payload is invalid")
	}
	if _, err = h.findFlag(r.Context(), actor.organizationID, flagID); err != nil {
		return nil, 0, err
	}
	if _, _, err = h.findOwnedVariant(r.Context(), actor.organizationID, variantID); err != nil {
		return nil, 0, err
	}
	enabled := true
	if raw, ok := fields["enabled"]; ok {
		if err = json.Unmarshal(raw, &enabled); err != nil {
			return nil, 0, workspaceFailure(400, "invalid_assignment_payload", "Request payload is invalid")
		}
	}
	var payload any
	if raw, ok := fields["payload"]; ok {
		if !json.Valid(raw) {
			return nil, 0, workspaceFailure(400, "invalid_assignment_payload", "Request payload is invalid")
		}
		payload = string(raw)
	}
	row := h.workspace.pool.QueryRow(r.Context(), `
		insert into experiment_flag_assignments (flag_id, variant_id, enabled, payload)
		values ($1,$2,$3,$4::jsonb)
		returning id, flag_id, variant_id, enabled, payload, created_at, updated_at`,
		flagID, variantID, enabled, payload)
	assignment, err := scanAssignment(row)
	if isUniqueViolation(err) {
		return nil, 0, workspaceFailure(409, "assignment_exists", "This flag is already attached to the variant")
	}
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"assignment": assignment.public()}, http.StatusCreated, nil
}

func (h *handler) updateHyperlabAssignment(r *http.Request, actor workspaceActor) (any, int, error) {
	assignmentID, err := pathUUID(r, "assignmentId")
	if err != nil {
		return nil, 0, err
	}
	current, err := h.findAssignment(r.Context(), assignmentID)
	if err != nil {
		return nil, 0, err
	}
	if _, err = h.findFlag(r.Context(), actor.organizationID, current.FlagID); err != nil {
		if isNoRows(err) || isWorkspaceCode(err, "flag_not_found") {
			return nil, 0, workspaceFailure(404, "assignment_not_found", "Assignment was not found.")
		}
		return nil, 0, err
	}
	fields, err := readWorkspaceObject(r)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_assignment_payload", "Request payload is invalid")
	}
	update := sqlSet{}
	if raw, ok := fields["enabled"]; ok {
		var enabled bool
		if err = json.Unmarshal(raw, &enabled); err != nil {
			return nil, 0, workspaceFailure(400, "invalid_assignment_payload", "Request payload is invalid")
		}
		update.set("enabled", enabled)
	}
	if raw, ok := fields["payload"]; ok {
		if string(raw) == "null" {
			update.set("payload", nil)
		} else if json.Valid(raw) {
			update.setRaw("payload", string(raw))
		} else {
			return nil, 0, workspaceFailure(400, "invalid_assignment_payload", "Request payload is invalid")
		}
	}
	item := current
	if len(update.sets) > 0 {
		update.set("updated_at", time.Now().UTC())
		query := fmt.Sprintf(`update experiment_flag_assignments set %s where id=$%d returning id, flag_id, variant_id, enabled, payload, created_at, updated_at`, strings.Join(update.sets, ", "), len(update.args)+1)
		item, err = scanAssignment(h.workspace.pool.QueryRow(r.Context(), query, append(update.args, assignmentID)...))
		if err != nil {
			return nil, 0, err
		}
	}
	return map[string]any{"assignment": item.public()}, http.StatusOK, nil
}

func (h *handler) deleteHyperlabAssignment(r *http.Request, actor workspaceActor) (any, int, error) {
	assignmentID, err := pathUUID(r, "assignmentId")
	if err != nil {
		return nil, 0, err
	}
	current, err := h.findAssignment(r.Context(), assignmentID)
	if err != nil {
		return nil, 0, err
	}
	if _, err = h.findFlag(r.Context(), actor.organizationID, current.FlagID); err != nil {
		if isNoRows(err) || isWorkspaceCode(err, "flag_not_found") {
			return nil, 0, workspaceFailure(404, "assignment_not_found", "Assignment was not found.")
		}
		return nil, 0, err
	}
	if _, err = h.workspace.pool.Exec(r.Context(), `delete from experiment_flag_assignments where id=$1`, assignmentID); err != nil {
		return nil, 0, err
	}
	return nil, http.StatusNoContent, nil
}

func (h *handler) listHyperlabKeys(r *http.Request, actor workspaceActor) (any, int, error) {
	rows, err := h.workspace.pool.Query(r.Context(), `
		select id, organization_id, name, key_prefix, last_used_at, revoked_at, created_at
		from experiment_client_keys where organization_id=$1 order by created_at desc`, actor.organizationID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	keys := []any{}
	for rows.Next() {
		item, err := scanClientKey(rows)
		if err != nil {
			return nil, 0, err
		}
		keys = append(keys, item.public())
	}
	return map[string]any{"keys": keys}, http.StatusOK, rows.Err()
}

func (h *handler) createHyperlabKey(r *http.Request, actor workspaceActor) (any, int, error) {
	fields, err := readWorkspaceObject(r)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_client_key_payload", "Request payload is invalid")
	}
	name, err := requiredText(fields, "name", 128)
	if err != nil {
		return nil, 0, workspaceFailure(400, "invalid_client_key_payload", "Request payload is invalid")
	}
	secret, err := newClientKey()
	if err != nil {
		return nil, 0, err
	}
	item, err := scanClientKey(h.workspace.pool.QueryRow(r.Context(), `
		insert into experiment_client_keys (organization_id, name, key_hash, key_prefix, created_by_user_id)
		values ($1,$2,$3,$4,$5)
		returning id, organization_id, name, key_prefix, last_used_at, revoked_at, created_at`,
		actor.organizationID, name, experiment.HashClientKey(secret), secret[:8], actor.userID))
	if err != nil {
		return nil, 0, err
	}
	body := item.public()
	body["secret"] = secret
	return map[string]any{"key": body}, http.StatusCreated, nil
}

func (h *handler) revokeHyperlabKey(r *http.Request, actor workspaceActor) (any, int, error) {
	keyID, err := pathUUID(r, "keyId")
	if err != nil {
		return nil, 0, err
	}
	item, err := scanClientKey(h.workspace.pool.QueryRow(r.Context(), `
		update experiment_client_keys set revoked_at=now(), updated_at=now()
		where id=$1 and organization_id=$2
		returning id, organization_id, name, key_prefix, last_used_at, revoked_at, created_at`,
		keyID, actor.organizationID))
	if isNoRows(err) {
		return nil, 0, workspaceFailure(404, "key_not_found", "Client key was not found.")
	}
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"key": item.public()}, http.StatusOK, nil
}

type hyperlabFlag struct {
	ID, OrganizationID, Key, Kind string
	Description                   *string
	CreatedAt, UpdatedAt          time.Time
}

func (f hyperlabFlag) public() map[string]any {
	return map[string]any{
		"id": f.ID, "organizationId": f.OrganizationID, "key": f.Key, "description": nullableString(f.Description),
		"kind": f.Kind, "createdAt": isoTime(&f.CreatedAt), "updatedAt": isoTime(&f.UpdatedAt),
	}
}

type hyperlabAudience struct {
	ID, OrganizationID, Name string
	Description              *string
	Criterion                json.RawMessage
	CreatedAt, UpdatedAt     time.Time
}

func (a hyperlabAudience) public() map[string]any {
	return map[string]any{
		"id": a.ID, "organizationId": a.OrganizationID, "name": a.Name, "description": nullableString(a.Description),
		"criterion": jsonValue(a.Criterion), "createdAt": isoTime(&a.CreatedAt), "updatedAt": isoTime(&a.UpdatedAt),
	}
}

type hyperlabExperiment struct {
	ID, OrganizationID, Name, Status, Kind, Timezone string
	AudienceID                                       *string
	RolloutPercentage                                int
	StartAt, EndAt, CreatedAt, UpdatedAt             time.Time
	ArchivedAt                                       *time.Time
}

func (e hyperlabExperiment) public() map[string]any {
	return map[string]any{
		"id": e.ID, "organizationId": e.OrganizationID, "name": e.Name, "status": e.Status, "kind": e.Kind,
		"audienceId": nullableString(e.AudienceID), "rolloutPercentage": e.RolloutPercentage,
		"startAt": isoTime(&e.StartAt), "endAt": isoTime(&e.EndAt), "timezone": e.Timezone,
		"archivedAt": isoTime(e.ArchivedAt), "createdAt": isoTime(&e.CreatedAt), "updatedAt": isoTime(&e.UpdatedAt),
	}
}

type hyperlabVariant struct {
	ID, ExperimentID, Key string
	AudienceID            *string
	RolloutPercentage     int
	IsControl             bool
	CreatedAt, UpdatedAt  time.Time
}

func (v hyperlabVariant) public() map[string]any {
	return map[string]any{
		"id": v.ID, "experimentId": v.ExperimentID, "key": v.Key, "audienceId": nullableString(v.AudienceID),
		"rolloutPercentage": v.RolloutPercentage, "isControl": v.IsControl,
		"createdAt": isoTime(&v.CreatedAt), "updatedAt": isoTime(&v.UpdatedAt),
	}
}

type hyperlabAssignment struct {
	ID, FlagID, VariantID string
	Enabled               bool
	Payload               json.RawMessage
	CreatedAt, UpdatedAt  time.Time
}

func (a hyperlabAssignment) public() map[string]any {
	return map[string]any{
		"id": a.ID, "flagId": a.FlagID, "variantId": a.VariantID, "enabled": a.Enabled,
		"payload": jsonValue(a.Payload), "createdAt": isoTime(&a.CreatedAt), "updatedAt": isoTime(&a.UpdatedAt),
	}
}

type hyperlabClientKey struct {
	ID, OrganizationID, Name, KeyPrefix string
	LastUsedAt, RevokedAt               *time.Time
	CreatedAt                           time.Time
}

func (k hyperlabClientKey) public() map[string]any {
	return map[string]any{
		"id": k.ID, "organizationId": k.OrganizationID, "name": k.Name, "keyPrefix": k.KeyPrefix,
		"lastUsedAt": isoTime(k.LastUsedAt), "revokedAt": isoTime(k.RevokedAt), "createdAt": isoTime(&k.CreatedAt),
	}
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanFlag(row rowScanner) (hyperlabFlag, error) {
	var flag hyperlabFlag
	err := row.Scan(&flag.ID, &flag.OrganizationID, &flag.Key, &flag.Description, &flag.Kind, &flag.CreatedAt, &flag.UpdatedAt)
	return flag, err
}

func scanAudience(row rowScanner) (hyperlabAudience, error) {
	var audience hyperlabAudience
	err := row.Scan(&audience.ID, &audience.OrganizationID, &audience.Name, &audience.Description, &audience.Criterion, &audience.CreatedAt, &audience.UpdatedAt)
	return audience, err
}

const experimentColumns = `id, organization_id, name, status, kind, audience_id, rollout_percentage, start_at, end_at, timezone, archived_at, created_at, updated_at`

const experimentSelect = `select ` + experimentColumns + ` from experiments`

func scanExperiment(row rowScanner) (hyperlabExperiment, error) {
	var item hyperlabExperiment
	err := row.Scan(&item.ID, &item.OrganizationID, &item.Name, &item.Status, &item.Kind, &item.AudienceID, &item.RolloutPercentage, &item.StartAt, &item.EndAt, &item.Timezone, &item.ArchivedAt, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}

func scanVariant(row rowScanner) (hyperlabVariant, error) {
	var item hyperlabVariant
	err := row.Scan(&item.ID, &item.ExperimentID, &item.Key, &item.AudienceID, &item.RolloutPercentage, &item.IsControl, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}

func scanAssignment(row rowScanner) (hyperlabAssignment, error) {
	var item hyperlabAssignment
	err := row.Scan(&item.ID, &item.FlagID, &item.VariantID, &item.Enabled, &item.Payload, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}

func scanClientKey(row rowScanner) (hyperlabClientKey, error) {
	var item hyperlabClientKey
	err := row.Scan(&item.ID, &item.OrganizationID, &item.Name, &item.KeyPrefix, &item.LastUsedAt, &item.RevokedAt, &item.CreatedAt)
	return item, err
}

func (h *handler) findFlag(ctx context.Context, organizationID, flagID string) (hyperlabFlag, error) {
	flag, err := scanFlag(h.workspace.pool.QueryRow(ctx, `
		select id, organization_id, key, description, kind, created_at, updated_at
		from experiment_flags where id=$1 and organization_id=$2`, flagID, organizationID))
	if isNoRows(err) {
		return flag, workspaceFailure(404, "flag_not_found", "Flag was not found.")
	}
	return flag, err
}

func (h *handler) findAudience(ctx context.Context, organizationID, audienceID string) (hyperlabAudience, error) {
	audience, err := scanAudience(h.workspace.pool.QueryRow(ctx, `
		select id, organization_id, name, description, criterion, created_at, updated_at
		from experiment_audiences where id=$1 and organization_id=$2`, audienceID, organizationID))
	if isNoRows(err) {
		return audience, workspaceFailure(404, "audience_not_found", "Audience was not found.")
	}
	return audience, err
}

func (h *handler) findExperiment(ctx context.Context, organizationID, experimentID string) (hyperlabExperiment, error) {
	item, err := scanExperiment(h.workspace.pool.QueryRow(ctx, experimentSelect+` where id=$1 and organization_id=$2`, experimentID, organizationID))
	if isNoRows(err) {
		return item, workspaceFailure(404, "experiment_not_found", "Experiment was not found.")
	}
	return item, err
}

func (h *handler) findAssignment(ctx context.Context, assignmentID string) (hyperlabAssignment, error) {
	item, err := scanAssignment(h.workspace.pool.QueryRow(ctx, `
		select id, flag_id, variant_id, enabled, payload, created_at, updated_at
		from experiment_flag_assignments where id=$1`, assignmentID))
	if isNoRows(err) {
		return item, workspaceFailure(404, "assignment_not_found", "Assignment was not found.")
	}
	return item, err
}

func (h *handler) findOwnedVariant(ctx context.Context, organizationID, variantID string) (hyperlabVariant, string, error) {
	item, err := scanVariant(h.workspace.pool.QueryRow(ctx, `
		select v.id, v.experiment_id, v.key, v.audience_id, v.rollout_percentage, v.is_control, v.created_at, v.updated_at
		from experiment_variants v
		join experiments e on e.id = v.experiment_id
		where v.id=$1 and e.organization_id=$2`, variantID, organizationID))
	if isNoRows(err) {
		return item, "", workspaceFailure(404, "variant_not_found", "Variant was not found.")
	}
	return item, item.ExperimentID, err
}

func (h *handler) assertAudience(ctx context.Context, organizationID string, audienceID *string) error {
	if audienceID == nil {
		return nil
	}
	var id string
	err := h.workspace.pool.QueryRow(ctx, `select id from experiment_audiences where id=$1 and organization_id=$2`, *audienceID, organizationID).Scan(&id)
	if isNoRows(err) {
		return workspaceFailure(404, "audience_not_found", "Audience was not found.")
	}
	return err
}

func (h *handler) listVariants(ctx context.Context, experimentID string) ([]hyperlabVariant, error) {
	rows, err := h.workspace.pool.Query(ctx, `
		select id, experiment_id, key, audience_id, rollout_percentage, is_control, created_at, updated_at
		from experiment_variants where experiment_id=$1 order by created_at`, experimentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	variants := []hyperlabVariant{}
	for rows.Next() {
		item, err := scanVariant(rows)
		if err != nil {
			return nil, err
		}
		variants = append(variants, item)
	}
	return variants, rows.Err()
}

func (h *handler) listAllocations(ctx context.Context, variants []hyperlabVariant) ([]any, error) {
	if len(variants) == 0 {
		return []any{}, nil
	}
	ids := make([]string, len(variants))
	for i, variant := range variants {
		ids[i] = variant.ID
	}
	rows, err := h.workspace.pool.Query(ctx, `
		select id, variant_id, start, "end" from experiment_allocations where variant_id = any($1::uuid[])`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	allocations := []any{}
	for rows.Next() {
		var id, variantID string
		var start, end int
		if err := rows.Scan(&id, &variantID, &start, &end); err != nil {
			return nil, err
		}
		allocations = append(allocations, map[string]any{"id": id, "variantId": variantID, "start": start, "end": end})
	}
	return allocations, rows.Err()
}

func publicVariants(variants []hyperlabVariant) []any {
	rows := make([]any, len(variants))
	for i, variant := range variants {
		rows[i] = variant.public()
	}
	return rows
}

func (h *handler) deleteScoped(r *http.Request, actor workspaceActor, param, code, message, query string) (any, int, error) {
	id, err := pathUUID(r, param)
	if err != nil {
		return nil, 0, err
	}
	tag, err := h.workspace.pool.Exec(r.Context(), query, id, actor.organizationID)
	if err != nil {
		return nil, 0, err
	}
	if tag.RowsAffected() == 0 {
		return nil, 0, workspaceFailure(404, code, message)
	}
	return nil, http.StatusNoContent, nil
}

func (h *handler) updateAudience(ctx context.Context, organizationID, audienceID string, update sqlSet) (hyperlabAudience, error) {
	if len(update.sets) == 0 {
		return h.findAudience(ctx, organizationID, audienceID)
	}
	update.set("updated_at", time.Now().UTC())
	args := append(update.args, audienceID, organizationID)
	query := fmt.Sprintf(`update experiment_audiences set %s where id=$%d and organization_id=$%d returning id, organization_id, name, description, criterion, created_at, updated_at`, strings.Join(update.sets, ", "), len(update.args)+1, len(update.args)+2)
	audience, err := scanAudience(h.workspace.pool.QueryRow(ctx, query, args...))
	if isNoRows(err) {
		return audience, workspaceFailure(404, "audience_not_found", "Audience was not found.")
	}
	return audience, err
}

func (h *handler) updateExperiment(ctx context.Context, experimentID string, update sqlSet) (hyperlabExperiment, error) {
	if len(update.sets) == 0 {
		return scanExperiment(h.workspace.pool.QueryRow(ctx, experimentSelect+` where id=$1`, experimentID))
	}
	update.set("updated_at", time.Now().UTC())
	query := fmt.Sprintf(`update experiments set %s where id=$%d returning %s`, strings.Join(update.sets, ", "), len(update.args)+1, experimentColumns)
	return scanExperiment(h.workspace.pool.QueryRow(ctx, query, append(update.args, experimentID)...))
}

type sqlSet struct {
	sets []string
	args []any
}

func (s *sqlSet) set(column string, value any) {
	s.args = append(s.args, value)
	s.sets = append(s.sets, fmt.Sprintf("%s=$%d", column, len(s.args)))
}

func (s *sqlSet) setRaw(column string, value any) {
	s.args = append(s.args, value)
	s.sets = append(s.sets, fmt.Sprintf("%s=$%d::jsonb", column, len(s.args)))
}

type allocationDB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

func recomputeExperimentAllocations(ctx context.Context, db allocationDB, experimentID string) error {
	if _, isTx := db.(pgx.Tx); !isTx {
		if pool, ok := db.(dictionaryPool); ok {
			tx, err := pool.Begin(ctx)
			if err != nil {
				return err
			}
			defer func() { _ = tx.Rollback(ctx) }()
			if err = recomputeExperimentAllocations(ctx, tx, experimentID); err != nil {
				return err
			}
			return tx.Commit(ctx)
		}
	}
	var rollout int
	err := db.QueryRow(ctx, `select rollout_percentage from experiments where id=$1`, experimentID).Scan(&rollout)
	if isNoRows(err) {
		return nil
	}
	if err != nil {
		return err
	}
	rows, err := db.Query(ctx, `select id, rollout_percentage from experiment_variants where experiment_id=$1 order by created_at`, experimentID)
	if err != nil {
		return err
	}
	defer rows.Close()
	ids := []string{}
	percentages := []int{}
	for rows.Next() {
		var id string
		var percentage int
		if err = rows.Scan(&id, &percentage); err != nil {
			return err
		}
		ids = append(ids, id)
		percentages = append(percentages, percentage)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	if len(ids) > 0 {
		if _, err = db.Exec(ctx, `delete from experiment_allocations where variant_id = any($1::uuid[])`, ids); err != nil {
			return err
		}
	}
	for index, rng := range calculateAllocationRanges(rollout, percentages) {
		if rng == nil {
			continue
		}
		if _, err = db.Exec(ctx, `insert into experiment_allocations (variant_id, start, "end") values ($1,$2,$3)`, ids[index], rng[0], rng[1]); err != nil {
			return err
		}
	}
	return nil
}

func calculateAllocationRanges(experimentRollout int, variantRollouts []int) []*[2]int {
	if experimentRollout < 0 {
		experimentRollout = 0
	}
	if experimentRollout > experimentBucketCount {
		experimentRollout = experimentBucketCount
	}
	allocated := experimentRollout * experimentBucketCount / 10000
	ranges := make([]*[2]int, len(variantRollouts))
	start := 0
	for index, percentage := range variantRollouts {
		if percentage == 0 {
			continue
		}
		if percentage < 0 {
			percentage = 0
		}
		if percentage > experimentBucketCount {
			percentage = experimentBucketCount
		}
		variantBuckets := percentage * allocated / 10000
		remaining := allocated - start
		if remaining < 0 {
			remaining = 0
		}
		adjusted := variantBuckets
		if adjusted > remaining {
			adjusted = remaining
		}
		if index == len(variantRollouts)-1 {
			adjusted = remaining
		}
		end := start + adjusted - 1
		if end >= start {
			ranges[index] = &[2]int{start, end}
			start = end + 1
		}
	}
	return ranges
}

type variantRollout struct {
	id         string
	percentage int
}

func parseRollouts(raw json.RawMessage) ([]variantRollout, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	var rows []struct {
		VariantID         string `json:"variantId"`
		RolloutPercentage int    `json:"rolloutPercentage"`
	}
	if err := json.Unmarshal(raw, &rows); err != nil {
		return nil, err
	}
	rollouts := make([]variantRollout, len(rows))
	for i, row := range rows {
		if _, err := uuid.Parse(row.VariantID); err != nil || row.RolloutPercentage < 0 || row.RolloutPercentage > 10000 {
			return nil, errors.New("invalid rollout")
		}
		rollouts[i] = variantRollout{row.VariantID, row.RolloutPercentage}
	}
	return rollouts, nil
}

func rolloutsCover(variants []hyperlabVariant, rollouts []variantRollout) bool {
	if len(variants) != len(rollouts) {
		return false
	}
	seen := map[string]struct{}{}
	for _, rollout := range rollouts {
		seen[rollout.id] = struct{}{}
	}
	if len(seen) != len(rollouts) {
		return false
	}
	for _, variant := range variants {
		if _, ok := seen[variant.ID]; !ok {
			return false
		}
	}
	return true
}

func pathUUID(r *http.Request, name string) (string, error) {
	value := r.PathValue(name)
	if _, err := uuid.Parse(value); err != nil {
		return "", workspaceFailure(404, "not_found", "Not found.")
	}
	return value, nil
}

func requiredFlagKey(fields map[string]json.RawMessage, name string) (string, error) {
	value, err := requiredText(fields, name, 255)
	if err != nil || !experimentFlagKeyPattern.MatchString(value) {
		return "", errors.New("invalid key")
	}
	return value, nil
}

func requiredText(fields map[string]json.RawMessage, name string, max int) (string, error) {
	raw, ok := fields[name]
	if !ok {
		return "", errors.New("missing")
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", err
	}
	value = strings.TrimSpace(value)
	if value == "" || len(value) > max {
		return "", errors.New("invalid text")
	}
	return value, nil
}

func optionalText(fields map[string]json.RawMessage, name string, max int) (*string, error) {
	raw, ok := fields[name]
	if !ok || string(raw) == "null" {
		return nil, nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	value = strings.TrimSpace(value)
	if len(value) > max {
		return nil, errors.New("too long")
	}
	return &value, nil
}

func optionalUUID(fields map[string]json.RawMessage, name string) (*string, error) {
	raw, ok := fields[name]
	if !ok || string(raw) == "null" {
		return nil, nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	if _, err := uuid.Parse(value); err != nil {
		return nil, err
	}
	return &value, nil
}

func requiredUUID(fields map[string]json.RawMessage, name string) (string, error) {
	value, err := optionalUUID(fields, name)
	if err != nil || value == nil {
		return "", errors.New("missing uuid")
	}
	return *value, nil
}

func requiredInt(fields map[string]json.RawMessage, name string, min, max int) (int, error) {
	raw, ok := fields[name]
	if !ok {
		return 0, errors.New("missing")
	}
	var value int
	if err := json.Unmarshal(raw, &value); err != nil || value < min || value > max {
		return 0, errors.New("invalid int")
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	var number json.Number
	if err := decoder.Decode(&number); err != nil {
		return 0, err
	}
	if strings.Contains(number.String(), ".") {
		return 0, errors.New("not an integer")
	}
	return value, nil
}

func requiredTime(raw json.RawMessage) (time.Time, error) {
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return time.Time{}, err
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}, err
	}
	return parsed.UTC(), nil
}

func optionalCriterion(fields map[string]json.RawMessage) (any, error) {
	raw, ok := fields["criterion"]
	if !ok || string(raw) == "null" {
		return nil, nil
	}
	if !validCriterion(raw) {
		return nil, errors.New("invalid criterion")
	}
	return string(raw), nil
}

func validCriterion(raw json.RawMessage) bool {
	var node struct {
		Type     string            `json:"type"`
		Children []json.RawMessage `json:"children"`
		Name     string            `json:"name"`
		Match    string            `json:"match"`
		Value    json.RawMessage   `json:"value"`
	}
	if err := json.Unmarshal(raw, &node); err != nil {
		return false
	}
	switch node.Type {
	case "and", "or", "not":
		if len(node.Children) == 0 {
			return false
		}
		for _, child := range node.Children {
			if !validCriterion(child) {
				return false
			}
		}
		return true
	case "attribute":
		name := strings.TrimSpace(node.Name)
		if name == "" || len(name) > 255 || !validCriterionMatch(node.Match) {
			return false
		}
		return len(node.Value) == 0 || validCriterionValue(node.Value)
	default:
		return false
	}
}

func validCriterionMatch(value string) bool {
	switch value {
	case "exact", "gt", "gte", "lt", "lte", "is_null", "is_not_null", "in", "contains_substring", "contains_any", "contains_substring_any":
		return true
	default:
		return false
	}
}

func validCriterionValue(raw json.RawMessage) bool {
	var text string
	if json.Unmarshal(raw, &text) == nil {
		return true
	}
	var number float64
	if json.Unmarshal(raw, &number) == nil && !strings.Contains(string(raw), "\"") {
		return true
	}
	var flag bool
	if json.Unmarshal(raw, &flag) == nil && (string(raw) == "true" || string(raw) == "false") {
		return true
	}
	var list []string
	return json.Unmarshal(raw, &list) == nil
}

func jsonValue(raw json.RawMessage) any {
	if len(raw) == 0 {
		return nil
	}
	return raw
}

func newExperimentSeed() (int32, error) {
	var buf [4]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return 0, err
	}
	return int32(binary.BigEndian.Uint32(buf[:])), nil
}

func newClientKey() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return "hlk_" + base64.RawURLEncoding.EncodeToString(buf), nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func isWorkspaceCode(err error, code string) bool {
	var failure *workspaceError
	return errors.As(err, &failure) && failure.code == code
}
