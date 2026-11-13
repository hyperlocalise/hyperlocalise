package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func BenchmarkExtractMessagesFromReactIntlEdgeCaseSource(b *testing.B) {
	source := `import { defineMessage, defineMessages, FormattedHTMLMessage, FormattedMessage, useIntl } from "react-intl";

export const messages = defineMessages(({
  0: {
    id: "edge.0",
    defaultMessage: "Zero",
  },
  0x10n: {
    id: "edge.hex",
    defaultMessage: "Hex",
  },
  标题: {
    id: "edge.unicode",
    defaultMessage: "Title" as const,
  },
}));

export const concatenated = defineMessage({
  id: "edge.concat",
  defaultMessage: ("Hello " + "world"),
});

export const arrayMessage = defineMessage({
  id: "edge.array",
  defaultMessage: ["Hello ", "wo" + "rld"],
});

export function Edge(intl: ReturnType<typeof useIntl>) {
  return (
    <>
      {intl.formatMessage?.<string>({
        id: "edge.optional",
        defaultMessage: "Optional",
      })}
      {intl.formatMessage!({
        id: "edge.nonnull",
        defaultMessage: "Non-null",
      })}
      <FormattedMessage id="edge.children">Hello children</FormattedMessage>
      <FormattedHTMLMessage id="edge.html">Hello <b>html</b></FormattedHTMLMessage>
      <FormattedMessage id="edge.jsx-concat" defaultMessage={"Hello " + "world"} />
    </>
  );
}
`

	b.ReportAllocs()
	for b.Loop() {
		messages, err := extractMessagesFromReactIntlSource(source, "src/Edge.tsx")
		if err != nil {
			b.Fatalf("extract: %v", err)
		}
		if len(messages) < 9 {
			b.Fatalf("extracted %d messages, want at least 9", len(messages))
		}
	}
}

func BenchmarkExtractMessagesFromReactIntlSource(b *testing.B) {
	source, file := makeExtractBenchmarkSource(120)

	b.ReportAllocs()
	for b.Loop() {
		_, _ = extractMessagesFromReactIntlSource(source, file)
	}
}

func BenchmarkRunExtract(b *testing.B) {
	dir := b.TempDir()
	corpusDir := filepath.Join(dir, "src", "components")
	if err := os.MkdirAll(corpusDir, 0o755); err != nil {
		b.Fatalf("create corpus dir: %v", err)
	}

	for i := 0; i < 40; i++ {
		path := filepath.Join(corpusDir, fmt.Sprintf("Component%03d.tsx", i))
		if err := os.WriteFile(path, []byte(makeExtractComponentSource(i)), 0o644); err != nil {
			b.Fatalf("write corpus file %q: %v", path, err)
		}
	}

	options := extractOptions{
		ignorePatterns: []string{"**/*.d.ts", "**/node_modules/**"},
	}

	b.ReportAllocs()
	for b.Loop() {
		if _, err := runExtract([]string{filepath.Join(dir, "src")}, options, nil); err != nil {
			b.Fatalf("runExtract: %v", err)
		}
	}
}

func BenchmarkResolveExtractFiles(b *testing.B) {
	dir := b.TempDir()
	corpusDir := filepath.Join(dir, "src", "features")
	if err := os.MkdirAll(corpusDir, 0o755); err != nil {
		b.Fatalf("create corpus dir: %v", err)
	}

	for i := 0; i < 200; i++ {
		path := filepath.Join(corpusDir, fmt.Sprintf("feature-%03d.tsx", i))
		if err := os.WriteFile(path, []byte("export const noop = true;\n"), 0o644); err != nil {
			b.Fatalf("write corpus file %q: %v", path, err)
		}
	}

	ignorePatterns := []string{
		"**/*.d.ts",
		"**/node_modules/**",
		"**/dist/**",
		"**/*.test.tsx",
	}

	b.ReportAllocs()
	for b.Loop() {
		if _, err := resolveExtractFiles([]string{filepath.Join(dir, "src", "**", "*.tsx")}, ignorePatterns); err != nil {
			b.Fatalf("resolveExtractFiles: %v", err)
		}
	}
}

func makeExtractBenchmarkSource(messageCount int) (string, string) {
	var builder strings.Builder
	builder.Grow(messageCount * 256)
	builder.WriteString(`import { defineMessage, defineMessages, FormattedMessage, useIntl } from "react-intl";

const messages = defineMessages({
`)
	for i := 0; i < messageCount; i++ {
		fmt.Fprintf(&builder, `  key%d: {
    id: "bench.key.%d",
    defaultMessage: "Benchmark message %d",
    description: "Generated benchmark copy %d",
  },
`, i, i, i, i)
	}
	builder.WriteString(`});

export function BenchmarkComponent() {
  const intl = useIntl();
`)
	for i := 0; i < messageCount/4; i++ {
		fmt.Fprintf(&builder, `  const label%d = intl.formatMessage({
    id: "bench.label.%d",
    defaultMessage: "Label %d",
  });
`, i, i, i)
	}
	builder.WriteString(`
  return (
    <>
`)
	for i := 0; i < messageCount/4; i++ {
		fmt.Fprintf(&builder, `      <FormattedMessage
        id="bench.jsx.%d"
        defaultMessage="JSX message %d"
        description="Generated JSX copy %d"
      />
`, i, i, i)
	}
	builder.WriteString(`    </>
  );
}
`)

	return builder.String(), "src/components/BenchmarkComponent.tsx"
}

func makeExtractComponentSource(index int) string {
	return fmt.Sprintf(`import { defineMessage, defineMessages, FormattedMessage, useIntl } from "react-intl";

const messages = defineMessages({
  title: {
    id: "component.%d.title",
    defaultMessage: "Component %d title",
    description: "Heading for component %d",
  },
  body: {
    id: "component.%d.body",
    defaultMessage: "Component %d body copy",
  },
});

export function Component%03d() {
  const intl = useIntl();
  const refresh = intl.formatMessage({
    id: "component.%d.refresh",
    defaultMessage: "Refresh %d",
  });

  return (
  <>
    <FormattedMessage
      id="component.%d.empty"
      defaultMessage="No items in component %d"
      description="Empty state for component %d"
    />
    <span>{refresh}</span>
  </>
  );
}
`, index, index, index, index, index, index, index, index, index, index, index)
}
