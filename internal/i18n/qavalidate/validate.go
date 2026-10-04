// Package qavalidate applies the cloud QA policy to local source/target segments.
package qavalidate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/spellcheck"
)

const PolicyVersion = 1

var checkTypes = []string{
	"not_localized", "whitespace_only", "same_as_source", "escaped_char_mismatch",
	"length", "placeholder_mismatch", "glossary_violation", "format", "spelling",
	"numbers_mismatch", "punctuation_mismatch", "character_case_mismatch",
}

type Setting struct {
	Enabled  bool   `json:"enabled"`
	Severity string `json:"severity"`
}

type GlossaryTerm struct {
	SourceTerm    string `json:"sourceTerm"`
	TargetTerm    string `json:"targetTerm"`
	TargetLocale  string `json:"targetLocale"`
	Forbidden     bool   `json:"forbidden"`
	CaseSensitive bool   `json:"caseSensitive"`
}

type Policy struct {
	Version               int                 `json:"version"`
	Checks                map[string]Setting  `json:"checks"`
	GlossaryTerms         []GlossaryTerm      `json:"glossaryTerms,omitempty"`
	AcceptedWordsByLocale map[string][]string `json:"acceptedWordsByLocale,omitempty"`
}

type Segment struct {
	ID           string `json:"id"`
	SourceText   string `json:"sourceText"`
	TargetText   string `json:"targetText"`
	SourcePath   string `json:"sourcePath,omitempty"`
	TargetLocale string `json:"targetLocale"`
	MaxLength    int    `json:"maxLength,omitempty"`
}

type Finding struct {
	CheckType     string   `json:"checkType"`
	Severity      string   `json:"severity"`
	Category      string   `json:"category"`
	Message       string   `json:"message"`
	RelatedTokens []string `json:"relatedTokens"`
}

type Result struct {
	ID            string    `json:"id"`
	Checks        []Finding `json:"checks"`
	SkippedChecks []string  `json:"skippedChecks,omitempty"`
}

type Report struct {
	Results []Result `json:"results"`
}

func DefaultPolicy() Policy {
	checks := map[string]Setting{
		"not_localized":           {true, "error"},
		"whitespace_only":         {true, "warning"},
		"same_as_source":          {true, "warning"},
		"escaped_char_mismatch":   {true, "warning"},
		"length":                  {true, "error"},
		"placeholder_mismatch":    {true, "error"},
		"glossary_violation":      {true, "warning"},
		"format":                  {true, "error"},
		"spelling":                {true, "warning"},
		"numbers_mismatch":        {false, "warning"},
		"punctuation_mismatch":    {false, "warning"},
		"character_case_mismatch": {false, "warning"},
	}
	return Policy{Version: PolicyVersion, Checks: checks}
}

func (p Policy) Validate() error {
	if p.Version != PolicyVersion {
		return fmt.Errorf("unsupported QA policy version %d", p.Version)
	}
	if len(p.Checks) != len(checkTypes) {
		return errors.New("QA policy must contain all 12 checks")
	}
	for _, name := range checkTypes {
		setting, ok := p.Checks[name]
		if !ok {
			return fmt.Errorf("QA policy is missing %s", name)
		}
		if setting.Severity != "error" && setting.Severity != "warning" {
			return fmt.Errorf("invalid severity for %s", name)
		}
	}
	return nil
}

func LoadPolicy(path string) (Policy, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Policy{}, err
	}
	var policy Policy
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&policy); err != nil {
		return Policy{}, fmt.Errorf("decode QA policy: %w", err)
	}
	if err := policy.Validate(); err != nil {
		return Policy{}, err
	}
	return policy, nil
}

func ValidateBatch(ctx context.Context, segments []Segment, policy Policy) (Report, error) {
	if err := policy.Validate(); err != nil {
		return Report{}, err
	}
	spelling, skipped, err := collectSpelling(ctx, segments, policy)
	if err != nil {
		return Report{}, err
	}
	report := Report{Results: make([]Result, 0, len(segments))}
	for _, segment := range segments {
		if segment.TargetLocale == "" {
			return Report{}, errors.New("targetLocale is required")
		}
		modes := make([]string, 0, 7)
		for _, mode := range segmentvalidate.KnownQAModes() {
			if policy.Checks[mode].Enabled {
				modes = append(modes, mode)
			}
		}
		checks := segmentvalidate.ValidateSegment(segmentvalidate.Request{
			SourceText: segment.SourceText, TargetText: segment.TargetText,
			SourcePath: segment.SourcePath, TargetLocale: segment.TargetLocale,
			MaxLength: segment.MaxLength, Modes: modes,
		})
		result := Result{ID: segment.ID, Checks: []Finding{}}
		for _, check := range checks {
			if check.Status == segmentvalidate.StatusPass {
				continue
			}
			checkType := typeForCheck(check)
			setting := policy.Checks[checkType]
			if !setting.Enabled {
				continue
			}
			result.Checks = append(result.Checks, Finding{
				CheckType: checkType, Severity: setting.Severity, Category: categoryForCheck(check),
				Message: check.Message, RelatedTokens: nonNil(check.RelatedTokens),
			})
		}
		result.Checks = append(result.Checks, glossaryFindings(segment, policy)...)
		if policy.Checks["spelling"].Enabled {
			if skipped[segment.TargetLocale] {
				result.SkippedChecks = []string{"spelling"}
			} else {
				seen := map[string]bool{}
				for _, word := range spellcheck.Tokenize(segment.TargetText) {
					key := strings.ToLower(word)
					if seen[key] {
						continue
					}
					seen[key] = true
					if issue, ok := spelling[segment.TargetLocale][key]; ok {
						result.Checks = append(result.Checks, Finding{
							CheckType: "spelling", Severity: policy.Checks["spelling"].Severity,
							Category: "spelling", Message: spellingMessage(word, issue),
							RelatedTokens: append([]string{word}, issue...),
						})
						if countType(result.Checks, "spelling") >= 5 {
							break
						}
					}
				}
			}
		}
		report.Results = append(report.Results, result)
	}
	return report, nil
}

func typeForCheck(check segmentvalidate.Check) string {
	switch check.ID {
	case "qa-not-localized":
		return "not_localized"
	case "qa-whitespace-only":
		return "whitespace_only"
	case "qa-same-as-source":
		return "same_as_source"
	case "qa-escaped-char-mismatch":
		return "escaped_char_mismatch"
	case "qa-numbers-mismatch":
		return "numbers_mismatch"
	case "qa-punctuation-mismatch":
		return "punctuation_mismatch"
	case "qa-character-case-mismatch":
		return "character_case_mismatch"
	case "length":
		return "length"
	}
	if check.Category == "placeholder" {
		return "placeholder_mismatch"
	}
	return "format"
}

func categoryForCheck(check segmentvalidate.Check) string {
	switch check.Category {
	case "qa", "length", "placeholder":
		return check.Category
	default:
		return "syntax"
	}
}

func glossaryFindings(segment Segment, policy Policy) []Finding {
	if !policy.Checks["glossary_violation"].Enabled || strings.TrimSpace(segment.TargetText) == "" {
		return nil
	}
	findings := []Finding{}
	for _, term := range policy.GlossaryTerms {
		if term.TargetLocale != segment.TargetLocale || term.SourceTerm == "" || term.TargetTerm == "" {
			continue
		}
		source, sourceTerm := segment.SourceText, term.SourceTerm
		target, targetTerm := segment.TargetText, term.TargetTerm
		if !term.CaseSensitive {
			source, sourceTerm = strings.ToLower(source), strings.ToLower(sourceTerm)
			target, targetTerm = strings.ToLower(target), strings.ToLower(targetTerm)
		}
		if !strings.Contains(source, sourceTerm) {
			continue
		}
		contains := strings.Contains(target, targetTerm)
		if term.Forbidden && !contains || !term.Forbidden && contains {
			continue
		}
		message := fmt.Sprintf("Glossary term %q requires %q.", term.SourceTerm, term.TargetTerm)
		if term.Forbidden {
			message = fmt.Sprintf("Forbidden term %q appears in the target.", term.TargetTerm)
		}
		findings = append(findings, Finding{
			"glossary_violation", policy.Checks["glossary_violation"].Severity,
			"glossary", message,
			[]string{term.TargetTerm},
		})
	}
	return findings
}

func nonNil(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func countType(checks []Finding, name string) int {
	n := 0
	for _, check := range checks {
		if check.CheckType == name {
			n++
		}
	}
	return n
}

func spellingMessage(word string, suggestions []string) string {
	if len(suggestions) == 0 {
		return fmt.Sprintf("%q may be misspelled.", word)
	}
	return fmt.Sprintf("%q may be misspelled. Suggestions: %s.", word, strings.Join(suggestions, ", "))
}

func collectSpelling(ctx context.Context, segments []Segment, policy Policy) (map[string]map[string][]string, map[string]bool, error) {
	issues := map[string]map[string][]string{}
	skipped := map[string]bool{}
	if !policy.Checks["spelling"].Enabled {
		return issues, skipped, nil
	}
	wordsByLocale := map[string]map[string]bool{}
	accepted := map[string]map[string]bool{}
	for locale, words := range policy.AcceptedWordsByLocale {
		key := strings.ToLower(strings.ReplaceAll(locale, "_", "-"))
		accepted[key] = map[string]bool{}
		for _, word := range words {
			accepted[key][strings.ToLower(word)] = true
		}
	}
	for _, segment := range segments {
		locale := segment.TargetLocale
		if wordsByLocale[locale] == nil {
			wordsByLocale[locale] = map[string]bool{}
		}
		for _, word := range spellcheck.Tokenize(segment.TargetText) {
			key := strings.ToLower(word)
			if !accepted[strings.ToLower(strings.ReplaceAll(locale, "_", "-"))][key] {
				wordsByLocale[locale][key] = true
			}
		}
	}
	binary, binaryErr := exec.LookPath("hunspell")
	registry := spellcheck.LoadRegistry()
	for locale, words := range wordsByLocale {
		files, err := registry.Resolve(locale)
		if binaryErr != nil || err != nil {
			skipped[locale] = true
			continue
		}
		dictionaryDir := os.Getenv("DICPATH")
		if dictionaryDir == "" {
			dictionaryDir = "/usr/share/hunspell"
		}
		base := strings.TrimSuffix(files.AffFile, filepath.Ext(files.AffFile))
		dictionary := filepath.Join(dictionaryDir, base)
		if _, err := os.Stat(dictionary + ".aff"); err != nil {
			skipped[locale] = true
			continue
		}
		ordered := make([]string, 0, len(words))
		for word := range words {
			ordered = append(ordered, word)
		}
		sort.Strings(ordered)
		if len(ordered) == 0 {
			continue
		}
		output, err := runHunspell(ctx, binary, dictionary, ordered)
		if err != nil {
			if ctx.Err() != nil {
				return nil, nil, ctx.Err()
			}
			skipped[locale] = true
			continue
		}
		issues[locale] = output
	}
	return issues, skipped, nil
}

func runHunspell(ctx context.Context, binary, dictionary string, words []string) (map[string][]string, error) {
	command := exec.CommandContext(ctx, binary, "-a", "-i", "UTF-8", "-d", dictionary)
	command.Stdin = strings.NewReader(strings.Join(words, "\n") + "\n")
	output, err := command.Output()
	if err != nil {
		return nil, err
	}
	lines := strings.Split(strings.ReplaceAll(string(output), "\r\n", "\n"), "\n")
	if len(lines) == 0 {
		return nil, errors.New("empty hunspell output")
	}
	result := map[string][]string{}
	index := 0
	for _, line := range lines[1:] {
		line = strings.TrimSpace(line)
		if line == "" {
			if index < len(words) {
				index++
			}
			continue
		}
		if index >= len(words) {
			break
		}
		if strings.HasPrefix(line, "# ") {
			result[words[index]] = []string{}
			continue
		}
		if strings.HasPrefix(line, "& ") {
			parts := strings.SplitN(line, ": ", 2)
			suggestions := []string{}
			if len(parts) == 2 {
				suggestions = strings.Split(parts[1], ", ")
			}
			if len(suggestions) > 3 {
				suggestions = suggestions[:3]
			}
			result[words[index]] = suggestions
		}
	}
	return result, nil
}
