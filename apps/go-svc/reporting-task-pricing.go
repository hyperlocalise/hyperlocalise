package main

import (
	"fmt"
	"math"
	"net/http"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
)

// A task's own pricing for a step: a rate card, a time estimate or a fixed fee. It can change
// only before work on that step starts, so the work already recorded keeps one price.

type reportingTaskRate struct {
	ID               string  `json:"id"`
	OrganizationID   string  `json:"organizationId"`
	JobID            string  `json:"jobId"`
	Step             string  `json:"step"`
	RateCardName     *string `json:"rateCardName"`
	PricedAt         *string `json:"pricedAt"`
	RateID           *string `json:"rateId"`
	EstimatedMinutes *int    `json:"estimatedMinutes"`
	OverrideUSD      *string `json:"overrideUsd"`
	CreatedAt        string  `json:"createdAt"`
}

func (api *reportingAPI) saveTaskRate(r *http.Request, actor reportingActor) (any, int, error) {
	body, err := readReportingBody(r, "invalid_task_rate")
	if err != nil {
		return nil, 0, err
	}
	jobID := body.text("jobId", 1, math.MaxInt)
	step := body.step("step")
	rateCardName := body.nullableTrimmedText("rateCardName", 100)
	estimatedMinutes := body.nullableInteger("estimatedMinutes", 0, 525600)
	overrideUSD := body.nullableUSD("overrideUsd")
	if !body.valid {
		return nil, 0, reportingInvalid("invalid_task_rate")
	}
	ctx := r.Context()
	var saved reportingTaskRate
	err = api.write(ctx, func(tx pgx.Tx) error {
		job, err := loadReportingTaskRow(ctx, tx, actor, jobID)
		if err != nil {
			return err
		}
		if rateCardName != nil {
			exists, err := reportingRateCardExists(ctx, tx, actor.organizationID, *rateCardName)
			if err != nil {
				return err
			}
			if !exists {
				return reportingFailure(400, "rate_card_not_found", "Request payload is invalid")
			}
		}
		var status string
		if err := tx.QueryRow(ctx, `select status from jobs where id = $1 for update`, job.ID).Scan(&status); err != nil {
			return fmt.Errorf("lock task: %w", err)
		}
		locked, err := queryReportingLockedPricingSteps(ctx, tx, actor.organizationID, job.ID, status)
		if err != nil {
			return err
		}
		if slices.Contains(locked, step) {
			return reportingFailure(400, "task_rate_locked", "A task's pricing can only change before work on that step starts.")
		}
		// The task keeps the card's prices as they are now; holding the card's save lock keeps a
		// save in progress from landing on either side of that moment.
		if rateCardName != nil {
			if err := reportingLockRateCard(ctx, tx, actor.organizationID, *rateCardName); err != nil {
				return err
			}
		}
		var pricedAt, created *time.Time
		if err := tx.QueryRow(ctx, `
            insert into reporting_task_rates (organization_id, job_id, step, rate_card_name, estimated_minutes, override_usd, priced_at)
            values ($1, $2, $3, $4, $5, $6::numeric, case when $4::text is null then null else clock_timestamp() end)
            on conflict (organization_id, job_id, step) do update set
                rate_card_name = excluded.rate_card_name, estimated_minutes = excluded.estimated_minutes,
                override_usd = excluded.override_usd, priced_at = excluded.priced_at
            returning id, organization_id, job_id, step, rate_card_name, priced_at, rate_id, estimated_minutes, override_usd::text, created_at`,
			actor.organizationID, job.ID, step, rateCardName, estimatedMinutes, overrideUSD).
			Scan(&saved.ID, &saved.OrganizationID, &saved.JobID, &saved.Step, &saved.RateCardName, &pricedAt, &saved.RateID, &saved.EstimatedMinutes, &saved.OverrideUSD, &created); err != nil {
			return fmt.Errorf("save task pricing: %w", err)
		}
		if pricedAt != nil {
			text := formatReportingTime(*pricedAt)
			saved.PricedAt = &text
		}
		saved.CreatedAt = formatReportingTime(*created)
		return reportingAudit(ctx, tx, actor, saved.ID, "task_rate_saved", nil, saved)
	})
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"taskRate": saved}, http.StatusOK, nil
}
