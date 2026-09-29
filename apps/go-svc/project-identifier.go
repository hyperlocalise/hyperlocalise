package main

import (
	"context"
	"regexp"
	"strconv"
	"strings"
)

const (
	projectIdentifierMaxLength      = 10
	projectIdentifierFallback       = "PROJ"
	projectIdentifierInsertAttempts = 10_000
)

var (
	projectIdentifierWordSplit       = regexp.MustCompile(`[\s/_-]+`)
	projectIdentifierNonAlnum        = regexp.MustCompile(`[^A-Za-z0-9]`)
	projectIdentifierNonUpper        = regexp.MustCompile(`[^A-Z0-9]`)
	projectIdentifierPattern         = regexp.MustCompile(`^[A-Z][A-Z0-9]{0,9}$`)
	projectIdentifierLeadsWithLetter = regexp.MustCompile(`^[A-Z]`)
)

func deriveProjectIdentifierCandidate(name string) string {
	var words []string
	for _, word := range projectIdentifierWordSplit.Split(strings.TrimSpace(name), -1) {
		cleaned := projectIdentifierNonAlnum.ReplaceAllString(word, "")
		if cleaned != "" {
			words = append(words, cleaned)
		}
	}

	var initials strings.Builder
	for _, word := range words {
		initials.WriteByte(word[0])
	}
	candidate := projectIdentifierNonUpper.ReplaceAllString(strings.ToUpper(initials.String()), "")

	if len(candidate) < 2 {
		letters := projectIdentifierNonUpper.ReplaceAllString(strings.ToUpper(name), "")
		if len(letters) > 3 {
			letters = letters[:3]
		}
		if len(letters) >= 2 {
			candidate = letters
		} else {
			candidate = projectIdentifierFallback
		}
	}

	if len(candidate) > projectIdentifierMaxLength {
		candidate = candidate[:projectIdentifierMaxLength]
	}
	if !projectIdentifierLeadsWithLetter.MatchString(candidate) {
		candidate = "P" + candidate
		if len(candidate) > projectIdentifierMaxLength {
			candidate = candidate[:projectIdentifierMaxLength]
		}
	}
	if !projectIdentifierPattern.MatchString(candidate) {
		return projectIdentifierFallback
	}
	return candidate
}

func uniquifyProjectIdentifier(candidate string, taken map[string]struct{}) string {
	if _, exists := taken[candidate]; !exists {
		return candidate
	}
	for suffix := 2; suffix <= projectIdentifierInsertAttempts; suffix++ {
		suffixText := strconv.Itoa(suffix)
		baseMax := projectIdentifierMaxLength - len(suffixText)
		if baseMax < 1 {
			fallback := projectIdentifierFallback + suffixText
			if len(fallback) > projectIdentifierMaxLength {
				fallback = fallback[:projectIdentifierMaxLength]
			}
			if _, exists := taken[fallback]; !exists && projectIdentifierPattern.MatchString(fallback) {
				return fallback
			}
			continue
		}
		base := candidate
		if len(base) > baseMax {
			base = base[:baseMax]
		}
		if !projectIdentifierLeadsWithLetter.MatchString(base) {
			base = "P"
		}
		next := base + suffixText
		if len(next) > projectIdentifierMaxLength {
			next = next[:projectIdentifierMaxLength]
		}
		if _, exists := taken[next]; !exists {
			return next
		}
	}
	return ""
}

func insertProjectWithAllocatedIdentifier(
	ctx context.Context,
	tx dictionaryDB,
	organizationID, name string,
	insert func(ctx context.Context, identifier string) (string, error),
) (string, error) {
	taken, err := loadTakenProjectIdentifiers(ctx, tx, organizationID)
	if err != nil {
		return "", err
	}
	base := deriveProjectIdentifierCandidate(name)
	for attempt := 0; attempt < projectIdentifierInsertAttempts; attempt++ {
		identifier := uniquifyProjectIdentifier(base, taken)
		if identifier == "" {
			return "", projectFailure(503, "project_identifier_exhausted", "Could not allocate a unique project identifier")
		}
		id, err := insert(ctx, identifier)
		if err == nil {
			return id, nil
		}
		if !isNoRows(err) {
			return "", err
		}
		taken[identifier] = struct{}{}
	}
	return "", projectFailure(503, "project_identifier_exhausted", "Could not allocate a unique project identifier")
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
