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

	got := decodeExtractTestCatalog(t, out.Bytes())
	want := map[string]extractCatalogMessage{
		"app.header.title": {
			DefaultMessage: "Dashboard",
			Description:    "Main dashboard heading",
		},
		"app.header.cta": {
			DefaultMessage: "Create project",
		},
		"app.header.subtitle": {
			DefaultMessage: "Translate files without drama",
			Description:    "Subheading copy",
		},
		"app.header.refresh": {
			DefaultMessage: "Refresh",
			Description:    "Refresh button label",
		},
		"app.header.empty": {
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
		if gotMessage.DefaultMessage != wantMessage.DefaultMessage ||
			gotMessage.Description != wantMessage.Description {
			t.Fatalf("message %q = %#v, want %#v", id, gotMessage, wantMessage)
		}
	}

	if strings.Contains(out.String(), sourcePath) {
		t.Fatalf("output should not include source metadata: %s", out.String())
	}
	if strings.Contains(out.String(), `"description": ""`) {
		t.Fatalf("output should omit empty descriptions: %s", out.String())
	}
	if strings.Contains(out.String(), `"id":`) {
		t.Fatalf("formatjs catalog should use ids as keys: %s", out.String())
	}
}

func TestExtractCommandExtractsDefineMessagesWithComputedKeys(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	writeExtractTestFile(t, filepath.Join(dir, "src", "DeleteAccount.tsx"), `
import { defineMessages } from "react-intl";

enum UserDeleteReason {
  Leaving_current_role = "Leaving_current_role",
  Switching_to_another_product = "Switching_to_another_product",
}

const DELETE_REASON_LABELS = defineMessages({
  [UserDeleteReason.Leaving_current_role]: {
    id: '8+RXxBclvz',
    defaultMessage: 'Leaving current role',
    description: 'Account deletion survey: reason option',
  },
  [UserDeleteReason.Switching_to_another_product]: {
    id: '5faw+pEI3P',
    defaultMessage: 'Switching to another product',
    description: 'Account deletion survey: reason option',
  },
});
`)

	cmd := newExtractCmd()
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"src"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute extract command: %v", err)
	}

	catalog := decodeExtractTestCatalog(t, out.Bytes())
	if got, want := len(catalog), 2; got != want {
		t.Fatalf("message count = %d, want %d; output=%s", got, want, out.String())
	}
	if got, want := catalog["8+RXxBclvz"].DefaultMessage, "Leaving current role"; got != want {
		t.Fatalf("computed-key message defaultMessage = %q, want %q", got, want)
	}
	if got, want := catalog["5faw+pEI3P"].Description, "Account deletion survey: reason option"; got != want {
		t.Fatalf("computed-key message description = %q, want %q", got, want)
	}
}

func TestExtractCommandGeneratesFormatJSIDForMissingID(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	writeExtractTestFile(t, filepath.Join(dir, "src", "DocumentPreview.tsx"), `
import { defineMessages, FormattedMessage } from "react-intl";

const messages = defineMessages({
  title: {
    defaultMessage: 'Document preview \u2014 {documentName}',
    description:
      'Dialog title for previewing a generated document with the document name appended',
  },
  save: {
    defaultMessage: 'Save document',
  },
});

export function DocumentPreview() {
  return (
    <FormattedMessage
      defaultMessage="Open document"
      description="Button label for opening the generated document preview"
    />
    <FormattedMessage defaultMessage="Close preview" />
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

	catalog := decodeExtractTestCatalog(t, out.Bytes())
	got, ok := catalog["OVx7L4"]
	if !ok {
		t.Fatalf("missing generated FormatJS id OVx7L4 in output=%s", out.String())
	}
	if got.DefaultMessage != "Document preview \u2014 {documentName}" {
		t.Fatalf("generated-id defaultMessage = %q", got.DefaultMessage)
	}
	if got.Description != "Dialog title for previewing a generated document with the document name appended" {
		t.Fatalf("generated-id description = %q", got.Description)
	}
	if got, ok := catalog["cBUY8d"]; !ok {
		t.Fatalf("missing generated FormatJS id cBUY8d for descriptor without description in output=%s", out.String())
	} else if got.DefaultMessage != "Save document" {
		t.Fatalf("generated-id defaultMessage = %q", got.DefaultMessage)
	}

	jsxID := generatedFormatJSMessageID("Open document", "Button label for opening the generated document preview")
	if _, ok := catalog[jsxID]; !ok {
		t.Fatalf("missing generated JSX id %q in output=%s", jsxID, out.String())
	}
	if got, ok := catalog["8jAKYt"]; !ok {
		t.Fatalf("missing generated JSX id 8jAKYt for message without description in output=%s", out.String())
	} else if got.DefaultMessage != "Close preview" {
		t.Fatalf("generated JSX defaultMessage = %q", got.DefaultMessage)
	}
}

func TestExtractCommandDoesNotEscapeRichTextTagsInJSON(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	writeExtractTestFile(t, filepath.Join(dir, "src", "App.tsx"), `
import { defineMessage } from "react-intl";

export const redirect = defineMessage({
  id: "app.redirect",
  defaultMessage: "If you weren't redirected, <link>click here</link>",
});

export const sop = defineMessage({
  id: "app.sop",
  defaultMessage: "Use <atSymbol>@</atSymbol> in the SOP to reference capabilities.",
});
`)

	cmd := newExtractCmd()
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"src"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute extract command: %v", err)
	}

	raw := out.String()
	if strings.Contains(raw, `\u003c`) || strings.Contains(raw, `\u003e`) {
		t.Fatalf("output should keep rich text tags unescaped: %s", raw)
	}
	if !strings.Contains(raw, `<link>click here</link>`) {
		t.Fatalf("output missing unescaped link tag: %s", raw)
	}
	if !strings.Contains(raw, `<atSymbol>@</atSymbol>`) {
		t.Fatalf("output missing unescaped atSymbol tag: %s", raw)
	}
}

func TestExtractCommandExtractsJSXMessageIDStartingWithSlash(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	source := `
import { FormattedMessage } from "react-intl";

export function App() {
  return <FormattedMessage defaultMessage="Open settings" id="/app.settings.open" />;
}
`
	writeExtractTestFile(t, filepath.Join(dir, "src", "App.tsx"), source)

	cmd := newExtractCmd()
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"src"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute extract command: %v", err)
	}

	catalog := decodeExtractTestCatalog(t, out.Bytes())
	got, ok := catalog["/app.settings.open"]
	if !ok {
		t.Fatalf("missing slash-prefixed id in output=%s", out.String())
	}
	if got.DefaultMessage != "Open settings" {
		t.Fatalf("defaultMessage = %q, want %q", got.DefaultMessage, "Open settings")
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

	catalog := decodeExtractTestCatalog(t, out.Bytes())
	if got, want := len(catalog), 1; got != want {
		t.Fatalf("message count = %d, want %d; output=%s", got, want, out.String())
	}
	if _, ok := catalog["src.components.app-header.title"]; !ok {
		t.Fatalf("missing prefixed id in output=%s", out.String())
	}
}

func TestExtractCommandWritesFormatJSCatalogWithCompatibleFlags(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	writeExtractTestFile(t, filepath.Join(dir, "src", "App.tsx"), `
import { defineMessage, FormattedMessage } from "react-intl";

export const title = defineMessage({
  id: "app.title",
  defaultMessage: "I have {count, plural, one{a dog} other{many dogs}}",
});

export function App() {
  return <FormattedMessage id="app.cta" defaultMessage="Create project" description="Primary CTA" />;
}
`)
	writeExtractTestFile(t, filepath.Join(dir, "src", "components", "Nested.tsx"), `
import { defineMessage } from "react-intl";

export const nested = defineMessage({
  id: "app.nested",
  defaultMessage: "Nested",
});
`)
	writeExtractTestFile(t, filepath.Join(dir, "src", "components", "Nested.test.tsx"), `
import { defineMessage } from "react-intl";

export const hidden = defineMessage({
  id: "app.hidden",
  defaultMessage: "Hidden",
});
`)
	writeExtractTestFile(t, filepath.Join(dir, "src", "types.d.ts"), `
export const message: { id: "app.types"; defaultMessage: "Types" };
`)

	outPath := filepath.Join(dir, "src", "locales", "en", "messages.json")
	cmd := newExtractCmd()
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{
		"src/**/*.{ts,tsx}",
		"--ignore=**/*.d.ts",
		"--ignore=**/*.test.{ts,tsx}",
		"--out-file", outPath,
		"--flatten",
	})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute extract command: %v", err)
	}
	if out.Len() != 0 {
		t.Fatalf("expected out-file mode to keep stdout empty, got %q", out.String())
	}

	content, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("read extract output file: %v", err)
	}
	if strings.Contains(string(content), `"description": ""`) {
		t.Fatalf("output should omit empty descriptions: %s", string(content))
	}
	if strings.Contains(string(content), `"id":`) {
		t.Fatalf("formatjs catalog should use ids as keys: %s", string(content))
	}

	var catalog map[string]map[string]string
	if err := json.Unmarshal(content, &catalog); err != nil {
		t.Fatalf("decode formatjs catalog: %v\noutput=%s", err, string(content))
	}
	if got, want := catalog["app.title"]["defaultMessage"], "{count,plural,one{I have a dog}other{I have many dogs}}"; got != want {
		t.Fatalf("app.title defaultMessage = %q, want %q", got, want)
	}
	if _, ok := catalog["app.title"]["description"]; ok {
		t.Fatalf("app.title should not include empty description: %#v", catalog["app.title"])
	}
	if got, want := catalog["app.cta"]["description"], "Primary CTA"; got != want {
		t.Fatalf("app.cta description = %q, want %q", got, want)
	}
	if got, want := catalog["app.nested"]["defaultMessage"], "Nested"; got != want {
		t.Fatalf("app.nested defaultMessage = %q, want %q", got, want)
	}
	if _, ok := catalog["app.hidden"]; ok {
		t.Fatalf("ignored test file message should not be present: %#v", catalog)
	}
}

func TestExtractCommandFlattenHoistsICUSelectorsInStdoutCatalog(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	writeExtractTestFile(t, filepath.Join(dir, "src", "App.tsx"), `
import { defineMessage } from "react-intl";

export const title = defineMessage({
  id: "app.title",
  defaultMessage: "You have {count, plural, one{one project} other{# projects}}.",
});
`)

	cmd := newExtractCmd()
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"src", "--flatten"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute extract command: %v", err)
	}

	catalog := decodeExtractTestCatalog(t, out.Bytes())
	if got, want := len(catalog), 1; got != want {
		t.Fatalf("message count = %d, want %d; output=%s", got, want, out.String())
	}
	if got, want := catalog["app.title"].DefaultMessage, "{count,plural,one{You have one project.}other{You have # projects.}}"; got != want {
		t.Fatalf("flattened defaultMessage = %q, want %q", got, want)
	}
	if strings.Contains(out.String(), `"id":`) {
		t.Fatalf("formatjs catalog should use ids as keys: %s", out.String())
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

	catalog := decodeExtractTestCatalog(t, out.Bytes())
	if got, want := len(catalog), 1; got != want {
		t.Fatalf("message count = %d, want %d; output=%s", got, want, out.String())
	}
	if _, ok := catalog["visible"]; !ok {
		t.Fatalf("missing visible message in output=%s", out.String())
	}
}

func TestUnescapeJavaScriptStringSupportsHighByteHexEscapes(t *testing.T) {
	got := []byte(unescapeJavaScriptString(`\x7F\x80\xA0\xFF`))
	want := []byte{0x7f, 0x80, 0xa0, 0xff}
	if !bytes.Equal(got, want) {
		t.Fatalf("unescaped bytes = %v, want %v", got, want)
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

func decodeExtractTestCatalog(t *testing.T, content []byte) map[string]extractCatalogMessage {
	t.Helper()

	var catalog map[string]extractCatalogMessage
	if err := json.Unmarshal(content, &catalog); err != nil {
		t.Fatalf("decode extract output: %v\noutput=%s", err, string(content))
	}

	return catalog
}
