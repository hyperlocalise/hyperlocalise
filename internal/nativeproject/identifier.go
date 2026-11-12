// Package nativeproject creates Hyperlocalise-owned (native) projects. go-svc and the public
// API both call it, so a project made in the web app and one made through the API get the same
// identifier, team, translation memory, and glossary rules.
package nativeproject

import (
	"context"
	"errors"
	"regexp"
	"strconv"
	"strings"
)

const (
	IdentifierMaxLength      = 10
	identifierFallback       = "PROJ"
	IdentifierInsertAttempts = 10_000
)

var (
	identifierWordSplit       = regexp.MustCompile(`[\s/_-]+`)
	identifierNonAlnum        = regexp.MustCompile(`[^A-Za-z0-9]`)
	identifierNonUpper        = regexp.MustCompile(`[^A-Z0-9]`)
	IdentifierPattern         = regexp.MustCompile(`^[A-Z][A-Z0-9]{0,9}$`)
	identifierLeadsWithLetter = regexp.MustCompile(`^[A-Z]`)
)

// ErrIdentifierExhausted means no free project identifier was found for the workspace.
var ErrIdentifierExhausted = errors.New("could not allocate a unique project identifier")

// DeriveIdentifierCandidate turns a project name into an identifier such as "WA" for
// "Web app": the initials, or the first letters when there are fewer than two words.
func DeriveIdentifierCandidate(name string) string {
	var words []string
	for _, word := range identifierWordSplit.Split(strings.TrimSpace(name), -1) {
		cleaned := identifierNonAlnum.ReplaceAllString(word, "")
		if cleaned != "" {
			words = append(words, cleaned)
		}
	}

	var initials strings.Builder
	for _, word := range words {
		initials.WriteByte(word[0])
	}
	candidate := identifierNonUpper.ReplaceAllString(strings.ToUpper(initials.String()), "")

	if len(candidate) < 2 {
		letters := identifierNonUpper.ReplaceAllString(strings.ToUpper(name), "")
		if len(letters) > 3 {
			letters = letters[:3]
		}
		if len(letters) >= 2 {
			candidate = letters
		} else {
			candidate = identifierFallback
		}
	}

	if len(candidate) > IdentifierMaxLength {
		candidate = candidate[:IdentifierMaxLength]
	}
	if !identifierLeadsWithLetter.MatchString(candidate) {
		candidate = "P" + candidate
		if len(candidate) > IdentifierMaxLength {
			candidate = candidate[:IdentifierMaxLength]
		}
	}
	if !IdentifierPattern.MatchString(candidate) {
		return identifierFallback
	}
	return candidate
}

// UniquifyIdentifier returns candidate, or candidate with the lowest numeric suffix that is not
// taken. It returns "" when every suffix is taken.
func UniquifyIdentifier(candidate string, taken map[string]struct{}) string {
	if _, exists := taken[candidate]; !exists {
		return candidate
	}
	for suffix := 2; suffix <= IdentifierInsertAttempts; suffix++ {
		suffixText := strconv.Itoa(suffix)
		baseMax := IdentifierMaxLength - len(suffixText)
		if baseMax < 1 {
			fallback := identifierFallback + suffixText
			if len(fallback) > IdentifierMaxLength {
				fallback = fallback[:IdentifierMaxLength]
			}
			if _, exists := taken[fallback]; !exists && IdentifierPattern.MatchString(fallback) {
				return fallback
			}
			continue
		}
		base := candidate
		if len(base) > baseMax {
			base = base[:baseMax]
		}
		if !identifierLeadsWithLetter.MatchString(base) {
			base = "P"
		}
		next := base + suffixText
		if len(next) > IdentifierMaxLength {
			next = next[:IdentifierMaxLength]
		}
		if _, exists := taken[next]; !exists {
			return next
		}
	}
	return ""
}

// LoadTakenIdentifiers returns the workspace's project identifiers and the prefixes of its
// issue identifiers, upper-cased, so a new project never reuses either.
func LoadTakenIdentifiers(ctx context.Context, db DB, organizationID string) (map[string]struct{}, error) {
	taken := map[string]struct{}{}
	rows, err := db.Query(ctx, `select identifier from projects where organization_id=$1`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var identifier string
		if err := rows.Scan(&identifier); err != nil {
			return nil, err
		}
		taken[strings.ToUpper(strings.TrimSpace(identifier))] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	prefixRows, err := db.Query(ctx, `
		select distinct split_part(identifier, '-', 1) as prefix
		from issue_sheet_issues
		where organization_id=$1`, organizationID)
	if err != nil {
		return nil, err
	}
	defer prefixRows.Close()
	for prefixRows.Next() {
		var prefix string
		if err := prefixRows.Scan(&prefix); err != nil {
			return nil, err
		}
		prefix = strings.ToUpper(strings.TrimSpace(prefix))
		if prefix != "" {
			taken[prefix] = struct{}{}
		}
	}
	return taken, prefixRows.Err()
}

// InsertWithAllocatedIdentifier calls insert with free identifiers derived from name until one
// inserts. insert returns pgx.ErrNoRows when its identifier was taken concurrently.
func InsertWithAllocatedIdentifier(
	ctx context.Context,
	db DB,
	organizationID, name string,
	insert func(ctx context.Context, identifier string) (string, error),
) (string, error) {
	taken, err := LoadTakenIdentifiers(ctx, db, organizationID)
	if err != nil {
		return "", err
	}
	base := DeriveIdentifierCandidate(name)
	for attempt := 0; attempt < IdentifierInsertAttempts; attempt++ {
		identifier := UniquifyIdentifier(base, taken)
		if identifier == "" {
			return "", ErrIdentifierExhausted
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
	return "", ErrIdentifierExhausted
}
