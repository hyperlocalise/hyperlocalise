package aisdk

import (
	"encoding/json"
	"math"
	"reflect"
	"strconv"
)

const probabilityTolerance = 1e-6

func validateEvaluateInput(state any, questions map[string]Question) error {
	if !isInput(state) {
		return invalidArgument("state must be a JSON-compatible string, object, or array")
	}
	if len(questions) == 0 {
		return invalidArgument("questions must be a nonempty question map")
	}

	for id, question := range questions {
		if !isInput(question.Instructions) {
			return invalidArgument("questions." + id + ": instructions must be a JSON-compatible string, object, or array")
		}
		switch question.Type {
		case QuestionChoice:
			criteria, ok := asStringMap(question.Criteria)
			if !ok || len(criteria) == 0 {
				return invalidArgument("questions." + id + ": choice criteria must be a nonempty option map")
			}
			if err := validateCriteriaValues(id, criteria); err != nil {
				return err
			}
		case QuestionScore:
			levels, ok := asList(question.Criteria)
			if !ok || len(levels) < 2 {
				return invalidArgument("questions." + id + ": score criteria must contain at least two ordered levels")
			}
			if err := validateCriteriaValues(id, levels); err != nil {
				return err
			}
		case QuestionBoolean:
			if question.Criteria == nil {
				continue
			}
			criteria, ok := asStringMap(question.Criteria)
			if !ok {
				return invalidArgument("questions." + id + ": boolean criteria may only describe true and false")
			}
			for key := range criteria {
				if key != "true" && key != "false" {
					return invalidArgument("questions." + id + ": boolean criteria may only describe true and false")
				}
			}
			if err := validateCriteriaValues(id, criteria); err != nil {
				return err
			}
		default:
			return invalidArgument("questions." + id + ": question type must be choice, score, or boolean")
		}
	}
	return nil
}

func validateCriteriaValues(id string, values any) error {
	items, ok := asList(values)
	if !ok {
		if record, ok := asStringMap(values); ok {
			items = make([]any, 0, len(record))
			for _, value := range record {
				items = append(items, value)
			}
		} else {
			return invalidArgument("questions." + id + ": criteria descriptions must be JSON-compatible strings, objects, arrays, or null")
		}
	}
	for _, value := range items {
		if value != nil && !isInput(value) {
			return invalidArgument("questions." + id + ": criteria descriptions must be JSON-compatible strings, objects, arrays, or null")
		}
	}
	return nil
}

func validateEvaluateAnswers(questions map[string]Question, answers map[string]Answer, rounding *Rounding) error {
	probabilityError, err := roundingError(rounding, true)
	if err != nil {
		return err
	}
	scoreError, err := roundingError(rounding, false)
	if err != nil {
		return err
	}

	if len(answers) != len(questions) {
		return invalidResponse("evaluation must return exactly one answer for every question")
	}
	for id := range questions {
		if _, ok := answers[id]; !ok {
			return invalidResponse("evaluation must return exactly one answer for every question")
		}
	}

	for id, question := range questions {
		answer := answers[id]
		if answer.Type != question.Type {
			return invalidResponse(`question "` + id + `" returned an answer with the wrong type`)
		}
		switch question.Type {
		case QuestionChoice:
			criteria, _ := asStringMap(question.Criteria)
			if answer.Choice == "" {
				return invalidResponse(`question "` + id + `" selected an unknown option`)
			}
			if _, ok := criteria[answer.Choice]; !ok {
				return invalidResponse(`question "` + id + `" selected an unknown option`)
			}
			if answer.Probabilities != nil {
				if err := validateDistribution(id, answer.Probabilities, mapKeys(criteria), probabilityError); err != nil {
					return err
				}
				selected := answer.Probabilities[answer.Choice]
				for _, probability := range answer.Probabilities {
					if probability > selected+probabilityTolerance {
						return invalidResponse(`question "` + id + `" did not select a highest-probability option`)
					}
				}
			}
		case QuestionScore:
			if answer.Score == nil || !isFinite(*answer.Score) {
				return invalidResponse(`question "` + id + `" score must be in [0, n-1]`)
			}
			levels, _ := asList(question.Criteria)
			maxScore := float64(len(levels) - 1)
			if *answer.Score < 0 || *answer.Score > maxScore {
				return invalidResponse(`question "` + id + `" score must be in [0, n-1]`)
			}
			if answer.Probabilities != nil {
				keys := make([]string, len(levels))
				for i := range levels {
					keys[i] = strconv.Itoa(i)
				}
				if err := validateDistribution(id, answer.Probabilities, keys, probabilityError); err != nil {
					return err
				}
				mean := 0.0
				meanRoundingError := 0.0
				for i := range levels {
					key := strconv.Itoa(i)
					mean += float64(i) * answer.Probabilities[key]
					meanRoundingError += float64(i) * probabilityError
				}
				if math.Abs(mean-*answer.Score) > probabilityTolerance+meanRoundingError+scoreError {
					return invalidResponse(`question "` + id + `" score must equal the probability-weighted mean within the declared rounding precision`)
				}
			}
		case QuestionBoolean:
			if answer.Probability == nil || !isProbability(*answer.Probability) {
				return invalidResponse(`question "` + id + `" must return P(true) as a finite probability in [0, 1]`)
			}
		}
	}
	return nil
}

func validateDistribution(id string, value map[string]float64, keys []string, roundingError float64) error {
	if len(value) != len(keys) {
		return invalidResponse(`question "` + id + `" must have a complete distribution of finite probabilities in [0, 1]`)
	}
	sum := 0.0
	for _, key := range keys {
		probability, ok := value[key]
		if !ok || !isProbability(probability) {
			return invalidResponse(`question "` + id + `" must have a complete distribution of finite probabilities in [0, 1]`)
		}
		sum += probability
	}
	if math.Abs(sum-1) > probabilityTolerance+float64(len(keys))*roundingError {
		return invalidResponse(`question "` + id + `" probabilities must sum to 1 within the declared rounding precision`)
	}
	return nil
}

func roundingError(rounding *Rounding, probability bool) (float64, error) {
	if rounding == nil {
		return 0, nil
	}
	var decimals *int
	if probability {
		decimals = rounding.ProbabilityDecimals
	} else {
		decimals = rounding.ScoreDecimals
	}
	if decimals == nil {
		return 0, nil
	}
	if *decimals < 0 || *decimals > 15 {
		return 0, invalidResponse("evaluation rounding decimals must be integers between 0 and 15")
	}
	return 0.5 * math.Pow10(-*decimals), nil
}

func isInput(value any) bool {
	if value == nil {
		return false
	}
	switch value.(type) {
	case string:
		return isJSON(value)
	default:
		if _, ok := asStringMap(value); ok {
			return isJSON(value)
		}
		if _, ok := asList(value); ok {
			return isJSON(value)
		}
		return false
	}
}

func isJSON(value any) bool {
	switch v := value.(type) {
	case nil, string, bool:
		return true
	case json.Number:
		_, err := v.Float64()
		return err == nil
	case float32:
		return isFinite(float64(v))
	case float64:
		return isFinite(v)
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return true
	case []any:
		for _, item := range v {
			if !isJSON(item) {
				return false
			}
		}
		return true
	case map[string]any:
		for _, item := range v {
			if !isJSON(item) {
				return false
			}
		}
		return true
	default:
		rv := reflect.ValueOf(value)
		switch rv.Kind() {
		case reflect.Slice, reflect.Array:
			for i := range rv.Len() {
				if !isJSON(rv.Index(i).Interface()) {
					return false
				}
			}
			return true
		case reflect.Map:
			if rv.Type().Key().Kind() != reflect.String {
				return false
			}
			for _, key := range rv.MapKeys() {
				if !isJSON(rv.MapIndex(key).Interface()) {
					return false
				}
			}
			return true
		case reflect.Pointer, reflect.Interface:
			if rv.IsNil() {
				return true
			}
			return isJSON(rv.Elem().Interface())
		case reflect.Struct:
			encoded, err := json.Marshal(value)
			if err != nil {
				return false
			}
			var decoded any
			if err := json.Unmarshal(encoded, &decoded); err != nil {
				return false
			}
			return isJSON(decoded)
		default:
			return false
		}
	}
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func isProbability(value float64) bool {
	return isFinite(value) && value >= 0 && value <= 1
}

func asStringMap(value any) (map[string]any, bool) {
	if value == nil {
		return nil, false
	}
	switch typed := value.(type) {
	case map[string]any:
		return typed, true
	case map[string]string:
		out := make(map[string]any, len(typed))
		for key, item := range typed {
			out[key] = item
		}
		return out, true
	case *BooleanCriteria:
		if typed == nil {
			return nil, false
		}
		out := map[string]any{}
		if typed.True != nil {
			out["true"] = typed.True
		}
		if typed.False != nil {
			out["false"] = typed.False
		}
		return out, true
	case BooleanCriteria:
		return asStringMap(&typed)
	default:
		rv := reflect.ValueOf(value)
		if rv.Kind() == reflect.Pointer && !rv.IsNil() {
			return asStringMap(rv.Elem().Interface())
		}
		if rv.Kind() != reflect.Map || rv.Type().Key().Kind() != reflect.String {
			return nil, false
		}
		out := make(map[string]any, rv.Len())
		for _, key := range rv.MapKeys() {
			out[key.String()] = rv.MapIndex(key).Interface()
		}
		return out, true
	}
}

func asList(value any) ([]any, bool) {
	if value == nil {
		return nil, false
	}
	switch typed := value.(type) {
	case []any:
		return typed, true
	case []string:
		out := make([]any, len(typed))
		for i, item := range typed {
			out[i] = item
		}
		return out, true
	default:
		rv := reflect.ValueOf(value)
		if rv.Kind() != reflect.Slice && rv.Kind() != reflect.Array {
			return nil, false
		}
		out := make([]any, rv.Len())
		for i := range rv.Len() {
			out[i] = rv.Index(i).Interface()
		}
		return out, true
	}
}

func mapKeys(value map[string]any) []string {
	keys := make([]string, 0, len(value))
	for key := range value {
		keys = append(keys, key)
	}
	return keys
}

func jsonNumber(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, isFinite(typed)
	case float32:
		return float64(typed), isFinite(float64(typed))
	case json.Number:
		number, err := typed.Float64()
		return number, err == nil
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	default:
		return 0, false
	}
}
