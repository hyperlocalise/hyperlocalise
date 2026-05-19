package cmd

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExtractCommandExtractsReactIntlMessages(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	sourcePath := filepath.Join(dir, "src", "components", "AppHeader.tsx")
	writeExtractTestFile(t, sourcePath, `
import { defineMessage, defineMessages, FormattedMessage, useIntl } from "react-intl";

const messages = defineMessages({
  title: {
    id: "app.header.title",
    defaultMessage: "Dashboard",
    description: "Main dashboard heading",
  },
  cta: {
    id: 'app.header.cta',
    defaultMessage: 'Create project',
  },
});

const subtitle = defineMessage({
  id: "app.header.subtitle",
  defaultMessage: "Translate files without drama",
  description: `+"`"+`Subheading copy`+"`"+`,
});

export function AppHeader() {
  const intl = useIntl();
  const label = intl.formatMessage({
    id: "app.header.refresh",
    defaultMessage: "Refresh",
    description: "Refresh button label",
  });

  return (
    <FormattedMessage
      id="app.header.empty"
      defaultMessage="No projects yet"
      description={"Empty project list text"}
    />
  );
}
`)

	cmd := newExtractCmd()
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"src"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute extract command: %v", err)
	}

	var messages []extractMessage
	if err := json.Unmarshal(out.Bytes(), &messages); err != nil {
		t.Fatalf("decode extract output: %v\noutput=%s", err, out.String())
	}

	got := extractTestMessageMap(messages)
	want := map[string]extractMessage{
		"app.header.title": {
			ID:             "app.header.title",
			DefaultMessage: "Dashboard",
			Description:    "Main dashboard heading",
		},
		"app.header.cta": {
			ID:             "app.header.cta",
			DefaultMessage: "Create project",
		},
		"app.header.subtitle": {
			ID:             "app.header.subtitle",
			DefaultMessage: "Translate files without drama",
			Description:    "Subheading copy",
		},
		"app.header.refresh": {
			ID:             "app.header.refresh",
			DefaultMessage: "Refresh",
			Description:    "Refresh button label",
		},
		"app.header.empty": {
			ID:             "app.header.empty",
			DefaultMessage: "No projects yet",
			Description:    "Empty project list text",
		},
	}

	if len(got) != len(want) {
		t.Fatalf("message count = %d, want %d; output=%s", len(got), len(want), out.String())
	}
	for id, wantMessage := range want {
		gotMessage, ok := got[id]
		if !ok {
			t.Fatalf("missing message %q in output=%s", id, out.String())
		}
		if gotMessage.ID != wantMessage.ID ||
			gotMessage.DefaultMessage != wantMessage.DefaultMessage ||
			gotMessage.Description != wantMessage.Description {
			t.Fatalf("message %q = %#v, want %#v", id, gotMessage, wantMessage)
		}
	}

	if strings.Contains(out.String(), sourcePath) {
		t.Fatalf("output should not include source metadata: %s", out.String())
	}
}

func TestExtractCommandPrefixesIDWithNormalizedFilename(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	sourcePath := filepath.Join(dir, "src", "components", "AppHeader.tsx")
	writeExtractTestFile(t, sourcePath, `
import { FormattedMessage } from "react-intl";

export function AppHeader() {
  return <FormattedMessage id="title" defaultMessage="Dashboard" description="Heading" />;
}
`)

	cmd := newExtractCmd()
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"src", "--prefix-id"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute extract command: %v", err)
	}

	var messages []extractMessage
	if err := json.Unmarshal(out.Bytes(), &messages); err != nil {
		t.Fatalf("decode extract output: %v\noutput=%s", err, out.String())
	}
	if got, want := len(messages), 1; got != want {
		t.Fatalf("message count = %d, want %d; output=%s", got, want, out.String())
	}
	if got, want := messages[0].ID, "src.components.app-header.title"; got != want {
		t.Fatalf("prefixed id = %q, want %q", got, want)
	}
}

func TestExtractCommandSkipsIgnoredDirectoriesAndDeclarations(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	writeExtractTestFile(t, filepath.Join(dir, "src", "visible.tsx"), `
import { defineMessage } from "react-intl";

export const message = defineMessage({
  id: "visible",
  defaultMessage: "Visible",
});
`)
	writeExtractTestFile(t, filepath.Join(dir, "src", "types.d.ts"), `
export const message: { id: "types"; defaultMessage: "Types" };
`)
	writeExtractTestFile(t, filepath.Join(dir, "node_modules", "package", "hidden.tsx"), `
import { defineMessage } from "react-intl";

export const message = defineMessage({
  id: "hidden",
  defaultMessage: "Hidden",
});
`)

	cmd := newExtractCmd()
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute extract command: %v", err)
	}

	var messages []extractMessage
	if err := json.Unmarshal(out.Bytes(), &messages); err != nil {
		t.Fatalf("decode extract output: %v\noutput=%s", err, out.String())
	}
	if got, want := len(messages), 1; got != want {
		t.Fatalf("message count = %d, want %d; output=%s", got, want, out.String())
	}
	if got, want := messages[0].ID, "visible"; got != want {
		t.Fatalf("id = %q, want %q", got, want)
	}
}

func TestRootHelpIncludesExtractCommand(t *testing.T) {
	cmd := newRootCmd("")
	b := bytes.NewBufferString("")

	cmd.SetArgs([]string{"-h"})
	cmd.SetOut(b)

	if err := cmd.Execute(); err != nil {
		t.Fatalf("run root help: %v", err)
	}

	if !strings.Contains(b.String(), "extract") {
		t.Fatalf("expected help to include extract command, got %q", b.String())
	}
}

func writeExtractTestFile(t *testing.T, path, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create test directory: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write test file: %v", err)
	}
}

func extractTestMessageMap(messages []extractMessage) map[string]extractMessage {
	byID := make(map[string]extractMessage, len(messages))
	for _, message := range messages {
		byID[message.ID] = message
	}

	return byID
}
