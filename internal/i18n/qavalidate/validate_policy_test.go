package qavalidate

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
)

func writePolicyFile(t *testing.T, contents string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "qa-policy.json")
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func marshalPolicy(t *testing.T, policy Policy) string {
	t.Helper()
	data, err := json.Marshal(policy)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func TestLoadPolicyRoundTripsDefaultPolicy(t *testing.T) {
	want := DefaultPolicy()
	want.GlossaryTerms = []GlossaryTerm{{SourceTerm: "Save", TargetTerm: "Enregistrer", TargetLocale: "fr-FR"}}
	want.AcceptedWordsByLocale = map[string][]string{"fr-FR": {"Hyperlocalise"}}

	got, err := LoadPolicy(writePolicyFile(t, marshalPolicy(t, want)))
	if err != nil {
		t.Fatalf("LoadPolicy: %v", err)
	}
	if got.Version != PolicyVersion {
		t.Fatalf("version = %d", got.Version)
	}
	if len(got.Checks) != len(checkTypes) {
		t.Fatalf("checks = %d, want %d", len(got.Checks), len(checkTypes))
	}
	for name, setting := range want.Checks {
		if got.Checks[name] != setting {
			t.Fatalf("check %s = %+v, want %+v", name, got.Checks[name], setting)
		}
	}
	if len(got.GlossaryTerms) != 1 || got.GlossaryTerms[0] != want.GlossaryTerms[0] {
		t.Fatalf("glossary terms = %+v", got.GlossaryTerms)
	}
	if words := got.AcceptedWordsByLocale["fr-FR"]; len(words) != 1 || words[0] != "Hyperlocalise" {
		t.Fatalf("accepted words = %+v", got.AcceptedWordsByLocale)
	}
}

func TestLoadPolicyAddsUnreachablePluralDefault(t *testing.T) {
	policy := DefaultPolicy()
	delete(policy.Checks, checkUnreachablePlural)

	got, err := LoadPolicy(writePolicyFile(t, marshalPolicy(t, policy)))
	if err != nil {
		t.Fatalf("LoadPolicy: %v", err)
	}
	if setting := got.Checks[checkUnreachablePlural]; !setting.Enabled || setting.Severity != "error" {
		t.Fatalf("unreachable plural = %+v", setting)
	}
}

func TestLoadPolicyErrors(t *testing.T) {
	missingFormat := DefaultPolicy()
	delete(missingFormat.Checks, "format")

	badSeverity := DefaultPolicy()
	badSeverity.Checks["length"] = Setting{Enabled: true, Severity: "fatal"}

	unknownCheck := DefaultPolicy()
	unknownCheck.Checks["made_up"] = Setting{Enabled: true, Severity: "warning"}

	wrongVersion := DefaultPolicy()
	wrongVersion.Version = PolicyVersion + 1

	tests := []struct {
		name    string
		path    string
		wantErr string
	}{
		{name: "missing file", path: filepath.Join(t.TempDir(), "missing.json"), wantErr: "no such file"},
		{name: "invalid json", path: writePolicyFile(t, "{not json"), wantErr: "decode QA policy"},
		{name: "unknown field", path: writePolicyFile(t, `{"version":1,"checks":{},"extra":true}`), wantErr: "decode QA policy"},
		{name: "wrong version", path: writePolicyFile(t, marshalPolicy(t, wrongVersion)), wantErr: "unsupported QA policy version"},
		{name: "missing check", path: writePolicyFile(t, marshalPolicy(t, missingFormat)), wantErr: "missing format"},
		{name: "bad severity", path: writePolicyFile(t, marshalPolicy(t, badSeverity)), wantErr: "invalid severity for length"},
		{name: "unknown check", path: writePolicyFile(t, marshalPolicy(t, unknownCheck)), wantErr: "unknown QA check made_up"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := LoadPolicy(tt.path)
			if err == nil {
				t.Fatal("expected error")
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("err = %v, want substring %q", err, tt.wantErr)
			}
		})
	}
}

func TestValidateBatchRejectsInvalidInput(t *testing.T) {
	invalid := DefaultPolicy()
	invalid.Version = 0
	if _, err := ValidateBatch(context.Background(), nil, invalid); err == nil {
		t.Fatal("expected invalid policy error")
	}

	policy := DefaultPolicy()
	policy.Checks["spelling"] = Setting{Enabled: false, Severity: "warning"}
	_, err := ValidateBatch(context.Background(), []Segment{{ID: "one", SourceText: "Hi", TargetText: "Salut"}}, policy)
	if err == nil || !strings.Contains(err.Error(), "targetLocale is required") {
		t.Fatalf("err = %v, want targetLocale error", err)
	}
}

func TestValidateBatchOptInLocaleChecks(t *testing.T) {
	segment := Segment{ID: "one", SourceText: "You have 3 items.", TargetText: "vous avez 4 articles", TargetLocale: "fr-FR"}

	policy := DefaultPolicy()
	policy.Checks["spelling"] = Setting{Enabled: false, Severity: "warning"}
	report, err := ValidateBatch(context.Background(), []Segment{segment}, policy)
	if err != nil {
		t.Fatal(err)
	}
	for _, finding := range report.Results[0].Checks {
		switch finding.CheckType {
		case "numbers_mismatch", "punctuation_mismatch", "character_case_mismatch":
			t.Fatalf("opt-in check %s ran while disabled by default", finding.CheckType)
		}
	}

	policy.Checks["numbers_mismatch"] = Setting{Enabled: true, Severity: "error"}
	policy.Checks["punctuation_mismatch"] = Setting{Enabled: true, Severity: "warning"}
	policy.Checks["character_case_mismatch"] = Setting{Enabled: true, Severity: "warning"}
	report, err = ValidateBatch(context.Background(), []Segment{segment}, policy)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]Finding{}
	for _, finding := range report.Results[0].Checks {
		got[finding.CheckType] = finding
	}
	for checkType, severity := range map[string]string{
		"numbers_mismatch":        "error",
		"punctuation_mismatch":    "warning",
		"character_case_mismatch": "warning",
	} {
		finding, ok := got[checkType]
		if !ok {
			t.Fatalf("missing %s in %+v", checkType, report.Results[0].Checks)
		}
		if finding.Severity != severity || finding.Category != "qa" || finding.RelatedTokens == nil {
			t.Fatalf("%s = %+v", checkType, finding)
		}
	}
}

func TestTypeForCheck(t *testing.T) {
	tests := []struct {
		check segmentvalidate.Check
		want  string
	}{
		{check: segmentvalidate.Check{ID: "qa-not-localized"}, want: "not_localized"},
		{check: segmentvalidate.Check{ID: "qa-whitespace-only"}, want: "whitespace_only"},
		{check: segmentvalidate.Check{ID: "qa-same-as-source"}, want: "same_as_source"},
		{check: segmentvalidate.Check{ID: "qa-escaped-char-mismatch"}, want: "escaped_char_mismatch"},
		{check: segmentvalidate.Check{ID: "qa-numbers-mismatch"}, want: "numbers_mismatch"},
		{check: segmentvalidate.Check{ID: "qa-punctuation-mismatch"}, want: "punctuation_mismatch"},
		{check: segmentvalidate.Check{ID: "qa-character-case-mismatch"}, want: "character_case_mismatch"},
		{check: segmentvalidate.Check{ID: "qa-unreachable-plural-case"}, want: checkUnreachablePlural},
		{check: segmentvalidate.Check{ID: "length"}, want: "length"},
		{check: segmentvalidate.Check{ID: "placeholder-parity", Category: "placeholder"}, want: "placeholder_mismatch"},
		{check: segmentvalidate.Check{ID: "format-parity", Category: "format"}, want: "format"},
		{check: segmentvalidate.Check{ID: "anything-else"}, want: "format"},
	}
	for _, tt := range tests {
		got := typeForCheck(tt.check)
		if got != tt.want {
			t.Errorf("typeForCheck(%+v) = %q, want %q", tt.check, got, tt.want)
		}
	}
	// Every mapped type must be a policy check, or ValidateBatch would drop it.
	known := map[string]bool{}
	for _, name := range checkTypes {
		known[name] = true
	}
	for _, tt := range tests {
		if !known[tt.want] {
			t.Errorf("typeForCheck result %q is not in checkTypes", tt.want)
		}
	}
}

func TestCategoryForCheck(t *testing.T) {
	for category, want := range map[string]string{
		"qa":          "qa",
		"length":      "length",
		"placeholder": "placeholder",
		"format":      "syntax",
		"icu":         "syntax",
		"":            "syntax",
	} {
		if got := categoryForCheck(segmentvalidate.Check{Category: category}); got != want {
			t.Errorf("categoryForCheck(%q) = %q, want %q", category, got, want)
		}
	}
}

func TestSpellingMessage(t *testing.T) {
	if got, want := spellingMessage("teh", nil), `"teh" may be misspelled.`; got != want {
		t.Fatalf("spellingMessage without suggestions = %q, want %q", got, want)
	}
	if got, want := spellingMessage("teh", []string{"the", "tea"}), `"teh" may be misspelled. Suggestions: the, tea.`; got != want {
		t.Fatalf("spellingMessage with suggestions = %q, want %q", got, want)
	}
}

func TestCountType(t *testing.T) {
	checks := []Finding{{CheckType: "spelling"}, {CheckType: "format"}, {CheckType: "spelling"}}
	if got := countType(checks, "spelling"); got != 2 {
		t.Fatalf("countType spelling = %d", got)
	}
	if got := countType(checks, "length"); got != 0 {
		t.Fatalf("countType length = %d", got)
	}
	if got := countType(nil, "spelling"); got != 0 {
		t.Fatalf("countType nil = %d", got)
	}
}

// installFakeHunspell puts a hunspell script on PATH that flags every word as
// misspelled with four suggestions, plus an en_US dictionary on DICPATH.
func installFakeHunspell(t *testing.T) {
	t.Helper()
	root := t.TempDir()
	dictDir := filepath.Join(root, "dict")
	binDir := filepath.Join(root, "bin")
	for _, dir := range []string{dictDir, binDir} {
		if err := os.Mkdir(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	for name, contents := range map[string]string{"en_US.aff": "SET UTF-8\n", "en_US.dic": "0\n"} {
		if err := os.WriteFile(filepath.Join(dictDir, name), []byte(contents), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	script := "#!/bin/sh\nprintf 'Hunspell 1.7\\n'\nwhile IFS= read -r word; do\n" +
		"  [ -z \"$word\" ] && continue\n  printf '& %s 4 0: aa, bb, cc, dd\\n\\n' \"$word\"\ndone\n"
	if err := os.WriteFile(filepath.Join(binDir, "hunspell"), []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DICPATH", dictDir)
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
}

func TestValidateBatchSpellingFindings(t *testing.T) {
	installFakeHunspell(t)

	policy := DefaultPolicy()
	policy.Checks["spelling"] = Setting{Enabled: true, Severity: "error"}
	policy.AcceptedWordsByLocale = map[string][]string{"en_US": {"Hyperlocalise"}}

	report, err := ValidateBatch(context.Background(), []Segment{
		{ID: "dedupe", SourceText: "src", TargetText: "Wrold wrold hyperlocalise", TargetLocale: "en-US"},
		{ID: "capped", SourceText: "src", TargetText: "alfa bravo charlie delta echo foxtrot golf", TargetLocale: "en-US"},
	}, policy)
	if err != nil {
		t.Fatal(err)
	}

	dedupe := spellingFindings(report.Results[0].Checks)
	if len(dedupe) != 1 {
		t.Fatalf("dedupe findings = %+v", dedupe)
	}
	finding := dedupe[0]
	if finding.Severity != "error" || finding.Category != "spelling" {
		t.Fatalf("finding = %+v", finding)
	}
	// The first spelling of a word wins, and suggestions are truncated to three.
	wantTokens := []string{"Wrold", "aa", "bb", "cc"}
	if strings.Join(finding.RelatedTokens, ",") != strings.Join(wantTokens, ",") {
		t.Fatalf("related tokens = %v, want %v", finding.RelatedTokens, wantTokens)
	}
	if finding.Message != `"Wrold" may be misspelled. Suggestions: aa, bb, cc.` {
		t.Fatalf("message = %q", finding.Message)
	}
	if report.Results[0].SkippedChecks != nil {
		t.Fatalf("skipped = %v", report.Results[0].SkippedChecks)
	}

	if capped := spellingFindings(report.Results[1].Checks); len(capped) != 5 {
		t.Fatalf("capped findings = %d, want 5: %+v", len(capped), capped)
	}
}

func spellingFindings(findings []Finding) []Finding {
	out := []Finding{}
	for _, finding := range findings {
		if finding.CheckType == "spelling" {
			out = append(out, finding)
		}
	}
	return out
}

func TestCollectSpellingSkipsWhenDictionaryMissing(t *testing.T) {
	installFakeHunspell(t)
	t.Setenv("DICPATH", t.TempDir())

	issues, skipped, err := collectSpelling(context.Background(), []Segment{
		{ID: "one", TargetText: "Wrold", TargetLocale: "en-US"},
	}, DefaultPolicy())
	if err != nil {
		t.Fatal(err)
	}
	if !skipped["en-US"] || len(issues) != 0 {
		t.Fatalf("issues = %v, skipped = %v", issues, skipped)
	}
}

func TestCollectSpellingDisabled(t *testing.T) {
	policy := DefaultPolicy()
	policy.Checks["spelling"] = Setting{Enabled: false, Severity: "warning"}
	issues, skipped, err := collectSpelling(context.Background(), []Segment{
		{ID: "one", TargetText: "Wrold", TargetLocale: "en-US"},
	}, policy)
	if err != nil {
		t.Fatal(err)
	}
	if len(issues) != 0 || len(skipped) != 0 {
		t.Fatalf("issues = %v, skipped = %v", issues, skipped)
	}
}
