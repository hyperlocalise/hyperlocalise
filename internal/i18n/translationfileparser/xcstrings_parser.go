package translationfileparser

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"
)

const xcstringsEscapedBaseKeyPrefix = "%xcs:"

// XCStringsParser parses Apple Xcode string catalog (.xcstrings) files.
type XCStringsParser struct{}

type xcstringsPathStep struct {
	kind   string
	name   string
	option string
}

type xcstringsLeafRef struct {
	key   string
	steps []xcstringsPathStep
}

func (p XCStringsParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := parseXCStringsCatalog(content, "")
	return values, err
}

func (p XCStringsParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	return parseXCStringsCatalog(content, "")
}

// ParseXCStringsLocale parses values for one localization inside a string catalog.
// It is used by local target-file checks because .xcstrings can hold more than one locale.
func ParseXCStringsLocale(content []byte, locale string) (map[string]string, error) {
	values, _, err := parseXCStringsCatalog(content, strings.TrimSpace(locale))
	return values, err
}

func parseXCStringsCatalog(content []byte, locale string) (map[string]string, map[string]string, error) {
	root, err := decodeXCStringsObject(content)
	if err != nil {
		return nil, nil, err
	}
	stringsNode, err := xcstringsObjectField(root, "strings")
	if err != nil {
		return nil, nil, err
	}

	sourceLanguage, _ := root["sourceLanguage"].(string)
	sourceLanguage = strings.TrimSpace(sourceLanguage)
	sourceMode := strings.TrimSpace(locale) == ""

	out := map[string]string{}
	contextByKey := map[string]string{}
	for _, key := range sortedXCStringsKeys(stringsNode) {
		entry, err := xcstringsObjectValue(stringsNode[key], fmt.Sprintf("strings.%s", key))
		if err != nil {
			return nil, nil, err
		}

		baseContext := xcstringsEntryContext(entry, sourceLanguage)
		if sourceMode {
			refs, err := xcstringsSourceLeafRefs(key, entry, sourceLanguage)
			if err != nil {
				return nil, nil, err
			}
			for _, ref := range refs {
				value, ok, err := xcstringsValueForRef(entry, sourceLanguage, ref)
				if err != nil {
					return nil, nil, err
				}
				if !ok {
					value = key
				}
				out[ref.key] = value
				if ctx := xcstringsLeafContext(baseContext, ref.steps); ctx != "" {
					contextByKey[ref.key] = ctx
				}
			}
			continue
		}

		locs, ok, err := xcstringsOptionalObjectField(entry, "localizations")
		if err != nil {
			return nil, nil, err
		}
		if !ok {
			continue
		}
		locRaw, ok := locs[locale]
		if !ok {
			continue
		}
		loc, err := xcstringsObjectValue(locRaw, fmt.Sprintf("strings.%s.localizations.%s", key, locale))
		if err != nil {
			return nil, nil, err
		}
		if _, err := collectXCStringsLeaves(key, loc, out, contextByKey, baseContext, nil); err != nil {
			return nil, nil, err
		}
	}

	return out, contextByKey, nil
}

func decodeXCStringsObject(content []byte) (map[string]any, error) {
	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.UseNumber()
	var root map[string]any
	if err := decoder.Decode(&root); err != nil {
		return nil, fmt.Errorf("xcstrings decode: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("xcstrings decode: multiple JSON values")
		}
		return nil, fmt.Errorf("xcstrings decode trailing content: %w", err)
	}
	if root == nil {
		return nil, fmt.Errorf("xcstrings decode: expected JSON object")
	}
	return root, nil
}

func sortedXCStringsKeys(obj map[string]any) []string {
	keys := make([]string, 0, len(obj))
	for key := range obj {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func xcstringsObjectField(obj map[string]any, name string) (map[string]any, error) {
	raw, ok := obj[name]
	if !ok {
		return nil, fmt.Errorf("xcstrings: missing %q object", name)
	}
	return xcstringsObjectValue(raw, name)
}

func xcstringsOptionalObjectField(obj map[string]any, name string) (map[string]any, bool, error) {
	raw, ok := obj[name]
	if !ok {
		return nil, false, nil
	}
	child, err := xcstringsObjectValue(raw, name)
	return child, true, err
}

func xcstringsObjectValue(raw any, label string) (map[string]any, error) {
	obj, ok := raw.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("xcstrings: %s must be an object", label)
	}
	return obj, nil
}

func xcstringsSourceLeafRefs(entryKey string, entry map[string]any, sourceLanguage string) ([]xcstringsLeafRef, error) {
	locs, hasLocs, err := xcstringsOptionalObjectField(entry, "localizations")
	if err != nil {
		return nil, err
	}
	if !hasLocs || len(locs) == 0 {
		return []xcstringsLeafRef{{key: xcstringsKeyForSteps(entryKey, nil)}}, nil
	}

	if sourceLanguage != "" {
		if raw, ok := locs[sourceLanguage]; ok {
			loc, err := xcstringsObjectValue(raw, fmt.Sprintf("localizations.%s", sourceLanguage))
			if err != nil {
				return nil, err
			}
			refs := []xcstringsLeafRef{}
			if _, err := collectXCStringsLeafRefs(entryKey, loc, nil, &refs); err != nil {
				return nil, err
			}
			if len(refs) > 0 {
				return refs, nil
			}
			if xcstringsLocalizationHasStructuredContainers(loc) {
				return nil, fmt.Errorf("xcstrings key %q: source localization %q has no supported stringUnit values", entryKey, sourceLanguage)
			}
		}
		if xcstringsLocalizationsHaveStructuredLeaves(locs) {
			return nil, fmt.Errorf("xcstrings key %q: source localization %q is required for variants or substitutions", entryKey, sourceLanguage)
		}
		return []xcstringsLeafRef{{key: xcstringsKeyForSteps(entryKey, nil)}}, nil
	}

	if len(locs) == 1 {
		for locName, raw := range locs {
			loc, err := xcstringsObjectValue(raw, fmt.Sprintf("localizations.%s", locName))
			if err != nil {
				return nil, err
			}
			refs := []xcstringsLeafRef{}
			if _, err := collectXCStringsLeafRefs(entryKey, loc, nil, &refs); err != nil {
				return nil, err
			}
			if len(refs) > 0 {
				return refs, nil
			}
		}
	}
	if xcstringsLocalizationsHaveStructuredLeaves(locs) {
		return nil, fmt.Errorf("xcstrings key %q: sourceLanguage is required for variant or substitution entries", entryKey)
	}
	return []xcstringsLeafRef{{key: xcstringsKeyForSteps(entryKey, nil)}}, nil
}

func xcstringsValueForRef(entry map[string]any, sourceLanguage string, ref xcstringsLeafRef) (string, bool, error) {
	locs, hasLocs, err := xcstringsOptionalObjectField(entry, "localizations")
	if err != nil {
		return "", false, err
	}
	if !hasLocs || len(locs) == 0 {
		return "", false, nil
	}

	if sourceLanguage != "" {
		if raw, ok := locs[sourceLanguage]; ok {
			loc, err := xcstringsObjectValue(raw, fmt.Sprintf("localizations.%s", sourceLanguage))
			if err != nil {
				return "", false, err
			}
			return xcstringsValueAtSteps(loc, ref.steps)
		}
		return "", false, nil
	}

	if len(locs) == 1 {
		for locName, raw := range locs {
			loc, err := xcstringsObjectValue(raw, fmt.Sprintf("localizations.%s", locName))
			if err != nil {
				return "", false, err
			}
			return xcstringsValueAtSteps(loc, ref.steps)
		}
	}
	return "", false, nil
}

func collectXCStringsLeaves(baseKey string, loc map[string]any, out map[string]string, contextByKey map[string]string, baseContext string, steps []xcstringsPathStep) (int, error) {
	count := 0
	if raw, ok := loc["stringUnit"]; ok {
		unit, err := xcstringsObjectValue(raw, "stringUnit")
		if err != nil {
			return 0, err
		}
		value, ok, err := xcstringsStringUnitValue(unit)
		if err != nil {
			return 0, err
		}
		if !ok {
			return count, nil
		}
		key := xcstringsKeyForSteps(baseKey, steps)
		out[key] = value
		if ctx := xcstringsLeafContext(baseContext, steps); ctx != "" {
			contextByKey[key] = ctx
		}
		count++
	}

	variationCount, err := collectXCStringsVariationLeaves(baseKey, loc, out, contextByKey, baseContext, steps)
	if err != nil {
		return 0, err
	}
	count += variationCount

	substitutionCount, err := collectXCStringsSubstitutionLeaves(baseKey, loc, out, contextByKey, baseContext, steps)
	if err != nil {
		return 0, err
	}
	count += substitutionCount

	return count, nil
}

func collectXCStringsLeafRefs(baseKey string, loc map[string]any, steps []xcstringsPathStep, refs *[]xcstringsLeafRef) (int, error) {
	count := 0
	if raw, ok := loc["stringUnit"]; ok {
		unit, err := xcstringsObjectValue(raw, "stringUnit")
		if err != nil {
			return 0, err
		}
		if _, ok, err := xcstringsStringUnitValue(unit); err != nil {
			return 0, err
		} else if !ok {
			return 0, fmt.Errorf("xcstrings key %q: stringUnit.value is required in source localization", baseKey)
		}
		*refs = append(*refs, xcstringsLeafRef{key: xcstringsKeyForSteps(baseKey, steps), steps: append([]xcstringsPathStep(nil), steps...)})
		count++
	}

	variations, ok, err := xcstringsOptionalObjectField(loc, "variations")
	if err != nil {
		return 0, err
	}
	if ok {
		for _, dimension := range sortedXCStringsKeys(variations) {
			options, err := xcstringsObjectValue(variations[dimension], fmt.Sprintf("variations.%s", dimension))
			if err != nil {
				return 0, err
			}
			for _, option := range sortedXCStringsKeys(options) {
				child, err := xcstringsObjectValue(options[option], fmt.Sprintf("variations.%s.%s", dimension, option))
				if err != nil {
					return 0, err
				}
				childSteps := append(append([]xcstringsPathStep(nil), steps...), xcstringsPathStep{kind: "variation", name: dimension, option: option})
				childCount, err := collectXCStringsLeafRefs(baseKey, child, childSteps, refs)
				if err != nil {
					return 0, err
				}
				count += childCount
			}
		}
	}

	substitutions, ok, err := xcstringsOptionalObjectField(loc, "substitutions")
	if err != nil {
		return 0, err
	}
	if ok {
		for _, name := range sortedXCStringsKeys(substitutions) {
			child, err := xcstringsObjectValue(substitutions[name], fmt.Sprintf("substitutions.%s", name))
			if err != nil {
				return 0, err
			}
			childSteps := append(append([]xcstringsPathStep(nil), steps...), xcstringsPathStep{kind: "substitution", name: name})
			childCount, err := collectXCStringsLeafRefs(baseKey, child, childSteps, refs)
			if err != nil {
				return 0, err
			}
			count += childCount
		}
	}

	return count, nil
}

func collectXCStringsVariationLeaves(baseKey string, loc map[string]any, out map[string]string, contextByKey map[string]string, baseContext string, steps []xcstringsPathStep) (int, error) {
	variations, ok, err := xcstringsOptionalObjectField(loc, "variations")
	if err != nil {
		return 0, err
	}
	if !ok {
		return 0, nil
	}

	count := 0
	for _, dimension := range sortedXCStringsKeys(variations) {
		options, err := xcstringsObjectValue(variations[dimension], fmt.Sprintf("variations.%s", dimension))
		if err != nil {
			return 0, err
		}
		for _, option := range sortedXCStringsKeys(options) {
			child, err := xcstringsObjectValue(options[option], fmt.Sprintf("variations.%s.%s", dimension, option))
			if err != nil {
				return 0, err
			}
			childSteps := append(append([]xcstringsPathStep(nil), steps...), xcstringsPathStep{kind: "variation", name: dimension, option: option})
			childCount, err := collectXCStringsLeaves(baseKey, child, out, contextByKey, baseContext, childSteps)
			if err != nil {
				return 0, err
			}
			count += childCount
		}
	}
	return count, nil
}

func collectXCStringsSubstitutionLeaves(baseKey string, loc map[string]any, out map[string]string, contextByKey map[string]string, baseContext string, steps []xcstringsPathStep) (int, error) {
	substitutions, ok, err := xcstringsOptionalObjectField(loc, "substitutions")
	if err != nil {
		return 0, err
	}
	if !ok {
		return 0, nil
	}

	count := 0
	for _, name := range sortedXCStringsKeys(substitutions) {
		child, err := xcstringsObjectValue(substitutions[name], fmt.Sprintf("substitutions.%s", name))
		if err != nil {
			return 0, err
		}
		childSteps := append(append([]xcstringsPathStep(nil), steps...), xcstringsPathStep{kind: "substitution", name: name})
		childCount, err := collectXCStringsLeaves(baseKey, child, out, contextByKey, baseContext, childSteps)
		if err != nil {
			return 0, err
		}
		count += childCount
	}
	return count, nil
}

func xcstringsStringUnitValue(unit map[string]any) (string, bool, error) {
	raw, ok := unit["value"]
	if !ok {
		return "", false, nil
	}
	value, ok := raw.(string)
	if !ok {
		return "", false, fmt.Errorf("xcstrings: stringUnit.value must be a string")
	}
	return value, true, nil
}

func xcstringsValueAtSteps(loc map[string]any, steps []xcstringsPathStep) (string, bool, error) {
	current := loc
	for _, step := range steps {
		switch step.kind {
		case "variation":
			variations, ok, err := xcstringsOptionalObjectField(current, "variations")
			if err != nil || !ok {
				return "", false, err
			}
			options, err := xcstringsObjectValue(variations[step.name], fmt.Sprintf("variations.%s", step.name))
			if err != nil {
				return "", false, err
			}
			next, err := xcstringsObjectValue(options[step.option], fmt.Sprintf("variations.%s.%s", step.name, step.option))
			if err != nil {
				return "", false, err
			}
			current = next
		case "substitution":
			substitutions, ok, err := xcstringsOptionalObjectField(current, "substitutions")
			if err != nil || !ok {
				return "", false, err
			}
			next, err := xcstringsObjectValue(substitutions[step.name], fmt.Sprintf("substitutions.%s", step.name))
			if err != nil {
				return "", false, err
			}
			current = next
		default:
			return "", false, fmt.Errorf("xcstrings: unknown path step %q", step.kind)
		}
	}
	raw, ok := current["stringUnit"]
	if !ok {
		return "", false, nil
	}
	unit, err := xcstringsObjectValue(raw, "stringUnit")
	if err != nil {
		return "", false, err
	}
	value, ok, err := xcstringsStringUnitValue(unit)
	return value, ok, err
}

func xcstringsLocalizationsHaveStructuredLeaves(locs map[string]any) bool {
	for _, raw := range locs {
		loc, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if xcstringsLocalizationHasStructuredContainers(loc) {
			return true
		}
	}
	return false
}

func xcstringsLocalizationHasStructuredContainers(loc map[string]any) bool {
	if _, ok := loc["variations"]; ok {
		return true
	}
	if _, ok := loc["substitutions"]; ok {
		return true
	}
	return false
}

func xcstringsKeyForSteps(baseKey string, steps []xcstringsPathStep) string {
	key := escapeXCStringsBaseKey(baseKey)
	for _, step := range steps {
		switch step.kind {
		case "variation":
			key += "::" + step.name + "." + step.option
		case "substitution":
			key += "::substitution." + step.name
		}
	}
	return key
}

func escapeXCStringsBaseKey(key string) string {
	if !strings.Contains(key, "::") && !strings.HasPrefix(key, xcstringsEscapedBaseKeyPrefix) {
		return key
	}
	return xcstringsEscapedBaseKeyPrefix + base64.RawURLEncoding.EncodeToString([]byte(key))
}

func xcstringsEntryContext(entry map[string]any, sourceLanguage string) string {
	parts := []string{}
	if comment, ok := entry["comment"].(string); ok && strings.TrimSpace(comment) != "" {
		parts = append(parts, "Comment: "+strings.TrimSpace(comment))
	}
	if extractionState, ok := entry["extractionState"].(string); ok && strings.TrimSpace(extractionState) != "" {
		parts = append(parts, "Extraction state: "+strings.TrimSpace(extractionState))
	}
	if sourceLanguage != "" {
		parts = append(parts, "String catalog source language: "+sourceLanguage)
	}
	return strings.Join(parts, "\n")
}

func xcstringsLeafContext(base string, steps []xcstringsPathStep) string {
	parts := []string{}
	if strings.TrimSpace(base) != "" {
		parts = append(parts, base)
	}
	for _, step := range steps {
		switch step.kind {
		case "variation":
			parts = append(parts, "String catalog variation: "+step.name+"."+step.option)
		case "substitution":
			parts = append(parts, "String catalog substitution: "+step.name)
		}
	}
	return strings.Join(parts, "\n")
}

// MarshalXCStrings rewrites target-locale stringUnit values while preserving catalog metadata.
func MarshalXCStrings(template, sourceTemplate []byte, values map[string]string, sourceLocale, targetLocale string) ([]byte, error) {
	targetLocale = strings.TrimSpace(targetLocale)
	if targetLocale == "" {
		return nil, fmt.Errorf("xcstrings marshal: target locale is required")
	}

	root, err := decodeXCStringsObject(template)
	if err != nil {
		return nil, err
	}
	sourceRoot, err := decodeXCStringsObject(sourceTemplate)
	if err != nil {
		return nil, fmt.Errorf("xcstrings source template: %w", err)
	}

	stringsNode, err := xcstringsObjectField(root, "strings")
	if err != nil {
		return nil, err
	}
	sourceStrings, err := xcstringsObjectField(sourceRoot, "strings")
	if err != nil {
		return nil, fmt.Errorf("xcstrings source template: %w", err)
	}

	if strings.TrimSpace(sourceLocale) == "" {
		if sourceLanguage, ok := sourceRoot["sourceLanguage"].(string); ok {
			sourceLocale = strings.TrimSpace(sourceLanguage)
		}
	}

	for _, key := range sortedXCStringsKeys(sourceStrings) {
		sourceEntry, err := xcstringsObjectValue(sourceStrings[key], fmt.Sprintf("source strings.%s", key))
		if err != nil {
			return nil, err
		}
		targetEntry, err := ensureXCStringsCatalogEntry(stringsNode, key, sourceEntry)
		if err != nil {
			return nil, err
		}

		refs, err := xcstringsSourceLeafRefs(key, sourceEntry, sourceLocale)
		if err != nil {
			return nil, err
		}
		sourceLoc := xcstringsLocalizationObject(sourceEntry, sourceLocale)
		for _, ref := range refs {
			value, ok := values[ref.key]
			if !ok {
				continue
			}
			localizations, err := ensureXCStringsObjectField(targetEntry, "localizations")
			if err != nil {
				return nil, err
			}
			targetLoc, err := ensureXCStringsObjectChild(localizations, targetLocale, sourceLoc)
			if err != nil {
				return nil, err
			}
			if err := setXCStringsValue(targetLoc, sourceLoc, ref.steps, value); err != nil {
				return nil, fmt.Errorf("xcstrings key %q: %w", ref.key, err)
			}
		}
	}

	content, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("xcstrings encode: %w", err)
	}
	content = append(content, '\n')
	return content, nil
}

func xcstringsLocalizationObject(entry map[string]any, locale string) map[string]any {
	if strings.TrimSpace(locale) == "" {
		return nil
	}
	locs, ok, err := xcstringsOptionalObjectField(entry, "localizations")
	if err != nil || !ok {
		return nil
	}
	loc, ok := locs[locale].(map[string]any)
	if !ok {
		return nil
	}
	return loc
}

func ensureXCStringsObjectField(parent map[string]any, key string) (map[string]any, error) {
	raw, ok := parent[key]
	if !ok {
		child := map[string]any{}
		parent[key] = child
		return child, nil
	}
	child, ok := raw.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("xcstrings: %s must be an object", key)
	}
	return child, nil
}

func ensureXCStringsObjectChild(parent map[string]any, key string, source map[string]any) (map[string]any, error) {
	raw, ok := parent[key]
	if ok {
		return xcstringsObjectValue(raw, key)
	}
	if source != nil {
		if cloned, ok := cloneXCStringsSkeleton(source).(map[string]any); ok {
			parent[key] = cloned
			return cloned, nil
		}
	}
	child := map[string]any{}
	parent[key] = child
	return child, nil
}

func ensureXCStringsCatalogEntry(parent map[string]any, key string, source map[string]any) (map[string]any, error) {
	raw, ok := parent[key]
	if ok {
		return xcstringsObjectValue(raw, key)
	}
	cloned, ok := cloneXCStringsJSONValue(source).(map[string]any)
	if !ok {
		return nil, fmt.Errorf("xcstrings: source entry %s must be an object", key)
	}
	parent[key] = cloned
	return cloned, nil
}

func setXCStringsValue(targetLoc, sourceLoc map[string]any, steps []xcstringsPathStep, value string) error {
	if len(steps) == 0 {
		return setXCStringsStringUnitValue(targetLoc, value)
	}

	step := steps[0]
	switch step.kind {
	case "variation":
		targetVariations, err := ensureXCStringsObjectField(targetLoc, "variations")
		if err != nil {
			return err
		}
		var sourceVariations map[string]any
		if sourceLoc != nil {
			sourceVariations, _, _ = xcstringsOptionalObjectField(sourceLoc, "variations")
		}
		sourceDimension := xcstringsObjectChildOrNil(sourceVariations, step.name)
		targetDimension, err := ensureXCStringsObjectChild(targetVariations, step.name, sourceDimension)
		if err != nil {
			return err
		}
		sourceChild := xcstringsObjectChildOrNil(sourceDimension, step.option)
		targetChild, err := ensureXCStringsObjectChild(targetDimension, step.option, sourceChild)
		if err != nil {
			return err
		}
		return setXCStringsValue(targetChild, sourceChild, steps[1:], value)
	case "substitution":
		targetSubstitutions, err := ensureXCStringsObjectField(targetLoc, "substitutions")
		if err != nil {
			return err
		}
		var sourceSubstitutions map[string]any
		if sourceLoc != nil {
			sourceSubstitutions, _, _ = xcstringsOptionalObjectField(sourceLoc, "substitutions")
		}
		sourceChild := xcstringsObjectChildOrNil(sourceSubstitutions, step.name)
		targetChild, err := ensureXCStringsObjectChild(targetSubstitutions, step.name, sourceChild)
		if err != nil {
			return err
		}
		return setXCStringsValue(targetChild, sourceChild, steps[1:], value)
	default:
		return fmt.Errorf("unknown xcstrings path step %q", step.kind)
	}
}

func setXCStringsStringUnitValue(loc map[string]any, value string) error {
	unit, err := ensureXCStringsObjectField(loc, "stringUnit")
	if err != nil {
		return err
	}
	if state, ok := unit["state"].(string); !ok || strings.TrimSpace(state) == "" || strings.TrimSpace(state) == "new" {
		unit["state"] = "translated"
	}
	unit["value"] = value
	return nil
}

func xcstringsObjectChildOrNil(parent map[string]any, key string) map[string]any {
	if parent == nil {
		return nil
	}
	child, _ := parent[key].(map[string]any)
	return child
}

func cloneXCStringsSkeleton(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, child := range typed {
			if key == "stringUnit" {
				out[key] = cloneXCStringsStringUnitSkeleton(child)
				continue
			}
			out[key] = cloneXCStringsSkeleton(child)
		}
		return out
	case []any:
		out := make([]any, len(typed))
		for i := range typed {
			out[i] = cloneXCStringsSkeleton(typed[i])
		}
		return out
	default:
		return typed
	}
}

func cloneXCStringsStringUnitSkeleton(value any) any {
	unit, ok := value.(map[string]any)
	if !ok {
		return value
	}
	out := make(map[string]any, len(unit))
	for key, child := range unit {
		if key == "value" {
			out[key] = ""
			continue
		}
		out[key] = cloneXCStringsSkeleton(child)
	}
	return out
}

func cloneXCStringsJSONValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, child := range typed {
			out[key] = cloneXCStringsJSONValue(child)
		}
		return out
	case []any:
		out := make([]any, len(typed))
		for i := range typed {
			out[i] = cloneXCStringsJSONValue(typed[i])
		}
		return out
	default:
		return typed
	}
}
