package translationfileparser

import (
	"encoding/json"
	"regexp"
	"strings"
	"unicode"
)

// ImportOptions are per-file parse filters applied at ingest.
// The JSON shape is shared with the web app import-settings column.
type ImportOptions struct {
	HTML  HTMLImportOptions  `json:"html,omitempty"`
	JSON  JSONImportOptions  `json:"json,omitempty"`
	Excel ExcelImportOptions `json:"excel,omitempty"`
}

// HTMLImportOptions filters HTML files and HTML string values.
type HTMLImportOptions struct {
	// Extra tag names to skip in addition to head, script, style, and pre.
	ExcludedElements []string `json:"excludedElements,omitempty"`
	// When true, entries that look like ICU MessageFormat are marked format=icu.
	ICUSubfilter bool `json:"icuSubfilter,omitempty"`
}

// JSONImportOptions filters JSON and JSONC catalogs.
type JSONImportOptions struct {
	// Dotted paths to include. Empty means every non-metadata string.
	// A segment of "*" matches one key; "**" matches any remaining depth.
	KeyPaths []string `json:"keyPaths,omitempty"`
	// Dotted paths to drop after includes are applied.
	ExcludeKeyPaths []string `json:"excludeKeyPaths,omitempty"`
	// Sibling object field names copied onto matching string entries as context.
	ContextFields []string `json:"contextFields,omitempty"`
	// Sibling object field names read as a positive character limit.
	CharacterLimitFields []string `json:"characterLimitFields,omitempty"`
	// When true, string values that contain HTML tags are marked format=html.
	HTMLSubfilter bool `json:"htmlSubfilter,omitempty"`
	// When true, string values that look like ICU MessageFormat are marked format=icu.
	ICUSubfilter bool `json:"icuSubfilter,omitempty"`
}

// ExcelImportOptions maps multilingual workbook columns by 0-based position.
type ExcelImportOptions struct {
	// When false, row 0 is data. When true or omitted with a scheme, row 0 is a header.
	FirstLineContainsHeader *bool             `json:"firstLineContainsHeader,omitempty"`
	Columns                 ExcelColumnScheme `json:"columns,omitempty"`
}

// ExcelColumnScheme is 0-based column indexes. Missing fields stay auto-detected.
type ExcelColumnScheme struct {
	Identifier *int `json:"identifier,omitempty"`
	Source     *int `json:"source,omitempty"`
	Context    *int `json:"context,omitempty"`
	MaxLength  *int `json:"maxLength,omitempty"`
}

func (o HTMLImportOptions) active() bool {
	return len(normalizeNameList(o.ExcludedElements)) > 0 || o.ICUSubfilter
}

func (o JSONImportOptions) active() bool {
	return len(normalizeNameList(o.KeyPaths)) > 0 ||
		len(normalizeNameList(o.ExcludeKeyPaths)) > 0 ||
		len(normalizeNameList(o.ContextFields)) > 0 ||
		len(normalizeNameList(o.CharacterLimitFields)) > 0 ||
		o.HTMLSubfilter ||
		o.ICUSubfilter
}

func (c ExcelColumnScheme) active() bool {
	return c.Identifier != nil || c.Source != nil || c.Context != nil || c.MaxLength != nil
}

func (c ExcelColumnScheme) identifier() int {
	return optionalColumnIndex(c.Identifier)
}

func (c ExcelColumnScheme) source() int {
	return optionalColumnIndex(c.Source)
}

func (c ExcelColumnScheme) context() int {
	return optionalColumnIndex(c.Context)
}

func (c ExcelColumnScheme) maxLength() int {
	return optionalColumnIndex(c.MaxLength)
}

func optionalColumnIndex(value *int) int {
	if value == nil || *value < 0 {
		return -1
	}
	return *value
}

func (o ExcelImportOptions) headerRow() bool {
	if o.FirstLineContainsHeader != nil {
		return *o.FirstLineContainsHeader
	}
	return o.Columns.active()
}

func (o ExcelImportOptions) firstDataRow() int {
	if o.headerRow() {
		return 1
	}
	return 0
}

// ParseImportOptionsJSON decodes import settings. Empty or whitespace is a zero value.
func ParseImportOptionsJSON(raw []byte) (ImportOptions, error) {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" || trimmed == "{}" {
		return ImportOptions{}, nil
	}
	var opts ImportOptions
	if err := json.Unmarshal([]byte(trimmed), &opts); err != nil {
		return ImportOptions{}, err
	}
	return opts, nil
}

func normalizeNameList(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		out = append(out, trimmed)
	}
	return out
}

func normalizeFieldNameSet(values []string) map[string]struct{} {
	out := make(map[string]struct{}, len(values))
	for _, value := range normalizeNameList(values) {
		out[value] = struct{}{}
		out[strings.ToLower(value)] = struct{}{}
	}
	return out
}

func fieldNameInSet(name string, set map[string]struct{}) bool {
	if len(set) == 0 {
		return false
	}
	if _, ok := set[name]; ok {
		return true
	}
	_, ok := set[strings.ToLower(name)]
	return ok
}

var htmlTagHintPattern = regexp.MustCompile(`<(?:[A-Za-z][\w:-]*|/|[!?])`)

var icuArgumentPattern = regexp.MustCompile(`\{[A-Za-z_]\w*(?:\s*,\s*(?:plural|select|selectordinal|number|date|time)\b)?`)

func looksLikeHTML(value string) bool {
	return htmlTagHintPattern.MatchString(value)
}

func looksLikeICU(value string) bool {
	return icuArgumentPattern.MatchString(value)
}

func applyContentSubfilters(entry IngestEntry, htmlSubfilter, icuSubfilter bool) IngestEntry {
	if icuSubfilter && looksLikeICU(entry.Text) {
		entry.Format = "icu"
		return entry
	}
	if htmlSubfilter && looksLikeHTML(entry.Text) {
		entry.Format = "html"
	}
	return entry
}

func applyContentSubfiltersByKey(entries map[string]IngestEntry, htmlSubfilter, icuSubfilter bool) map[string]IngestEntry {
	if !htmlSubfilter && !icuSubfilter {
		return entries
	}
	out := make(map[string]IngestEntry, len(entries))
	for key, entry := range entries {
		out[key] = applyContentSubfilters(entry, htmlSubfilter, icuSubfilter)
	}
	return out
}

func htmlSkipElementSet(extra []string) map[string]bool {
	skip := make(map[string]bool, len(htmlSkipElements)+len(extra))
	for tag, value := range htmlSkipElements {
		skip[tag] = value
	}
	for _, raw := range extra {
		tag := normalizeHTMLExcludedElement(raw)
		if tag != "" {
			skip[tag] = true
		}
	}
	return skip
}

func normalizeHTMLExcludedElement(raw string) string {
	tag := strings.ToLower(strings.TrimSpace(raw))
	if tag == "" {
		return ""
	}
	if cut := strings.IndexAny(tag, ".#[ >:+~"); cut >= 0 {
		tag = tag[:cut]
	}
	tag = strings.TrimSpace(tag)
	if tag == "" {
		return ""
	}
	for _, r := range tag {
		if r != '-' && !unicode.IsLetter(r) && !unicode.IsDigit(r) {
			return ""
		}
	}
	return tag
}

func jsonKeyMatchesAny(key string, patterns []string) bool {
	if len(patterns) == 0 {
		return false
	}
	for _, pattern := range patterns {
		if jsonKeyMatches(key, pattern) {
			return true
		}
	}
	return false
}

func jsonKeyMatches(key, pattern string) bool {
	key = strings.TrimSpace(key)
	pattern = strings.TrimSpace(pattern)
	if pattern == "" {
		return false
	}
	if pattern == "**" || pattern == "*" {
		return key != ""
	}
	return matchJSONPathSegments(splitJSONPath(key), splitJSONPath(pattern))
}

func splitJSONPath(path string) []string {
	if path == "" {
		return nil
	}
	normalized := strings.ReplaceAll(path, "[", ".")
	normalized = strings.ReplaceAll(normalized, "]", "")
	parts := strings.Split(normalized, ".")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if part == "" {
			continue
		}
		out = append(out, part)
	}
	return out
}

func matchJSONPathSegments(key, pattern []string) bool {
	ki, pi := 0, 0
	for pi < len(pattern) {
		if pattern[pi] == "**" {
			if pi == len(pattern)-1 {
				return true
			}
			for next := ki; next <= len(key); next++ {
				if matchJSONPathSegments(key[next:], pattern[pi+1:]) {
					return true
				}
			}
			return false
		}
		if ki >= len(key) {
			return false
		}
		if pattern[pi] != "*" && pattern[pi] != key[ki] {
			return false
		}
		ki++
		pi++
	}
	return ki == len(key)
}

func filterJSONIngestEntries(entries map[string]IngestEntry, opts JSONImportOptions) map[string]IngestEntry {
	if len(entries) == 0 {
		return entries
	}
	includes := normalizeNameList(opts.KeyPaths)
	excludes := normalizeNameList(opts.ExcludeKeyPaths)
	if len(includes) == 0 && len(excludes) == 0 && !opts.HTMLSubfilter && !opts.ICUSubfilter {
		return entries
	}
	out := make(map[string]IngestEntry, len(entries))
	for key, entry := range entries {
		if len(includes) > 0 && !jsonKeyMatchesAny(key, includes) {
			continue
		}
		if jsonKeyMatchesAny(key, excludes) {
			continue
		}
		out[key] = applyContentSubfilters(entry, opts.HTMLSubfilter, opts.ICUSubfilter)
	}
	return out
}
