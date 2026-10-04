package qavalidate

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidateBatchAppliesCloudPolicy(t *testing.T) {
	policy := DefaultPolicy()
	policy.Checks["spelling"] = Setting{Enabled: false, Severity: "warning"}
	policy.Checks["same_as_source"] = Setting{Enabled: true, Severity: "error"}
	policy.GlossaryTerms = []GlossaryTerm{{SourceTerm: "Save", TargetTerm: "Enregistrer", TargetLocale: "fr-FR"}}
	report, err := ValidateBatch(context.Background(), []Segment{
		{ID: "one", SourceText: "Save", TargetText: "Save", TargetLocale: "fr-FR"},
	}, policy)
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Results) != 1 {
		t.Fatalf("results = %d", len(report.Results))
	}
	got := map[string]Finding{}
	for _, finding := range report.Results[0].Checks {
		got[finding.CheckType] = finding
	}
	if got["same_as_source"].Severity != "error" {
		t.Fatalf("same_as_source = %+v", got["same_as_source"])
	}
	if got["glossary_violation"].Severity != "warning" {
		t.Fatalf("glossary_violation = %+v", got["glossary_violation"])
	}
	if _, ok := got["spelling"]; ok {
		t.Fatal("spelling ran while disabled")
	}
}

func TestValidateBatchReportsSkippedSpelling(t *testing.T) {
	policy := DefaultPolicy()
	report, err := ValidateBatch(context.Background(), []Segment{
		{ID: "one", SourceText: "Hello", TargetText: "bonjour", TargetLocale: "xx-XX"},
	}, policy)
	if err != nil {
		t.Fatal(err)
	}
	skipped := report.Results[0].SkippedChecks
	if len(skipped) != 1 || skipped[0] != "spelling" {
		t.Fatalf("skipped = %v", skipped)
	}
}

func TestPolicyRequiresCompleteCheckSet(t *testing.T) {
	policy := DefaultPolicy()
	delete(policy.Checks, "format")
	if err := policy.Validate(); err == nil {
		t.Fatal("expected invalid policy")
	}
}

func TestGlossaryFindings(t *testing.T) {
	policy := DefaultPolicy()
	policy.GlossaryTerms = []GlossaryTerm{
		{SourceTerm: "Save", TargetTerm: "Enregistrer", TargetLocale: "fr-FR"},
		{SourceTerm: "Cancel", TargetTerm: "Annuler", TargetLocale: "fr-FR", CaseSensitive: true},
		{SourceTerm: "OK", TargetTerm: "OK", TargetLocale: "de-DE", Forbidden: true},
		{SourceTerm: "Draft", TargetTerm: "Brouillon", TargetLocale: "fr-FR"},
	}
	segment := Segment{SourceText: "Save and Cancel", TargetText: "Save and ANNULER", TargetLocale: "fr-FR"}

	findings := glossaryFindings(segment, policy)
	if len(findings) != 2 {
		t.Fatalf("findings = %+v", findings)
	}
	if findings[0].Message != `Glossary term "Save" requires "Enregistrer".` {
		t.Fatalf("required = %q", findings[0].Message)
	}
	if findings[1].Message != `Glossary term "Cancel" requires "Annuler".` {
		t.Fatalf("case-sensitive = %q", findings[1].Message)
	}

	forbidden := glossaryFindings(Segment{
		SourceText: "Press OK", TargetText: "Drücken Sie OK", TargetLocale: "de-DE",
	}, policy)
	if len(forbidden) != 1 || forbidden[0].Message != `Forbidden term "OK" appears in the target.` {
		t.Fatalf("forbidden = %+v", forbidden)
	}

	ok := glossaryFindings(Segment{
		SourceText: "Save Draft", TargetText: "Enregistrer le brouillon", TargetLocale: "fr-FR",
	}, policy)
	if len(ok) != 0 {
		t.Fatalf("matched required terms = %+v", ok)
	}

	policy.Checks["glossary_violation"] = Setting{Enabled: false, Severity: "warning"}
	if findings := glossaryFindings(segment, policy); len(findings) != 0 {
		t.Fatalf("disabled = %+v", findings)
	}
	policy.Checks["glossary_violation"] = Setting{Enabled: true, Severity: "warning"}
	if findings := glossaryFindings(Segment{
		SourceText: "Save", TargetText: "   ", TargetLocale: "fr-FR",
	}, policy); len(findings) != 0 {
		t.Fatalf("empty target = %+v", findings)
	}
}

func TestCollectSpellingPreservesWordCaseForHunspell(t *testing.T) {
	root := t.TempDir()
	dictDir := filepath.Join(root, "dict")
	if err := os.Mkdir(dictDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dictDir, "en_US.aff"), []byte("SET UTF-8\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dictDir, "en_US.dic"), []byte("0\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DICPATH", dictDir)

	logPath := filepath.Join(root, "words.log")
	binDir := filepath.Join(root, "bin")
	if err := os.Mkdir(binDir, 0o755); err != nil {
		t.Fatal(err)
	}
	script := "#!/bin/sh\nprintf 'Hunspell 1.7\\n'\nwhile IFS= read -r word; do\n" +
		"  [ -z \"$word\" ] && continue\n  printf '%s\\n' \"$word\" >> \"" + logPath + "\"\n  printf '*\\n\\n'\ndone\n"
	if err := os.WriteFile(filepath.Join(binDir, "hunspell"), []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	policy := DefaultPolicy()
	policy.AcceptedWordsByLocale = map[string][]string{}
	_, skipped, err := collectSpelling(context.Background(), []Segment{
		{ID: "one", SourceText: "Title", TargetText: "Bonjour Paris", TargetLocale: "en-US"},
	}, policy)
	if err != nil {
		t.Fatal(err)
	}
	if skipped["en-US"] {
		t.Fatalf("skipped = %v", skipped)
	}
	logged, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatal(err)
	}
	text := string(logged)
	if !strings.Contains(text, "Paris") {
		t.Fatalf("logged words = %q", text)
	}
	if strings.Contains(text, "paris\n") || strings.Contains(text, "paris\r") {
		t.Fatalf("logged lowercase word = %q", text)
	}
}

func TestRunHunspellParsesOneResponsePerWord(t *testing.T) {
	path := filepath.Join(t.TempDir(), "fake-hunspell")
	script := "#!/bin/sh\nprintf 'Hunspell 1.7\\n& bad 1 0: good\\n\\n*\\n\\n'\n"
	if err := os.WriteFile(path, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	issues, err := runHunspell(context.Background(), path, "unused", []string{"bad", "good"})
	if err != nil {
		t.Fatal(err)
	}
	if len(issues["bad"]) != 1 || issues["bad"][0] != "good" {
		t.Fatalf("bad = %v", issues["bad"])
	}
	if _, exists := issues["good"]; exists {
		t.Fatalf("good = %v", issues["good"])
	}
}
