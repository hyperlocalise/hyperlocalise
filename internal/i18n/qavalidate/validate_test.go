package qavalidate

import (
	"context"
	"os"
	"path/filepath"
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
