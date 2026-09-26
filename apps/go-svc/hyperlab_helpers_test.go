package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/dataforseo"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

func TestHyperlabParseRolloutsAndCover(t *testing.T) {
	validID := uuid.NewString()
	rollouts, err := parseRollouts(json.RawMessage(`[{"variantId":"` + validID + `","rolloutPercentage":5000}]`))
	require.NoError(t, err)
	require.Len(t, rollouts, 1)

	_, err = parseRollouts(json.RawMessage(`[{"variantId":"bad","rolloutPercentage":5000}]`))
	require.Error(t, err)

	variants := []hyperlabVariant{{ID: validID}, {ID: uuid.NewString()}}
	require.True(t, rolloutsCover(variants, []variantRollout{{id: validID, percentage: 1}, {id: variants[1].ID, percentage: 2}}))
	require.False(t, rolloutsCover(variants, []variantRollout{{id: validID, percentage: 1}}))
}

func TestHyperlabCriterionAndFields(t *testing.T) {
	require.True(t, validCriterion(json.RawMessage(`{"type":"and","children":[{"type":"attribute","name":"country","match":"exact","value":"US"}]}`)))
	require.False(t, validCriterion(json.RawMessage(`{"type":"attribute","name":"","match":"exact","value":"US"}`)))
	require.True(t, validCriterionMatch("contains_substring"))
	require.False(t, validCriterionMatch("unknown"))

	fields := map[string]json.RawMessage{
		"key":         json.RawMessage(`"checkout.enabled"`),
		"name":        json.RawMessage(`"Audience"`),
		"description": json.RawMessage(`null`),
		"audienceId":  json.RawMessage(`"` + uuid.NewString() + `"`),
		"rollout":     json.RawMessage(`5000`),
		"startAt":     json.RawMessage(`"` + time.Now().UTC().Format(time.RFC3339Nano) + `"`),
	}
	key, err := requiredFlagKey(fields, "key")
	require.NoError(t, err)
	require.Equal(t, "checkout.enabled", key)
	_, err = requiredFlagKey(map[string]json.RawMessage{"key": json.RawMessage(`"Bad Key"`)}, "key")
	require.Error(t, err)

	name, err := requiredText(fields, "name", 255)
	require.NoError(t, err)
	require.Equal(t, "Audience", name)

	desc, err := optionalText(fields, "description", 2000)
	require.NoError(t, err)
	require.Nil(t, desc)

	id, requireErr := requiredUUID(fields, "audienceId")
	require.NoError(t, requireErr)
	require.NotEmpty(t, id)

	rollout, intErr := requiredInt(fields, "rollout", 0, 10000)
	require.NoError(t, intErr)
	require.Equal(t, 5000, rollout)

	_, err = requiredInt(map[string]json.RawMessage{"rollout": json.RawMessage(`5000.5`)}, "rollout", 0, 10000)
	require.Error(t, err)

	_, err = optionalCriterion(map[string]json.RawMessage{"criterion": json.RawMessage(`{"type":"or","children":[]}`)})
	require.Error(t, err)

	require.Nil(t, jsonValue(nil))
	require.NotNil(t, jsonValue(json.RawMessage(`{"enabled":true}`)))
}

func TestHyperlabPathUUIDAndErrors(t *testing.T) {
	id := uuid.NewString()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.SetPathValue("flagId", id)
	got, err := pathUUID(req, "flagId")
	require.NoError(t, err)
	require.Equal(t, id, got)

	req.SetPathValue("flagId", "not-uuid")
	_, err = pathUUID(req, "flagId")
	require.Error(t, err)
	var failure *workspaceError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, http.StatusNotFound, failure.status)

	pgErr := &pgconn.PgError{Code: "23505"}
	require.True(t, isUniqueViolation(pgErr))
	require.False(t, isUniqueViolation(errors.New("other")))

	wsErr := workspaceFailure(404, "flag_not_found", "missing")
	require.True(t, isWorkspaceCode(wsErr, "flag_not_found"))
	require.False(t, isWorkspaceCode(wsErr, "other"))
}

func TestHyperlabPublicSnapshots(t *testing.T) {
	now := time.Now().UTC()
	desc := "desc"
	audienceID := uuid.NewString()
	flag := hyperlabFlag{ID: uuid.NewString(), OrganizationID: "org", Key: "flag", Description: &desc, Kind: "config", CreatedAt: now, UpdatedAt: now}
	require.Equal(t, "flag", flag.public()["key"])

	audience := hyperlabAudience{ID: uuid.NewString(), OrganizationID: "org", Name: "All", Criterion: json.RawMessage(`{"type":"and","children":[]}`), CreatedAt: now, UpdatedAt: now}
	require.Equal(t, "All", audience.public()["name"])

	experiment := hyperlabExperiment{ID: uuid.NewString(), OrganizationID: "org", Name: "Checkout", Status: "draft", Kind: "ab", AudienceID: &audienceID, RolloutPercentage: 10000, StartAt: now, EndAt: now.Add(time.Hour), Timezone: "UTC", CreatedAt: now, UpdatedAt: now}
	require.Equal(t, "ab", experiment.public()["kind"])

	variant := hyperlabVariant{ID: uuid.NewString(), ExperimentID: experiment.ID, Key: "control", RolloutPercentage: 10000, IsControl: true, CreatedAt: now, UpdatedAt: now}
	require.True(t, variant.public()["isControl"].(bool))

	assignment := hyperlabAssignment{ID: uuid.NewString(), FlagID: flag.ID, VariantID: variant.ID, Enabled: true, Payload: json.RawMessage(`{"on":true}`), CreatedAt: now, UpdatedAt: now}
	require.True(t, assignment.public()["enabled"].(bool))

	key := hyperlabClientKey{ID: uuid.NewString(), OrganizationID: "org", Name: "SDK", KeyPrefix: "hlk_abcd", CreatedAt: now}
	require.Equal(t, "SDK", key.public()["name"])
}

func TestCalculateAllocationRangesEdgeCases(t *testing.T) {
	negative := calculateAllocationRanges(-1, []int{10000})
	require.Nil(t, negative[0])

	clamped := calculateAllocationRanges(20000, []int{5000, 5000})
	require.Equal(t, &[2]int{0, 4999}, clamped[0])
	require.Equal(t, &[2]int{5000, 9999}, clamped[1])

	percentClamp := calculateAllocationRanges(10000, []int{0, 10000})
	require.Nil(t, percentClamp[0])
	require.Equal(t, &[2]int{0, 9999}, percentClamp[1])
}

func TestResearchProviderErrorMapping(t *testing.T) {
	rateLimited := researchProviderError(&dataforseo.Error{Code: dataforseo.ErrorCodeRateLimited, Message: "slow down"})
	var failure *workspaceError
	require.ErrorAs(t, rateLimited, &failure)
	require.Equal(t, http.StatusTooManyRequests, failure.status)
	require.Equal(t, "provider_rate_limited", failure.code)

	validation := researchProviderError(&dataforseo.Error{Code: dataforseo.ErrorCodeValidation, Message: ""})
	require.ErrorAs(t, validation, &failure)
	require.Equal(t, "provider_validation_failed", failure.code)

	generic := researchProviderError(errors.New("network"))
	require.ErrorAs(t, generic, &failure)
	require.Equal(t, http.StatusServiceUnavailable, failure.status)
	require.Equal(t, "provider_unavailable", failure.code)
}

func TestNewExperimentSeedAndClientKey(t *testing.T) {
	seed, err := newExperimentSeed()
	require.NoError(t, err)
	require.NotZero(t, seed)

	secret, err := newClientKey()
	require.NoError(t, err)
	require.Contains(t, secret, "hlk_")
}
