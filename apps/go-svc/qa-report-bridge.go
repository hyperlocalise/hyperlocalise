package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"strings"
)

const contentEditorAllFilesSourcePath = "*"

func buildTranslationQaFindingHref(organizationSlug, projectID string, sourcePath *string, targetLocale, key string) string {
	source := contentEditorAllFilesSourcePath
	if sourcePath != nil && strings.TrimSpace(*sourcePath) != "" {
		source = strings.TrimSpace(*sourcePath)
	}
	params := url.Values{
		"sourcePath": {source},
		"locale":     {targetLocale},
		"segment":    {key},
	}
	return fmt.Sprintf(
		"/org/%s/projects/%s/files/content-editor?%s",
		organizationSlug,
		url.PathEscape(projectID),
		params.Encode(),
	)
}

func truncateUTF16Prefix(value string, maxUnits int) string {
	if maxUnits <= 0 {
		return ""
	}
	units := 0
	for i, r := range value {
		n := 1
		if r > 0xFFFF {
			n = 2
		}
		if units+n > maxUnits {
			return value[:i]
		}
		units += n
	}
	return value
}

func buildQaFindingExternalRef(projectID, runID, findingKey, checkType, targetLocale string) string {
	raw := fmt.Sprintf("%s:%s:%s:%s:%s", projectID, runID, findingKey, checkType, targetLocale)
	if utf16Length(raw) <= 505 {
		return "qa:" + raw
	}
	sum := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("qa:%s:%s:%s", projectID, runID, hex.EncodeToString(sum[:16]))
}

func buildQaFindingIssueTitle(checkType, findingKey, targetLocale string) string {
	base := fmt.Sprintf("[QA] %s · %s (%s)", checkType, findingKey, targetLocale)
	if utf16Length(base) <= 300 {
		return base
	}
	return truncateUTF16Prefix(base, 297) + "..."
}

func buildQaFindingIssueDescription(checkType, message, sourceText, targetText, editorHref string) string {
	return strings.Join([]string{
		"## Which check",
		checkType,
		"",
		"## Message",
		message,
		"",
		"## Expected (source)",
		sourceText,
		"",
		"## Actual (target)",
		targetText,
		"",
		"## Open in editor",
		editorHref,
	}, "\n")
}

func buildQaFindingIssueMetadata(runID, findingID, checkType, severity, editorHref string) map[string]any {
	return map[string]any{
		"qaFinding": map[string]string{
			"runId":      runID,
			"findingId":  findingID,
			"checkType":  checkType,
			"severity":   severity,
			"editorHref": editorHref,
		},
	}
}
