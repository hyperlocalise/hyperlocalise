package main

import (
	"context"
	"log/slog"
	"math"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
)

// Iris charges AI credit through Autumn and records every charge in usage_events, the ledger
// Reports' AI usage reads. Each row says what the charge was for (a chat turn, a generation, a
// translation), who made it, which model and which Iris thread, and what Autumn actually
// charged. A charge Autumn did not take stays as tracking_failed for reconciliation instead of
// only a log line, and the operation key keeps a re-run job from being charged twice.

const (
	irisSourceChat       = "iris_chat_turn"
	irisSourceTranslate  = "iris_localise_translate"
	irisSourceImage      = "iris_image_generation"
	irisSourceVideo      = "iris_video_generation"
	irisSourceGeneration = "iris_generation"

	irisChargeTimeout = 10 * time.Second
	// A unit-priced charge (images, seconds, minutes) under this much a unit means Autumn
	// priced the units as language-model tokens, which bills almost nothing.
	irisMinUnitChargeUSD = 0.001
	// Characters per token when a turn's usage has to be estimated.
	irisCharsPerToken = 4

	irisThreadIDHeader    = "X-Iris-Thread-Id"
	irisThreadTitleHeader = "X-Iris-Thread-Title"
	irisThreadIDMaxLen    = 128
	irisThreadTitleMaxLen = 200
)

// irisCharge is one debit of the workspace's AI credit.
type irisCharge struct {
	// OperationKey is unique per charge; a second charge with the same key is skipped.
	OperationKey string
	Source       string
	Track        autumn.TrackTokensRequest
	// Units is set when OutputTokens counts images, seconds or minutes rather than tokens.
	Units bool
	// Dimensions are extra details for the ledger row, beside the thread and token counts.
	Dimensions map[string]any
}

// irisThreadFromRequest reads the Iris thread a request belongs to, so a task's chat turns,
// generations and translations can be added up together. The title is percent-encoded so it
// can carry any language in a header.
func irisThreadFromRequest(r *http.Request) (id, title string) {
	id = strings.TrimSpace(r.Header.Get(irisThreadIDHeader))
	if len(id) > irisThreadIDMaxLen {
		id = id[:irisThreadIDMaxLen]
	}
	if id == "" {
		return "", ""
	}
	raw := strings.TrimSpace(r.Header.Get(irisThreadTitleHeader))
	if decoded, err := url.PathUnescape(raw); err == nil {
		raw = decoded
	}
	return id, truncateRunes(strings.TrimSpace(raw), irisThreadTitleMaxLen)
}

// irisEstimatedTokens is a token count from a length in characters, rounded up.
func irisEstimatedTokens(chars int) int {
	if chars <= 0 {
		return 0
	}
	return int(math.Ceil(float64(chars) / irisCharsPerToken))
}

func irisOperationKey(prefix string) string {
	return prefix + ":" + uuid.NewString()
}

// charge records the charge in the ledger, takes it from Autumn, and records what Autumn
// charged. It never fails the caller's request: a failure is left on the row.
func (api *irisGenerationAPI) charge(ctx context.Context, scope irisOrgScope, charge irisCharge) {
	if api.meter == nil || strings.TrimSpace(charge.Track.ModelID) == "" {
		return
	}
	if charge.Track.InputTokens+charge.Track.OutputTokens < 1 {
		return
	}
	chargeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), irisChargeTimeout)
	defer cancel()
	charge.Track.CustomerID = scope.OrganizationID
	charge.Track.FeatureID = autumn.AITokens
	logArgs := []any{"organization_id", scope.OrganizationID, "operation_key", charge.OperationKey, "source", charge.Source, "model", charge.Track.ModelID}

	recorded, err := api.recordCharge(chargeCtx, scope, charge)
	if err != nil {
		// Billing must not stop because the ledger is down; the charge is still taken.
		slog.WarnContext(chargeCtx, "iris_usage_record_failed", append(logArgs, "error", err)...)
	} else if !recorded {
		return
	}

	res, trackErr := api.meter.TrackTokensCharged(chargeCtx, charge.Track)
	if trackErr != nil {
		slog.WarnContext(chargeCtx, "iris_usage_track_failed", append(logArgs, "error", trackErr)...)
	}
	if charge.Units && trackErr == nil && res.Value < irisMinUnitChargeUSD*float64(charge.Track.OutputTokens) {
		slog.WarnContext(chargeCtx, "iris_usage_unit_charge_low",
			append(logArgs, "units", charge.Track.OutputTokens, "charged_usd", res.Value)...)
	}
	if err == nil {
		if err := api.settleCharge(chargeCtx, charge.OperationKey, res.Value, trackErr); err != nil {
			slog.WarnContext(chargeCtx, "iris_usage_settle_failed", append(logArgs, "error", err)...)
		}
	}
}

// recordCharge writes the ledger row as tracking_pending. It returns false when a row with the
// operation key already exists, so the charge was already taken.
func (api *irisGenerationAPI) recordCharge(ctx context.Context, scope irisOrgScope, charge irisCharge) (bool, error) {
	if api.pool == nil {
		return true, nil
	}
	dimensions := map[string]any{}
	for key, value := range charge.Dimensions {
		dimensions[key] = value
	}
	quantity := 0
	if charge.Units {
		dimensions["units"] = charge.Track.OutputTokens
	} else {
		dimensions["input_tokens"] = charge.Track.InputTokens
		dimensions["output_tokens"] = charge.Track.OutputTokens
		quantity = charge.Track.InputTokens + charge.Track.OutputTokens
	}
	if scope.ThreadID != "" {
		dimensions["iris_thread_id"] = scope.ThreadID
		if scope.ThreadTitle != "" {
			dimensions["iris_thread_title"] = scope.ThreadTitle
		}
	}
	var id string
	err := api.pool.QueryRow(ctx, `
        insert into usage_events (organization_id, feature_id, status, operation_key, quantity, model_id,
            credential_source, dimensions, source, actor_user_id)
        values ($1, 'ai_tokens', 'tracking_pending', $2, $3, $4, 'gateway', $5::jsonb, $6, nullif($7, '')::uuid)
        on conflict (operation_key) do nothing
        returning id::text`,
		scope.OrganizationID, charge.OperationKey, quantity, charge.Track.ModelID, string(mustJSON(dimensions)),
		charge.Source, scope.UserID).Scan(&id)
	if isNoRows(err) {
		return false, nil
	}
	return err == nil, err
}

// settleCharge records what Autumn charged, or why it did not.
func (api *irisGenerationAPI) settleCharge(ctx context.Context, operationKey string, chargedUSD float64, trackErr error) error {
	if api.pool == nil {
		return nil
	}
	if trackErr != nil {
		_, err := api.pool.Exec(ctx, `
            update usage_events set status = 'tracking_failed', autumn_track_error = $2, updated_at = now()
            where operation_key = $1`, operationKey, truncate(trackErr.Error(), 500))
		return err
	}
	_, err := api.pool.Exec(ctx, `
        update usage_events set status = 'tracking_succeeded', amount_usd = $2, autumn_tracked_at = now(),
            autumn_track_error = null, updated_at = now()
        where operation_key = $1`, operationKey, chargedUSD)
	return err
}
