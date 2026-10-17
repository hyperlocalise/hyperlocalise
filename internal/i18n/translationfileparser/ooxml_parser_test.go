package translationfileparser

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"flag"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"testing"
	"time"
)

var updateOOXMLGolden = flag.Bool("update-ooxml", false, "rewrite testdata/ooxml/*.expected.json")

// ooxmlGolden is shared with the TypeScript reader and writer in
// apps/hyperlocalise-web/src/lib/translation/ooxml, which must produce the
// same entries and the same translated parts for each fixture.
type ooxmlGolden struct {
	Entries           []OOXMLEntry      `json:"entries"`
	TranslatedEntries []OOXMLEntry      `json:"translatedEntries"`
	TranslatedParts   map[string]string `json:"translatedParts"`
}

func zipOOXMLFixture(t *testing.T, dir string) []byte {
	t.Helper()
	var names []string
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		rel, err := filepath.Rel(dir, path)
		names = append(names, filepath.ToSlash(rel))
		return err
	})
	if err != nil {
		t.Fatalf("walk fixture: %v", err)
	}
	slices.Sort(names)
	var out bytes.Buffer
	writer := zip.NewWriter(&out)
	for _, name := range names {
		content, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(name)))
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		entry, err := writer.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Deflate, Modified: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)})
		if err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
		if _, err := entry.Write(content); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close zip: %v", err)
	}
	return out.Bytes()
}

var ooxmlTemplatePattern = regexp.MustCompile(`\{([oca])(\d+)\}`)

// expandOOXMLTemplate swaps {o0}, {c0}, and {a0} for the source placeholder
// with that kind and index.
func expandOOXMLTemplate(t *testing.T, source, template string) string {
	t.Helper()
	tokens := map[string]string{}
	for _, match := range ooxmlTokenPattern.FindAllStringSubmatch(source, -1) {
		kind, index, ok := decodeOOXMLToken(match[1])
		if !ok {
			t.Fatalf("bad token in %q", source)
		}
		tokens[string(kind)+strconv.Itoa(index)] = match[0]
	}
	return ooxmlTemplatePattern.ReplaceAllStringFunc(template, func(raw string) string {
		inner := raw[1 : len(raw)-1]
		token, ok := tokens[inner]
		if !ok {
			t.Fatalf("template %q names %s, which the source %q does not have", template, raw, source)
		}
		return token
	})
}

func readZipParts(t *testing.T, content []byte) map[string][]byte {
	t.Helper()
	reader, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		t.Fatalf("open zip: %v", err)
	}
	parts := map[string][]byte{}
	for _, file := range reader.File {
		rc, err := file.Open()
		if err != nil {
			t.Fatalf("open %s: %v", file.Name, err)
		}
		var b bytes.Buffer
		if _, err := b.ReadFrom(rc); err != nil {
			t.Fatalf("read %s: %v", file.Name, err)
		}
		_ = rc.Close()
		parts[file.Name] = b.Bytes()
	}
	return parts
}

func runOOXMLGolden(t *testing.T, fixture string, read func([]byte) ([]OOXMLEntry, error), marshal func([]byte, map[string]string) ([]byte, error)) {
	t.Helper()
	base := filepath.Join("testdata", "ooxml")
	source := zipOOXMLFixture(t, filepath.Join(base, fixture))

	entries, err := read(source)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	sourceText := map[string]string{}
	for _, entry := range entries {
		sourceText[entry.Key] = entry.Text
	}

	rawTranslations, err := os.ReadFile(filepath.Join(base, fixture+".translations.json"))
	if err != nil {
		t.Fatalf("read translations: %v", err)
	}
	var templates map[string]string
	if err := json.Unmarshal(rawTranslations, &templates); err != nil {
		t.Fatalf("decode translations: %v", err)
	}
	values := map[string]string{}
	for key, template := range templates {
		src, ok := sourceText[key]
		if !ok {
			t.Fatalf("translation key %q is not an entry", key)
		}
		values[key] = expandOOXMLTemplate(t, src, template)
	}

	translated, err := marshal(source, values)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	again, err := marshal(source, values)
	if err != nil || !bytes.Equal(translated, again) {
		t.Fatalf("marshal is not byte-stable (err %v)", err)
	}
	unchanged, err := marshal(source, map[string]string{})
	if err != nil || !bytes.Equal(unchanged, source) {
		t.Fatalf("marshal without values changed the package (err %v)", err)
	}

	translatedEntries, err := read(translated)
	if err != nil {
		t.Fatalf("read translated: %v", err)
	}
	sourceParts := readZipParts(t, source)
	translatedParts := map[string]string{}
	for name, content := range readZipParts(t, translated) {
		if !bytes.Equal(content, sourceParts[name]) {
			translatedParts[name] = string(content)
		}
	}

	got := ooxmlGolden{Entries: entries, TranslatedEntries: translatedEntries, TranslatedParts: translatedParts}
	goldenPath := filepath.Join(base, fixture+".expected.json")
	if *updateOOXMLGolden {
		encoded, err := json.MarshalIndent(got, "", "  ")
		if err != nil {
			t.Fatalf("encode golden: %v", err)
		}
		if err := os.WriteFile(goldenPath, append(encoded, '\n'), 0o644); err != nil {
			t.Fatalf("write golden: %v", err)
		}
		return
	}
	rawGolden, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("read golden (run with -update-ooxml): %v", err)
	}
	var want ooxmlGolden
	if err := json.Unmarshal(rawGolden, &want); err != nil {
		t.Fatalf("decode golden: %v", err)
	}
	gotJSON, _ := json.Marshal(got)
	wantJSON, _ := json.Marshal(want)
	if !bytes.Equal(gotJSON, wantJSON) {
		t.Fatalf("golden mismatch for %s\n got: %s\nwant: %s", fixture, gotJSON, wantJSON)
	}
}

func TestDOCXGolden(t *testing.T) {
	runOOXMLGolden(t, "docx-basic", ReadDOCXEntries, MarshalDOCX)
}

func TestPPTXGolden(t *testing.T) {
	runOOXMLGolden(t, "pptx-basic", ReadPPTXEntries, MarshalPPTX)
}
