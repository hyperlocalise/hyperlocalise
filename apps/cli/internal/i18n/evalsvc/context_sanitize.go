package evalsvc

import "strings"

const maxEvalCaseContextLen = 512

func sanitizeEvalCaseContext(context string) string {
	clean := strings.ReplaceAll(context, "\n", " ")
	clean = strings.ReplaceAll(clean, "\r", " ")
	clean = strings.TrimSpace(clean)
	runes := []rune(clean)
	if len(runes) > maxEvalCaseContextLen {
		clean = string(runes[:maxEvalCaseContextLen])
	}
	return clean
}
