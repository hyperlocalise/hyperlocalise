package cmd

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/qavalidate"
)

func TestValidateCommandTextAndFileInputs(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "target.txt")
	if err := os.WriteFile(target, []byte("Save"), 0o600); err != nil {
		t.Fatal(err)
	}
	command := newRootCmd("")
	output := new(bytes.Buffer)
	command.SetOut(output)
	command.SetArgs([]string{
		"validate", "--source-text", "Save", "--target-file", target,
		"--target-locale", "fr-FR", "--format", "json",
	})
	if err := command.Execute(); err != nil {
		t.Fatal(err)
	}
	var report qavalidate.Report
	if err := json.Unmarshal(output.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	if len(report.Results) != 1 {
		t.Fatalf("results = %d", len(report.Results))
	}
	found := false
	for _, check := range report.Results[0].Checks {
		if check.CheckType == "same_as_source" {
			found = true
		}
	}
	if !found {
		t.Fatalf("missing same_as_source: %+v", report.Results[0].Checks)
	}
}

func TestValidateCommandBatchUsesPolicyFile(t *testing.T) {
	dir := t.TempDir()
	policy := qavalidate.DefaultPolicy()
	policy.Checks["same_as_source"] = qavalidate.Setting{Enabled: false, Severity: "warning"}
	policyJSON, _ := json.Marshal(policy)
	policyPath := filepath.Join(dir, "policy.json")
	if err := os.WriteFile(policyPath, policyJSON, 0o600); err != nil {
		t.Fatal(err)
	}
	inputPath := filepath.Join(dir, "input.json")
	if err := os.WriteFile(inputPath, []byte(`{"segments":[{"id":"a","sourceText":"Save","targetText":"Save","targetLocale":"fr-FR"}]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	command := newRootCmd("")
	output := new(bytes.Buffer)
	command.SetOut(output)
	command.SetArgs([]string{"validate", "--input-file", inputPath, "--policy-file", policyPath, "--format", "json"})
	if err := command.Execute(); err != nil {
		t.Fatal(err)
	}
	var report qavalidate.Report
	if err := json.Unmarshal(output.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	for _, check := range report.Results[0].Checks {
		if check.CheckType == "same_as_source" {
			t.Fatalf("disabled check present: %+v", check)
		}
	}
}

func TestCheckCommandAppliesCloudQAPolicyToRepositoryEntries(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "en.json")
	targetPath := filepath.Join(dir, "fr.json")
	configPath := filepath.Join(dir, "i18n.jsonc")
	policyPath := filepath.Join(dir, "qa-policy.json")
	if err := os.WriteFile(sourcePath, []byte(`{"headline":"Save 123"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(targetPath, []byte(`{"headline":"Enregistrer 456"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	writeCheckConfig(t, configPath, sourcePath, targetPath, []string{"fr-FR"})
	policy := qavalidate.DefaultPolicy()
	policy.Checks["numbers_mismatch"] = qavalidate.Setting{Enabled: true, Severity: "error"}
	policy.Checks["spelling"] = qavalidate.Setting{Enabled: false, Severity: "warning"}
	data, _ := json.Marshal(policy)
	if err := os.WriteFile(policyPath, data, 0o600); err != nil {
		t.Fatal(err)
	}
	report := executeCheckJSON(t, configPath, "", "--qa-policy", policyPath, "--no-fail")
	found := false
	for _, finding := range report.Findings {
		if finding.Type == "numbers_mismatch" {
			found = true
			if finding.Severity != "error" {
				t.Fatalf("severity = %s", finding.Severity)
			}
		}
	}
	if !found {
		t.Fatalf("missing numbers_mismatch in %+v", report.Findings)
	}
}

func TestCheckCommandAppliesCloudQAPolicyWhenTargetFileMissing(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "en.json")
	targetPath := filepath.Join(dir, "fr.json")
	configPath := filepath.Join(dir, "i18n.jsonc")
	policyPath := filepath.Join(dir, "qa-policy.json")
	if err := os.WriteFile(sourcePath, []byte(`{"headline":"Save"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	writeCheckConfig(t, configPath, sourcePath, targetPath, []string{"fr-FR"})
	policy := qavalidate.DefaultPolicy()
	policy.Checks["spelling"] = qavalidate.Setting{Enabled: false, Severity: "warning"}
	data, _ := json.Marshal(policy)
	if err := os.WriteFile(policyPath, data, 0o600); err != nil {
		t.Fatal(err)
	}
	report := executeCheckJSON(t, configPath, "", "--qa-policy", policyPath, "--no-fail")
	foundMissingFile := false
	foundNotLocalized := false
	for _, finding := range report.Findings {
		if finding.Type == checkMissingTargetFile {
			foundMissingFile = true
		}
		if finding.Type == "not_localized" && finding.Key == "headline" {
			foundNotLocalized = true
		}
	}
	if !foundMissingFile {
		t.Fatalf("missing target file finding in %+v", report.Findings)
	}
	if !foundNotLocalized {
		t.Fatalf("missing not_localized finding in %+v", report.Findings)
	}
}
