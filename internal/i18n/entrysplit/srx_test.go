package entrysplit

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

func TestApplyToIngestEntriesSplitsJSONLeaf(t *testing.T) {
	doc, err := CompileSpec("default")
	if err != nil {
		t.Fatal(err)
	}

	entries := map[string]translationfileparser.IngestEntry{
		"hello": {Text: "Hello. World."},
	}
	split, warnings, err := ApplyToIngestEntries(doc, "en.json", "", "en-US", entries)
	if err != nil {
		t.Fatal(err)
	}
	if len(warnings) != 0 {
		t.Fatalf("warnings: %v", warnings)
	}
	if split["hello#srx.0"].Text != "Hello." || split["hello#srx.1"].Text != " World." {
		t.Fatalf("unexpected split: %#v", split)
	}
}

func TestCompileSpecReadsCustomFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "custom.srx")
	xml := `<?xml version="1.0"?><srx version="2.0"><body><languagerules><languagerule languagename="A"><rule break="yes"><beforebreak>\.</beforebreak></rule></languagerule></languagerules><maprules><languagemap languagepattern=".*" languagerulename="A"/></maprules></body></srx>`
	if err := os.WriteFile(path, []byte(xml), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := CompileSpec(path); err != nil {
		t.Fatal(err)
	}
}
