// Package keymeta holds the rules for a string's tags and design link, shared by the content
// editor's routes in go-svc and the public API so both accept the same values. The web app's
// label filter uses the same tag rule (labelIdSchema in content-editor-advanced-queue-filter.ts).
package keymeta

import (
	"fmt"
	"net/url"
	"regexp"
)

const (
	// MaxTagsPerChange caps how many tags one request adds or removes.
	MaxTagsPerChange = 20
	// MaxTagLength is the longest tag, in bytes; tags are ASCII.
	MaxTagLength = 64
	// MaxDesignURLLength is the longest design link.
	MaxDesignURLLength = 2048
)

var tagPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// ValidTag reports whether tag is 1 to 64 letters, digits, `_` or `-`.
func ValidTag(tag string) bool {
	return tagPattern.MatchString(tag)
}

// ValidTags reports whether there are at most limit tags and each is valid.
func ValidTags(tags []string, limit int) bool {
	if len(tags) > limit {
		return false
	}
	for _, tag := range tags {
		if !ValidTag(tag) {
			return false
		}
	}
	return true
}

// ValidDesignURL reports whether value is an http or https address with a host, so a stored
// link can't run script when opened.
func ValidDesignURL(value string) bool {
	if value == "" || len(value) > MaxDesignURLLength {
		return false
	}
	parsed, err := url.Parse(value)
	return err == nil && (parsed.Scheme == "https" || parsed.Scheme == "http") && parsed.Host != ""
}

// TagsAfterChangeSQL is the expression for column's tags with the text[] parameters addParam
// added and removeParam removed, deduplicated and sorted, so both services store tags alike.
func TagsAfterChangeSQL(column string, addParam, removeParam int) string {
	return fmt.Sprintf(`ARRAY(SELECT DISTINCT t FROM unnest(%s || $%d::text[]) t
			WHERE t <> ALL($%d::text[]) ORDER BY t)`, column, addParam, removeParam)
}
