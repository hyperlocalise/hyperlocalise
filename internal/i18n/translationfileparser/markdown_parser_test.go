package translationfileparser

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMarkdownParserParseKeepsFrontmatterAndCodeFencesOut(t *testing.T) {
	content := []byte("---\ntitle: Hello\n---\n\n# Heading\n\nParagraph with [link text](https://example.com).\n\n```go\nfmt.Println(\"hi\")\n```\n")

	got, err := (MarkdownParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(got) == 0 {
		t.Fatalf("expected extracted entries")
	}

	for _, value := range got {
		if strings.Contains(value, "title:") || strings.Contains(value, "fmt.Println") {
			t.Fatalf("unexpected extracted non-translatable value: %q", value)
		}
	}
}

func TestMarkdownParserParseSkipsQuotedAndListNestedFences(t *testing.T) {
	content := []byte("> Quoted intro.\n>\n> ```ts\n> console.log('quoted')\n> ```\n>\n- List intro\n  ```bash\n  echo 'nested'\n  ```\n\nClosing paragraph.\n")

	got, err := (MarkdownParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(got), "\n")
	if strings.Contains(combined, "console.log('quoted')") {
		t.Fatalf("expected quoted fenced code to be excluded, got %q", combined)
	}
	if strings.Contains(combined, "echo 'nested'") {
		t.Fatalf("expected list-nested fenced code to be excluded, got %q", combined)
	}
	if !strings.Contains(combined, "Quoted intro.") {
		t.Fatalf("expected quoted prose to remain extracted, got %q", combined)
	}
	if !strings.Contains(combined, "List intro") || !strings.Contains(combined, "Closing paragraph.") {
		t.Fatalf("expected surrounding prose extracted, got %q", combined)
	}
}

func TestMarkdownParserParseSkipsIndentedCodeBlocks(t *testing.T) {
	content := []byte("Intro paragraph.\n\n    npm run build\n    npm run deploy\n\nOutro paragraph.\n")

	got, err := (MarkdownParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(got), "\n")
	if strings.Contains(combined, "npm run build") || strings.Contains(combined, "npm run deploy") {
		t.Fatalf("expected indented code block to be excluded, got %q", combined)
	}
	if !strings.Contains(combined, "Intro paragraph.") || !strings.Contains(combined, "Outro paragraph.") {
		t.Fatalf("expected surrounding prose extracted, got %q", combined)
	}
}

func TestMarkdownParserParseStandardMarkdownKeepsImportExportProse(t *testing.T) {
	content := []byte("import release notes before publishing.\nexport artifacts after approval.\n")

	got, err := (MarkdownParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(got), "\n")
	if !strings.Contains(combined, "import release notes before publishing.") {
		t.Fatalf("expected import-leading prose to remain translatable, got %q", combined)
	}
	if !strings.Contains(combined, "export artifacts after approval.") {
		t.Fatalf("expected export-leading prose to remain translatable, got %q", combined)
	}
}

func TestMarkdownParserParseSkipsRawHTMLBlocks(t *testing.T) {
	content := []byte("Intro paragraph.\n\n<div class=\"callout\">\n  <p>Unsafe HTML block</p>\n</div>\n\nOutro paragraph.\n")

	got, err := (MarkdownParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(got), "\n")
	if strings.Contains(combined, "Unsafe HTML block") {
		t.Fatalf("expected raw HTML block contents to remain non-translatable, got %q", combined)
	}
	if !strings.Contains(combined, "Intro paragraph.") || !strings.Contains(combined, "Outro paragraph.") {
		t.Fatalf("expected surrounding prose extracted, got %q", combined)
	}
}

func TestMarkdownParserParseMdxKeepsComponentsAndAttributesOut(t *testing.T) {
	template := []byte("---\ntitle: Mdx Page\n---\n\nimport Tabs from '@theme/Tabs'\n\n<Tabs defaultValue=\"first\">\n  <Tab value=\"first\" label=\"First tab\">\n    Here is a paragraph with <Badge text=\"New\" /> and [docs](https://mintlify.com).\n  </Tab>\n</Tabs>\n\n<CodeGroup>\n```bash\necho \"hi\"\n```\n</CodeGroup>\n\n> <Note icon=\"info\">Read me</Note>\n")

	entries, err := (MarkdownParser{MDX: true}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(entries), "\n")
	if strings.Contains(combined, "defaultValue") || strings.Contains(combined, "label=") || strings.Contains(combined, "import Tabs") {
		t.Fatalf("expected JSX/import literals to be excluded, got %q", combined)
	}
	if strings.Contains(combined, "echo \"hi\"") {
		t.Fatalf("expected fenced code to be excluded, got %q", combined)
	}
	if !strings.Contains(combined, "Here is a paragraph") || !strings.Contains(combined, "Read me") {
		t.Fatalf("expected prose to be extracted, got %q", combined)
	}
}

func TestMarkdownParserParseMdxIncludesFrontmatterMetadataValues(t *testing.T) {
	content := []byte("---\ntitle: \"Conflict handling\"\ndescription: \"Understand pull/push conflicts and apply safe resolution strategies.\"\n---\n\nBody text.\n")

	got, err := (MarkdownParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(got), "\n")
	if !strings.Contains(combined, "Conflict handling") {
		t.Fatalf("expected title frontmatter value extracted, got %q", combined)
	}
	if !strings.Contains(combined, "Understand pull/push conflicts and apply safe resolution strategies.") {
		t.Fatalf("expected description frontmatter value extracted, got %q", combined)
	}
}

func TestMarshalMarkdownRoundTripReplacesOnlyExtractedSegments(t *testing.T) {
	template := []byte("# Heading\n\n- First item\n- Second item\n\nSee [docs](https://example.com).\n> Quote\n| Name | Value |\n| ---- | ----- |\n| Alpha | Beta |\n")

	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	updates := map[string]string{}
	for k, v := range entries {
		updates[k] = strings.ToUpper(v)
	}

	output := string(MarshalMarkdown(template, updates, false))
	if !strings.Contains(output, "https://example.com") {
		t.Fatalf("expected link destination preserved, got %q", output)
	}
	if strings.Contains(output, "First item") {
		t.Fatalf("expected translated text output, got %q", output)
	}
	if !strings.Contains(output, "```") && strings.Contains(string(template), "```") {
		t.Fatalf("expected markdown structure to be preserved")
	}
}

func TestMarshalMarkdownPreservesLinkDestinationsWithParentheses(t *testing.T) {
	template := []byte("See [URL docs](https://en.wikipedia.org/wiki/URL_(disambiguation)) now.\n")

	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	updates := map[string]string{}
	for k, v := range entries {
		updates[k] = strings.ToUpper(v)
	}

	output := string(MarshalMarkdown(template, updates, false))
	if !strings.Contains(output, "https://en.wikipedia.org/wiki/URL_(disambiguation)") {
		t.Fatalf("expected full link destination preserved, got %q", output)
	}
	if !strings.Contains(output, "[URL DOCS]") {
		t.Fatalf("expected link text translated, got %q", output)
	}
}

func TestMarshalMarkdownPreservesDoubleBacktickInlineCode(t *testing.T) {
	template := []byte("Use ``code with ` inside`` safely.\n")

	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	updates := map[string]string{}
	for k, v := range entries {
		updates[k] = strings.ToUpper(v)
	}

	output := string(MarshalMarkdown(template, updates, false))
	if !strings.Contains(output, "``code with ` inside``") {
		t.Fatalf("expected double-backtick inline code preserved, got %q", output)
	}
	if !strings.Contains(output, "USE ") || !strings.Contains(output, " SAFELY.") {
		t.Fatalf("expected surrounding prose translated, got %q", output)
	}
}

func TestMarshalMarkdownPreservesTripleBacktickInlineCode(t *testing.T) {
	template := []byte("Wrap ```code with `` nested``` carefully.\n")

	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	updates := map[string]string{}
	for k, v := range entries {
		updates[k] = strings.ToUpper(v)
	}

	output := string(MarshalMarkdown(template, updates, false))
	if !strings.Contains(output, "```code with `` nested```") {
		t.Fatalf("expected triple-backtick inline code preserved, got %q", output)
	}
	if !strings.Contains(output, "WRAP ") || !strings.Contains(output, " CAREFULLY.") {
		t.Fatalf("expected surrounding prose translated, got %q", output)
	}
}

func TestMarshalMarkdownPreservesAutolinkDestinations(t *testing.T) {
	template := []byte("Visit <https://example.com/docs(reference)> now.\n")

	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	updates := map[string]string{}
	for k, v := range entries {
		updates[k] = strings.ToUpper(v)
	}

	output := string(MarshalMarkdown(template, updates, false))
	if !strings.Contains(output, "<https://example.com/docs(reference)>") {
		t.Fatalf("expected autolink destination preserved, got %q", output)
	}
	if !strings.Contains(output, "VISIT ") || !strings.Contains(output, " NOW.") {
		t.Fatalf("expected surrounding prose translated, got %q", output)
	}
}

func TestMarshalMarkdownPreservesInlineRawHTMLTags(t *testing.T) {
	template := []byte("Press <kbd>Ctrl</kbd> to continue.\n")

	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	updates := map[string]string{}
	for k, v := range entries {
		updates[k] = strings.ReplaceAll(v, "continue", "proceed")
	}

	output := string(MarshalMarkdown(template, updates, false))
	if !strings.Contains(output, "<kbd>Ctrl</kbd>") {
		t.Fatalf("expected inline raw HTML tags preserved, got %q", output)
	}
	if !strings.Contains(output, "proceed.") {
		t.Fatalf("expected prose translated around inline raw HTML, got %q", output)
	}
}

func TestMarshalMarkdownLeavesUnclosedMultiBacktickSpanLiteral(t *testing.T) {
	template := []byte("Document ``unfinished span safely.\n")

	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	updates := map[string]string{}
	for k, v := range entries {
		updates[k] = strings.ToUpper(v)
	}

	output := string(MarshalMarkdown(template, updates, false))
	if !strings.Contains(output, "``UNFINISHED SPAN SAFELY.") {
		t.Fatalf("expected unmatched multi-backtick run left literal and translated as prose, got %q", output)
	}
}

func TestMarshalMarkdownMdxRoundTripPreservesComponentSyntax(t *testing.T) {
	template := []byte("<Tabs defaultValue=\"cli\">\n<Tab value=\"cli\" label=\"CLI\">Run the command.</Tab>\n</Tabs>\n")
	entries, err := (MarkdownParser{MDX: true}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	updates := map[string]string{}
	for k, v := range entries {
		updates[k] = "FR(" + strings.TrimSpace(v) + ")"
	}

	output := string(MarshalMarkdown(template, updates, true))
	if !strings.Contains(output, "defaultValue=\"cli\"") || !strings.Contains(output, "label=\"CLI\"") {
		t.Fatalf("expected component attributes unchanged, got %q", output)
	}
	if !strings.Contains(output, "FR(Run the command.)") {
		t.Fatalf("expected prose translation in component body, got %q", output)
	}
}

func TestMarshalMarkdownPreservesBoundaryWhitespaceWithTrimmedTranslations(t *testing.T) {
	template := []byte("  Hello  \n\n- World \n")
	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	updates := map[string]string{}
	for k, v := range entries {
		updates[k] = strings.TrimSpace(strings.ToUpper(v))
	}

	output := string(MarshalMarkdown(template, updates, false))
	if output != "  HELLO  \n\n- WORLD \n" {
		t.Fatalf("expected boundary whitespace preserved, got %q", output)
	}
}

func TestMarshalMarkdownPreservesFrontmatterStructureWithTranslatedMetadataValues(t *testing.T) {
	template := []byte("---\ntitle: \"Conflict handling\"\ndescription: \"Understand pull/push conflicts and apply safe resolution strategies.\"\n---\n")
	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	updates := map[string]string{}
	for k, v := range entries {
		switch v {
		case "Conflict handling":
			updates[k] = "Gestion des conflits"
		case "Understand pull/push conflicts and apply safe resolution strategies.":
			updates[k] = "Comprendre les conflits pull/push et appliquer des strategies de resolution sures."
		default:
			updates[k] = v
		}
	}

	output := string(MarshalMarkdown(template, updates, false))
	if !strings.Contains(output, "title: \"Gestion des conflits\"") {
		t.Fatalf("expected translated title in frontmatter, got %q", output)
	}
	if !strings.Contains(output, "description: \"Comprendre les conflits pull/push et appliquer des strategies de resolution sures.\"") {
		t.Fatalf("expected translated description in frontmatter, got %q", output)
	}
	if !strings.HasPrefix(output, "---\n") || !strings.HasSuffix(output, "---\n") {
		t.Fatalf("expected frontmatter delimiters preserved, got %q", output)
	}
}

func TestStrategyParsesMarkdown(t *testing.T) {
	s := NewDefaultStrategy()
	content := []byte("# Welcome\n\nHello world\n")

	got, err := s.Parse("fr.md", content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(got) < 2 {
		t.Fatalf("expected markdown entries parsed, got %d", len(got))
	}
}

func TestStrategyParsesMDX(t *testing.T) {
	s := NewDefaultStrategy()
	content := []byte("<Callout>Use the docs.</Callout>\n")

	got, err := s.Parse("fr.mdx", content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(got) == 0 {
		t.Fatalf("expected mdx entries parsed")
	}
}

func TestMarkdownParserKeysAreStableAcrossInsertedSegments(t *testing.T) {
	base := []byte("Alpha\nBeta\n")
	withInsert := []byte("Intro\nAlpha\nBeta\n")

	baseEntries, err := (MarkdownParser{}).Parse(base)
	if err != nil {
		t.Fatalf("parse base: %v", err)
	}
	insertedEntries, err := (MarkdownParser{}).Parse(withInsert)
	if err != nil {
		t.Fatalf("parse with insert: %v", err)
	}

	baseAlpha := findKeyByValue(baseEntries, "Alpha")
	baseBeta := findKeyByValue(baseEntries, "Beta")
	insertAlpha := findKeyByValue(insertedEntries, "Alpha")
	insertBeta := findKeyByValue(insertedEntries, "Beta")
	if baseAlpha == "" || baseBeta == "" || insertAlpha == "" || insertBeta == "" {
		t.Fatalf("expected keys for shared segments")
	}
	if baseAlpha != insertAlpha || baseBeta != insertBeta {
		t.Fatalf("expected stable hash keys, base=(%s,%s) inserted=(%s,%s)", baseAlpha, baseBeta, insertAlpha, insertBeta)
	}
}

func TestMarkdownParserKeysDisambiguateDuplicateSegments(t *testing.T) {
	content := []byte("Repeat\nRepeat\n")
	entries, err := (MarkdownParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected two distinct keys for duplicate segments, got %d", len(entries))
	}
}

func TestMarkdownParserParseTreatsMdxSentenceWithExpressionAsSingleSection(t *testing.T) {
	content := []byte("Fallback route: {locale === \"vi-VN\" ? \"/vi-VN\" : \"/\"} is computed at runtime.\n")

	entries, err := (MarkdownParser{MDX: true}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one section for sentence around expression, got %d", len(entries))
	}

	combined := strings.Join(mapValues(entries), "\n")
	if !strings.Contains(combined, "Fallback route:") || !strings.Contains(combined, "is computed at runtime.") {
		t.Fatalf("expected sentence content preserved, got %q", combined)
	}
	if !strings.Contains(combined, "HLMDPH_") {
		t.Fatalf("expected protected placeholder for runtime expression, got %q", combined)
	}
}

func TestMarkdownParserParseTreatsMdxWrappedTextAsSingleSection(t *testing.T) {
	content := []byte("<Tab value=\"cli\">Run `hyperlocalise status --verbose` before publishing.</Tab>\n")

	entries, err := (MarkdownParser{MDX: true}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one section for wrapped prose, got %d", len(entries))
	}

	combined := strings.Join(mapValues(entries), "\n")
	if !strings.Contains(combined, "Run ") || !strings.Contains(combined, "before publishing.") {
		t.Fatalf("expected wrapped prose preserved, got %q", combined)
	}
	if strings.Contains(combined, "<Tab") || strings.Contains(combined, "</Tab>") {
		t.Fatalf("expected wrapper tags excluded from keyed section, got %q", combined)
	}
	if !strings.Contains(combined, "HLMDPH_") {
		t.Fatalf("expected inline code placeholder preserved, got %q", combined)
	}
}

func TestSplitMarkdownLinePrefixDoesNotTreatThematicBreakAsBullet(t *testing.T) {
	prefix, body := splitMarkdownLinePrefix("- - -\n")
	if prefix != "" || body != "- - -\n" {
		t.Fatalf("expected thematic break to remain a single literal line, got prefix=%q body=%q", prefix, body)
	}

	prefix, body = splitMarkdownLinePrefix("* * *\n")
	if prefix != "" || body != "* * *\n" {
		t.Fatalf("expected starred thematic break to remain a single literal line, got prefix=%q body=%q", prefix, body)
	}
}

func TestMarkdownParserParseSkipsMultiLineJSXAttributes(t *testing.T) {
	content := []byte("<Card\n  title=\"Replacement rules\"\n  href=\"/docs/rules\"\n>\n  Replace the sentence only.\n</Card>\n")

	entries, err := (MarkdownParser{MDX: true}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one translatable section inside multiline tag, got %d", len(entries))
	}

	combined := strings.Join(mapValues(entries), "\n")
	if combined != "Replace the sentence only." {
		t.Fatalf("expected only inner prose extracted, got %q", combined)
	}
}

func TestMarkdownParserParseMdxSkipsOnlyActualESMStatements(t *testing.T) {
	content := []byte("import release notes before publishing.\nexport artifacts after approval.\n\nimport Tabs from '@theme/Tabs'\nexport const version = '1';\n")

	entries, err := (MarkdownParser{MDX: true}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(entries), "\n")
	if !strings.Contains(combined, "import release notes before publishing.") {
		t.Fatalf("expected prose beginning with import to be extracted, got %q", combined)
	}
	if !strings.Contains(combined, "export artifacts after approval.") {
		t.Fatalf("expected prose beginning with export to be extracted, got %q", combined)
	}
	if strings.Contains(combined, "Tabs from") || strings.Contains(combined, "version = '1'") {
		t.Fatalf("expected actual ESM statements to remain protected, got %q", combined)
	}
}

func TestMarkdownParserParseMdxTreatsExportDefaultProseAsTranslatable(t *testing.T) {
	content := []byte("export default workflows remain stable after review.\n")

	entries, err := (MarkdownParser{MDX: true}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(entries), "\n")
	if !strings.Contains(combined, "export default workflows remain stable after review.") {
		t.Fatalf("expected prose beginning with export default to be extracted, got %q", combined)
	}
}

func TestMarkdownParserParseMdxSkipsValidExportDefaultStatement(t *testing.T) {
	content := []byte("export default Meta\n\nVisible paragraph.\n")

	entries, err := (MarkdownParser{MDX: true}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(entries), "\n")
	if strings.Contains(combined, "export default Meta") {
		t.Fatalf("expected valid export default statement to remain protected, got %q", combined)
	}
	if !strings.Contains(combined, "Visible paragraph.") {
		t.Fatalf("expected surrounding prose extracted, got %q", combined)
	}
}

func TestMarkdownParserParseMdxSkipsMultilineESMWithTemplatesAndComments(t *testing.T) {
	content := []byte("export const meta = {\n  title: `Docs ${locale}`,\n  note: \"keep\", // parser should keep this protected\n}\n\nVisible paragraph.\n")

	entries, err := (MarkdownParser{MDX: true}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(entries), "\n")
	if strings.Contains(combined, "title: `Docs") || strings.Contains(combined, "parser should keep this protected") {
		t.Fatalf("expected multiline esm block excluded, got %q", combined)
	}
	if !strings.Contains(combined, "Visible paragraph.") {
		t.Fatalf("expected prose after multiline esm extracted, got %q", combined)
	}
}

func TestMarkdownParserParseMdxTreatsFragmentWrappedTextAsSingleSection(t *testing.T) {
	content := []byte("<>\n  Fragment prose with {locale.toUpperCase()} kept safe.\n</>\n")

	entries, err := (MarkdownParser{MDX: true}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one section for fragment-wrapped prose, got %d", len(entries))
	}

	combined := strings.Join(mapValues(entries), "\n")
	if !strings.Contains(combined, "Fragment prose with") || !strings.Contains(combined, "kept safe.") {
		t.Fatalf("expected fragment prose preserved, got %q", combined)
	}
	if !strings.Contains(combined, "HLMDPH_") {
		t.Fatalf("expected fragment expression protected with placeholder, got %q", combined)
	}
}

func TestMarkdownParserParseMdxTreatsTemplateLiteralExpressionAsSingleSection(t *testing.T) {
	content := []byte("Preview: {items.map((item) => `#${item.id} ${item.name}`).join(', ')} is ready.\n")

	entries, err := (MarkdownParser{MDX: true}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one section around template literal expression, got %d", len(entries))
	}

	combined := strings.Join(mapValues(entries), "\n")
	if !strings.Contains(combined, "Preview:") || !strings.Contains(combined, "is ready.") {
		t.Fatalf("expected surrounding sentence preserved, got %q", combined)
	}
	if !strings.Contains(combined, "HLMDPH_") {
		t.Fatalf("expected template literal expression protected with placeholder, got %q", combined)
	}
}

func TestMarkdownParserParseMdxSkipsMalformedJSXConservatively(t *testing.T) {
	content := []byte("Intro paragraph.\n\n<Card title=\"broken\"\n  Replace only safe prose outside malformed tag.\n\nOutro paragraph.\n")

	entries, err := (MarkdownParser{MDX: true}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(entries), "\n")
	if strings.Contains(combined, "Replace only safe prose outside malformed tag.") {
		t.Fatalf("expected malformed JSX region skipped conservatively, got %q", combined)
	}
	if !strings.Contains(combined, "Intro paragraph.") || !strings.Contains(combined, "Outro paragraph.") {
		t.Fatalf("expected surrounding safe prose extracted, got %q", combined)
	}
}

func TestMarkdownParserParseMdxSkipsMalformedExpressionConservatively(t *testing.T) {
	content := []byte("Intro paragraph.\n\nFallback route: {locale === \"vi-VN\" ? \"/vi-VN\" : \"/\"\n\nOutro paragraph.\n")

	entries, err := (MarkdownParser{MDX: true}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(entries), "\n")
	if strings.Contains(combined, "Fallback route:") {
		t.Fatalf("expected malformed expression region skipped conservatively, got %q", combined)
	}
	if !strings.Contains(combined, "Intro paragraph.") || !strings.Contains(combined, "Outro paragraph.") {
		t.Fatalf("expected surrounding safe prose extracted, got %q", combined)
	}
}

func TestMarkdownParserParseMdxSkipsFencedCodeInsideJSXWrappers(t *testing.T) {
	content := []byte("<CodeGroup>\n```ts\nexport const projectId = \"docs\";\n```\n</CodeGroup>\n\n<Card>\n  Replace this prose.\n</Card>\n")

	entries, err := (MarkdownParser{MDX: true}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(entries), "\n")
	if strings.Contains(combined, "projectId") {
		t.Fatalf("expected fenced code inside JSX wrapper excluded, got %q", combined)
	}
	if !strings.Contains(combined, "Replace this prose.") {
		t.Fatalf("expected prose inside safe JSX children extracted, got %q", combined)
	}
}

func TestMarshalMarkdownMdxPreservesMalformedJSXRegionWhileTranslatingSafeProse(t *testing.T) {
	template := []byte("Intro paragraph.\n\n<Card title=\"broken\"\n  Replace only safe prose outside malformed tag.\n\nOutro paragraph.\n")

	entries, err := (MarkdownParser{MDX: true}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	updates := map[string]string{}
	for k, v := range entries {
		updates[k] = "FR:" + strings.TrimSpace(v)
	}

	output := string(MarshalMarkdown(template, updates, true))
	if !strings.Contains(output, "<Card title=\"broken\"\n  Replace only safe prose outside malformed tag.\n") {
		t.Fatalf("expected malformed JSX region preserved byte-for-byte, got %q", output)
	}
	if !strings.Contains(output, "FR:Intro paragraph.") || !strings.Contains(output, "FR:Outro paragraph.") {
		t.Fatalf("expected surrounding safe prose translated, got %q", output)
	}
}

func TestMarshalMarkdownMdxPreservesMalformedExpressionRegionWhileTranslatingSafeProse(t *testing.T) {
	template := []byte("Intro paragraph.\n\nFallback route: {locale === \"vi-VN\" ? \"/vi-VN\" : \"/\"\n\nOutro paragraph.\n")

	entries, err := (MarkdownParser{MDX: true}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	updates := map[string]string{}
	for k, v := range entries {
		updates[k] = "FR:" + strings.TrimSpace(v)
	}

	output := string(MarshalMarkdown(template, updates, true))
	if !strings.Contains(output, "Fallback route: {locale === \"vi-VN\" ? \"/vi-VN\" : \"/\"") {
		t.Fatalf("expected malformed expression region preserved byte-for-byte, got %q", output)
	}
	if !strings.Contains(output, "FR:Intro paragraph.") || !strings.Contains(output, "FR:Outro paragraph.") {
		t.Fatalf("expected surrounding safe prose translated, got %q", output)
	}
}

func TestMarshalMarkdownWithTargetFallbackIncludesInsertedSourceSegments(t *testing.T) {
	source := []byte("# Guide\n\nExisting intro.\n\nNew section added.\n\nExisting outro.\n")
	target := []byte("# Guide\n\nIntro existant.\n\nConclusion existante.\n")

	sourceEntries, err := (MarkdownParser{}).Parse(source)
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}

	var newKey string
	for key, value := range sourceEntries {
		if strings.TrimSpace(value) == "New section added." {
			newKey = key
			break
		}
	}
	if newKey == "" {
		t.Fatalf("expected key for inserted source segment")
	}

	output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{
		newKey: "Nouvelle section ajoutee.",
	}, false))

	if !strings.Contains(output, "Intro existant.") {
		t.Fatalf("expected existing translated intro preserved, got %q", output)
	}
	if !strings.Contains(output, "Nouvelle section ajoutee.") {
		t.Fatalf("expected new inserted section translated, got %q", output)
	}
	if !strings.Contains(output, "Conclusion existante.") {
		t.Fatalf("expected existing translated outro preserved, got %q", output)
	}
}

func TestMarshalMarkdownWithTargetFallbackPreservesInlineCodeSentenceOrder(t *testing.T) {
	source := []byte("- MDX `import` and `export` lines\n- Next line\n")
	target := []byte("- MDX `import` va `export` dong\n- Dong tiep theo\n")
	output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{}, false))

	if !strings.Contains(output, "- MDX `import` va `export` dong") {
		t.Fatalf("expected inline-code sentence order preserved, got %q", output)
	}
	if strings.Contains(output, "MDX `import` MDX `export`") {
		t.Fatalf("unexpected duplicated/reordered inline-code sentence, got %q", output)
	}
}

func TestMarshalMarkdownWithTargetFallbackDoesNotBleedAcrossHeadings(t *testing.T) {
	source := []byte("When you pass `--output`, report includes metadata.\n\n## Worker tuning guidance\n\nLower `--workers` in constrained CI.\n")
	target := []byte("Khi truyen `--output`, bao cao gom metadata.\n\n## Huong dan dieu chinh cong nhan\n\nGiam `--workers` trong CI gioi han.\n")

	out := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{}, false))
	if !strings.Contains(out, "## Huong dan dieu chinh cong nhan") {
		t.Fatalf("expected heading translation preserved, got %q", out)
	}
	if strings.Contains(out, "`--workers` Huong dan dieu chinh cong nhan") {
		t.Fatalf("unexpected heading text merged into sentence, got %q", out)
	}
}

func TestAlignMarkdownTargetToSourceMapsBySourceKeys(t *testing.T) {
	source := []byte("# Guide\n\nExisting intro.\n\nExisting outro.\n")
	target := []byte("# Guide\n\nIntro existant.\n\nConclusion existante.\n")

	aligned := AlignMarkdownTargetToSource(source, target, false)
	sourceEntries, err := (MarkdownParser{}).Parse(source)
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}

	introKey := findKeyByValue(sourceEntries, "Existing intro.")
	outroKey := findKeyByValue(sourceEntries, "Existing outro.")
	if introKey == "" || outroKey == "" {
		t.Fatalf("expected source keys for intro/outro")
	}

	if got := strings.TrimSpace(aligned[introKey]); got != "Intro existant." {
		t.Fatalf("expected intro mapped to source key, got %q", got)
	}
	if got := strings.TrimSpace(aligned[outroKey]); got != "Conclusion existante." {
		t.Fatalf("expected outro mapped to source key, got %q", got)
	}
}

func TestAlignMarkdownTargetToSourceMapsInsertedSectionWhenPresent(t *testing.T) {
	source := []byte("# Guide\n\nExisting intro.\n\nNew section added.\n\nExisting outro.\n")
	target := []byte("# Guide\n\nIntro existant.\n\nNouvelle section ajoutee.\n\nConclusion existante.\n")

	aligned := AlignMarkdownTargetToSource(source, target, false)
	sourceEntries, err := (MarkdownParser{}).Parse(source)
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}

	newKey := findKeyByValue(sourceEntries, "New section added.")
	if newKey == "" {
		t.Fatalf("expected source key for inserted section")
	}
	if got := strings.TrimSpace(aligned[newKey]); got != "Nouvelle section ajoutee." {
		t.Fatalf("expected inserted section mapped to source key, got %q", got)
	}
}

func TestAlignMarkdownFallbackPrefersStructuralPathsOverGreedyOrder(t *testing.T) {
	sourceDoc := markdownDocument{parts: []markdownPart{
		{key: "source.first", source: "First source", path: "section/0"},
		{key: "source.second", source: "Second source", path: "section/1"},
	}}
	sourceEntries := map[string]string{
		"source.first":  "First source",
		"source.second": "Second source",
	}
	targetDoc := markdownDocument{parts: []markdownPart{
		{key: "target.second", source: "Deuxieme cible", path: "section/1"},
		{key: "target.first", source: "Premiere cible", path: "section/0"},
	}}

	aligned := alignMarkdownFallback(sourceDoc, sourceEntries, targetDoc)
	if got := aligned["source.first"]; got != "Premiere cible" {
		t.Fatalf("expected first source key to align by structural path, got %q", got)
	}
	if got := aligned["source.second"]; got != "Deuxieme cible" {
		t.Fatalf("expected second source key to align by structural path, got %q", got)
	}
}

func TestMarshalMarkdownWithTargetFallbackFixturesPreserveReplacementBoundaries(t *testing.T) {
	t.Run("markdown", func(t *testing.T) {
		source := readFixture(t, "tests/md/en-US.md")
		target := []byte(`---
title: "Danh sach kiem tra ban phat hanh"
description: "Xac nhan cap nhat tai lieu truoc khi dong bo noi dung da ban dia hoa."
---

# Danh sach kiem tra ban phat hanh

Phat hanh cap nhat ma khong lam hong placeholder nhu ` + "`{{locale}}`" + ` hoac co nhu ` + "`--dry-run`" + `.

Su dung [tai lieu tham chieu status](https://example.com/docs/status?tab=cli#dry-run) truoc khi day thay doi.

Lien ket tham chieu cung phai duoc giu nguyen: [huong dan CLI][cli-guide] va ![So do](https://example.com/assets/flow(chart).png).

> Giu cho nhan lap lai on dinh.
> Giu cho nhan lap lai on dinh.
>
> Giu ` + "`MDPH_0_END`" + ` nhu van ban thong thuong, khong phai token parser.

- Xem "Tom tat dong bo" trong terminal.
- Xac nhan lien ket trong [Troubleshooting](https://example.com/docs/troubleshooting#common-errors) van nguyen ven.
- Khong dich ` + "`hyperlocalise run --group docs`" + `.
- Xu ly ky tu thoat nhu ` + "`\\*literal asterisks\\*`" + ` va ` + "`docs\\[archive]`" + ` can than.

| Buoc | Phu trach | Ghi chu |
| ---- | --------- | ------- |
| Chuan bi | Tai lieu | Chi thay cau van, khong thay ` + "`docs/{{locale}}/index.mdx`" + `. |
| Xac minh | QA | Kiem tra "Tom tat dong bo" xuat hien trong bao cao va xem [huong dan CLI][cli-guide]. |
| Phat hanh | Ops | Tai len ![So do](https://example.com/assets/flow(chart).png) sau khi phe duyet. |

1. Mo ` + "`docs/index.mdx`" + `.
2. Tim "Tom tat dong bo".
3. So sanh voi ghi chu phat hanh truoc.

- Muc cha
  - Ghi chu long voi [Troubleshooting](https://example.com/docs/troubleshooting#common-errors) va ` + "`{{locale}}`" + `

` + "```bash" + `
hyperlocalise run --group docs --dry-run
` + "```" + `

Luu y cuoi cung: "Tom tat dong bo" phai khop giua danh sach kiem tra va bao cao.

[cli-guide]: https://example.com/docs/cli(reference)
`)

		output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{}, false))
		if !strings.Contains(output, "title: \"Danh sach kiem tra ban phat hanh\"") {
			t.Fatalf("expected translated frontmatter title preserved, got %q", output)
		}
		if !strings.Contains(output, "https://example.com/docs/status?tab=cli#dry-run") {
			t.Fatalf("expected source link destination preserved, got %q", output)
		}
		if !strings.Contains(output, "https://example.com/docs/cli(reference)") {
			t.Fatalf("expected reference link destination preserved, got %q", output)
		}
		if !strings.Contains(output, "https://example.com/assets/flow(chart).png") {
			t.Fatalf("expected image destination with parentheses preserved, got %q", output)
		}
		if !strings.Contains(output, "`docs/{{locale}}/index.mdx`") {
			t.Fatalf("expected placeholder path preserved, got %q", output)
		}
		if !strings.Contains(output, "MDPH_0_END") {
			t.Fatalf("expected literal placeholder-looking prose preserved, got %q", output)
		}
		if strings.Count(output, "Giu cho nhan lap lai on dinh.") != 2 {
			t.Fatalf("expected duplicate blockquote lines preserved independently, got %q", output)
		}
		if !strings.Contains(output, "\\*literal asterisks\\*") || !strings.Contains(output, "docs\\[archive]") {
			t.Fatalf("expected escaped markdown content preserved, got %q", output)
		}
		if !strings.Contains(output, "  - Ghi chu long voi [Troubleshooting](https://example.com/docs/troubleshooting#common-errors) va `{{locale}}`") {
			t.Fatalf("expected nested list content preserved, got %q", output)
		}
		if !strings.Contains(output, "```bash\nhyperlocalise run --group docs --dry-run\n```") {
			t.Fatalf("expected fenced code block preserved, got %q", output)
		}
	})

	t.Run("mdx", func(t *testing.T) {
		source := readFixture(t, "tests/mdx/en-US.mdx")
		brokenTarget := readFixture(t, "tests/mdx/zh-CN.mdx")
		target := []byte(`---
title: "So tay phat hanh tai lieu"
description: "Xu ly thay the van ban MDX ma khong dong vao JSX, bieu thuc hoac import."
---

import { Callout } from "nextra/components";
import { Tabs, Tab } from "fumadocs-ui/components/tabs";

# So tay phat hanh tai lieu

<Callout type="warning">
  Giu nguyen ` + "`projectId=\"docs\"`" + ` khi ban cap nhat trang nay.
</Callout>

<Tabs items={["cli", "api"]}>
  <Tab value="cli">
    Chay ` + "`hyperlocalise status --verbose`" + ` truoc khi phat hanh cong tai lieu.
  </Tab>
  <Tab value="api">
    Nguoi dung API nen giu ten token ` + "`HYPERLOCALISE_API_KEY`" + `.
  </Tab>
</Tabs>

<Card title="Replacement rules" href="/docs/rules">
  Chi thay cau van, khong thay prop ` + "`title`" + ` hay bieu thuc ` + "`{locale.toUpperCase()}`" + `.
</Card>

<Card
  title="Nested checks"
  href="/docs/nested(checks)"
  icon={<Badge text="beta" />}
>
  <Callout type="info">
    Giu [lien ket tham chieu][mdx-ref] on dinh va bao toan van ban nhu ` + "`MDPH_0_END`" + `.
  </Callout>

  - Muc long dau tien voi ` + "`hyperlocalise sync pull`" + `
  - Muc long thu hai voi <Badge text="inline" /> danh dau
</Card>

Duong dan du phong: {locale === "vi-VN" ? "/vi-VN" : "/"} duoc tinh khi chay.

Dung ban build <Badge text="stable" /> khi nhanh phat hanh da dong bang.

> Blockquote co the chua <Badge text="quoted" /> UI va ` + "`inlineCode()`" + `.
>
> ![So do trich dan](https://example.com/assets/quoted(flow).png)

<Steps>
  <Step title="Prepare">
    Xem [huong dan CLI](https://example.com/docs/cli(reference)) truoc khi phat hanh.
  </Step>
  <Step
    title="Publish"
    icon={<Badge text="go" />}
  >
    Phat hanh trang tai lieu va giu nguyen ` + "`docs/[locale]/index.mdx`" + `.
  </Step>
</Steps>

> Lap lai canh bao nay: giu nguyen ` + "`href=\"/docs/rules\"`" + `.
> Lap lai canh bao nay: giu nguyen ` + "`href=\"/docs/rules\"`" + `.

` + "```ts" + `
export const projectId = "docs";
` + "```" + `

[mdx-ref]: https://example.com/docs/mdx(reference)
`)

		output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{}, true))
		if !strings.Contains(output, "title: \"So tay phat hanh tai lieu\"") {
			t.Fatalf("expected translated mdx frontmatter title preserved, got %q", output)
		}
		if !strings.Contains(output, "import { Tabs, Tab } from \"fumadocs-ui/components/tabs\";") {
			t.Fatalf("expected source import preserved, got %q", output)
		}
		if !strings.Contains(output, "<Card title=\"Replacement rules\" href=\"/docs/rules\">") {
			t.Fatalf("expected JSX props preserved, got %q", output)
		}
		if !strings.Contains(output, "<Card\n  title=\"Nested checks\"\n  href=\"/docs/nested(checks)\"\n  icon={<Badge text=\"beta\" />}\n>") {
			t.Fatalf("expected multiline JSX opening tag preserved, got %q", output)
		}
		if !strings.Contains(output, "{locale === \"vi-VN\" ? \"/vi-VN\" : \"/\"}") {
			t.Fatalf("expected runtime expression preserved, got %q", output)
		}
		if !strings.Contains(output, "[lien ket tham chieu][mdx-ref]") || !strings.Contains(output, "[mdx-ref]: https://example.com/docs/mdx(reference)") {
			t.Fatalf("expected MDX reference links preserved, got %q", output)
		}
		if !strings.Contains(output, "MDPH_0_END") {
			t.Fatalf("expected literal placeholder-looking prose preserved in mdx, got %q", output)
		}
		if !strings.Contains(output, "![So do trich dan](https://example.com/assets/quoted(flow).png)") {
			t.Fatalf("expected blockquoted image destination preserved, got %q", output)
		}
		if !strings.Contains(output, "<Step\n    title=\"Publish\"\n    icon={<Badge text=\"go\" />}\n  >") {
			t.Fatalf("expected multiline nested step tag preserved, got %q", output)
		}
		if !strings.Contains(output, "Phat hanh trang tai lieu va giu nguyen `docs/[locale]/index.mdx`.") {
			t.Fatalf("expected prose inside nested step preserved, got %q", output)
		}
		if strings.Count(output, "Lap lai canh bao nay: giu nguyen `href=\"/docs/rules\"`.") != 2 {
			t.Fatalf("expected repeated mdx warning preserved independently, got %q", output)
		}
		if !strings.Contains(output, "```ts\nexport const projectId = \"docs\";\n```") {
			t.Fatalf("expected fenced code block preserved, got %q", output)
		}

		brokenOutput := string(MarshalMarkdownWithTargetFallback(source, brokenTarget, map[string]string{}, true))
		if !strings.Contains(brokenOutput, "[mdx-ref]: https://example.com/docs/mdx(reference)") {
			t.Fatalf("expected source mdx reference destination used when target destination changed, got %q", brokenOutput)
		}
	})
}

func TestMarshalMarkdownWithTargetFallbackPreservesSourceReferenceDefinitionDestination(t *testing.T) {
	source := []byte("See [docs][mdx-ref].\n\n[mdx-ref]: https://example.com/docs/mdx(reference)\n")
	target := []byte("Xem [tai lieu][mdx-ref].\n\n[mdx-ref]: https://example.com/docs/mdx(ban-dich)\n")

	output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{}, false))
	if !strings.Contains(output, "Xem [tai lieu][mdx-ref].") {
		t.Fatalf("expected translated reference link text preserved, got %q", output)
	}
	if !strings.Contains(output, "[mdx-ref]: https://example.com/docs/mdx(reference)") {
		t.Fatalf("expected source reference destination preserved, got %q", output)
	}
}

func TestMarshalMarkdownWithTargetFallbackRepairsDanglingReferenceLinkCloserInMDX(t *testing.T) {
	source := []byte("<Callout>\n  Keep [reference links][mdx-ref] stable.\n</Callout>\n\n[mdx-ref]: https://example.com/docs/mdx(reference)\n")
	target := []byte("<Callout>\n  Giu [liên kết tham khảo][mdx-ref]] on dinh.\n</Callout>\n\n[mdx-ref]: https://example.com/docs/mdx(reference)\n")

	output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{}, true))
	if strings.Contains(output, "[liên kết tham khảo][mdx-ref]]") {
		t.Fatalf("expected dangling reference-link closer repaired, got %q", output)
	}
	if !strings.Contains(output, "Giu [liên kết tham khảo][mdx-ref] on dinh.") {
		t.Fatalf("expected repaired reference-style mdx link preserved, got %q", output)
	}
}

func TestMarshalMarkdownWithTargetFallbackFixturesRepairDanglingInlineLinkClosersFromZhCNDocs(t *testing.T) {
	t.Run("workflows/local-generation", func(t *testing.T) {
		source := readFixture(t, "docs/workflows/local-generation.mdx")
		target := readFixture(t, "docs/zh-CN/workflows/local-generation.mdx")

		output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{}, true))
		if strings.Contains(output, "[锁文件合约](/reference/lockfile-contract)]") {
			t.Fatalf("expected dangling bracket after inline link repaired, got %q", output)
		}
		if !strings.Contains(output, "[锁文件合约](/reference/lockfile-contract)") {
			t.Fatalf("expected reconstructed inline link destination preserved, got %q", output)
		}
	})

	t.Run("index/common-next-steps", func(t *testing.T) {
		source := readFixture(t, "docs/index.mdx")
		target := readFixture(t, "docs/zh-CN/index.mdx")

		output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{}, true))
		if strings.Contains(output, "[命令概览](/commands/overview)].") {
			t.Fatalf("expected dangling bracket repaired for commands overview link, got %q", output)
		}
		if strings.Contains(output, "[提供商凭据](/configuration/provider-credentials)]") {
			t.Fatalf("expected dangling bracket repaired for provider credentials link, got %q", output)
		}
		if strings.Contains(output, "[稳定性矩阵](/reference/stability-matrix)]") {
			t.Fatalf("expected dangling bracket repaired for stability matrix link, got %q", output)
		}
	})
}

func TestMarshalMarkdownWithTargetFallbackFixturesRepairDanglingTableRowClosersFromWhyHyperlocaliseDocs(t *testing.T) {
	source := readFixture(t, "docs/getting-started/why-hyperlocalise.mdx")
	target := readFixture(t, "docs/zh-CN/getting-started/why-hyperlocalise.mdx")

	output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{}, true))
	if strings.Contains(output, "| 手动脚本 | 🟡 中到高（需要自行构建和维护） | 🟢 高（完全自定义） | 🟡 中（取决于脚本的质量和标准） | 🟢 低\n") {
		t.Fatalf("expected dangling table row closer repaired, got %q", output)
	}
	if !strings.Contains(output, "| 手动脚本 | 🟡 中到高（需要自行构建和维护） | 🟢 高（完全自定义） | 🟡 中（取决于脚本的质量和标准） | 🟢 低 |") {
		t.Fatalf("expected table row with restored closing pipe, got %q", output)
	}
	if !strings.Contains(output, "| 细分地域化 | 🟢 低 (使用单一 CLI，配置简单) | 🟢 高 (AI 自动生成 + 可选的人工审核流程) | 🟢 高 (显式预演、同步、状态流程) | 🟢 低 (支持多提供商和多适配器) |") {
		t.Fatalf("expected final table row with restored closing pipe, got %q", output)
	}
}

func TestMarkdownParserParseMdxFixtureQuickstartSkipsCodeGroupExports(t *testing.T) {
	source := readFixture(t, "docs/getting-started/quickstart.mdx")

	entries, err := (MarkdownParser{MDX: true}).Parse(source)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	combined := strings.Join(mapValues(entries), "\n")
	if !strings.Contains(combined, "Quickstart") ||
		!strings.Contains(combined, "This writes ") ||
		!strings.Contains(combined, "in your current directory.") {
		t.Fatalf("expected prose from quickstart fixture extracted, got %q", combined)
	}
	if strings.Contains(combined, "export OPENAI_API_KEY") || strings.Contains(combined, "export AZURE_OPENAI_BASE_URL") {
		t.Fatalf("expected CodeGroup export lines from quickstart fixture excluded, got %q", combined)
	}
}

func TestMarshalMarkdownWithTargetFallbackRepairsDanglingImageCloserInTableRow(t *testing.T) {
	source := []byte("| Step | Owner | Notes |\n| ---- | ----- | ----- |\n| Publish | Ops | Upload ![Diagram](https://example.com/assets/flow(chart).png) after approval. |\n")
	target := []byte("| 步骤 | 负责人 | 备注 |\n| ---- | ----- | ----- |\n| 发布 | 运维 | 上传 ![审核后，图表](https://example.com/assets/flow(chart).png) ] |\n")

	output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{}, false))
	if strings.Contains(output, ".png) ] |") {
		t.Fatalf("expected dangling image closer repaired, got %q", output)
	}
	if !strings.Contains(output, "https://example.com/assets/flow(chart).png") {
		t.Fatalf("expected source image destination preserved, got %q", output)
	}
}

func TestMarshalMarkdownWithTargetFallbackKeepsMdxSentenceBoundariesAroundExpressions(t *testing.T) {
	source := []byte("Fallback route: {locale === \"vi-VN\" ? \"/vi-VN\" : \"/\"} is computed at runtime.\nUse <Badge text=\"stable\" /> builds when the release branch is frozen.\n")
	target := []byte("Duong dan du phong: {locale === \"vi-VN\" ? \"/vi-VN\" : \"/\"} duoc tinh khi chay.\nDung ban build <Badge text=\"stable\" /> khi nhanh phat hanh da dong bang.\n")

	output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{}, true))
	if !strings.Contains(output, "Duong dan du phong: {locale === \"vi-VN\" ? \"/vi-VN\" : \"/\"} duoc tinh khi chay.") {
		t.Fatalf("expected expression sentence preserved, got %q", output)
	}
	if !strings.Contains(output, "Dung ban build <Badge text=\"stable\" /> khi nhanh phat hanh da dong bang.") {
		t.Fatalf("expected inline component sentence preserved, got %q", output)
	}
}

func TestMarshalMarkdownWithTargetFallbackPreservesMixedProtectedConstructsInSingleSentence(t *testing.T) {
	source := []byte("Open [docs](https://example.com/docs), run `hyperlocalise status`, inspect <Badge text=\"beta\" />, then confirm {locale.toUpperCase()}.\n")
	target := []byte("Mo [tai lieu](https://example.com/docs), chay `hyperlocalise status`, kiem tra <Badge text=\"beta\" />, sau do xac nhan {locale.toUpperCase()}.\n")

	output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{}, true))
	if !strings.Contains(output, "Mo [tai lieu](https://example.com/docs), chay `hyperlocalise status`, kiem tra <Badge text=\"beta\" />, sau do xac nhan {locale.toUpperCase()}.") {
		t.Fatalf("expected all protected constructs preserved in one sentence, got %q", output)
	}
}

func TestMarshalMarkdownPreservesLiteralPlaceholderLookingText(t *testing.T) {
	template := []byte("Document the token MDPH_0_END literally and keep `code` intact.\n")

	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	updates := map[string]string{}
	for k, v := range entries {
		updates[k] = strings.ReplaceAll(v, "literally", "verbatim")
	}

	output := string(MarshalMarkdown(template, updates, false))
	if !strings.Contains(output, "MDPH_0_END") {
		t.Fatalf("expected literal placeholder-looking text preserved, got %q", output)
	}
	if !strings.Contains(output, "`code`") {
		t.Fatalf("expected inline code restored, got %q", output)
	}
}

func TestMarshalMarkdownWithTargetFallbackExpandsTargetSpecificPlaceholders(t *testing.T) {
	source := []byte("Open [docs](https://example.com/source-docs) and inspect <Badge text=\"beta\" />.\n")
	target := []byte("Mo [tai lieu](https://example.com/vi-docs) va kiem tra <Badge text=\"ban dich\" />.\n")

	output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{}, true))
	if strings.Contains(output, "\x1eHLMDPH_") {
		t.Fatalf("expected no raw placeholder control tokens in fallback output, got %q", output)
	}
	if !strings.Contains(output, "[tai lieu](https://example.com/vi-docs)") {
		t.Fatalf("expected target link destination preserved, got %q", output)
	}
	if !strings.Contains(output, "<Badge text=\"ban dich\" />") {
		t.Fatalf("expected target inline JSX preserved, got %q", output)
	}
}

func TestMarshalMarkdownWithTargetFallbackPreservesMultiLineJSXStructure(t *testing.T) {
	source := []byte("<Card\n  title=\"Replacement rules\"\n  href=\"/docs/rules\"\n>\n  Replace the sentence only.\n</Card>\n")
	target := []byte("<Card\n  title=\"Quy tac thay the\"\n  href=\"/docs/rules\"\n>\n  Chi thay cau van.\n</Card>\n")

	output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{}, true))
	if !strings.Contains(output, "title=\"Replacement rules\"") {
		t.Fatalf("expected source JSX attributes preserved, got %q", output)
	}
	if !strings.Contains(output, "href=\"/docs/rules\"") {
		t.Fatalf("expected link prop preserved, got %q", output)
	}
	if !strings.Contains(output, "  Chi thay cau van.\n") {
		t.Fatalf("expected inner prose preserved from target, got %q", output)
	}
}

func TestMarkdownParserParseSkipsMultiLineJSXAttributesWithNestedBracesAndAngles(t *testing.T) {
	content := []byte("<Card\n  title={label === \"a > b\" ? \"A > B\" : \"C\"}\n  meta={{cta: {href: \"/docs?x=1>0\"}}}\n>\n  Replace only the prose.\n</Card>\n")

	entries, err := (MarkdownParser{MDX: true}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one translatable section inside multiline tag with nested braces, got %d", len(entries))
	}

	combined := strings.Join(mapValues(entries), "\n")
	if combined != "Replace only the prose." {
		t.Fatalf("expected only prose extracted from multiline JSX tag, got %q", combined)
	}
}

func TestMarshalMarkdownWithTargetFallbackExpandsFallbackSpanPerTargetPart(t *testing.T) {
	source := []byte("Alpha.\nInserted note.\nOmega.\n")
	target := []byte("Mot [lien ket](https://example.com/vi).\nHai voi <Badge text=\"noi tuyen\" />.\n")

	output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{}, true))
	if strings.Contains(output, "\x1eHLMDPH_") {
		t.Fatalf("expected no raw placeholder control tokens in fallback span output, got %q", output)
	}
	if !strings.Contains(output, "Mot [lien ket](https://example.com/vi).") {
		t.Fatalf("expected first target part preserved in fallback span, got %q", output)
	}
	if !strings.Contains(output, "Hai voi <Badge text=\"noi tuyen\" />.") {
		t.Fatalf("expected second target part preserved in fallback span, got %q", output)
	}
}

func TestMarshalMarkdownRecoversRecognizableMalformedPlaceholderTokens(t *testing.T) {
	template := []byte("Run `hyperlocalise status --verbose` before publishing.\n")

	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one entry, got %d", len(entries))
	}

	var key, value string
	for k, v := range entries {
		key, value = k, v
	}

	malformed := strings.Replace(value, "Run", "Execute", 1)
	malformed = strings.Replace(malformed, "HLMDPH_", "HLMDPH_BROKEN_", 1)
	output := string(MarshalMarkdown(template, map[string]string{key: malformed}, false))
	if strings.Contains(output, "\x1eHLMDPH_") {
		t.Fatalf("expected malformed but recognizable placeholder token to be normalized, got %q", output)
	}
	if !strings.Contains(output, "Execute ") {
		t.Fatalf("expected translated prose preserved, got %q", output)
	}
	if !strings.Contains(output, "`hyperlocalise status --verbose`") {
		t.Fatalf("expected inline code restored from placeholder index, got %q", output)
	}
}

func TestMarshalMarkdownFallsBackToSourceWhenPlaceholderTokensRemainUnrecoverable(t *testing.T) {
	template := []byte("Open [docs](https://example.com/source-docs) and inspect <Badge text=\"beta\" />.\n")

	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one entry, got %d", len(entries))
	}

	var key, value string
	for k, v := range entries {
		key, value = k, v
	}

	unrecoverable := strings.Replace(value, "HLMDPH_", "NOTPH_", 1)
	output := string(MarshalMarkdown(template, map[string]string{key: unrecoverable}, true))
	if strings.Contains(output, "\x1eHLMDPH_") {
		t.Fatalf("expected unrecoverable placeholder corruption to fall back to source markdown, got %q", output)
	}
	if output != string(template) {
		t.Fatalf("expected source markdown fallback when placeholder corruption is unrecoverable, got %q", output)
	}
}

func TestMarshalMarkdownWithDiagnosticsReportsUnrecoverablePlaceholderFallback(t *testing.T) {
	template := []byte("Open [docs](https://example.com/source-docs) and inspect <Badge text=\"beta\" />.\n")

	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one entry, got %d", len(entries))
	}

	var key, value string
	for k, v := range entries {
		key, value = k, v
	}

	unrecoverable := strings.Replace(value, "HLMDPH_", "NOTPH_", 1)
	_, diags := MarshalMarkdownWithDiagnostics(template, map[string]string{key: unrecoverable}, true)
	if len(diags.SourceFallbackKeys) != 1 || diags.SourceFallbackKeys[0] != key {
		t.Fatalf("expected fallback diagnostic for key %q, got %+v", key, diags)
	}
}

func TestMarshalMarkdownFallsBackToSourceWhenMalformedTokenTargetsWrongPlaceholderIndex(t *testing.T) {
	template := []byte("Open [docs](https://example.com/source-docs) and inspect <Badge text=\"beta\" />.\n")

	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one entry, got %d", len(entries))
	}

	var key, value string
	for k, v := range entries {
		key, value = k, v
	}

	swapped := strings.Replace(value, "_0\x1f", "_1\x1f", 1)
	output := string(MarshalMarkdown(template, map[string]string{key: swapped}, true))
	if output != string(template) {
		t.Fatalf("expected source markdown fallback for wrong placeholder index corruption, got %q", output)
	}
	_, diags := MarshalMarkdownWithDiagnostics(template, map[string]string{key: swapped}, true)
	if len(diags.SourceFallbackKeys) != 1 || diags.SourceFallbackKeys[0] != key {
		t.Fatalf("expected fallback diagnostic for key %q, got %+v", key, diags)
	}
}

func TestMarshalMarkdownFallsBackToSourceWhenMultiPlaceholderSegmentIsCorrupted(t *testing.T) {
	template := []byte("Review [docs](https://example.com/docs) and keep `hyperlocalise run --dry-run` unchanged.\n")

	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one entry, got %d", len(entries))
	}

	var key, value string
	for k, v := range entries {
		key, value = k, v
	}

	// Corrupt one of multiple protected placeholders in the segment. The renderer
	// intentionally fails closed here instead of guessing which literal should be restored.
	unrecoverable := strings.Replace(value, "HLMDPH_", "NOTPH_", 1)
	output, diags := MarshalMarkdownWithDiagnostics(template, map[string]string{key: unrecoverable}, false)
	if string(output) != string(template) {
		t.Fatalf("expected source markdown fallback for multi-placeholder corruption, got %q", string(output))
	}
	if len(diags.SourceFallbackKeys) != 1 || diags.SourceFallbackKeys[0] != key {
		t.Fatalf("expected fallback diagnostic for key %q, got %+v", key, diags)
	}
}

func TestMarshalMarkdownWithTargetFallbackRendersSourceWhenNoValueOrFallbackExists(t *testing.T) {
	source := []byte("Open [docs](https://example.com/source-docs) and inspect <Badge text=\"beta\" />.\n")
	target := []byte("")

	output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{}, true))
	if strings.Contains(output, "\x1eHLMDPH_") {
		t.Fatalf("expected source markdown to be rendered without raw placeholder tokens, got %q", output)
	}
	if output != string(source) {
		t.Fatalf("expected original source markdown when no value or fallback exists, got %q", output)
	}
}

func TestMarshalMarkdownWithTargetFallbackKeepsInsertedSectionsOrderedAroundMultiLineJSX(t *testing.T) {
	source := []byte("<Card\n  title=\"One\"\n>\n  Existing intro.\n</Card>\n\nNew inserted note.\n\n<Card\n  title=\"Two\"\n>\n  Existing outro.\n</Card>\n")
	target := []byte("<Card\n  title=\"One\"\n>\n  Gioi thieu hien co.\n</Card>\n\n<Card\n  title=\"Two\"\n>\n  Ket hien co.\n</Card>\n")

	sourceEntries, err := (MarkdownParser{MDX: true}).Parse(source)
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}

	newKey := findKeyByValue(sourceEntries, "New inserted note.")
	if newKey == "" {
		t.Fatalf("expected source key for inserted note")
	}

	output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{
		newKey: "Ghi chu moi duoc chen.",
	}, true))
	if !strings.Contains(output, "Gioi thieu hien co.") {
		t.Fatalf("expected first translated section preserved, got %q", output)
	}
	if !strings.Contains(output, "Ghi chu moi duoc chen.") {
		t.Fatalf("expected inserted section preserved in order, got %q", output)
	}
	if !strings.Contains(output, "Ket hien co.") {
		t.Fatalf("expected second translated section preserved, got %q", output)
	}
	first := strings.Index(output, "Gioi thieu hien co.")
	inserted := strings.Index(output, "Ghi chu moi duoc chen.")
	last := strings.Index(output, "Ket hien co.")
	if first < 0 || inserted <= first || last <= inserted {
		t.Fatalf("expected inserted section to remain ordered between existing sections, got %q", output)
	}
}

func TestMarshalMarkdownWithTargetFallbackMdxKeepsTranslationsWithReorderedSiblingWrappers(t *testing.T) {
	source := []byte("<Card title=\"One\">\n  Alpha source.\n</Card>\n\n<Card title=\"Two\">\n  Beta source.\n</Card>\n")
	target := []byte("<Card title=\"Two\">\n  Beta translated.\n</Card>\n\n<Card title=\"One\">\n  Alpha translated.\n</Card>\n")

	output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{}, true))
	alphaIdx := strings.Index(output, "Alpha translated.")
	betaIdx := strings.Index(output, "Beta translated.")
	if alphaIdx < 0 || betaIdx < 0 {
		t.Fatalf("expected both wrapper translations preserved, got %q", output)
	}
	if alphaIdx >= betaIdx {
		t.Fatalf("expected source wrapper order preserved while reusing correct translations, got %q", output)
	}
}

func TestAlignMarkdownTargetToSourceReturnsExpandedFallbackText(t *testing.T) {
	source := []byte("Open [docs](https://example.com/source-docs) and inspect <Badge text=\"beta\" />.\n")
	target := []byte("Mo [tai lieu](https://example.com/vi-docs) va kiem tra <Badge text=\"ban dich\" />.\n")

	aligned := AlignMarkdownTargetToSource(source, target, true)
	if len(aligned) != 1 {
		t.Fatalf("expected one aligned entry, got %d", len(aligned))
	}
	for _, got := range aligned {
		if strings.Contains(got, "\x1eHLMDPH_") {
			t.Fatalf("expected expanded aligned fallback text, got %q", got)
		}
		if !strings.Contains(got, "[tai lieu](https://example.com/vi-docs)") {
			t.Fatalf("expected aligned text to preserve target link destination, got %q", got)
		}
		if !strings.Contains(got, "<Badge text=\"ban dich\" />") {
			t.Fatalf("expected aligned text to preserve target inline JSX, got %q", got)
		}
	}
}

func TestAlignMarkdownTargetToSourceMdxDoesNotCrossMatchReorderedSiblingWrappers(t *testing.T) {
	source := []byte("<Card title=\"One\">\n  Alpha source.\n</Card>\n\n<Card title=\"Two\">\n  Beta source.\n</Card>\n")
	target := []byte("<Card title=\"Two\">\n  Beta translated.\n</Card>\n\n<Card title=\"One\">\n  Alpha translated.\n</Card>\n")

	aligned := AlignMarkdownTargetToSource(source, target, true)
	sourceEntries, err := (MarkdownParser{MDX: true}).Parse(source)
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}

	alphaKey := findKeyByValue(sourceEntries, "Alpha source.")
	betaKey := findKeyByValue(sourceEntries, "Beta source.")
	if alphaKey == "" || betaKey == "" {
		t.Fatalf("expected source keys for alpha and beta")
	}

	if got := strings.TrimSpace(aligned[alphaKey]); got != "Alpha translated." {
		t.Fatalf("expected reordered alpha wrapper to keep its own translation, got %q", got)
	}
	if got := strings.TrimSpace(aligned[betaKey]); got != "Beta translated." {
		t.Fatalf("expected reordered beta wrapper to keep its own translation, got %q", got)
	}
}

func TestAlignMarkdownTargetToSourceMdxDoesNotCrossMatchReorderedSameLineSiblingWrappers(t *testing.T) {
	source := []byte("<Card title=\"One\">Alpha source.\n</Card>\n\n<Card title=\"Two\">Beta source.\n</Card>\n")
	target := []byte("<Card title=\"Two\">Beta translated.\n</Card>\n\n<Card title=\"One\">Alpha translated.\n</Card>\n")

	aligned := AlignMarkdownTargetToSource(source, target, true)
	sourceEntries, err := (MarkdownParser{MDX: true}).Parse(source)
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}

	alphaKey := findKeyByValue(sourceEntries, "Alpha source.")
	betaKey := findKeyByValue(sourceEntries, "Beta source.")
	if alphaKey == "" || betaKey == "" {
		t.Fatalf("expected source keys for alpha and beta")
	}

	if got := strings.TrimSpace(aligned[alphaKey]); got != "Alpha translated." {
		t.Fatalf("expected same-line alpha wrapper to keep its own translation, got %q", got)
	}
	if got := strings.TrimSpace(aligned[betaKey]); got != "Beta translated." {
		t.Fatalf("expected same-line beta wrapper to keep its own translation, got %q", got)
	}
}

func TestMarshalMarkdownMdxPreservesBytesOutsideTranslatedSpans(t *testing.T) {
	template := []byte("import Tabs from '@theme/Tabs'\n\n<Tabs items={[\"cli\", \"api\"]}>\n  <Tab value=\"cli\">\n    Run the command.\n  </Tab>\n</Tabs>\n")

	entries, err := (MarkdownParser{MDX: true}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	key := findKeyByValue(entries, "Run the command.")
	if key == "" {
		t.Fatalf("expected key for translatable prose")
	}

	output := string(MarshalMarkdown(template, map[string]string{key: "Execute the command."}, true))
	want := "import Tabs from '@theme/Tabs'\n\n<Tabs items={[\"cli\", \"api\"]}>\n  <Tab value=\"cli\">\n    Execute the command.\n  </Tab>\n</Tabs>\n"
	if output != want {
		t.Fatalf("expected exact-byte preservation outside translated span\nwant: %q\ngot:  %q", want, output)
	}
}

func TestMarshalMarkdownWithTargetFallbackRegressionMarkdownStructureAcrossAddThenDelete(t *testing.T) {
	v1Source := []byte("# Release checklist\n\nFirst section.\n\nSecond section.\n\nThird section.\n")
	v1Target := MarshalMarkdown(v1Source, translateAllMarkdownEntries(t, v1Source), false)

	v2Source := []byte("# Release checklist\n\nFirst section.\n\nSecond section.\n\nInserted section.\n\nThird section.\n")
	v2Entries, err := (MarkdownParser{}).Parse(v2Source)
	if err != nil {
		t.Fatalf("parse v2 source: %v", err)
	}
	insertedKey := findKeyByValue(v2Entries, "Inserted section.")
	if insertedKey == "" {
		t.Fatalf("expected key for inserted section")
	}
	v2Target := MarshalMarkdownWithTargetFallback(v2Source, v1Target, map[string]string{insertedKey: "FR:Inserted section."}, false)

	v3Source := []byte("# Release checklist\n\nFirst section.\n\nInserted section.\n\nThird section.\n")
	v3Target := string(MarshalMarkdownWithTargetFallback(v3Source, v2Target, map[string]string{}, false))

	if strings.Contains(v3Target, "FR:Second section.") {
		t.Fatalf("expected deleted section to be pruned from markdown structure, got %q", v3Target)
	}
	first := strings.Index(v3Target, "FR:First section.")
	inserted := strings.Index(v3Target, "FR:Inserted section.")
	third := strings.Index(v3Target, "FR:Third section.")
	if first < 0 || inserted < 0 || third < 0 {
		t.Fatalf("expected translated sections to remain present, got %q", v3Target)
	}
	if first >= inserted || inserted >= third {
		t.Fatalf("expected section order preserved after add/delete cycle, got %q", v3Target)
	}
}

func TestMarshalMarkdownWithTargetFallbackRegressionMDXStructureAcrossAddThenDelete(t *testing.T) {
	v1Source := []byte("# Guide\n\nIntro paragraph.\n\n<Callout type=\"info\">\n  Existing callout text.\n</Callout>\n\nOutro paragraph.\n")
	v1Target := MarshalMarkdown(v1Source, translateAllMarkdownEntries(t, v1Source, true), true)

	v2Source := []byte("# Guide\n\nIntro paragraph.\n\n<Callout type=\"info\">\n  Existing callout text.\n</Callout>\n\n<Card title=\"New\">\n  Inserted card text.\n</Card>\n\nOutro paragraph.\n")
	v2Entries, err := (MarkdownParser{MDX: true}).Parse(v2Source)
	if err != nil {
		t.Fatalf("parse v2 source: %v", err)
	}
	insertedKey := findKeyByValue(v2Entries, "Inserted card text.")
	if insertedKey == "" {
		t.Fatalf("expected key for inserted mdx section")
	}
	v2Target := MarshalMarkdownWithTargetFallback(v2Source, v1Target, map[string]string{insertedKey: "FR:Inserted card text."}, true)

	v3Source := []byte("# Guide\n\nIntro paragraph.\n\n<Card title=\"New\">\n  Inserted card text.\n</Card>\n\nOutro paragraph.\n")
	v3Target := string(MarshalMarkdownWithTargetFallback(v3Source, v2Target, map[string]string{}, true))

	if strings.Contains(v3Target, "FR:Existing callout text.") {
		t.Fatalf("expected deleted mdx section to be pruned from output, got %q", v3Target)
	}
	intro := strings.Index(v3Target, "FR:Intro paragraph.")
	inserted := strings.Index(v3Target, "FR:Inserted card text.")
	outro := strings.Index(v3Target, "FR:Outro paragraph.")
	if intro < 0 || inserted < 0 || outro < 0 {
		t.Fatalf("expected translated mdx sections to remain present, got %q", v3Target)
	}
	if intro >= inserted || inserted >= outro {
		t.Fatalf("expected mdx section order preserved after add/delete cycle, got %q", v3Target)
	}
}

func translateAllMarkdownEntries(t *testing.T, source []byte, mdx ...bool) map[string]string {
	t.Helper()

	isMdx := len(mdx) > 0 && mdx[0]
	entries, err := (MarkdownParser{MDX: isMdx}).Parse(source)
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}
	translated := make(map[string]string, len(entries))
	for key, value := range entries {
		translated[key] = "FR:" + strings.TrimSpace(value)
	}
	return translated
}

func readFixture(t *testing.T, rel string) []byte {
	t.Helper()

	path := filepath.Join("..", "..", "..", rel)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture %s: %v", rel, err)
	}
	return data
}

func mapValues(values map[string]string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		out = append(out, value)
	}
	return out
}

func TestMarshalMarkdownWithTargetFallbackPreservesOrderWhenCountsDiffer(t *testing.T) {
	source := []byte("# Guide\n\nFirst section.\n\nInserted section.\n\nSecond section.\n")
	target := []byte("# Guide\n\nPremiere section.\n\nDeuxieme section.\n")

	output := string(MarshalMarkdownWithTargetFallback(source, target, map[string]string{}, false))
	first := strings.Index(output, "Premiere section.")
	second := strings.Index(output, "Deuxieme section.")
	if first < 0 || second < 0 {
		t.Fatalf("expected both translated sections preserved, got %q", output)
	}
	if first >= second {
		t.Fatalf("expected section order preserved even with count mismatch, got %q", output)
	}
}

func TestAlignMarkdownFallbackPreservesOrderWhenCountsDiffer(t *testing.T) {
	source := []byte("# Title\n\nAlpha paragraph.\n\nBeta paragraph.\n")
	target := []byte("# Titre\n\nAlpha traduit.\n\nBeta traduit.\n")

	aligned := AlignMarkdownTargetToSource(source, target, false)
	sourceEntries, err := (MarkdownParser{}).Parse(source)
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}

	alphaKey := findKeyByValue(sourceEntries, "Alpha paragraph.")
	betaKey := findKeyByValue(sourceEntries, "Beta paragraph.")
	if alphaKey == "" || betaKey == "" {
		t.Fatalf("expected source keys for alpha/beta")
	}

	if got := strings.TrimSpace(aligned[alphaKey]); got != "Alpha traduit." {
		t.Fatalf("expected alpha aligned, got %q", got)
	}
	if got := strings.TrimSpace(aligned[betaKey]); got != "Beta traduit." {
		t.Fatalf("expected beta aligned, got %q", got)
	}
}

func findKeyByValue(values map[string]string, needle string) string {
	for key, value := range values {
		if strings.TrimSpace(value) == needle {
			return key
		}
	}
	return ""
}

func TestMarkdownParserParsePlainFrontmatterValues(t *testing.T) {
	content := []byte("---\ntitle: Hello world\ndescription: A simple guide\ncount: 42\n---\n\nBody text.\n")
	got, err := (MarkdownParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	combined := strings.Join(mapValues(got), "\n")
	if !strings.Contains(combined, "Hello world") {
		t.Fatalf("expected plain title extracted, got %q", combined)
	}
	if !strings.Contains(combined, "A simple guide") {
		t.Fatalf("expected plain description extracted, got %q", combined)
	}
}

func TestMarshalMarkdownPreservesPlainFrontmatterRoundTrip(t *testing.T) {
	template := []byte("---\ntitle: Hello world\n---\n\nBody.\n")
	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	updates := map[string]string{}
	for k, v := range entries {
		if v == "Hello world" {
			updates[k] = "Bonjour le monde"
		} else {
			updates[k] = v
		}
	}
	output := string(MarshalMarkdown(template, updates, false))
	if !strings.Contains(output, "title: Bonjour le monde") {
		t.Fatalf("expected translated plain frontmatter, got %q", output)
	}
}

func TestMarkdownParserHandlesBOM(t *testing.T) {
	bom := []byte{0xEF, 0xBB, 0xBF}
	content := append(bom, []byte("---\ntitle: \"Hello\"\n---\n\nBody text.\n")...)
	got, err := (MarkdownParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	combined := strings.Join(mapValues(got), "\n")
	if !strings.Contains(combined, "Hello") {
		t.Fatalf("expected frontmatter value extracted after BOM, got %q", combined)
	}
	if !strings.Contains(combined, "Body text.") {
		t.Fatalf("expected body extracted after BOM, got %q", combined)
	}
}

func TestMarkdownParserHandlesCRLF(t *testing.T) {
	content := []byte("---\r\ntitle: \"Hello\"\r\n---\r\n\r\nBody text.\r\n")
	got, err := (MarkdownParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	combined := strings.Join(mapValues(got), "\n")
	if !strings.Contains(combined, "Hello") {
		t.Fatalf("expected frontmatter value extracted with CRLF, got %q", combined)
	}
	if !strings.Contains(combined, "Body text.") {
		t.Fatalf("expected body extracted with CRLF, got %q", combined)
	}
}

func TestMarkdownParserHandlesMDXCRLF(t *testing.T) {
	content := []byte("import Tabs from '@theme/Tabs'\r\n\r\n<>\r\n  Body text with {locale.toUpperCase()}.\r\n</>\r\n")

	got, err := (MarkdownParser{MDX: true}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	combined := strings.Join(mapValues(got), "\n")
	if !strings.Contains(combined, "Body text with") {
		t.Fatalf("expected mdx body extracted with CRLF, got %q", combined)
	}
	if strings.Contains(combined, "import Tabs") {
		t.Fatalf("expected import preserved as non-translatable with CRLF, got %q", combined)
	}
	if !strings.Contains(combined, "HLMDPH_") {
		t.Fatalf("expected protected expression placeholder with CRLF, got %q", combined)
	}
}

func TestMarkdownParserParseMdxSkipsMultiLineJSXAttributesInsideBlockquotes(t *testing.T) {
	content := []byte("> <Step\n>   title=\"Prepare\"\n>   icon={<Badge text=\"go\" />}\n> >\n>   Review the docs portal.\n> </Step>\n")

	entries, err := (MarkdownParser{MDX: true}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one translatable section inside blockquoted multiline tag, got %d", len(entries))
	}

	combined := strings.Join(mapValues(entries), "\n")
	if combined != "Review the docs portal." {
		t.Fatalf("expected only blockquoted inner prose extracted, got %q", combined)
	}
}

func TestMarshalMarkdownPreservesReferenceLinkIDs(t *testing.T) {
	template := []byte("See [CLI guide][cli-guide] for details.\n\n[cli-guide]: https://example.com/cli\n")
	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	updates := map[string]string{}
	for k, v := range entries {
		updates[k] = strings.ToUpper(v)
	}
	output := string(MarshalMarkdown(template, updates, false))
	if !strings.Contains(output, "[cli-guide]") {
		t.Fatalf("expected reference link ID preserved, got %q", output)
	}
}

func TestFindQuotedStringEndHandlesYAMLSingleQuoteEscaping(t *testing.T) {
	// YAML: 'It''s okay' means the literal value It's okay
	s := "'It''s okay'"
	end := findQuotedStringEnd(s, '\'')
	if end != len(s)-1 {
		t.Fatalf("expected end at %d, got %d", len(s)-1, end)
	}
}
