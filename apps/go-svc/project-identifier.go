package main

import (
	"context"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/nativeproject"
)

const (
	projectIdentifierMaxLength      = nativeproject.IdentifierMaxLength
	projectIdentifierInsertAttempts = nativeproject.IdentifierInsertAttempts
)

var projectIdentifierPattern = nativeproject.IdentifierPattern

func deriveProjectIdentifierCandidate(name string) string {
	return nativeproject.DeriveIdentifierCandidate(name)
}

func uniquifyProjectIdentifier(candidate string, taken map[string]struct{}) string {
	return nativeproject.UniquifyIdentifier(candidate, taken)
}

func loadTakenProjectIdentifiers(ctx context.Context, db dictionaryDB, organizationID string) (map[string]struct{}, error) {
	return nativeproject.LoadTakenIdentifiers(ctx, db, organizationID)
}

func normalizeProjectIdentifierInput(raw string) (string, bool) {
	trimmed := strings.ToUpper(strings.TrimSpace(raw))
	if !projectIdentifierPattern.MatchString(trimmed) {
		return "", false
	}
	return trimmed, true
}

func isProjectIdentifierTaken(ctx context.Context, db dictionaryDB, organizationID, identifier, excludeProjectID string) (bool, error) {
	var found string
	err := db.QueryRow(ctx, `
		select id from projects where organization_id=$1 and identifier=$2 and id<>$3 limit 1`,
		organizationID, identifier, excludeProjectID).Scan(&found)
	if err == nil {
		return true, nil
	}
	if !isNoRows(err) {
		return false, err
	}
	err = db.QueryRow(ctx, `
		select id from issue_sheet_issues
		where organization_id=$1 and identifier like $2 and project_id<>$3 limit 1`,
		organizationID, identifier+"-%", excludeProjectID).Scan(&found)
	if err == nil {
		return true, nil
	}
	if isNoRows(err) {
		return false, nil
	}
	return false, err
}
