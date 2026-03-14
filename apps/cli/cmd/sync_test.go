package cmd

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/quiet-circles/hyperlocalise/apps/cli/internal/i18n/syncsvc"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/storage"
	"github.com/spf13/cobra"
)

func TestSyncPullRequiresStorageConfig(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "i18n.jsonc")
	content := `{
	  "locales": {"source":"en","targets":["fr"]},
	  "buckets": {"json":{"files":[{"from":"lang/{{source}}.json","to":"lang/{{target}}.json"}]}},
	  "groups": {"default":{"targets":["fr"],"buckets":["json"]}},
	  "llm": {"profiles":{"default":{"provider":"openai","model":"gpt-4.1-mini","prompt":"Translate"}}}
	}`
	if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"sync", "pull", "--config", configPath})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected sync pull error without storage config")
	}
	if !strings.Contains(err.Error(), "storage config is required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestWriteSyncMarkdownGroupsByLocaleAndCategory(t *testing.T) {
	report := syncsvc.Report{
		Action: "pull",
		Creates: []storage.Entry{{
			Key:       "checkout.button.submit",
			Locale:    "de",
			Namespace: "ui/checkout.json",
			Value:     "Bestellen",
		}},
		Updates: []storage.Entry{{
			Key:       "checkout.total.label",
			Locale:    "fr",
			Namespace: "ui/checkout.json",
			Value:     "Total",
		}},
		Conflicts: []storage.Conflict{{
			ID:     storage.EntryID{Key: "email.cta", Locale: "fr"},
			Reason: "invariant_violation",
		}},
		Risky: []syncsvc.RiskChange{{
			ID:      storage.EntryID{Key: "email.cta", Locale: "fr"},
			Code:    "placeholder_edit",
			Message: "placeholder or ICU structure edited",
		}},
	}

	var out bytes.Buffer
	if err := writeSyncMarkdown(&out, report); err != nil {
		t.Fatalf("writeSyncMarkdown() error = %v", err)
	}

	md := out.String()
	for _, want := range []string{
		"## Translation Diff Summary",
		"### Risk Highlights",
		"### Diffs by Locale and Key Category",
		"#### `de`",
		"#### `fr`",
		"**ui/checkout.json/checkout**",
		"`conflict` `email.cta` (reason: invariant_violation) [RISK: placeholder_edit]",
	} {
		if !strings.Contains(md, want) {
			t.Fatalf("markdown output missing %q\n%s", want, md)
		}
	}
}

func TestWriteSyncReportMarkdownAlias(t *testing.T) {
	cmd := &cobra.Command{}
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)

	err := writeSyncReport(cmd, syncsvc.Report{Action: "pull"}, "md")
	if err != nil {
		t.Fatalf("writeSyncReport() error = %v", err)
	}
	if !strings.Contains(out.String(), "Translation Diff Summary") {
		t.Fatalf("expected markdown output, got: %s", out.String())
	}
}
