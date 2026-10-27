package translationfileparser

import (
	"errors"
	"sort"
	"strings"
	"testing"
)

type targetFromSourceCase struct {
	name   string
	path   string
	source string
	// translate maps a source string to its translation.
	translate map[string]string
	// gone lists source strings the target must no longer hold. Formats that keep the
	// source text beside the translation leave it empty.
	gone []string
	// keeps lists structure the target must still hold.
	keeps []string
}

var targetFromSourceCases = []targetFromSourceCase{
	{
		name:      "yaml",
		path:      "locales/en.yml",
		source:    "home:\n  title: Hello\n  cta: Buy now\n",
		translate: map[string]string{"Hello": "Hallo", "Buy now": "Jetzt kaufen"},
		gone:      []string{"Hello", "Buy now"},
		keeps:     []string{"home:", "title:", "cta:"},
	},
	{
		name: "xliff",
		path: "messages.xlf",
		source: `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" datatype="plaintext" original="messages">
    <body>
      <trans-unit id="greeting">
        <source>Hello</source>
      </trans-unit>
    </body>
  </file>
</xliff>
`,
		translate: map[string]string{"Hello": "Hallo"},
		keeps:     []string{"<source>Hello</source>", `id="greeting"`},
	},
	{
		name:      "po",
		path:      "messages.po",
		source:    "msgid \"\"\nmsgstr \"\"\n\"Content-Type: text/plain; charset=UTF-8\\n\"\n\nmsgid \"Hello\"\nmsgstr \"\"\n",
		translate: map[string]string{"Hello": "Hallo"},
		keeps:     []string{`msgid "Hello"`},
	},
	{
		name:      "html",
		path:      "welcome.html",
		source:    "<!doctype html>\n<html>\n  <body>\n    <h1 class=\"hero\">Hello, world!</h1>\n    <p>Thanks for <strong>signing up</strong>.</p>\n  </body>\n</html>\n",
		translate: map[string]string{"Hello, world!": "Hallo, Welt!"},
		gone:      []string{"Hello, world!"},
		keeps:     []string{`<h1 class="hero">`, "<strong>signing up</strong>"},
	},
	{
		name:      "liquid",
		path:      "sections/hero.liquid",
		source:    "<h1>Hello there</h1>\n{% if customer %}<p>Welcome back</p>{% endif %}\n",
		translate: map[string]string{"Hello there": "Hallo zusammen", "Welcome back": "Willkommen zurück"},
		gone:      []string{"Hello there", "Welcome back"},
		keeps:     []string{"{% if customer %}", "{% endif %}"},
	},
	{
		name:      "apple strings",
		path:      "Localizable.strings",
		source:    "/* Greeting */\n\"greeting\" = \"Hello\";\n",
		translate: map[string]string{"Hello": "Hallo"},
		gone:      []string{"Hello"},
		keeps:     []string{"/* Greeting */", `"greeting" =`},
	},
	{
		name: "apple stringsdict",
		path: "Localizable.stringsdict",
		source: `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>files_count</key>
  <dict>
    <key>NSStringLocalizedFormatKey</key>
    <string>%#@files@</string>
    <key>files</key>
    <dict>
      <key>one</key>
      <string>%d file</string>
      <key>other</key>
      <string>%d files</string>
    </dict>
  </dict>
</dict>
</plist>
`,
		translate: map[string]string{"%d file": "%d Datei", "%d files": "%d Dateien"},
		gone:      []string{"%d file<", "%d files<"},
		keeps:     []string{"%#@files@", "<key>one</key>"},
	},
	{
		name:      "xcstrings",
		path:      "Localizable.xcstrings",
		source:    "{\n  \"sourceLanguage\" : \"en\",\n  \"strings\" : {\n    \"greeting\" : {\n      \"localizations\" : {\n        \"en\" : {\n          \"stringUnit\" : {\n            \"state\" : \"translated\",\n            \"value\" : \"Hello\"\n          }\n        }\n      }\n    }\n  },\n  \"version\" : \"1.0\"\n}\n",
		translate: map[string]string{"Hello": "Hallo"},
		keeps:     []string{`"Hello"`, `"de"`},
	},
	{
		name:      "csv key and value",
		path:      "messages.csv",
		source:    "key,value\ngreeting,\"Hello, world!\"\nfarewell,Goodbye\n",
		translate: map[string]string{"Hello, world!": "Hallo, Welt!", "Goodbye": "Auf Wiedersehen"},
		gone:      []string{"Hello, world!", "Goodbye"},
		keeps:     []string{"key,value", "greeting,", "farewell,"},
	},
	{
		name:      "csv locale columns",
		path:      "catalog.csv",
		source:    "key,en,de\ngreeting,Hello,\nfarewell,Goodbye,\n",
		translate: map[string]string{"Hello": "Hallo", "Goodbye": "Auf Wiedersehen"},
		keeps:     []string{"key,en,de", "greeting,Hello,Hallo", "farewell,Goodbye,Auf Wiedersehen"},
	},
	{
		name:      "tsv",
		path:      "messages.tsv",
		source:    "key\tvalue\ngreeting\tHello\n",
		translate: map[string]string{"Hello": "Hallo"},
		gone:      []string{"Hello"},
		keeps:     []string{"key\tvalue", "greeting\tHallo"},
	},
	{
		name:      "toml",
		path:      "messages.toml",
		source:    "# Home page\n[home]\ntitle = \"Hello\"\n",
		translate: map[string]string{"Hello": "Hallo"},
		gone:      []string{"Hello"},
		keeps:     []string{"# Home page", "[home]", "title ="},
	},
	{
		name:      "ini",
		path:      "messages.ini",
		source:    "; Home page\n[home]\ntitle=Hello\n",
		translate: map[string]string{"Hello": "Hallo"},
		gone:      []string{"Hello"},
		keeps:     []string{"; Home page", "[home]"},
	},
	{
		name:      "java properties",
		path:      "messages.properties",
		source:    "# Home page\nhome.title=Hello\n",
		translate: map[string]string{"Hello": "Hallo"},
		gone:      []string{"Hello"},
		keeps:     []string{"# Home page", "home.title="},
	},
	{
		name:      "php array",
		path:      "lang/en/messages.php",
		source:    "<?php\n\nreturn [\n    'greeting' => 'Hello',\n];\n",
		translate: map[string]string{"Hello": "Hallo"},
		gone:      []string{"Hello"},
		keeps:     []string{"<?php", "'greeting' =>"},
	},
	{
		name:      "fluent",
		path:      "messages.ftl",
		source:    "# Home page\ngreeting = Hello\n",
		translate: map[string]string{"Hello": "Hallo"},
		gone:      []string{"Hello"},
		keeps:     []string{"# Home page", "greeting ="},
	},
	{
		name:      "android xml",
		path:      "app/src/main/res/values/strings.xml",
		source:    "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<resources>\n    <string name=\"greeting\">Hello</string>\n</resources>\n",
		translate: map[string]string{"Hello": "Hallo"},
		gone:      []string{"Hello"},
		keeps:     []string{"<resources>", `<string name="greeting">`},
	},
	{
		name:      "generic xml",
		path:      "locale.xml",
		source:    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<locale code=\"en-US\">\n  <message key=\"checkout.cta\">Checkout now</message>\n</locale>\n",
		translate: map[string]string{"Checkout now": "Jetzt bezahlen"},
		gone:      []string{"Checkout now"},
		keeps:     []string{`<message key="checkout.cta">`},
	},
	{
		name:      "resx",
		path:      "Resources.resx",
		source:    "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<root>\n  <data name=\"home.title\" xml:space=\"preserve\">\n    <value>Welcome home</value>\n    <comment>Main heading</comment>\n  </data>\n</root>\n",
		translate: map[string]string{"Welcome home": "Willkommen zu Hause"},
		gone:      []string{"Welcome home"},
		keeps:     []string{`<data name="home.title"`, "<comment>Main heading</comment>"},
	},
	{
		name:      "resw",
		path:      "Resources.resw",
		source:    "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<root>\n  <data name=\"home.title\" xml:space=\"preserve\">\n    <value>Welcome home</value>\n  </data>\n</root>\n",
		translate: map[string]string{"Welcome home": "Willkommen zu Hause"},
		gone:      []string{"Welcome home"},
		keeps:     []string{`<data name="home.title"`},
	},
	{
		name:      "srt",
		path:      "captions.srt",
		source:    "1\n00:00:01,000 --> 00:00:02,000\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nGoodbye\n",
		translate: map[string]string{"Hello": "Hallo", "Goodbye": "Auf Wiedersehen"},
		gone:      []string{"Hello", "Goodbye"},
		keeps:     []string{"00:00:01,000 --> 00:00:02,000", "00:00:03,000 --> 00:00:04,000"},
	},
	{
		name:      "vtt",
		path:      "captions.vtt",
		source:    "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n",
		translate: map[string]string{"Hello": "Hallo"},
		gone:      []string{"Hello"},
		keeps:     []string{"WEBVTT", "00:00:01.000 --> 00:00:02.000"},
	},
	{
		name:      "sbv",
		path:      "captions.sbv",
		source:    "0:00:01.000,0:00:02.000\nHello\n",
		translate: map[string]string{"Hello": "Hallo"},
		gone:      []string{"Hello"},
		keeps:     []string{"0:00:01.000,0:00:02.000"},
	},
	{
		name:      "svg",
		path:      "banner.svg",
		source:    "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 20\">\n  <text x=\"0\" y=\"15\">Hello</text>\n</svg>\n",
		translate: map[string]string{"Hello": "Hallo"},
		gone:      []string{"Hello"},
		keeps:     []string{`viewBox="0 0 100 20"`, `<text x="0" y="15">`},
	},
	{
		name:      "qt linguist",
		path:      "app_en.ts",
		source:    "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!DOCTYPE TS>\n<TS version=\"2.1\" language=\"en\">\n<context>\n    <name>Main</name>\n    <message>\n        <source>Hello</source>\n        <translation type=\"unfinished\"></translation>\n    </message>\n</context>\n</TS>\n",
		translate: map[string]string{"Hello": "Hallo"},
		keeps:     []string{"<source>Hello</source>", "<translation>Hallo</translation>", "<name>Main</name>"},
	},
	{
		name:      "typescript locale module",
		path:      "locales/en.ts",
		source:    "export default {\n  greeting: \"Hello\",\n};\n",
		translate: map[string]string{"Hello": "Hallo"},
		gone:      []string{"Hello"},
		keeps:     []string{"export default {", "greeting:"},
	},
	{
		name:      "javascript locale module",
		path:      "locales/en.js",
		source:    "module.exports = {\n  greeting: \"Hello\",\n};\n",
		translate: map[string]string{"Hello": "Hallo"},
		gone:      []string{"Hello"},
		keeps:     []string{"module.exports = {", "greeting:"},
	},
}

func TestMarshalTargetFromSourceKeepsTheSourceFormat(t *testing.T) {
	for _, tc := range targetFromSourceCases {
		t.Run(tc.name, func(t *testing.T) {
			values := translatedValuesForSource(t, tc.path, tc.source, tc.translate)

			out, err := MarshalTargetFromSource(tc.path, []byte(tc.source), values, "en", "de")
			if err != nil {
				t.Fatalf("marshal target: %v", err)
			}

			rendered := string(out)
			for _, translation := range tc.translate {
				if !strings.Contains(rendered, translation) {
					t.Errorf("target is missing translation %q:\n%s", translation, rendered)
				}
			}
			for _, source := range tc.gone {
				if strings.Contains(rendered, source) {
					t.Errorf("target still holds source text %q:\n%s", source, rendered)
				}
			}
			for _, structure := range tc.keeps {
				if !strings.Contains(rendered, structure) {
					t.Errorf("target lost %q:\n%s", structure, rendered)
				}
			}
		})
	}
}

func TestMarshalTargetFromSourceLeavesUntranslatedKeysAsTheSourceHasThem(t *testing.T) {
	for _, tc := range targetFromSourceCases {
		t.Run(tc.name, func(t *testing.T) {
			withTranslations, err := MarshalTargetFromSource(tc.path, []byte(tc.source), translatedValuesForSource(t, tc.path, tc.source, tc.translate), "en", "de")
			if err != nil {
				t.Fatalf("marshal target: %v", err)
			}
			withoutTranslations, err := MarshalTargetFromSource(tc.path, []byte(tc.source), map[string]string{}, "en", "de")
			if err != nil {
				t.Fatalf("marshal target without values: %v", err)
			}

			rendered := string(withoutTranslations)
			for source, translation := range tc.translate {
				if strings.Contains(rendered, translation) {
					t.Errorf("target holds %q without a value for it:\n%s", translation, rendered)
				}
				if !strings.Contains(rendered, source) {
					t.Errorf("target lost untranslated source text %q:\n%s", source, rendered)
				}
			}
			if string(withTranslations) == rendered {
				t.Errorf("translations made no difference to the target:\n%s", rendered)
			}
		})
	}
}

// Every file type the default strategy parses is either written by MarshalTargetFromSource
// or listed here with the writer that covers it instead.
func TestMarshalTargetFromSourceCoversEveryParsedFileType(t *testing.T) {
	writtenElsewhere := map[string]string{
		".json":     "MarshalJSON",
		".jsonc":    "MarshalJSON after comment removal",
		".arb":      "MarshalARB, which also takes a target template",
		".lottie":   "MarshalDotLottie",
		".md":       "MarshalMarkdown",
		".mdx":      "MarshalMarkdown",
		".markdown": "MarshalMarkdown",
		".mdown":    "MarshalMarkdown",
		".mkdn":     "MarshalMarkdown",
		".mdwn":     "MarshalMarkdown",
		".mkd":      "MarshalMarkdown",
		".adoc":     "MarshalAsciiDoc",
		".asciidoc": "MarshalAsciiDoc",
		".asc":      "MarshalAsciiDoc",
		".docx":     "MarshalDOCX",
		".pptx":     "MarshalPPTX",
		".xlsx":     "MarshalXLSX",
		".pdf":      "MarshalPDF, which also reports text that overflows its box",
		".txt":      "MarshalPlainText",
	}

	covered := map[string]struct{}{}
	for _, tc := range targetFromSourceCases {
		covered[strings.ToLower(tc.path[strings.LastIndex(tc.path, "."):])] = struct{}{}
	}

	extensions := make([]string, 0, len(NewDefaultStrategy().parsersByExt))
	for ext := range NewDefaultStrategy().parsersByExt {
		extensions = append(extensions, ext)
	}
	sort.Strings(extensions)

	for _, ext := range extensions {
		_, err := MarshalTargetFromSource("file"+ext, nil, nil, "en", "de")
		unsupported := errors.Is(err, ErrTargetFormatUnsupported)
		if _, elsewhere := writtenElsewhere[ext]; elsewhere {
			if !unsupported {
				t.Errorf("%s is listed as written elsewhere but MarshalTargetFromSource accepts it", ext)
			}
			continue
		}
		if unsupported {
			t.Errorf("%s is parsed but MarshalTargetFromSource cannot write it", ext)
		}
		if _, ok := covered[ext]; !ok && !sharesWriterWithCoveredExtension(ext) {
			t.Errorf("%s has no case in targetFromSourceCases", ext)
		}
	}
}

// Extensions that reach the same writer as an extension with its own case.
func sharesWriterWithCoveredExtension(ext string) bool {
	switch ext {
	case ".yaml", ".pot", ".xlif", ".xliff", ".htm", ".jsx", ".mjs", ".cjs", ".tsx", ".mts", ".cts":
		return true
	default:
		return false
	}
}

func TestMarshalTargetFromSourceRejectsUnknownFileTypes(t *testing.T) {
	_, err := MarshalTargetFromSource("notes.bin", []byte("Hello"), map[string]string{"a": "b"}, "en", "de")
	if !errors.Is(err, ErrTargetFormatUnsupported) {
		t.Fatalf("want ErrTargetFormatUnsupported, got %v", err)
	}
}

// translatedValuesForSource keys translations the way ingest stores them: read by the
// ingest parser, with keys trimmed.
func TestMarshalTargetFromSourceWritesThePOHeaderForTheTargetLocale(t *testing.T) {
	source := "msgid \"\"\nmsgstr \"\"\n\"Language: en\\n\"\n\"Plural-Forms: nplurals=2; plural=(n != 1);\\n\"\n\nmsgid \"one file\"\nmsgid_plural \"%d files\"\nmsgstr[0] \"\"\nmsgstr[1] \"\"\n"
	values := map[string]string{"one file||one": "jeden plik", "one file||other": "%d plików"}

	out, err := MarshalTargetFromSource("messages.pot", []byte(source), values, "en", "pl-PL")
	if err != nil {
		t.Fatalf("marshal target: %v", err)
	}

	rendered := string(out)
	for _, want := range []string{"Language: pl_PL", "nplurals=4", "msgstr[3]", "jeden plik"} {
		if !strings.Contains(rendered, want) {
			t.Errorf("target is missing %q:\n%s", want, rendered)
		}
	}
}

func TestMarshalTargetFromSourceAddsAColumnForANewLocale(t *testing.T) {
	source := "key,en-US,de-DE\ngreeting,Hello,Hallo\nfarewell,Goodbye,Tschüss\n"

	out, err := MarshalTargetFromSource("catalog.csv", []byte(source), map[string]string{"greeting": "Bonjour"}, "en-US", "fr-FR")
	if err != nil {
		t.Fatalf("marshal target: %v", err)
	}

	want := "key,en-US,de-DE,fr-FR\ngreeting,Hello,Hallo,Bonjour\nfarewell,Goodbye,Tschüss,\n"
	if string(out) != want {
		t.Fatalf("got:\n%s\nwant:\n%s", out, want)
	}
}

func TestMarshalTargetFromSourceFindsKeysTrimmedAtIngest(t *testing.T) {
	source := "msgid \"Usage: foo\\n\"\nmsgstr \"\"\n"

	out, err := MarshalTargetFromSource("messages.po", []byte(source), map[string]string{"Usage: foo": "Utilisation : foo\n"}, "en", "fr")
	if err != nil {
		t.Fatalf("marshal target: %v", err)
	}

	if !strings.Contains(string(out), `msgstr "Utilisation : foo\n"`) {
		t.Fatalf("translation of a trimmed key was not written:\n%s", out)
	}
}

func TestMarshalTargetFromSourceKeepsTrimmedKeysToTheirOwnString(t *testing.T) {
	source := "export default {\n  'a': 'A',\n  'a ': 'A2',\n  ' b ': 'B',\n};\n"

	out, err := MarshalTargetFromSource("locales/en.js", []byte(source), map[string]string{"a": "TA", "b ": "TB"}, "en", "de")
	if err != nil {
		t.Fatalf("marshal target: %v", err)
	}

	rendered := string(out)
	for _, want := range []string{"'a': 'TA'", "'a ': 'A2'", "' b ': 'TB'"} {
		if !strings.Contains(rendered, want) {
			t.Errorf("target is missing %q:\n%s", want, rendered)
		}
	}
}

func TestMarshalTargetFromSourceMatchesLocaleColumns(t *testing.T) {
	tests := []struct {
		name, source, sourceLocale, targetLocale, want string
	}{
		{
			name:         "target spelled with an underscore",
			source:       "key,en_US,fr_FR\ngreeting,Hello,\n",
			sourceLocale: "en-US", targetLocale: "fr-FR",
			want: "key,en_US,fr_FR\ngreeting,Hello,Bonjour\n",
		},
		{
			name:         "source column named by its language",
			source:       "key,en,de\ngreeting,Hello,Hallo\n",
			sourceLocale: "en-US", targetLocale: "fr-FR",
			want: "key,en,de,fr-FR\ngreeting,Hello,Hallo,Bonjour\n",
		},
		{
			name:         "regional target beside its base language",
			source:       "key,en,fr\ngreeting,Hello,Bonjour\n",
			sourceLocale: "en", targetLocale: "fr-CA",
			want: "key,en,fr,fr-CA\ngreeting,Hello,Bonjour,Bonjour\n",
		},
		{
			name:         "locale columns that name neither locale",
			source:       "key,english,german\ngreeting,Hello,Hallo\n",
			sourceLocale: "en-US", targetLocale: "fr-FR",
			want: "key,english,german,fr-FR\ngreeting,Hello,Hallo,Bonjour\n",
		},
		{
			name:         "row longer than the header",
			source:       "key,en\ngreeting,Hello,note\n",
			sourceLocale: "en", targetLocale: "fr-FR",
			want: "key,en,fr-FR\ngreeting,Hello,Bonjour,note\n",
		},
		{
			name:         "value column with a comment column",
			source:       "key,value,comment\ngreeting,Hello,On the home page\n",
			sourceLocale: "en", targetLocale: "fr-FR",
			want: "key,value,comment\ngreeting,Bonjour,On the home page\n",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			out, err := MarshalTargetFromSource("catalog.csv", []byte(tc.source), map[string]string{"greeting": "Bonjour"}, tc.sourceLocale, tc.targetLocale)
			if err != nil {
				t.Fatalf("marshal target: %v", err)
			}
			if string(out) != tc.want {
				t.Fatalf("got:\n%s\nwant:\n%s", out, tc.want)
			}
		})
	}
}

func TestMarshalTargetFromSourceIgnoresKeysTheSourceDoesNotHave(t *testing.T) {
	out, err := MarshalTargetFromSource("messages.toml", []byte("title = \"Hello\"\n"), map[string]string{"title": "Hallo", "removed.key": "Stale"}, "en", "de")
	if err != nil {
		t.Fatalf("marshal target: %v", err)
	}

	if strings.Contains(string(out), "Stale") || !strings.Contains(string(out), "Hallo") {
		t.Fatalf("got:\n%s", out)
	}
}

func TestMarshalTargetFromSourceReplacesStringsdictTextWithEntities(t *testing.T) {
	source := `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>files</key><dict><key>NSStringLocalizedFormatKey</key><string>%#@n@</string><key>n</key><dict><key>NSStringFormatSpecTypeKey</key><string>NSStringPluralRuleType</string><key>NSStringFormatValueTypeKey</key><string>d</string><key>one</key><string>Tom &amp; Jerry</string><key>other</key><string>Tom &amp; Jerry &#x2026;</string></dict></dict></dict></plist>`

	out, err := MarshalTargetFromSource("Localizable.stringsdict", []byte(source), map[string]string{"files.n.one": "Tom und Jerry", "files.n.other": "Tom und Jerry …"}, "en", "de")
	if err != nil {
		t.Fatalf("marshal target: %v", err)
	}

	rendered := string(out)
	if strings.Contains(rendered, "&amp;") || !strings.Contains(rendered, "<string>Tom und Jerry</string>") || !strings.Contains(rendered, "<string>Tom und Jerry …</string>") {
		t.Fatalf("got:\n%s", rendered)
	}
}

func translatedValuesForSource(t *testing.T, path, source string, translate map[string]string) map[string]string {
	t.Helper()
	ingested, err := NewDefaultStrategy().ParseIngestEntriesWithSourceLocale(path, []byte(source), "en", "en")
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}
	entries := make(map[string]string, len(ingested))
	for key, entry := range ingested {
		entries[strings.TrimSpace(key)] = entry.Text
	}
	values := map[string]string{}
	for key, text := range entries {
		if translation, ok := translate[text]; ok {
			values[key] = translation
			continue
		}
		// A gettext entry is keyed by its source string and starts with no text.
		if translation, ok := translate[key]; ok {
			values[key] = translation
		}
	}
	if len(values) != len(translate) {
		t.Fatalf("source strings %v did not all match a parsed entry: %#v", translate, entries)
	}
	return values
}
