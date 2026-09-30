package translationfileparser

import (
	"archive/zip"
	"bytes"
	"io"
	"strings"
	"testing"
	"time"
)

type dotLottieTestEntry struct {
	name    string
	content string
	method  uint16
}

func buildDotLottieArchive(t *testing.T, entries []dotLottieTestEntry) []byte {
	t.Helper()
	var buf bytes.Buffer
	writer := zip.NewWriter(&buf)
	modified := time.Date(2026, time.January, 2, 3, 4, 5, 0, time.UTC)
	for _, entry := range entries {
		entryWriter, err := writer.CreateHeader(&zip.FileHeader{Name: entry.name, Method: entry.method, Modified: modified})
		if err != nil {
			t.Fatalf("create %q: %v", entry.name, err)
		}
		if _, err := entryWriter.Write([]byte(entry.content)); err != nil {
			t.Fatalf("write %q: %v", entry.name, err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close archive: %v", err)
	}
	return buf.Bytes()
}

func readDotLottieTestArchive(t *testing.T, content []byte) map[string]*zip.File {
	t.Helper()
	reader, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		t.Fatalf("open archive: %v", err)
	}
	files := make(map[string]*zip.File, len(reader.File))
	for _, file := range reader.File {
		files[file.Name] = file
	}
	return files
}

func readDotLottieTestEntry(t *testing.T, file *zip.File) string {
	t.Helper()
	entry, err := file.Open()
	if err != nil {
		t.Fatalf("open %q: %v", file.Name, err)
	}
	defer func() { _ = entry.Close() }()
	content, err := io.ReadAll(entry)
	if err != nil {
		t.Fatalf("read %q: %v", file.Name, err)
	}
	return string(content)
}

const dotLottieSecondAnimation = `{"v":"5.9.0","fr":24,"ip":0,"op":48,"layers":[{"ty":5,"nm":"Caption","t":{"d":{"k":[{"s":{"t":"Tap to start","s":20},"t":0}]}}}]}`

func dotLottieFixtureEntries() []dotLottieTestEntry {
	return []dotLottieTestEntry{
		{name: "manifest.json", content: `{"version":"2","animations":[{"id":"promo"},{"id":"caption"}]}`, method: zip.Deflate},
		{name: "a/promo.json", content: lottieFixture, method: zip.Deflate},
		{name: "a/caption.json", content: dotLottieSecondAnimation, method: zip.Store},
		{name: "i/logo.png", content: "\x89PNG\r\n\x1a\nbinary", method: zip.Store},
		{name: "t/dark.json", content: `{"rules":[]}`, method: zip.Deflate},
	}
}

func TestDotLottieParserExtractsTextFromAllAnimations(t *testing.T) {
	archive := buildDotLottieArchive(t, dotLottieFixtureEntries())

	values, entryContext, err := DotLottieParser{}.ParseWithContext(archive)
	if err != nil {
		t.Fatalf("parse dotlottie: %v", err)
	}

	want := map[string]string{
		"a/promo.json#layers[1].t.d.k[0].s.t":           "Save <b>more</b>\rtoday & tomorrow",
		"a/promo.json#layers[1].t.d.k[1].s.t":           "Limited offer",
		"a/promo.json#assets[0].layers[0].t.d.k[0].s.t": "New",
		"a/caption.json#layers[0].t.d.k[0].s.t":         "Tap to start",
	}
	if len(values) != len(want) {
		t.Fatalf("values mismatch: got %#v", values)
	}
	for key, value := range want {
		if values[key] != value {
			t.Fatalf("value %q mismatch: got %q want %q", key, values[key], value)
		}
	}
	if got := entryContext["a/caption.json#layers[0].t.d.k[0].s.t"]; got != `Animation "a/caption.json": Lottie text layer "Caption"` {
		t.Fatalf("unexpected context: %q", got)
	}
}

func TestDotLottieParserSupportsV1AnimationsDir(t *testing.T) {
	archive := buildDotLottieArchive(t, []dotLottieTestEntry{
		{name: "manifest.json", content: `{"version":"1.0","animations":[{"id":"caption"}]}`, method: zip.Deflate},
		{name: "animations/caption.json", content: dotLottieSecondAnimation, method: zip.Deflate},
	})

	values, err := NewDefaultStrategy().Parse("assets/onboarding.lottie", archive)
	if err != nil {
		t.Fatalf("strategy parse: %v", err)
	}
	if got := values["animations/caption.json#layers[0].t.d.k[0].s.t"]; got != "Tap to start" {
		t.Fatalf("unexpected values: %#v", values)
	}
}

func TestDotLottieParserRejectsInvalidArchives(t *testing.T) {
	if _, err := (DotLottieParser{}).Parse([]byte("not a zip")); err == nil {
		t.Fatalf("expected error for non-zip content")
	}
	noAnimations := buildDotLottieArchive(t, []dotLottieTestEntry{{name: "manifest.json", content: `{}`, method: zip.Deflate}})
	if _, err := (DotLottieParser{}).Parse(noAnimations); err == nil {
		t.Fatalf("expected error for archive without animations")
	}
}

func TestMarshalDotLottieRewritesOnlyChangedAnimations(t *testing.T) {
	entries := dotLottieFixtureEntries()
	archive := buildDotLottieArchive(t, entries)

	content, err := MarshalDotLottie(archive, map[string]string{
		"a/promo.json#assets[0].layers[0].t.d.k[0].s.t": "Nouveau",
		"a/caption.json#layers[0].t.d.k[0].s.t":         "Touchez pour commencer",
		"a/missing.json#layers[0].t.d.k[0].s.t":         "ignored",
		"no-separator":                                  "ignored",
	})
	if err != nil {
		t.Fatalf("marshal dotlottie: %v", err)
	}

	source := readDotLottieTestArchive(t, archive)
	files := readDotLottieTestArchive(t, content)
	if len(files) != len(entries) {
		t.Fatalf("expected %d entries, got %d", len(entries), len(files))
	}

	wantPromo := strings.Replace(lottieFixture, `"t":"New"`, `"t":"Nouveau"`, 1)
	if got := readDotLottieTestEntry(t, files["a/promo.json"]); got != wantPromo {
		t.Fatalf("promo animation mismatch:\n got %s\nwant %s", got, wantPromo)
	}
	wantCaption := strings.Replace(dotLottieSecondAnimation, "Tap to start", "Touchez pour commencer", 1)
	if got := readDotLottieTestEntry(t, files["a/caption.json"]); got != wantCaption {
		t.Fatalf("caption animation mismatch:\n got %s\nwant %s", got, wantCaption)
	}

	for _, entry := range entries {
		file := files[entry.name]
		if file.Method != entry.method {
			t.Fatalf("entry %q method changed: got %d want %d", entry.name, file.Method, entry.method)
		}
		if !file.Modified.Equal(source[entry.name].Modified) {
			t.Fatalf("entry %q modified time changed: got %v want %v", entry.name, file.Modified, source[entry.name].Modified)
		}
	}
	for _, name := range []string{"manifest.json", "i/logo.png", "t/dark.json"} {
		if got := readDotLottieTestEntry(t, files[name]); got != readDotLottieTestEntry(t, source[name]) {
			t.Fatalf("entry %q content changed", name)
		}
	}

	roundTrip, err := DotLottieParser{}.Parse(content)
	if err != nil {
		t.Fatalf("reparse dotlottie: %v", err)
	}
	if got := roundTrip["a/promo.json#layers[1].t.d.k[1].s.t"]; got != "Limited offer" {
		t.Fatalf("untranslated text should keep source value, got %q", got)
	}
}

func TestMarshalDotLottieRewritesAnimationEntryWithHashInName(t *testing.T) {
	entryName := "a/foo#bar.json"
	archive := buildDotLottieArchive(t, []dotLottieTestEntry{
		{name: "manifest.json", content: `{}`, method: zip.Deflate},
		{name: entryName, content: dotLottieSecondAnimation, method: zip.Deflate},
	})

	compositeKey := entryName + "#layers[0].t.d.k[0].s.t"
	content, err := MarshalDotLottie(archive, map[string]string{
		compositeKey: "Touchez pour commencer",
	})
	if err != nil {
		t.Fatalf("marshal dotlottie: %v", err)
	}

	files := readDotLottieTestArchive(t, content)
	want := strings.Replace(dotLottieSecondAnimation, "Tap to start", "Touchez pour commencer", 1)
	if got := readDotLottieTestEntry(t, files[entryName]); got != want {
		t.Fatalf("animation mismatch:\n got %s\nwant %s", got, want)
	}
}

func TestMarshalDotLottieIsDeterministic(t *testing.T) {
	archive := buildDotLottieArchive(t, dotLottieFixtureEntries())
	values := map[string]string{"a/caption.json#layers[0].t.d.k[0].s.t": "Tippen zum Starten"}

	first, err := MarshalDotLottie(archive, values)
	if err != nil {
		t.Fatalf("marshal dotlottie: %v", err)
	}
	second, err := MarshalDotLottie(archive, values)
	if err != nil {
		t.Fatalf("marshal dotlottie: %v", err)
	}
	if !bytes.Equal(first, second) {
		t.Fatalf("expected deterministic archive output")
	}
}
