package experiment

import (
	"context"
	"encoding/json"
)

type Resolution struct {
	Key          string
	Value        any
	Reason       string
	Variant      string
	Error        string
	ErrorDetails string
}

func evaluateFlags(ctx context.Context, store Store, organizationID string, flags []FlagRecord, targetingKey string, attributes map[string]any) ([]Resolution, error) {
	flagIDs := make([]string, 0, len(flags))
	for _, flag := range flags {
		if flag.Kind != "config" {
			flagIDs = append(flagIDs, flag.ID)
		}
	}

	rows, err := store.LoadEvalRows(ctx, organizationID, flagIDs)
	if err != nil {
		return nil, err
	}
	rowsByFlag := make(map[string][]EvalRow, len(flagIDs))
	for _, row := range rows {
		rowsByFlag[row.FlagID] = append(rowsByFlag[row.FlagID], row)
	}

	resolutions := make([]Resolution, 0, len(flags))
	for _, flag := range flags {
		if flag.Kind == "config" {
			resolutions = append(resolutions, resolveConfig(flag))
			continue
		}
		resolutions = append(resolutions, resolveExperiment(flag, rowsByFlag[flag.ID], targetingKey, attributes))
	}
	return resolutions, nil
}

func resolveConfig(flag FlagRecord) Resolution {
	if len(flag.ConfigValue) == 0 {
		return Resolution{
			Key:          flag.Key,
			Reason:       "ERROR",
			Error:        "GENERAL",
			ErrorDetails: "Config flag has no value",
		}
	}
	var value any
	if err := json.Unmarshal(flag.ConfigValue, &value); err != nil {
		return Resolution{
			Key:          flag.Key,
			Reason:       "ERROR",
			Error:        "PARSE_ERROR",
			ErrorDetails: "Config flag value is not valid JSON",
		}
	}
	return Resolution{Key: flag.Key, Value: value, Reason: "STATIC"}
}

func resolveExperiment(flag FlagRecord, rows []EvalRow, targetingKey string, attributes map[string]any) Resolution {
	for _, row := range rows {
		bucket := calculateBucket(row.ExperimentID, targetingKey, row.Seed)
		if bucket < row.AllocStart || bucket > row.AllocEnd {
			continue
		}
		ok, err := evaluateCriterion(row.Criterion, attributes)
		if err != nil || !ok {
			continue
		}
		if !row.Enabled {
			return Resolution{
				Key:     flag.Key,
				Value:   false,
				Reason:  "DISABLED",
				Variant: row.VariantKey,
			}
		}
		value := any(true)
		if len(row.Payload) > 0 {
			var payload any
			if err := json.Unmarshal(row.Payload, &payload); err == nil {
				value = payload
			}
		}
		reason := "SPLIT"
		if len(row.Criterion) > 0 && string(row.Criterion) != "null" {
			reason = "TARGETING_MATCH"
		}
		return Resolution{
			Key:     flag.Key,
			Value:   value,
			Reason:  reason,
			Variant: row.VariantKey,
		}
	}
	return Resolution{Key: flag.Key, Value: false, Reason: "STATIC"}
}
