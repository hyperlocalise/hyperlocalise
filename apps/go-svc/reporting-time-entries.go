package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
)

type reportingTimeEntryRecord struct {
	ID             string  `json:"id"`
	OrganizationID string  `json:"organizationId"`
	ProjectID      *string `json:"projectId"`
	JobID          *string `json:"jobId"`
	ContributorID  string  `json:"contributorId"`
	Step           string  `json:"step"`
	TargetLocale   string  `json:"targetLocale"`
	WorkDate       string  `json:"workDate"`
	Minutes        int     `json:"minutes"`
	Note           *string `json:"note"`
	RateID         *string `json:"rateId"`
	Voided         bool    `json:"voided"`
	CreatedAt      string  `json:"createdAt"`
}

const reportingTimeEntryColumns = `id, organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes, note, rate_id, voided, created_at`

func scanReportingTimeEntry(row pgx.Row) (reportingTimeEntryRecord, error) {
	var entry reportingTimeEntryRecord
	var workDate, created time.Time
	err := row.Scan(&entry.ID, &entry.OrganizationID, &entry.ProjectID, &entry.JobID, &entry.ContributorID, &entry.Step,
		&entry.TargetLocale, &workDate, &entry.Minutes, &entry.Note, &entry.RateID, &entry.Voided, &created)
	entry.WorkDate = formatReportingTime(workDate)
	entry.CreatedAt = formatReportingTime(created)
	return entry, err
}

func resolveReportingRate(ctx context.Context, db dictionaryDB, organizationID, projectID, jobID, sourceLocale, targetLocale, step string) (*reportingRate, error) {
	var overrideRateID *string
	err := db.QueryRow(ctx, `select rate_id from reporting_task_rates where organization_id=$1 and job_id=$2 and step=$3`,
		organizationID, jobID, step).Scan(&overrideRateID)
	if err != nil && !isNoRows(err) {
		return nil, fmt.Errorf("load task rate override: %w", err)
	}
	if overrideRateID != nil {
		return optionalReportingRate(db.QueryRow(ctx, `select `+reportingRateColumns+` from reporting_rates where id=$1 and organization_id=$2`,
			*overrideRateID, organizationID))
	}
	var rateCardName *string
	err = db.QueryRow(ctx, `select rate_card_name from reporting_budgets where organization_id=$1 and project_id=$2`,
		organizationID, projectID).Scan(&rateCardName)
	if err != nil && !isNoRows(err) {
		return nil, fmt.Errorf("load budget rate card: %w", err)
	}
	if rateCardName == nil || *rateCardName == "" {
		return nil, nil
	}
	return optionalReportingRate(db.QueryRow(ctx, `
        select `+reportingRateColumns+` from reporting_rates
        where organization_id=$1 and name=$2 and source_locale=$3 and target_locale=$4 and step=$5
        order by created_at desc, id desc limit 1`,
		organizationID, *rateCardName, sourceLocale, targetLocale, step))
}

func optionalReportingRate(row pgx.Row) (*reportingRate, error) {
	rate, err := scanReportingRate(row)
	if isNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load reporting rate: %w", err)
	}
	return &rate, nil
}

func reportingStart(ctx context.Context, db dictionaryDB) (time.Time, error) {
	var startedAt time.Time
	if _, err := db.Exec(ctx, `insert into reporting_rollout (id) values (1) on conflict do nothing`); err != nil {
		return startedAt, fmt.Errorf("start reporting rollout: %w", err)
	}
	if err := db.QueryRow(ctx, `select started_at from reporting_rollout limit 1`).Scan(&startedAt); err != nil {
		return startedAt, fmt.Errorf("load reporting rollout: %w", err)
	}
	return startedAt, nil
}

func reportingTimeCost(rate *reportingRate, minutes int) (*string, error) {
	if rate == nil {
		return nil, nil
	}
	cost, err := hourlyCost(rate.Rate, minutes)
	if err != nil {
		return nil, err
	}
	amount := usdString(cost)
	return &amount, nil
}

func insertReportingAudit(ctx context.Context, tx pgx.Tx, actor workspaceActor, resourceID, action string, before, after any) error {
	encode := func(value any) (*string, error) {
		if value == nil {
			return nil, nil
		}
		encoded, err := json.Marshal(value)
		if err != nil {
			return nil, err
		}
		text := string(encoded)
		return &text, nil
	}
	beforeJSON, err := encode(before)
	if err != nil {
		return err
	}
	afterJSON, err := encode(after)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
        insert into reporting_audit (organization_id, actor_id, resource_id, action, before, after)
        values ($1, $2, $3, $4, $5::text::jsonb, $6::text::jsonb)`,
		actor.organizationID, actor.userID, resourceID, action, beforeJSON, afterJSON); err != nil {
		return fmt.Errorf("insert reporting audit: %w", err)
	}
	return nil
}

func (h *handler) createTimeEntry(r *http.Request, actor workspaceActor) (any, int, error) {
	if !hasOrganizationCapability(actor.role, "jobs:write") {
		return nil, 0, reportingForbidden("time_entry_forbidden")
	}
	body, err := readReportingBody(r, "invalid_time_entry")
	if err != nil {
		return nil, 0, err
	}
	jobID := body.text("jobId", 1, math.MaxInt)
	step := body.step("step")
	targetLocale := body.text("targetLocale", 2, 35)
	day := body.day("workDate")
	minutes := body.integer("minutes", 1, 1440)
	note := body.optionalText("note", 2000)
	if !body.valid {
		return nil, 0, reportingInvalid("invalid_time_entry")
	}
	workDate, err := time.Parse(time.DateOnly, day)
	if err != nil {
		return nil, 0, reportingInvalid("invalid_time_entry")
	}
	ctx, pool := r.Context(), h.workspace.pool
	job, err := loadReportingJob(ctx, pool, actor, jobID)
	if isNoRows(err) || (err == nil && job.ProjectID == nil) {
		return nil, 0, reportingNotFound("job_not_found")
	}
	if err != nil {
		return nil, 0, err
	}
	var external bool
	if err := pool.QueryRow(ctx, `select exists(select 1 from external_job_details where job_id=$1)`, job.ID).Scan(&external); err != nil {
		return nil, 0, fmt.Errorf("check external job: %w", err)
	}
	if external {
		return nil, 0, workspaceFailure(400, "native_job_required", "Time can only be logged on native jobs")
	}
	var payloadType string
	var payloadLocale, projectLocale *string
	if err := pool.QueryRow(ctx, `
        select jsonb_typeof(j.input_payload), j.input_payload->>'sourceLocale', p.source_locale
        from jobs j join projects p on p.id = j.project_id where j.id=$1`, job.ID,
	).Scan(&payloadType, &payloadLocale, &projectLocale); err != nil {
		return nil, 0, fmt.Errorf("load time entry locales: %w", err)
	}
	if payloadType == "null" {
		return nil, 0, errors.New("time entry job payload is null")
	}
	sourceLocale := "en"
	if payloadLocale != nil {
		sourceLocale = *payloadLocale
	} else if projectLocale != nil {
		sourceLocale = *projectLocale
	}
	rate, err := resolveReportingRate(ctx, pool, actor.organizationID, *job.ProjectID, job.ID, sourceLocale, targetLocale, step)
	if err != nil {
		return nil, 0, err
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `select id from jobs where id=$1 for update`, job.ID); err != nil {
		return nil, 0, fmt.Errorf("lock time entry job: %w", err)
	}
	var overrideUSD *string
	err = tx.QueryRow(ctx, `select override_usd::text from reporting_task_rates where job_id=$1 and step=$2`, job.ID, step).Scan(&overrideUSD)
	if err != nil && !isNoRows(err) {
		return nil, 0, fmt.Errorf("load time entry task rate: %w", err)
	}
	var rateID *string
	if rate != nil {
		rateID = &rate.ID
	}
	entry, err := scanReportingTimeEntry(tx.QueryRow(ctx, `
        insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes, note, rate_id)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        returning `+reportingTimeEntryColumns,
		actor.organizationID, *job.ProjectID, job.ID, actor.userID, step, targetLocale, workDate, minutes, note, rateID))
	if err != nil {
		return nil, 0, fmt.Errorf("insert time entry: %w", err)
	}
	if (rate == nil || rate.Basis != "word") && overrideUSD == nil {
		amount, err := reportingTimeCost(rate, entry.Minutes)
		if err != nil {
			return nil, 0, err
		}
		basis := "unpriced"
		if rate != nil {
			basis = "rate"
		}
		if _, err := tx.Exec(ctx, `
            insert into reporting_costs (organization_id, project_id, job_id, operation_key, kind, step, time_entry_id, target_locale, rate_id, amount_usd, basis, created_at)
            values ($1, $2, $3, $4, 'human', $5, $6, $7, $8, $9::text::numeric, $10, $11)`,
			actor.organizationID, *job.ProjectID, job.ID, "time:"+entry.ID, entry.Step, entry.ID, entry.TargetLocale, rateID, amount, basis, workDate); err != nil {
			return nil, 0, fmt.Errorf("insert time cost: %w", err)
		}
	}
	if err := insertReportingAudit(ctx, tx, actor, entry.ID, "time_created", nil, entry); err != nil {
		return nil, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	if _, err := reportingStart(ctx, pool); err != nil {
		return nil, 0, err
	}
	return map[string]any{"timeEntry": map[string]string{"id": entry.ID}}, http.StatusCreated, nil
}

func (h *handler) loadEditableTimeEntry(ctx context.Context, actor workspaceActor, id string, includeVoided bool) (reportingTimeEntryRecord, error) {
	db := h.workspace.pool
	entry, err := scanReportingTimeEntry(db.QueryRow(ctx, `
        select `+reportingTimeEntryColumns+` from reporting_time_entries
        where organization_id=$1 and id=$2 and ($3::boolean or voided=false)`,
		actor.organizationID, id, includeVoided))
	if isNoRows(err) {
		return entry, reportingNotFound("time_entry_not_found")
	}
	if err != nil {
		return entry, fmt.Errorf("load time entry: %w", err)
	}
	if entry.ProjectID == nil {
		return entry, reportingNotFound("time_entry_not_found")
	}
	projectIDs, err := reportingProjectIDs(ctx, db, actor)
	if err != nil {
		return entry, err
	}
	if !slices.Contains(projectIDs, *entry.ProjectID) {
		return entry, reportingNotFound("time_entry_not_found")
	}
	return entry, nil
}

func (h *handler) updateTimeEntry(r *http.Request, actor workspaceActor) (any, int, error) {
	body, err := readReportingBody(r, "invalid_time_entry")
	if err != nil {
		return nil, 0, err
	}
	minutes := body.integer("minutes", 1, 1440)
	day := body.day("workDate")
	note := body.optionalText("note", 2000)
	if !body.valid {
		return nil, 0, reportingInvalid("invalid_time_entry")
	}
	workDate, err := time.Parse(time.DateOnly, day)
	if err != nil {
		return nil, 0, reportingInvalid("invalid_time_entry")
	}
	ctx := r.Context()
	entry, err := h.loadEditableTimeEntry(ctx, actor, r.PathValue("id"), false)
	if err != nil {
		return nil, 0, err
	}
	if !hasOrganizationCapability(actor.role, "jobs:write") ||
		(entry.ContributorID != actor.userID && !hasOrganizationCapability(actor.role, "billing:write")) {
		return nil, 0, reportingForbidden("time_entry_forbidden")
	}

	tx, err := h.workspace.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var rate *reportingRate
	if entry.RateID != nil {
		if rate, err = optionalReportingRate(tx.QueryRow(ctx, `select `+reportingRateColumns+` from reporting_rates where id=$1`, *entry.RateID)); err != nil {
			return nil, 0, err
		}
	}
	if _, err := tx.Exec(ctx, `
        update reporting_time_entries set minutes=$2, work_date=$3, note=case when $4::boolean then $5 else note end
        where id=$1`, entry.ID, minutes, workDate, note != nil, note); err != nil {
		return nil, 0, fmt.Errorf("update time entry: %w", err)
	}
	if rate == nil || rate.Basis != "word" {
		amount, err := reportingTimeCost(rate, minutes)
		if err != nil {
			return nil, 0, err
		}
		if _, err := tx.Exec(ctx, `update reporting_costs set amount_usd=$2::text::numeric, created_at=$3 where time_entry_id=$1`,
			entry.ID, amount, workDate); err != nil {
			return nil, 0, fmt.Errorf("update time cost: %w", err)
		}
	}
	after := map[string]any{"minutes": minutes, "workDate": day}
	if note != nil {
		after["note"] = *note
	}
	if err := insertReportingAudit(ctx, tx, actor, entry.ID, "time_updated", entry, after); err != nil {
		return nil, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	return map[string]any{"timeEntry": map[string]string{"id": entry.ID}}, http.StatusOK, nil
}

func (h *handler) deleteTimeEntry(r *http.Request, actor workspaceActor) (any, int, error) {
	ctx := r.Context()
	entry, err := h.loadEditableTimeEntry(ctx, actor, r.PathValue("id"), true)
	if err != nil {
		return nil, 0, err
	}
	if entry.ContributorID != actor.userID && !hasOrganizationCapability(actor.role, "billing:write") {
		return nil, 0, reportingForbidden("time_entry_forbidden")
	}
	tx, err := h.workspace.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `update reporting_time_entries set voided=true where id=$1`, entry.ID); err != nil {
		return nil, 0, fmt.Errorf("void time entry: %w", err)
	}
	if _, err := tx.Exec(ctx, `update reporting_costs set voided=true where time_entry_id=$1`, entry.ID); err != nil {
		return nil, 0, fmt.Errorf("void time cost: %w", err)
	}
	if err := insertReportingAudit(ctx, tx, actor, entry.ID, "time_voided", entry, nil); err != nil {
		return nil, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	return nil, http.StatusNoContent, nil
}
