package segmentvalidate

import (
	"fmt"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/htmltagparity"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

type Request struct {
	SourceText string
	TargetText string
	SourcePath string
	MaxLength  int
	Modes      []string `json:"modes,omitempty"`
}

type Check struct {
	ID            string   `json:"id"`
	Label         string   `json:"label"`
	Status        string   `json:"status"`
	Message       string   `json:"message"`
	Category      string   `json:"category,omitempty"`
	RelatedTokens []string `json:"relatedTokens,omitempty"`
}

const (
	StatusPass = "pass"
	StatusWarn = "warn"
	StatusFail = "fail"
)

// ValidateSegment runs format, length, and optional QA checks for a CAT segment.
func ValidateSegment(req Request) []Check {
	// BOLT OPTIMIZATION: Reduce initial capacity from 6 to 2 because most segments only
	// return a single pass check (and occasionally a QA warning). This avoids allocating
	// a large slice of 6 Check structs (~576 bytes) on the heap for the common path.
	checks := make([]Check, 0, 2)

	if req.MaxLength > 0 && utf8.RuneCountInString(req.TargetText) > req.MaxLength {
		checks = append(checks, Check{
			ID:       "length",
			Label:    "Length",
			Status:   StatusFail,
			Message:  fmt.Sprintf("Translation exceeds %d characters.", req.MaxLength),
			Category: "length",
		})
	}

	kind := KindForSourcePath(req.SourcePath)
	hasICUTokens, formatErr := validateForKindWithTokens(kind, req.SourceText, req.TargetText)
	var hasProfileTokens bool
	var profileErr error
	if formatErr == nil && kind != FormatMarkdown {
		hasProfileTokens, profileErr = validateProfileParityWithTokens(req.SourceText, req.TargetText)
	}

	switch {
	case formatErr != nil:
		checks = append(checks, checkFromError(formatErr))
	case profileErr != nil:
		checks = append(checks, checkFromError(profileErr))
	default:
		hasTokens := false
		if kind == FormatMarkdown {
			hasTokens = strings.Contains(req.SourceText, "\x1eHLMDPH_") || hasICUTokens || profileHasFormatTokens(req.SourceText)
		} else {
			hasTokens = hasICUTokens || hasProfileTokens
		}
		label := "Format"
		message := "No placeholders or ICU blocks detected."
		if hasTokens {
			label = "Placeholders & ICU"
			message = "Target keeps the required placeholders and ICU structure."
		}

		checks = append(checks, Check{
			ID:       "format-parity",
			Label:    label,
			Status:   StatusPass,
			Message:  message,
			Category: "placeholder",
		})
	}

	checks = append(checks, qaChecks(req)...)
	return checks
}

// FirstValidationError returns the first validation failure using runsvc-compatible messages.
func FirstValidationError(sourcePath, source, target string) error {
	return validateForKind(KindForSourcePath(sourcePath), source, target)
}

func validateForKind(kind FormatKind, source, translated string) error {
	_, err := validateForKindWithTokens(kind, source, translated)
	return err
}

func validateForKindWithTokens(kind FormatKind, source, translated string) (bool, error) {
	var err error
	var hasICUTokens bool
	switch kind {
	case FormatMarkdown:
		if err = translationfileparser.ValidateMarkdownTranslatedBlockStructure(source, translated); err != nil {
			return false, err
		}
		if err = translationfileparser.ValidateMarkdownInternalPlaceholders(source, translated); err != nil {
			return false, err
		}
		if translationfileparser.IntroducesRawHTMLSyntax(translationfileparser.RawHTMLSyntaxStartCount(source), translated) {
			return false, fmt.Errorf("raw HTML syntax introduced in translated markdown")
		}
		hasICUTokens, err = validateICUInvariantWithTokens(source, translated)
	case FormatHTML:
		if htmltagparity.Mismatch(source, translated) {
			return false, fmt.Errorf("html tag structure differs from source | %s", formatInvariantDebugContext(source, translated))
		}
		if translationfileparser.IntroducesRawHTMLSyntax(translationfileparser.RawHTMLSyntaxStartCount(source), translated) {
			return false, fmt.Errorf("raw HTML syntax introduced in translated html")
		}
		hasICUTokens, err = validateICUInvariantWithTokens(source, translated)
	case FormatLiquid:
		if err = translationfileparser.ValidateLiquidInternalPlaceholders(source, translated); err != nil {
			return false, err
		}
		if translationfileparser.IntroducesRawHTMLSyntax(translationfileparser.RawHTMLSyntaxStartCount(source), translated) {
			return false, fmt.Errorf("raw HTML syntax introduced in translated liquid")
		}
		hasICUTokens, err = validateICUInvariantWithTokens(source, translated)
	default:
		hasICUTokens, err = validateICUInvariantWithTokens(source, translated)
	}
	if err != nil {
		return false, err
	}
	return hasICUTokens, nil
}

func checkFromError(err error) Check {
	message := err.Error()
	lower := strings.ToLower(message)

	switch {
	case strings.Contains(lower, "exceeds") && strings.Contains(lower, "characters"):
		return Check{
			ID:       "length",
			Label:    "Length",
			Status:   StatusFail,
			Message:  message,
			Category: "length",
		}
	case strings.Contains(lower, "invalid icu/braces structure"):
		return Check{
			ID:       "format-parse-error",
			Label:    "ICU syntax",
			Status:   StatusFail,
			Message:  message,
			Category: "syntax",
		}
	case strings.Contains(lower, "extra placeholder parity mismatch"):
		return Check{
			ID:            "format-extra-placeholder-mismatch",
			Label:         "Missing placeholders",
			Status:        StatusFail,
			Message:       message,
			Category:      "placeholder",
			RelatedTokens: placeholderTokensFromMessage(message),
		}
	case strings.Contains(lower, "whitespace profile mismatch"):
		return Check{
			ID:       "format-whitespace-profile",
			Label:    "Whitespace",
			Status:   StatusFail,
			Message:  message,
			Category: "syntax",
		}
	case strings.Contains(lower, "special character parity mismatch"):
		return Check{
			ID:       "format-special-char-mismatch",
			Label:    "Special characters",
			Status:   StatusFail,
			Message:  message,
			Category: "syntax",
		}
	case strings.Contains(lower, "placeholder parity mismatch"):
		return Check{
			ID:            "format-missing-token",
			Label:         "Missing placeholders",
			Status:        StatusFail,
			Message:       message,
			Category:      "placeholder",
			RelatedTokens: placeholderTokensFromMessage(message),
		}
	case strings.Contains(lower, "icu parity mismatch"):
		return Check{
			ID:            "format-icu-mismatch",
			Label:         "ICU structure",
			Status:        StatusFail,
			Message:       message,
			Category:      "icu",
			RelatedTokens: icuTokensFromMessage(message),
		}
	case strings.Contains(lower, "duplicate # tokens"):
		return Check{
			ID:       "format-icu-duplicate-pound",
			Label:    "ICU structure",
			Status:   StatusFail,
			Message:  message,
			Category: "icu",
		}
	case strings.Contains(lower, "html tag"):
		return Check{
			ID:       "format-html-tag-mismatch",
			Label:    "HTML tags",
			Status:   StatusFail,
			Message:  message,
			Category: "syntax",
		}
	case strings.Contains(lower, "raw html"):
		return Check{
			ID:       "format-raw-html",
			Label:    "HTML safety",
			Status:   StatusFail,
			Message:  message,
			Category: "syntax",
		}
	case strings.Contains(lower, "placeholder"):
		return Check{
			ID:       "format-placeholder-mismatch",
			Label:    "Placeholders",
			Status:   StatusFail,
			Message:  message,
			Category: "placeholder",
		}
	case strings.Contains(lower, "structure"):
		return Check{
			ID:       "format-markdown-structure",
			Label:    "Markdown structure",
			Status:   StatusFail,
			Message:  message,
			Category: "syntax",
		}
	default:
		return Check{
			ID:       "format-validation",
			Label:    "Format",
			Status:   StatusFail,
			Message:  message,
			Category: "syntax",
		}
	}
}

func placeholderTokensFromMessage(message string) []string {
	expected, _ := extractListAfter(message, "expected ", ", got")
	if expected == "" {
		return nil
	}
	return formatPlaceholderNames(expected)
}

func icuTokensFromMessage(message string) []string {
	expected, _ := extractListAfter(message, "expected ", ", got")
	if expected == "" {
		return nil
	}
	return []string{expected}
}

func formatPlaceholderNames(rawList string) []string {
	rawList = strings.Trim(rawList, "[] ")
	if rawList == "" {
		return nil
	}

	// Use a simple scanner to extract quoted strings (from %q) or unquoted tokens.
	var out []string
	for i := 0; i < len(rawList); {
		// Skip separators
		if rawList[i] == ' ' || rawList[i] == ',' {
			i++
			continue
		}

		if rawList[i] == '"' {
			j := i + 1
			for j < len(rawList) {
				if rawList[j] == '"' {
					break
				}
				if rawList[j] == '\\' && j+1 < len(rawList) {
					j += 2
				} else {
					j++
				}
			}
			if j < len(rawList) {
				// We found a closing quote. In Go, %q produces a valid string literal.
				val, err := strconv.Unquote(rawList[i : j+1])
				if err != nil {
					// Fallback for failed unquoting
					val = strings.ReplaceAll(rawList[i+1:j], `\"`, `"`)
				}
				if placeholder := finalizePlaceholderName(val); placeholder != "" {
					out = append(out, placeholder)
				}
				i = j + 1
				continue
			}
		}

		// Fallback for unquoted parts (backward compatibility or non-quoted output)
		j := i
		for j < len(rawList) && rawList[j] != ' ' && rawList[j] != ',' {
			j++
		}
		if i != j {
			val := rawList[i:j]
			if placeholder := finalizePlaceholderName(val); placeholder != "" {
				out = append(out, placeholder)
			}
		}
		i = j
	}

	slices.Sort(out)
	return out
}

func finalizePlaceholderName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	if strings.HasPrefix(name, "%") || strings.HasPrefix(name, "$") || strings.HasPrefix(name, "{") {
		return name
	}
	return "{" + name + "}"
}

func extractListAfter(message, prefix, suffix string) (string, string) {
	start := strings.Index(message, prefix)
	if start < 0 {
		return "", message
	}
	start += len(prefix)
	end := strings.Index(message[start:], suffix)
	if end < 0 {
		return strings.TrimSpace(message[start:]), message
	}
	return strings.TrimSpace(message[start : start+end]), message
}

func trimSpace(value string) string {
	return strings.TrimSpace(value)
}
