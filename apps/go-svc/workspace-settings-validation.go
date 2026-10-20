package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"unicode"
	"unicode/utf8"
)

var (
	honoJSONContentType = regexp.MustCompile(`(?i)^application/([a-z-.]+\+)?json(;\s*[a-z0-9\-]+=([^;]+))*$`)
	workspaceSlugFormat = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
)

const (
	workspaceNameMaxLength = 120
	workspaceSlugMinLength = 2
	workspaceSlugMaxLength = 80
)

type workspaceValidationIssue struct {
	Path    []any  `json:"path"`
	Message string `json:"message"`
}

type workspaceSettingsUpdate struct {
	name, slug *string
}

func readWorkspaceSettingsBody(r *http.Request) (any, error) {
	if !honoJSONContentType.MatchString(r.Header.Get("Content-Type")) {
		return map[string]any{}, nil
	}
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		if isRequestBodyTooLarge(err) {
			return nil, workspaceSettingsFailure(http.StatusRequestEntityTooLarge, "payload_too_large", "request body exceeds maximum allowed size")
		}
		return nil, err
	}
	var value any
	if err := json.Unmarshal(bytes.TrimPrefix(raw, []byte("\xef\xbb\xbf")), &value); err != nil {
		return nil, workspaceSettingsFailure(http.StatusInternalServerError, "internal_error", workspaceSettingsInternalMessage)
	}
	return value, nil
}

func validateWorkspaceSettingsUpdate(value any) (workspaceSettingsUpdate, []workspaceValidationIssue) {
	object, ok := value.(map[string]any)
	if !ok {
		return workspaceSettingsUpdate{}, []workspaceValidationIssue{{Path: []any{}, Message: "Invalid input: expected object, received " + zodTypeName(value)}}
	}
	var update workspaceSettingsUpdate
	var issues []workspaceValidationIssue
	if raw, present := object["name"]; present {
		update.name, issues = validateWorkspaceIdentityField(raw, "name", issues, func(v string) []string {
			var messages []string
			if n := utf8.RuneCountInString(v); n < 1 {
				messages = append(messages, "Too small: expected string to have >=1 characters")
			} else if n > workspaceNameMaxLength {
				messages = append(messages, fmt.Sprintf("Too big: expected string to have <=%d characters", workspaceNameMaxLength))
			}
			if !isAllowedWorkspaceIdentity(v) {
				messages = append(messages, "Choose a workspace name without profanity or reserved words")
			}
			return messages
		}, 1, workspaceNameMaxLength)
	}
	if raw, present := object["slug"]; present {
		update.slug, issues = validateWorkspaceIdentityField(raw, "slug", issues, func(v string) []string {
			var messages []string
			if !workspaceSlugFormat.MatchString(v) {
				messages = append(messages, "Use lowercase letters, numbers, and single hyphens between words")
			}
			if n := utf8.RuneCountInString(v); n < workspaceSlugMinLength {
				messages = append(messages, fmt.Sprintf("Too small: expected string to have >=%d characters", workspaceSlugMinLength))
			} else if n > workspaceSlugMaxLength {
				messages = append(messages, fmt.Sprintf("Too big: expected string to have <=%d characters", workspaceSlugMaxLength))
			}
			if !isAllowedWorkspaceIdentity(v) {
				messages = append(messages, "Choose a workspace slug without profanity or reserved words")
			}
			return messages
		}, workspaceSlugMinLength, workspaceSlugMaxLength)
	}
	if len(issues) > 0 {
		return workspaceSettingsUpdate{}, issues
	}
	if update.name == nil && update.slug == nil {
		return workspaceSettingsUpdate{}, []workspaceValidationIssue{{Path: []any{}, Message: "Provide a name or slug"}}
	}
	return update, nil
}

func validateWorkspaceIdentityField(
	raw any,
	field string,
	issues []workspaceValidationIssue,
	check func(string) []string,
	minLength, maxLength int,
) (*string, []workspaceValidationIssue) {
	path := []any{field}
	s, ok := raw.(string)
	if !ok {
		issues = append(issues, workspaceValidationIssue{Path: path, Message: "Invalid input: expected string, received " + zodTypeName(raw)})
		if items, isArray := raw.([]any); isArray {
			if len(items) < minLength {
				issues = append(issues, workspaceValidationIssue{Path: path, Message: fmt.Sprintf("Too small: expected array to have >=%d items", minLength)})
			} else if len(items) > maxLength {
				issues = append(issues, workspaceValidationIssue{Path: path, Message: fmt.Sprintf("Too big: expected array to have <=%d items", maxLength)})
			}
		}
		return nil, issues
	}
	s = jsTrim(s)
	if field == "slug" {
		s = jsToLower(s)
	}
	for _, message := range check(s) {
		issues = append(issues, workspaceValidationIssue{Path: path, Message: message})
	}
	return &s, issues
}

func zodTypeName(value any) string {
	switch value.(type) {
	case nil:
		return "null"
	case []any:
		return "array"
	case string:
		return "string"
	case float64:
		return "number"
	case bool:
		return "boolean"
	default:
		return "object"
	}
}

func jsTrim(value string) string {
	isSpace := func(r rune) bool {
		return r >= '\t' && r <= '\r' || r == '\uFEFF' || r == '\u2028' || r == '\u2029' || unicode.Is(unicode.Zs, r)
	}
	start, end := 0, len(value)
	for start < end {
		r, size := utf8.DecodeRuneInString(value[start:])
		if !isSpace(r) {
			break
		}
		start += size
	}
	for end > start {
		r, size := utf8.DecodeLastRuneInString(value[:end])
		if !isSpace(r) {
			break
		}
		end -= size
	}
	return value[start:end]
}
