package nativeproject

import "strings"

// DefaultBranchName is the version branch native projects start with, matching
// Phrase Strings' default line of work.
const DefaultBranchName = "main"

// ResolveBranchName returns a trimmed branch name, or DefaultBranchName when empty.
func ResolveBranchName(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return DefaultBranchName
	}
	return value
}
