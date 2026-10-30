package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
)

// Time people log on tasks: logged, edited and deleted (voided, with the cost it was priced at).

// reportingTimeEntryRow is a time entry as the web app records it in the audit.
type reportingTimeEntryRow struct {
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

const reportingTimeEntryColumns = "id, organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes, note, rate_id, voided, created_at"

func scanReportingTimeEntry(row pgx.Row) (reportingTimeEntryRow, error) {
	var entry reportingTimeEntryRow
	var workDate, created time.Time
	err := row.Scan(&entry.ID, &entry.OrganizationID, &entry.ProjectID, &entry.JobID, &entry.ContributorID, &entry.Step, &entry.TargetLocale,
		&workDate, &entry.Minutes, &entry.Note, &entry.RateID, &entry.Voided, &created)
	entry.WorkDate, entry.CreatedAt = formatReportingTime(workDate), formatReportingTime(created)
	return entry, err
}

type reportingRateRow struct {
	id, basis, rate string
	retired         bool
}

// reportingRateLineFor is a card's line for a language pair and step, as of the time asOf
// reads (now when nil). Rates are versioned rows: a line taken off the card is a newer, retired
// row, so the newest row decides.
func reportingRateLineFor(ctx context.Context, db dictionaryDB, organizationID, name, sourceLocale, targetLocale, step string, asOf *string) (*reportingRateRow, error) {
	var args reportingArgs
	where := fmt.Sprintf("organization_id = %s and name = %s and source_locale = %s and target_locale = %s and step = %s",
		args.add(organizationID), args.add(name), args.add(sourceLocale), args.add(targetLocale), args.add(step))
	if asOf != nil {
		where += " and created_at <= (select priced_at from reporting_task_rates where id = " + args.add(*asOf) + ")"
	}
	var rate reportingRateRow
	err := db.QueryRow(ctx, `select id, basis, rate::text, retired from reporting_rates where `+where+` order by created_at desc, id desc limit 1`, args...).
		Scan(&rate.id, &rate.basis, &rate.rate, &rate.retired)
	if isNoRows(err) || (err == nil && rate.retired) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read rate line: %w", err)
	}
	return &rate, nil
}

// resolveReportingRate is the rate line that prices work: from the task's own rate card, as the
// card was when the task was priced; else from its project budget's card, as it is now. The
// first card found prices every language, so a language it has no line for has no rate. Nil
// when none applies.
func resolveReportingRate(ctx context.Context, db dictionaryDB, organizationID, projectID, jobID, sourceLocale, targetLocale, step string) (*reportingRateRow, error) {
	var taskRateID string
	var cardName *string
	err := db.QueryRow(ctx, `select id, rate_card_name from reporting_task_rates where organization_id = $1 and job_id = $2 and step = $3`, organizationID, jobID, step).Scan(&taskRateID, &cardName)
	if err != nil && !isNoRows(err) {
		return nil, fmt.Errorf("read task pricing: %w", err)
	}
	if err == nil && cardName != nil {
		// Compared in the database: the moment priced keeps its microseconds.
		return reportingRateLineFor(ctx, db, organizationID, *cardName, sourceLocale, targetLocale, step, &taskRateID)
	}
	var budgetCard *string
	err = db.QueryRow(ctx, `select rate_card_name from reporting_budgets where organization_id = $1 and project_id = $2`, organizationID, projectID).Scan(&budgetCard)
	if isNoRows(err) || (err == nil && budgetCard == nil) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read budget: %w", err)
	}
	return reportingRateLineFor(ctx, db, organizationID, *budgetCard, sourceLocale, targetLocale, step, nil)
}

// reportingStartRecording records when Reports started for a workspace, the first time it
// records anything for it: at its earliest record, or now. The earliest records are looked for
// only while the workspace has no start, so the lookup runs once per workspace.
func reportingStartRecording(ctx context.Context, db dictionaryDB, organizationID string) error {
	_, err := db.Exec(ctx, `
        insert into reporting_workspaces (organization_id, started_at)
        select $1, coalesce(least(
            (select min(created_at) from reporting_analyses where organization_id = $1),
            (select min(created_at) from reporting_activity where organization_id = $1),
            (select min(created_at) from reporting_costs where organization_id = $1)
        ), now())
        where not exists (select 1 from reporting_workspaces where organization_id = $1)
        on conflict (organization_id) do nothing`, organizationID)
	if err != nil {
		return fmt.Errorf("start reporting: %w", err)
	}
	return nil
}

// logTime records time on a native task. The time is priced only by an hourly rate; per-unit
// rates price finished work.
func (api *reportingAPI) logTime(r *http.Request, actor reportingActor) (any, int, error) {
	body, err := readReportingBody(r, "invalid_time_entry")
	if err != nil {
		return nil, 0, err
	}
	jobID := body.text("jobId", 1, math.MaxInt)
	step := body.step("step")
	targetLocale := body.text("targetLocale", 2, 35)
	workDate := body.day("workDate")
	minutes := body.integer("minutes", 1, 1440)
	note := body.optionalText("note", 2000)
	if !body.valid {
		return nil, 0, reportingInvalid("invalid_time_entry")
	}
	ctx := r.Context()
	var entry reportingTimeEntryRow
	err = api.write(ctx, func(tx pgx.Tx) error {
		job, err := loadReportingTaskRow(ctx, tx, actor, jobID)
		if err != nil {
			return err
		}
		if job.ProjectID == nil {
			return reportingFailure(404, "job_not_found", "Resource not found")
		}
		var external bool
		if err := tx.QueryRow(ctx, `select exists(select 1 from external_job_details where job_id = $1)`, job.ID).Scan(&external); err != nil {
			return fmt.Errorf("read task source: %w", err)
		}
		if external {
			return reportingFailure(400, "native_job_required", "Request payload is invalid")
		}
		var payload struct {
			SourceLocale *string `json:"sourceLocale"`
		}
		_ = json.Unmarshal(job.Payload, &payload)
		sourceLocale := payload.SourceLocale
		if sourceLocale == nil {
			if err := tx.QueryRow(ctx, `select source_locale from projects where id = $1`, *job.ProjectID).Scan(&sourceLocale); err != nil {
				return fmt.Errorf("read project: %w", err)
			}
		}
		if sourceLocale == nil {
			sourceLocale = new(string)
			*sourceLocale = "en"
		}
		// The task lock comes first, so a rate set while this runs (task pricing, which holds the
		// same lock) cannot slip in between reading the rate and writing the entry.
		if _, err := tx.Exec(ctx, `select id from jobs where id = $1 for update`, job.ID); err != nil {
			return fmt.Errorf("lock task: %w", err)
		}
		rate, err := resolveReportingRate(ctx, tx, actor.organizationID, *job.ProjectID, job.ID, *sourceLocale, targetLocale, step)
		if err != nil {
			return err
		}
		var overrideUSD *string
		if err := tx.QueryRow(ctx, `select override_usd::text from reporting_task_rates where job_id = $1 and step = $2`, job.ID, step).Scan(&overrideUSD); err != nil && !isNoRows(err) {
			return fmt.Errorf("read task pricing: %w", err)
		}
		var rateID *string
		if rate != nil {
			rateID = &rate.id
		}
		if entry, err = scanReportingTimeEntry(tx.QueryRow(ctx, `
            insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes, note, rate_id)
            values ($1, $2, $3, $4, $5, $6, $7::date::timestamp at time zone 'UTC', $8, $9, $10)
            returning `+reportingTimeEntryColumns,
			actor.organizationID, *job.ProjectID, job.ID, actor.userID, step, targetLocale, workDate, minutes, note, rateID)); err != nil {
			return fmt.Errorf("log time: %w", err)
		}
		if (rate == nil || rate.basis == "hour") && overrideUSD == nil {
			var amount *string
			basis := "unpriced"
			if rate != nil {
				cost, err := hourlyCost(rate.rate, minutes)
				if err != nil {
					return err
				}
				text := usdString(cost)
				amount, basis = &text, "rate"
			}
			if _, err := tx.Exec(ctx, `
                insert into reporting_costs (organization_id, project_id, job_id, operation_key, kind, step, time_entry_id, target_locale, rate_id, amount_usd, basis, created_at)
                values ($1, $2, $3, 'time:' || $4::text, 'human', $5, $4::uuid, $6, $7, $8::numeric, $9, $10::date::timestamp at time zone 'UTC')`,
				actor.organizationID, *job.ProjectID, job.ID, entry.ID, step, targetLocale, rateID, amount, basis, workDate); err != nil {
				return fmt.Errorf("price time: %w", err)
			}
		}
		if err := reportingAudit(ctx, tx, actor, entry.ID, "time_created", nil, entry); err != nil {
			return err
		}
		// With the entry, so a failure leaves neither: the web starts Reports after its commit.
		return reportingStartRecording(ctx, tx, actor.organizationID)
	})
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"timeEntry": map[string]string{"id": entry.ID}}, http.StatusCreated, nil
}

// loadReportingTimeEntry reads and locks one of the workspace's time entries in a project the
// viewer can open, so an edit waiting on a delete finds the entry gone instead of rewriting it.
func loadReportingTimeEntry(ctx context.Context, db dictionaryDB, actor reportingActor, id string, includeVoided bool) (reportingTimeEntryRow, error) {
	if !reportingValidText(id) {
		return reportingTimeEntryRow{}, reportingFailure(404, "time_entry_not_found", "Resource not found")
	}
	voided := " and not voided"
	if includeVoided {
		voided = ""
	}
	entry, err := scanReportingTimeEntry(db.QueryRow(ctx, `select `+reportingTimeEntryColumns+` from reporting_time_entries where organization_id = $1 and id::text = $2`+voided+` for update`, actor.organizationID, id))
	if isNoRows(err) {
		return entry, reportingFailure(404, "time_entry_not_found", "Resource not found")
	}
	if err != nil {
		return entry, fmt.Errorf("read time entry: %w", err)
	}
	projectIDs, err := reportingProjectIDs(ctx, db, actor)
	if err != nil {
		return entry, err
	}
	if entry.ProjectID == nil || !slices.Contains(projectIDs, *entry.ProjectID) {
		return entry, reportingFailure(404, "time_entry_not_found", "Resource not found")
	}
	return entry, nil
}

// editTime changes an entry's minutes, day and note; the entry's own cost follows. A
// contributor edits their own time; billing write edits anyone's.
func (api *reportingAPI) editTime(r *http.Request, actor reportingActor) (any, int, error) {
	body, err := readReportingBody(r, "invalid_time_entry")
	if err != nil {
		return nil, 0, err
	}
	minutes := body.integer("minutes", 1, 1440)
	workDate := body.day("workDate")
	note := body.optionalText("note", 2000)
	if !body.valid {
		return nil, 0, reportingInvalid("invalid_time_entry")
	}
	ctx := r.Context()
	var entryID string
	err = api.write(ctx, func(tx pgx.Tx) error {
		entry, err := loadReportingTimeEntry(ctx, tx, actor, r.PathValue("id"), false)
		if err != nil {
			return err
		}
		if !actor.can("jobs:write") || (entry.ContributorID != actor.userID && !actor.can("billing:write")) {
			return reportingForbidden("time_entry_forbidden")
		}
		entryID = entry.ID
		var rate *reportingRateRow
		if entry.RateID != nil {
			var found reportingRateRow
			err := tx.QueryRow(ctx, `select id, basis, rate::text, retired from reporting_rates where id = $1`, *entry.RateID).Scan(&found.id, &found.basis, &found.rate, &found.retired)
			if err != nil && !isNoRows(err) {
				return fmt.Errorf("read rate: %w", err)
			}
			if err == nil {
				rate = &found
			}
		}
		if _, err := tx.Exec(ctx, `update reporting_time_entries set minutes = $2, work_date = $3::date::timestamp at time zone 'UTC', note = coalesce($4, note) where id = $1`,
			entry.ID, minutes, workDate, note); err != nil {
			return fmt.Errorf("edit time: %w", err)
		}
		if rate == nil || rate.basis == "hour" {
			var amount *string
			if rate != nil {
				cost, err := hourlyCost(rate.rate, minutes)
				if err != nil {
					return err
				}
				text := usdString(cost)
				amount = &text
			}
			if _, err := tx.Exec(ctx, `update reporting_costs set amount_usd = $2::numeric, created_at = $3::date::timestamp at time zone 'UTC' where time_entry_id = $1`,
				entry.ID, amount, workDate); err != nil {
				return fmt.Errorf("reprice time: %w", err)
			}
		}
		after := map[string]any{"minutes": minutes, "workDate": workDate}
		if note != nil {
			after["note"] = *note
		}
		return reportingAudit(ctx, tx, actor, entry.ID, "time_updated", entry, after)
	})
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"timeEntry": map[string]string{"id": entryID}}, http.StatusOK, nil
}

// voidTime deletes an entry by voiding it and its cost, so the record stays.
func (api *reportingAPI) voidTime(r *http.Request, actor reportingActor) (any, int, error) {
	ctx := r.Context()
	err := api.write(ctx, func(tx pgx.Tx) error {
		entry, err := loadReportingTimeEntry(ctx, tx, actor, r.PathValue("id"), true)
		if err != nil {
			return err
		}
		if entry.ContributorID != actor.userID && !actor.can("billing:write") {
			return reportingForbidden("time_entry_forbidden")
		}
		if _, err := tx.Exec(ctx, `update reporting_time_entries set voided = true where id = $1`, entry.ID); err != nil {
			return fmt.Errorf("void time: %w", err)
		}
		if _, err := tx.Exec(ctx, `update reporting_costs set voided = true where time_entry_id = $1`, entry.ID); err != nil {
			return fmt.Errorf("void time cost: %w", err)
		}
		return reportingAudit(ctx, tx, actor, entry.ID, "time_voided", entry, nil)
	})
	if err != nil {
		return nil, 0, err
	}
	return nil, http.StatusNoContent, nil
}
