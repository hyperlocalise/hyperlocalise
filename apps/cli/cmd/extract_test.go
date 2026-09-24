package cmd

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unsafe"
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

	assertExtractTestCatalog(t, out, map[string]extractCatalogMessage{
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
	})

	if strings.Contains(out.String(), sourcePath) {
		t.Fatalf("output should not include source metadata: %s", out.String())
	}
}

func TestExtractCommandExtractsDefineMessagesObjectKeys(t *testing.T) {
	tests := []struct {
		name   string
		source string
		want   map[string]extractCatalogMessage
	}{
		{
			name: "decimal keys",
			source: `
import { defineMessages } from "react-intl";

export const messages = defineMessages({
  0: {
    id: "msg.0",
    defaultMessage: "Zero",
    description: "Numeric key 0",
  },
  12: {
    id: "msg.12",
    defaultMessage: "Twelve",
    description: "Numeric key 12",
  },
});
`,
			want: map[string]extractCatalogMessage{
				"msg.0":  {DefaultMessage: "Zero", Description: "Numeric key 0"},
				"msg.12": {DefaultMessage: "Twelve", Description: "Numeric key 12"},
			},
		},
		{
			name: "quoted numeric keys",
			source: `
import { defineMessages } from "react-intl";

export const messages = defineMessages({
  "0": {
    id: "msg.0",
    defaultMessage: "Zero",
    description: "Quoted numeric key 0",
  },
  '12': {
    id: "msg.12",
    defaultMessage: "Twelve",
    description: "Quoted numeric key 12",
  },
});
`,
			want: map[string]extractCatalogMessage{
				"msg.0":  {DefaultMessage: "Zero", Description: "Quoted numeric key 0"},
				"msg.12": {DefaultMessage: "Twelve", Description: "Quoted numeric key 12"},
			},
		},
		{
			name: "separator key",
			source: `
import { defineMessages } from "react-intl";

export const messages = defineMessages({
  10_000: {
    id: "msg.10000",
    defaultMessage: "Many",
    description: "Numeric key with separator",
  },
});
`,
			want: map[string]extractCatalogMessage{
				"msg.10000": {DefaultMessage: "Many", Description: "Numeric key with separator"},
			},
		},
		{
			name: "mixed identifier and numeric keys",
			source: `
import { defineMessages } from "react-intl";

export const messages = defineMessages({
  label: {
    id: "msg.label",
    defaultMessage: "Label",
    description: "Identifier key",
  },
  0: {
    id: "msg.0",
    defaultMessage: "Zero",
    description: "Numeric key",
  },
  "2": {
    id: "msg.2",
    defaultMessage: "Two",
    description: "Quoted numeric key",
  },
});
`,
			want: map[string]extractCatalogMessage{
				"msg.label": {DefaultMessage: "Label", Description: "Identifier key"},
				"msg.0":     {DefaultMessage: "Zero", Description: "Numeric key"},
				"msg.2":     {DefaultMessage: "Two", Description: "Quoted numeric key"},
			},
		},
		{
			name: "computed keys",
			source: `
import { defineMessages } from "react-intl";

enum ExampleKey {
  First = "First",
  Second = "Second",
}

export const messages = defineMessages({
  [ExampleKey.First]: {
    id: "msg.first",
    defaultMessage: "First",
    description: "Computed key first",
  },
  [ExampleKey.Second]: {
    id: "msg.second",
    defaultMessage: "Second",
    description: "Computed key second",
  },
});
`,
			want: map[string]extractCatalogMessage{
				"msg.first":  {DefaultMessage: "First", Description: "Computed key first"},
				"msg.second": {DefaultMessage: "Second", Description: "Computed key second"},
			},
		},
		{
			name: "satisfies type assertion",
			source: `
import { defineMessages, type MessageDescriptor } from "react-intl";

export const messages = defineMessages({
  0: {
    id: "msg.0",
    defaultMessage: "Zero",
    description: "Numeric key with satisfies",
  },
}) satisfies Record<number, MessageDescriptor>;
`,
			want: map[string]extractCatalogMessage{
				"msg.0": {DefaultMessage: "Zero", Description: "Numeric key with satisfies"},
			},
		},
		{
			name: "type arguments",
			source: `
import { defineMessages, type MessageDescriptor } from "react-intl";

export const messages = defineMessages<Record<number, MessageDescriptor>>({
  0: {
    id: "msg.0",
    defaultMessage: "Zero",
    description: "Numeric key with type arguments",
  },
});
`,
			want: map[string]extractCatalogMessage{
				"msg.0": {DefaultMessage: "Zero", Description: "Numeric key with type arguments"},
			},
		},
		{
			name: "omits empty description",
			source: `
import { defineMessages } from "react-intl";

export const messages = defineMessages({
  0: {
    id: "msg.0",
    defaultMessage: "Zero",
  },
});
`,
			want: map[string]extractCatalogMessage{
				"msg.0": {DefaultMessage: "Zero"},
			},
		},
		{
			name: "missing id generates formatjs id",
			source: `
import { defineMessages } from "react-intl";

export const messages = defineMessages({
  0: {
    defaultMessage: "Zero",
    description: "Numeric key without id",
  },
});
`,
			want: map[string]extractCatalogMessage{
				generatedFormatJSMessageID("Zero", "Numeric key without id"): {
					DefaultMessage: "Zero",
					Description:    "Numeric key without id",
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			t.Chdir(dir)

			writeExtractTestFile(t, filepath.Join(dir, "src", "Messages.tsx"), tt.source)

			cmd := newExtractCmd()
			out := bytes.NewBuffer(nil)
			cmd.SetOut(out)
			cmd.SetArgs([]string{"src"})

			if err := cmd.Execute(); err != nil {
				t.Fatalf("execute extract command: %v", err)
			}

			assertExtractTestCatalog(t, out, tt.want)
		})
	}
}

func TestExtractCommandExtractsFormatJSEdgeCases(t *testing.T) {
	tests := []struct {
		name   string
		source string
		want   map[string]extractCatalogMessage
	}{
		{
			name: "parenthesized defineMessages",
			source: `
import { defineMessages } from "react-intl";

export const messages = defineMessages(({
  label: {
    id: "msg.parenthesized",
    defaultMessage: "Parenthesized",
  },
}));
`,
			want: map[string]extractCatalogMessage{
				"msg.parenthesized": {DefaultMessage: "Parenthesized"},
			},
		},
		{
			name: "parenthesized defineMessage",
			source: `
import { defineMessage } from "react-intl";

export const message = defineMessage(({
  id: "msg.wrapped",
  defaultMessage: "Wrapped define",
}));
`,
			want: map[string]extractCatalogMessage{
				"msg.wrapped": {DefaultMessage: "Wrapped define"},
			},
		},
		{
			name: "optional call and non-null assertion",
			source: `
import { useIntl } from "react-intl";

export function Label(intl: ReturnType<typeof useIntl>) {
  return intl.formatMessage?.({
    id: "msg.optional",
    defaultMessage: "Optional",
  }) + intl.formatMessage!({
    id: "msg.nonnull",
    defaultMessage: "Non-null",
  });
}
`,
			want: map[string]extractCatalogMessage{
				"msg.optional": {DefaultMessage: "Optional"},
				"msg.nonnull":  {DefaultMessage: "Non-null"},
			},
		},
		{
			name: "optional call with type arguments",
			source: `
import { useIntl } from "react-intl";

export function Label(intl: ReturnType<typeof useIntl>) {
  return intl.formatMessage?.<string>({
    id: "msg.optional-typed",
    defaultMessage: "Optional typed",
  });
}
`,
			want: map[string]extractCatalogMessage{
				"msg.optional-typed": {DefaultMessage: "Optional typed"},
			},
		},
		{
			name: "unicode identifier key",
			source: `
import { defineMessages } from "react-intl";

export const messages = defineMessages({
  标题: {
    id: "msg.unicode",
    defaultMessage: "Title",
    description: "Unicode identifier key",
  },
});
`,
			want: map[string]extractCatalogMessage{
				"msg.unicode": {DefaultMessage: "Title", Description: "Unicode identifier key"},
			},
		},
		{
			name: "hex and bigint keys",
			source: `
import { defineMessages } from "react-intl";

export const messages = defineMessages({
  0x10: {
    id: "msg.hex",
    defaultMessage: "Hex key",
  },
  0n: {
    id: "msg.bigint",
    defaultMessage: "Bigint key",
  },
});
`,
			want: map[string]extractCatalogMessage{
				"msg.hex":    {DefaultMessage: "Hex key"},
				"msg.bigint": {DefaultMessage: "Bigint key"},
			},
		},
		{
			name: "array defaultMessage",
			source: `
import { defineMessage } from "react-intl";

export const message = defineMessage({
  id: "msg.array",
  defaultMessage: [
    "Hello {name},",
    "welcome back.",
  ],
});
`,
			want: map[string]extractCatalogMessage{
				"msg.array": {DefaultMessage: "Hello {name},welcome back."},
			},
		},
		{
			name: "concatenated defaultMessage",
			source: `
import { defineMessage } from "react-intl";

export const message = defineMessage({
  id: "msg.concat",
  defaultMessage: "Hello " + "world",
  description: "Concatenated static strings",
});
`,
			want: map[string]extractCatalogMessage{
				"msg.concat": {DefaultMessage: "Hello world", Description: "Concatenated static strings"},
			},
		},
		{
			name: "jsx children defaultMessage",
			source: `
import { FormattedMessage } from "react-intl";

export function Label() {
  return (
    <FormattedMessage id="msg.children" description="From children">
      Hello children
    </FormattedMessage>
  );
}
`,
			want: map[string]extractCatalogMessage{
				"msg.children": {DefaultMessage: "Hello children", Description: "From children"},
			},
		},
		{
			name: "jsx children with rich text",
			source: `
import { FormattedMessage } from "react-intl";

export function Label() {
  return (
    <FormattedMessage id="msg.rich">
      Hello <b>world</b>
    </FormattedMessage>
  );
}
`,
			want: map[string]extractCatalogMessage{
				"msg.rich": {DefaultMessage: "Hello <b>world</b>"},
			},
		},
		{
			name: "binary octal and hex bigint keys",
			source: `
import { defineMessages } from "react-intl";

export const messages = defineMessages({
  0b10: {
    id: "msg.binary",
    defaultMessage: "Binary key",
  },
  0o17: {
    id: "msg.octal",
    defaultMessage: "Octal key",
  },
  0x10n: {
    id: "msg.hex-bigint",
    defaultMessage: "Hex bigint key",
  },
});
`,
			want: map[string]extractCatalogMessage{
				"msg.binary":     {DefaultMessage: "Binary key"},
				"msg.octal":      {DefaultMessage: "Octal key"},
				"msg.hex-bigint": {DefaultMessage: "Hex bigint key"},
			},
		},
		{
			name: "as const on descriptor fields",
			source: `
import { defineMessage } from "react-intl";

export const message = defineMessage({
  id: "msg.asconst" as const,
  defaultMessage: "Hello" as const,
  description: "Const assertion" as const,
});
`,
			want: map[string]extractCatalogMessage{
				"msg.asconst": {DefaultMessage: "Hello", Description: "Const assertion"},
			},
		},
		{
			name: "parenthesized concatenated defaultMessage",
			source: `
import { defineMessage } from "react-intl";

export const message = defineMessage({
  id: "msg.paren-concat",
  defaultMessage: ("Hello " + "world"),
});
`,
			want: map[string]extractCatalogMessage{
				"msg.paren-concat": {DefaultMessage: "Hello world"},
			},
		},
		{
			name: "array of concatenated strings",
			source: `
import { defineMessage } from "react-intl";

export const message = defineMessage({
  id: "msg.array-concat",
  defaultMessage: [
    "Hello ",
    "wo" + "rld",
  ],
});
`,
			want: map[string]extractCatalogMessage{
				"msg.array-concat": {DefaultMessage: "Hello world"},
			},
		},
		{
			name: "template plus string concat",
			source: `
import { defineMessage } from "react-intl";

export const message = defineMessage({
  id: "msg.template-concat",
  defaultMessage: ` + "`Hello `" + ` + "world",
});
`,
			want: map[string]extractCatalogMessage{
				"msg.template-concat": {DefaultMessage: "Hello world"},
			},
		},
		{
			name: "nested parenthesized defineMessages",
			source: `
import { defineMessages } from "react-intl";

export const messages = defineMessages((({
  label: {
    id: "msg.nested-paren",
    defaultMessage: "Nested parens",
  },
})));
`,
			want: map[string]extractCatalogMessage{
				"msg.nested-paren": {DefaultMessage: "Nested parens"},
			},
		},
		{
			name: "parenthesized formatMessage",
			source: `
import { useIntl } from "react-intl";

export function Label(intl: ReturnType<typeof useIntl>) {
  return intl.formatMessage(({
    id: "msg.format-paren",
    defaultMessage: "Format paren",
  }));
}
`,
			want: map[string]extractCatalogMessage{
				"msg.format-paren": {DefaultMessage: "Format paren"},
			},
		},
		{
			name: "non-null assertion with type arguments",
			source: `
import { useIntl } from "react-intl";

export function Label(intl: ReturnType<typeof useIntl>) {
  return intl.formatMessage!<string>({
    id: "msg.nonnull-typed",
    defaultMessage: "Non-null typed",
  });
}
`,
			want: map[string]extractCatalogMessage{
				"msg.nonnull-typed": {DefaultMessage: "Non-null typed"},
			},
		},
		{
			name: "jsx attribute concatenation",
			source: `
import { FormattedMessage } from "react-intl";

export function Label() {
  return <FormattedMessage id="msg.jsx-concat" defaultMessage={"Hello " + "world"} />;
}
`,
			want: map[string]extractCatalogMessage{
				"msg.jsx-concat": {DefaultMessage: "Hello world"},
			},
		},
		{
			name: "jsx attribute array defaultMessage",
			source: `
import { FormattedMessage } from "react-intl";

export function Label() {
  return <FormattedMessage id="msg.jsx-array" defaultMessage={["Hello ", "world"]} />;
}
`,
			want: map[string]extractCatalogMessage{
				"msg.jsx-array": {DefaultMessage: "Hello world"},
			},
		},
		{
			name: "jsx children generate formatjs id",
			source: `
import { FormattedMessage } from "react-intl";

export function Label() {
  return (
    <FormattedMessage description="Children without id">
      Generated from children
    </FormattedMessage>
  );
}
`,
			want: map[string]extractCatalogMessage{
				generatedFormatJSMessageID("Generated from children", "Children without id"): {
					DefaultMessage: "Generated from children",
					Description:    "Children without id",
				},
			},
		},
		{
			name: "jsx attribute wins over children",
			source: `
import { FormattedMessage } from "react-intl";

export function Label() {
  return (
    <FormattedMessage id="msg.attr-wins" defaultMessage="From attribute">
      From children
    </FormattedMessage>
  );
}
`,
			want: map[string]extractCatalogMessage{
				"msg.attr-wins": {DefaultMessage: "From attribute"},
			},
		},
		{
			name: "formatted html message children",
			source: `
import { FormattedHTMLMessage } from "react-intl";

export function Label() {
  return (
    <FormattedHTMLMessage id="msg.html-children">
      Hello <b>html</b>
    </FormattedHTMLMessage>
  );
}
`,
			want: map[string]extractCatalogMessage{
				"msg.html-children": {DefaultMessage: "Hello <b>html</b>"},
			},
		},
		{
			name: "paren then dynamic concat is not extracted",
			source: `
import { defineMessage } from "react-intl";

const name = "Ada";
export const message = defineMessage({
  id: "msg.paren-dynamic",
  defaultMessage: ("Hello ") + name,
});
`,
			want: map[string]extractCatalogMessage{},
		},
		{
			name: "jsx children decode html entities",
			source: `
import { FormattedMessage } from "react-intl";

export function Label() {
  return (
    <FormattedMessage id="msg.entities">
      Tom &amp; Jerry
    </FormattedMessage>
  );
}
`,
			want: map[string]extractCatalogMessage{
				"msg.entities": {DefaultMessage: "Tom & Jerry"},
			},
		},
		{
			name: "unicode combining-mark key",
			source: `
import { defineMessages } from "react-intl";

export const messages = defineMessages({
  शीर्षक: {
    id: "msg.devanagari",
    defaultMessage: "Title",
  },
});
`,
			want: map[string]extractCatalogMessage{
				"msg.devanagari": {DefaultMessage: "Title"},
			},
		},
		{
			name: "dynamic concat is not extracted",
			source: `
import { defineMessage } from "react-intl";

const name = "Ada";
export const message = defineMessage({
  id: "msg.dynamic-concat",
  defaultMessage: "Hello " + name,
});
`,
			want: map[string]extractCatalogMessage{},
		},
		{
			name: "render prop children are not extracted",
			source: `
import { FormattedMessage } from "react-intl";

export function Label() {
  return (
    <FormattedMessage id="msg.render">
      {(txt) => txt}
    </FormattedMessage>
  );
}
`,
			want: map[string]extractCatalogMessage{},
		},
		{
			name: "self-closing formatted message without defaultMessage is skipped",
			source: `
import { FormattedMessage } from "react-intl";

export function Label() {
  return <FormattedMessage id="msg.empty" />;
}
`,
			want: map[string]extractCatalogMessage{},
		},
		{
			name: "formatMessage arrow param is not a descriptor",
			source: `
import { useIntl } from "react-intl";

export function Label(intl: ReturnType<typeof useIntl>) {
  return intl.formatMessage(({id}) => id);
}
`,
			want: map[string]extractCatalogMessage{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			t.Chdir(dir)

			writeExtractTestFile(t, filepath.Join(dir, "src", "Messages.tsx"), tt.source)

			cmd := newExtractCmd()
			out := bytes.NewBuffer(nil)
			cmd.SetOut(out)
			cmd.SetArgs([]string{"src"})

			if err := cmd.Execute(); err != nil {
				t.Fatalf("execute extract command: %v", err)
			}

			assertExtractTestCatalog(t, out, tt.want)
		})
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

func TestExtractCommandExtractsFormatMessageInsideTemplateLiterals(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	writeExtractTestFile(t, filepath.Join(dir, "src", "Greeting.tsx"), `
import { defineMessage, defineMessages, FormattedMessage, useIntl } from "react-intl";

export function Greeting(name: string) {
  const intl = useIntl();
  const outside = intl.formatMessage({
    id: "greeting.outside",
    defaultMessage: "Outside template",
  });

  const nested = defineMessages({
    title: {
      id: "greeting.nested-define",
      defaultMessage: "Nested defineMessages",
    },
  });

  return [
    `+"`"+`Hello ${intl.formatMessage({
      id: "greeting.hello",
      defaultMessage: "World",
      description: "Greeting inside template literal",
    })}`+"`"+`,
    `+"`"+`Status: ${formatMessage({
      id: "greeting.status",
      defaultMessage: "Active",
    })} and ${intl.formatMessage({
      id: "greeting.again",
      defaultMessage: "Again",
    })}`+"`"+`,
    `+"`"+`Escaped \${intl.formatMessage({
      id: "greeting.escaped",
      defaultMessage: "Should not extract",
    })}`+"`"+`,
    `+"`"+`Plain formatMessage text without a call`+"`"+`,
    `+"`"+`Outer ${`+"`"+`Inner ${intl.formatMessage({
      id: "greeting.nested-template",
      defaultMessage: "Nested template call",
    })}`+"`"+`}`+"`"+`,
    `+"`"+`Define ${defineMessage({
      id: "greeting.define-in-template",
      defaultMessage: "Defined in template",
    })}`+"`"+`,
    `+"`"+`JSX ${(<FormattedMessage id="greeting.jsx-in-template" defaultMessage="JSX in template" />)}`+"`"+`,
    `+"`"+`Typed ${intl.formatMessage<{ name: string }>({
      id: "greeting.typed",
      defaultMessage: "Typed call",
    })}`+"`"+`,
    outside,
    nested.title,
  ];
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
		"greeting.outside": {
			DefaultMessage: "Outside template",
		},
		"greeting.nested-define": {
			DefaultMessage: "Nested defineMessages",
		},
		"greeting.hello": {
			DefaultMessage: "World",
			Description:    "Greeting inside template literal",
		},
		"greeting.status": {
			DefaultMessage: "Active",
		},
		"greeting.again": {
			DefaultMessage: "Again",
		},
		"greeting.nested-template": {
			DefaultMessage: "Nested template call",
		},
		"greeting.define-in-template": {
			DefaultMessage: "Defined in template",
		},
		"greeting.jsx-in-template": {
			DefaultMessage: "JSX in template",
		},
		"greeting.typed": {
			DefaultMessage: "Typed call",
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
	if _, ok := got["greeting.escaped"]; ok {
		t.Fatalf("escaped template interpolation should not extract: %s", out.String())
	}
}

func TestExtractCommandExtractsFormatMessageInsideNestedTemplateExpressions(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	writeExtractTestFile(t, filepath.Join(dir, "src", "Nested.tsx"), `
import { useIntl } from "react-intl";

export function Nested(count: number) {
  const intl = useIntl();
  return `+"`"+`Items: ${count > 0 ? `+"`"+`${intl.formatMessage({
    id: "nested.positive",
    defaultMessage: "Has items",
  })}`+"`"+` : intl.formatMessage({
    id: "nested.empty",
    defaultMessage: "No items",
    description: "Empty state inside ternary in template",
  })}`+"`"+`;
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
		"nested.positive": {
			DefaultMessage: "Has items",
		},
		"nested.empty": {
			DefaultMessage: "No items",
			Description:    "Empty state inside ternary in template",
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
		if gotMessage != wantMessage {
			t.Fatalf("message %q = %#v, want %#v", id, gotMessage, wantMessage)
		}
	}
}

func TestExtractCommandExtractsFormatMessageWithGeneratedIDInsideTemplateLiteral(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	writeExtractTestFile(t, filepath.Join(dir, "src", "Generated.tsx"), `
import { useIntl } from "react-intl";

export function Generated() {
  const intl = useIntl();
  return `+"`"+`Label: ${intl.formatMessage({
    defaultMessage: "Generated inside template",
    description: "Template literal generated id",
  })}`+"`"+`;
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
	id := generatedFormatJSMessageID("Generated inside template", "Template literal generated id")
	got, ok := catalog[id]
	if !ok {
		t.Fatalf("missing generated id %q in output=%s", id, out.String())
	}
	if got.DefaultMessage != "Generated inside template" {
		t.Fatalf("defaultMessage = %q", got.DefaultMessage)
	}
	if got.Description != "Template literal generated id" {
		t.Fatalf("description = %q", got.Description)
	}
}

func TestScanTemplateLiteralFindsInterpolationRangesAndNestedTemplates(t *testing.T) {
	src := "`a ${one} b ${`inner ${two}`} c`"
	end, expressions, ok := scanTemplateLiteral(src, 0)
	if !ok {
		t.Fatalf("expected template literal to scan successfully")
	}
	if end != len(src) {
		t.Fatalf("end = %d, want %d", end, len(src))
	}
	if got, want := len(expressions), 2; got != want {
		t.Fatalf("expression count = %d, want %d", got, want)
	}
	if got, want := src[expressions[0].start:expressions[0].end], "one"; got != want {
		t.Fatalf("first expression = %q, want %q", got, want)
	}
	if got, want := src[expressions[1].start:expressions[1].end], "`inner ${two}`"; got != want {
		t.Fatalf("second expression = %q, want %q", got, want)
	}

	nestedEnd, nestedExpressions, ok := scanTemplateLiteral(src, expressions[1].start)
	if !ok {
		t.Fatalf("expected nested template literal to scan successfully")
	}
	if nestedEnd != expressions[1].end {
		t.Fatalf("nested end = %d, want %d", nestedEnd, expressions[1].end)
	}
	if got, want := len(nestedExpressions), 1; got != want {
		t.Fatalf("nested expression count = %d, want %d", got, want)
	}
	if got, want := src[nestedExpressions[0].start:nestedExpressions[0].end], "two"; got != want {
		t.Fatalf("nested expression = %q, want %q", got, want)
	}
}

func TestScanTemplateLiteralIgnoresEscapedInterpolations(t *testing.T) {
	src := "`literal \\${not.an.interpolation} and ${real}`" // one backslash before ${
	end, expressions, ok := scanTemplateLiteral(src, 0)
	if !ok {
		t.Fatalf("expected template literal to scan successfully")
	}
	if end != len(src) {
		t.Fatalf("end = %d, want %d", end, len(src))
	}
	if got, want := len(expressions), 1; got != want {
		t.Fatalf("expression count = %d, want %d; exprs=%v", got, want, expressions)
	}
	if got, want := src[expressions[0].start:expressions[0].end], "real"; got != want {
		t.Fatalf("expression = %q, want %q", got, want)
	}
}

func TestScanTemplateLiteralHandlesRegexWithQuotesInInterpolation(t *testing.T) {
	// Mirrors escapeCsv-style helpers: a template literal whose interpolation
	// contains a regex with a quote, plus a string with doubled quotes.
	src := "`\"${str.replace(/\"/g, '\"\"')}\"`"
	end, expressions, ok := scanTemplateLiteral(src, 0)
	if !ok {
		t.Fatalf("expected template literal with regex interpolation to scan successfully")
	}
	if end != len(src) {
		t.Fatalf("end = %d, want %d", end, len(src))
	}
	if got, want := len(expressions), 1; got != want {
		t.Fatalf("expression count = %d, want %d", got, want)
	}
	if got, want := src[expressions[0].start:expressions[0].end], "str.replace(/\"/g, '\"\"')"; got != want {
		t.Fatalf("expression = %q, want %q", got, want)
	}
}

func TestExtractReactIntlCallMessagesPreservesIdentifierBoundaries(t *testing.T) {
	tests := []struct {
		name    string
		src     string
		wantIDs []string
	}{
		{
			name: "suffix formatMessage is ignored",
			src: `myformatMessage({
  id: "suffix.format",
  defaultMessage: "Custom",
});
`,
			wantIDs: nil,
		},
		{
			name: "prefixed defineMessage is ignored",
			src: `_defineMessage({
  id: "suffix.define",
  defaultMessage: "Hidden",
});
`,
			wantIDs: nil,
		},
		{
			name: "prefixed defineMessages is ignored",
			src: `$defineMessages({
  title: {
    id: "suffix.defines",
    defaultMessage: "Hidden",
  },
});
`,
			wantIDs: nil,
		},
		{
			name: "identifier containing both d and f is ignored",
			src: `undefinedMessage({
  id: "suffix.undefined",
  defaultMessage: "Hidden",
});
`,
			wantIDs: nil,
		},
		{
			name: "bare formatMessage is extracted",
			src: `formatMessage({
  id: "real.format",
  defaultMessage: "Hello",
});
`,
			wantIDs: []string{"real.format"},
		},
		{
			name: "member formatMessage is extracted",
			src: `intl.formatMessage({
  id: "real.member",
  defaultMessage: "Hello",
});
`,
			wantIDs: []string{"real.member"},
		},
		{
			name: "bare defineMessage is extracted",
			src: `defineMessage({
  id: "real.define",
  defaultMessage: "Hello",
});
`,
			wantIDs: []string{"real.define"},
		},
		{
			name: "suffix calls do not hide later real calls",
			src: `myformatMessage({
  id: "suffix.format",
  defaultMessage: "Custom",
});
_defineMessage({
  id: "suffix.define",
  defaultMessage: "Hidden",
});
formatMessage({
  id: "real.after-suffix",
  defaultMessage: "Hello",
});
`,
			wantIDs: []string{"real.after-suffix"},
		},
		{
			name: "real call after identifier that contains d and f",
			src: `const unused = undefined;
formatMessage({
  id: "real.after-undefined",
  defaultMessage: "Hello",
});
`,
			wantIDs: []string{"real.after-undefined"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			messages, err := extractMessagesFromReactIntlSource(tt.src, "boundary.ts")
			if err != nil {
				t.Fatalf("extractMessagesFromReactIntlSource: %v", err)
			}

			gotIDs := make([]string, 0, len(messages))
			for _, message := range messages {
				gotIDs = append(gotIDs, message.ID)
			}
			if len(gotIDs) != len(tt.wantIDs) {
				t.Fatalf("ids = %v, want %v", gotIDs, tt.wantIDs)
			}
			for i, wantID := range tt.wantIDs {
				if gotIDs[i] != wantID {
					t.Fatalf("ids = %v, want %v", gotIDs, tt.wantIDs)
				}
			}
		})
	}
}

func TestStartsAtIdentifierBoundary(t *testing.T) {
	tests := []struct {
		name  string
		src   string
		index int
		want  bool
	}{
		{name: "start of source", src: "formatMessage", index: 0, want: true},
		{name: "after punctuation", src: ".formatMessage", index: 1, want: true},
		{name: "after whitespace", src: " formatMessage", index: 1, want: true},
		{name: "suffix of identifier", src: "myformatMessage", index: 2, want: false},
		{name: "after underscore", src: "_defineMessage", index: 1, want: false},
		{name: "after dollar", src: "$defineMessages", index: 1, want: false},
		{name: "after digit", src: "x2formatMessage", index: 2, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := startsAtIdentifierBoundary(tt.src, tt.index); got != tt.want {
				t.Fatalf("startsAtIdentifierBoundary(%q, %d) = %t, want %t",
					tt.src, tt.index, got, tt.want)
			}
		})
	}
}

func TestExtractMessagesFromSourceWithRegexInsideTemplateLiteral(t *testing.T) {
	src := "\n" +
		"function escapeCsv(field: string | number): string {\n" +
		"  const str = String(field);\n" +
		"  if (str.includes(\",\") || str.includes('\"') || str.includes(\"\\n\")) {\n" +
		"    return `\"${str.replace(/\"/g, '\"\"')}\"`;\n" +
		"  }\n" +
		"  return str;\n" +
		"}\n" +
		"\n" +
		"formatMessage({\n" +
		"  id: \"csv.header\",\n" +
		"  defaultMessage: \"Export\",\n" +
		"  description: \"CSV header\",\n" +
		"});\n"
	messages, err := extractMessagesFromReactIntlSource(src, "escape-csv.ts")
	if err != nil {
		t.Fatalf("extractMessagesFromReactIntlSource: %v", err)
	}
	if got, want := len(messages), 1; got != want {
		t.Fatalf("message count = %d, want %d", got, want)
	}
	if messages[0].ID != "csv.header" {
		t.Fatalf("id = %q, want csv.header", messages[0].ID)
	}
}

func TestSkipRegexLiteralDistinguishesDivision(t *testing.T) {
	regexSrc := `replace(/"/g, '""')`
	end, ok := skipRegexLiteral(regexSrc, strings.IndexByte(regexSrc, '/'))
	if !ok {
		t.Fatalf("expected regex literal to be skipped")
	}
	if got, want := regexSrc[:end], `replace(/"/g`; got != want {
		t.Fatalf("skipped prefix = %q, want %q", got, want)
	}

	divisionSrc := "value / 2"
	if _, ok := skipRegexLiteral(divisionSrc, strings.IndexByte(divisionSrc, '/')); ok {
		t.Fatalf("expected division operator not to be treated as regex")
	}
}

func TestParseStaticMessageExpression(t *testing.T) {
	tests := []struct {
		name string
		src  string
		want string
		ok   bool
	}{
		{name: "string", src: `"Hello"`, want: "Hello", ok: true},
		{name: "concat", src: `"Hello " + "world"`, want: "Hello world", ok: true},
		{name: "mixed quotes", src: `'Hello ' + "world"`, want: "Hello world", ok: true},
		{name: "template concat", src: "`Hello ` + \"world\"", want: "Hello world", ok: true},
		{name: "as const", src: `"Hello" as const`, want: "Hello", ok: true},
		{name: "parens", src: `("Hello " + "world")`, want: "Hello world", ok: true},
		{name: "paren then static concat", src: `("Hello ") + "world"`, want: "Hello world", ok: true},
		{name: "array", src: `["Hello ", "world"]`, want: "Hello world", ok: true},
		{name: "array concat elements", src: `["Hello ", "wo" + "rld"]`, want: "Hello world", ok: true},
		{name: "dynamic concat", src: `"Hello " + name`, ok: false},
		{name: "paren then dynamic concat", src: `("Hello ") + name`, ok: false},
		{name: "array then dynamic concat", src: `["Hello "] + name`, ok: false},
		{name: "interpolated template", src: "`Hello ${name}`", ok: false},
		{name: "empty array", src: `[]`, ok: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, _, ok := parseStaticMessageExpression(tt.src, 0, len(tt.src))
			if ok != tt.ok || got != tt.want {
				t.Fatalf("parseStaticMessageExpression(%q) = (%q, %t), want (%q, %t)",
					tt.src, got, ok, tt.want, tt.ok)
			}
		})
	}
}

func TestReadObjectPropertyKey(t *testing.T) {
	tests := []struct {
		name string
		src  string
		want string
		ok   bool
	}{
		{name: "identifier", src: "title:", want: "title", ok: true},
		{name: "quoted", src: `"0":`, want: "0", ok: true},
		{name: "decimal", src: "0:", want: "0", ok: true},
		{name: "multi-digit", src: "12:", want: "12", ok: true},
		{name: "separator", src: "10_000:", want: "10_000", ok: true},
		{name: "hex", src: "0x10:", want: "0x10", ok: true},
		{name: "binary", src: "0b10:", want: "0b10", ok: true},
		{name: "octal", src: "0o17:", want: "0o17", ok: true},
		{name: "hex bigint", src: "0x10n:", want: "0x10n", ok: true},
		{name: "bigint", src: "0n:", want: "0n", ok: true},
		{name: "unicode", src: "标题:", want: "标题", ok: true},
		{name: "unicode combining marks", src: "शीर्षक:", want: "शीर्षक", ok: true},
		{name: "computed", src: "[Enum.Value]:", want: "", ok: true},
		{name: "invalid", src: ":", want: "", ok: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, next, ok := readObjectPropertyKey(tt.src, 0)
			wantNext := 0
			if colon := strings.IndexByte(tt.src, ':'); colon >= 0 {
				wantNext = colon
			}
			if got != tt.want || next != wantNext || ok != tt.ok {
				t.Fatalf("readObjectPropertyKey(%q) = (%q, %d, %t), want (%q, %d, %t)",
					tt.src, got, next, ok, tt.want, wantNext, tt.ok)
			}
		})
	}
}

func TestSkipStringLiteralHandlesNestedTemplateLiterals(t *testing.T) {
	src := "`outer ${`inner`} tail` ;"
	got := skipStringLiteral(src, 0)
	if got != len("`outer ${`inner`} tail`") {
		t.Fatalf("skipStringLiteral end = %d, want %d (src=%q)", got, len("`outer ${`inner`} tail`"), src[:got])
	}
}

func TestUnescapeJavaScriptStringSupportsHighByteHexEscapes(t *testing.T) {
	got := []byte(unescapeJavaScriptString(`\x7F\x80\xA0\xFF`))
	want := []byte{0x7f, 0x80, 0xa0, 0xff}
	if !bytes.Equal(got, want) {
		t.Fatalf("unescaped bytes = %v, want %v", got, want)
	}
}

func TestParseStaticStringLiteral(t *testing.T) {
	tests := []struct {
		name     string
		src      string
		index    int
		want     string
		wantNext int
		wantOK   bool
	}{
		{name: "double quoted", src: `"hello"`, want: "hello", wantNext: 7, wantOK: true},
		{name: "single quoted", src: `'hello'`, want: "hello", wantNext: 7, wantOK: true},
		{name: "template literal", src: "`hello`", want: "hello", wantNext: 7, wantOK: true},
		{name: "empty double quoted", src: `""`, want: "", wantNext: 2, wantOK: true},
		{name: "escaped double quote", src: `"say \"hi\""`, want: `say "hi"`, wantNext: 12, wantOK: true},
		{name: "escaped single quote", src: `'it\'s fine'`, want: "it's fine", wantNext: 12, wantOK: true},
		{name: "escaped backtick", src: "`say \\`hi\\``", want: "say `hi`", wantNext: 12, wantOK: true},
		{name: "escaped backslash before close", src: `"foo\\"`, want: `foo\`, wantNext: 7, wantOK: true},
		{name: "double escaped backslash", src: `"\\\\"`, want: `\\`, wantNext: 6, wantOK: true},
		{name: "newline escape", src: `"one\ntwo"`, want: "one\ntwo", wantNext: 10, wantOK: true},
		{name: "tab return escapes", src: `"a\tb\rc"`, want: "a\tb\rc", wantNext: 9, wantOK: true},
		{name: "unicode escape", src: `"em\u2014dash"`, want: "em\u2014dash", wantNext: 14, wantOK: true},
		{name: "braced unicode escape", src: `"hi\u{1F600}"`, want: "hi\U0001F600", wantNext: 13, wantOK: true},
		{name: "hex escape", src: `"\x41BC"`, want: "ABC", wantNext: 8, wantOK: true},
		{name: "line continuation lf", src: "\"foo\\\nbar\"", want: "foobar", wantNext: 10, wantOK: true},
		{name: "prefix then literal", src: `xx"hello"yy`, index: 2, want: "hello", wantNext: 9, wantOK: true},
		{name: "unterminated", src: `"hello`, wantOK: false, wantNext: 6},
		{name: "trailing backslash", src: `"hello\`, wantOK: false, wantNext: 7},
		{name: "not a quote", src: `hello`, wantOK: false, wantNext: 0},
		{name: "template interpolation rejected", src: "`hello ${name}`", wantOK: false, wantNext: 15},
		{name: "escaped interpolation still rejected", src: "`hello \\${name}`", wantOK: false, wantNext: 16},
		{name: "quoted key then more", src: `"id": "value"`, want: "id", wantNext: 4, wantOK: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, next, ok := parseStaticStringLiteral(tt.src, tt.index)
			if ok != tt.wantOK || got != tt.want || next != tt.wantNext {
				t.Fatalf("parseStaticStringLiteral(%q, %d) = (%q, %d, %t), want (%q, %d, %t)",
					tt.src, tt.index, got, next, ok, tt.want, tt.wantNext, tt.wantOK)
			}
		})
	}
}

func TestReadStringLiteralContentSkipsEscapedQuotes(t *testing.T) {
	tests := []struct {
		name     string
		src      string
		want     string
		wantNext int
		wantOK   bool
	}{
		{name: "plain", src: `"abc"`, want: "abc", wantNext: 5, wantOK: true},
		{name: "escaped quote mid literal", src: `"ab\"cd"`, want: `ab\"cd`, wantNext: 8, wantOK: true},
		{name: "escaped quote then more text", src: `"ab\"cd\"ef"`, want: `ab\"cd\"ef`, wantNext: 12, wantOK: true},
		{name: "escaped backslash then closer", src: `"ab\\"`, want: `ab\\`, wantNext: 6, wantOK: true},
		{name: "unterminated after escape", src: `"ab\"`, wantOK: false, wantNext: 5},
		{name: "lone backslash at eof", src: `"ab\`, wantOK: false, wantNext: 4},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, next, ok := readStringLiteralContent(tt.src, 0)
			if ok != tt.wantOK || got != tt.want || next != tt.wantNext {
				t.Fatalf("readStringLiteralContent(%q) = (%q, %d, %t), want (%q, %d, %t)",
					tt.src, got, next, ok, tt.want, tt.wantNext, tt.wantOK)
			}
		})
	}
}

func TestReadStringLiteralContentDoesNotAllocateRemainingSource(t *testing.T) {
	prefix := strings.Repeat("x", 1<<20)
	src := prefix + `"hello\"world"`
	index := len(prefix)

	allocs := testing.AllocsPerRun(50, func() {
		got, next, ok := readStringLiteralContent(src, index)
		if !ok || got != `hello\"world` || next != len(src) {
			t.Fatalf("readStringLiteralContent = (%q, %d, %t)", got, next, ok)
		}
	})
	if allocs != 0 {
		t.Fatalf("allocs = %v, want 0 for escaped literal scan", allocs)
	}
}

func TestUnescapeJavaScriptString(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want string
	}{
		{name: "plain", raw: "hello", want: "hello"},
		{name: "empty", raw: "", want: ""},
		{name: "quotes", raw: `say \"hi\"`, want: `say "hi"`},
		{name: "backslash", raw: `a\\b`, want: `a\b`},
		{name: "common escapes", raw: `\b\f\n\r\t\v`, want: "\b\f\n\r\t\v"},
		{name: "literal quote chars", raw: "\\'\\\"\\`", want: "'\"`"},
		{name: "unknown escape", raw: `\q`, want: "q"},
		{name: "trailing backslash", raw: `abc\`, want: `abc\`},
		{name: "hex", raw: `\x41`, want: "A"},
		{name: "invalid hex", raw: `\xZZ`, want: "xZZ"},
		{name: "unicode", raw: `\u0041`, want: "A"},
		{name: "invalid unicode", raw: `\uZZZZ`, want: "uZZZZ"},
		{name: "braced unicode", raw: `\u{2E}`, want: "."},
		{name: "line continuation lf", raw: "foo\\\nbar", want: "foobar"},
		{name: "line continuation cr", raw: "foo\\\rbar", want: "foobar"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := unescapeJavaScriptString(tt.raw); got != tt.want {
				t.Fatalf("unescapeJavaScriptString(%q) = %q, want %q", tt.raw, got, tt.want)
			}
		})
	}
}

func TestUnescapeJavaScriptStringClonesPlainLiterals(t *testing.T) {
	src := `prefix-PLAIN-suffix`
	raw := src[7:12]
	got := unescapeJavaScriptString(raw)
	if got != "PLAIN" {
		t.Fatalf("unescaped = %q, want PLAIN", got)
	}
	if stringSharesBacking(got, src) {
		t.Fatalf("plain unescape still shares backing with source")
	}
}

func TestParseJSXAttributeValue(t *testing.T) {
	tests := []struct {
		name    string
		src     string
		want    string
		wantOK  bool
		wantErr bool
	}{
		{name: "double quoted", src: `"hello"`, want: "hello", wantOK: true},
		{name: "single quoted", src: `'hello'`, want: "hello", wantOK: true},
		{name: "html entity", src: `"Tom &amp; Jerry"`, want: "Tom & Jerry", wantOK: true},
		{name: "numeric entity", src: `"&#39;quoted&#39;"`, want: "'quoted'", wantOK: true},
		{name: "ampersand without entity", src: `"A & B"`, want: "A & B", wantOK: true},
		{name: "expression string", src: `{"hello"}`, want: "hello", wantOK: true},
		{name: "expression escaped", src: `{"say \"hi\""}`, want: `say "hi"`, wantOK: true},
		{name: "non-static expression", src: `{name}`, wantOK: false},
		{name: "unterminated quote", src: `"hello`, wantErr: true},
		{name: "unterminated expression", src: `{"hello"`, wantErr: true},
		{name: "empty quoted", src: `""`, want: "", wantOK: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, _, ok, err := parseJSXAttributeValue(tt.src, 0, len(tt.src))
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got (%q, %t)", got, ok)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseJSXAttributeValue: %v", err)
			}
			if ok != tt.wantOK || got != tt.want {
				t.Fatalf("parseJSXAttributeValue(%q) = (%q, %t), want (%q, %t)",
					tt.src, got, ok, tt.want, tt.wantOK)
			}
		})
	}
}

func TestParseJSXAttributeValueClonesPlainQuotedText(t *testing.T) {
	src := `xx"plain"yy`
	got, end, ok, err := parseJSXAttributeValue(src, 2, len(src))
	if err != nil {
		t.Fatalf("parseJSXAttributeValue: %v", err)
	}
	if !ok || got != "plain" || end != 9 {
		t.Fatalf("parseJSXAttributeValue = (%q, %d, %t)", got, end, ok)
	}
	if stringSharesBacking(got, src) {
		t.Fatalf("plain JSX attribute still shares backing with source")
	}
}

func TestExtractedMessagesDoNotRetainSourceBacking(t *testing.T) {
	src := `
formatMessage({
  id: "plain.id",
  defaultMessage: "Plain text",
  description: "Plain description",
});

formatMessage({
  id: "escaped.id",
  defaultMessage: "Say \"hello\"",
  description: "Line one\nand two",
});
`
	src += strings.Repeat("// padding keeps the source buffer large\n", 256)
	src += `
<FormattedMessage
  id="jsx.plain"
  defaultMessage="JSX plain"
  description="JSX description"
/>
<FormattedMessage
  id="jsx.entity"
  defaultMessage="Tom &amp; Jerry"
  description="Names"
/>
`

	messages, err := extractMessagesFromReactIntlSource(src, "retain.tsx")
	if err != nil {
		t.Fatalf("extractMessagesFromReactIntlSource: %v", err)
	}
	if got, want := len(messages), 4; got != want {
		t.Fatalf("message count = %d, want %d", got, want)
	}

	for _, message := range messages {
		for _, field := range []struct {
			name  string
			value string
		}{
			{"id", message.ID},
			{"defaultMessage", message.DefaultMessage},
			{"description", message.Description},
		} {
			if stringSharesBacking(field.value, src) {
				t.Fatalf("message %q field %s %q still shares backing with source",
					message.ID, field.name, field.value)
			}
		}
	}
}

func TestExtractMessagesFromEscapedStringLiterals(t *testing.T) {
	src := `
formatMessage({
  id: "escaped.quotes",
  defaultMessage: "Say \"hello\" and 'bye'",
  description: "Quoted copy",
});

formatMessage({
  id: "escaped.unicode",
  defaultMessage: "Range\u2014end",
  description: "Dash copy",
});

formatMessage({
  id: 'escaped.newline',
  defaultMessage: 'Line one\nLine two',
});

formatMessage({
  id: "escaped.backslash",
  defaultMessage: "C:\\Users\\name",
});
`
	messages, err := extractMessagesFromReactIntlSource(src, "escaped.ts")
	if err != nil {
		t.Fatalf("extractMessagesFromReactIntlSource: %v", err)
	}

	got := map[string]extractMessage{}
	for _, message := range messages {
		got[message.ID] = message
	}

	want := map[string]extractCatalogMessage{
		"escaped.quotes": {
			DefaultMessage: `Say "hello" and 'bye'`,
			Description:    "Quoted copy",
		},
		"escaped.unicode": {
			DefaultMessage: "Range\u2014end",
			Description:    "Dash copy",
		},
		"escaped.newline": {
			DefaultMessage: "Line one\nLine two",
		},
		"escaped.backslash": {
			DefaultMessage: `C:\Users\name`,
		},
	}
	if len(got) != len(want) {
		t.Fatalf("message count = %d, want %d; ids=%v", len(got), len(want), got)
	}
	for id, wantMessage := range want {
		gotMessage, ok := got[id]
		if !ok {
			t.Fatalf("missing message %q", id)
		}
		if gotMessage.DefaultMessage != wantMessage.DefaultMessage ||
			gotMessage.Description != wantMessage.Description {
			t.Fatalf("message %q = {%q, %q}, want {%q, %q}",
				id, gotMessage.DefaultMessage, gotMessage.Description,
				wantMessage.DefaultMessage, wantMessage.Description)
		}
	}
}

func TestExtractMessagesFromJSXAttributeEntities(t *testing.T) {
	src := `
<FormattedMessage
  id="jsx.entities"
  defaultMessage="Tom &amp; Jerry"
  description="Cartoon names"
/>
<FormattedMessage
  id={"jsx.expression"}
  defaultMessage={"Say \"hello\""}
  description={'Single quoted'}
/>
`
	messages, err := extractMessagesFromReactIntlSource(src, "jsx-attrs.tsx")
	if err != nil {
		t.Fatalf("extractMessagesFromReactIntlSource: %v", err)
	}

	got := map[string]extractMessage{}
	for _, message := range messages {
		got[message.ID] = message
	}

	if got, want := len(got), 2; got != want {
		t.Fatalf("message count = %d, want %d", got, want)
	}
	if message := got["jsx.entities"]; message.DefaultMessage != "Tom & Jerry" || message.Description != "Cartoon names" {
		t.Fatalf("jsx.entities = {%q, %q}", message.DefaultMessage, message.Description)
	}
	if message := got["jsx.expression"]; message.DefaultMessage != `Say "hello"` || message.Description != "Single quoted" {
		t.Fatalf("jsx.expression = {%q, %q}", message.DefaultMessage, message.Description)
	}
}

func stringSharesBacking(value, src string) bool {
	if len(value) == 0 || len(src) == 0 {
		return false
	}

	valueStart := uintptr(unsafe.Pointer(unsafe.StringData(value)))
	srcStart := uintptr(unsafe.Pointer(unsafe.StringData(src)))
	srcEnd := srcStart + uintptr(len(src))
	valueEnd := valueStart + uintptr(len(value))

	return valueStart < srcEnd && srcStart < valueEnd
}

func TestExtractCommandSkipsFilesWithExtractionErrors(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	writeExtractTestFile(t, filepath.Join(dir, "good.ts"), `
formatMessage({
  id: "good.message",
  defaultMessage: "Hello",
  description: "Greeting",
});
`)
	writeExtractTestFile(
		t, filepath.Join(dir, "bad.ts"),
		"const broken = `unterminated template;\n"+
			"formatMessage({\n"+
			"  id: \"bad.message\",\n"+
			"  defaultMessage: \"Should be skipped\",\n"+
			"});\n",
	)

	cmd := newExtractCmd()
	out := bytes.NewBuffer(nil)
	errOut := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(errOut)
	cmd.SetArgs([]string{"."})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute extract command: %v", err)
	}

	errorOutput := errOut.String()
	if !strings.Contains(errorOutput, `error: extract "`) || !strings.Contains(errorOutput, "bad.ts") {
		t.Fatalf("expected extraction error for bad.ts on stderr, got %q", errorOutput)
	}
	if !strings.Contains(errorOutput, "unterminated template literal") {
		t.Fatalf("expected unterminated template literal detail, got %q", errorOutput)
	}
	if strings.Contains(errorOutput, "good.ts") {
		t.Fatalf("did not expect error for good.ts, got %q", errorOutput)
	}
	if strings.Contains(out.String(), "error:") {
		t.Fatalf("stdout JSON must not include error lines, got %q", out.String())
	}

	catalog := decodeExtractTestCatalog(t, out.Bytes())
	if _, ok := catalog["good.message"]; !ok {
		t.Fatalf("missing good.message in catalog=%s", out.String())
	}
	if _, ok := catalog["bad.message"]; ok {
		t.Fatalf("bad.message should be skipped, catalog=%s", out.String())
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

func assertExtractTestCatalog(t *testing.T, out *bytes.Buffer, want map[string]extractCatalogMessage) {
	t.Helper()

	got := decodeExtractTestCatalog(t, out.Bytes())
	if len(got) != len(want) {
		t.Fatalf("message count = %d, want %d; output=%s", len(got), len(want), out.String())
	}
	for id, wantMessage := range want {
		gotMessage, ok := got[id]
		if !ok {
			t.Fatalf("missing message %q in output=%s", id, out.String())
		}
		if gotMessage != wantMessage {
			t.Fatalf("message %q = %#v, want %#v", id, gotMessage, wantMessage)
		}
	}
	if strings.Contains(out.String(), `"description": ""`) {
		t.Fatalf("output should omit empty descriptions: %s", out.String())
	}
	if strings.Contains(out.String(), `"id":`) {
		t.Fatalf("formatjs catalog should use ids as keys: %s", out.String())
	}
}
