package runsvc

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/lockfile"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translator"
	"github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func TestRunXLIFFTranslatesSegmentsAndCreatesTargets(t *testing.T) {
	svc := newTestService()
	sourcePath, targetPath := "/tmp/source.xlf", "/tmp/out.xlf"
	source := []byte(`<xliff version="2.0" srcLang="en" xmlns="urn:oasis:names:tc:xliff:document:2.0"><file id="f"><unit id="greeting"><segment id="one"><source>Hello</source></segment><segment id="two"><source>World</source><target/></segment></unit></file></xliff>`)
	svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
		cfg := testConfig(sourcePath, targetPath)
		return &cfg, nil
	}
	var written []byte
	svc.readFile = func(path string) ([]byte, error) {
		if path == sourcePath {
			return source, nil
		}
		if path == targetPath && written != nil {
			return written, nil
		}
		return nil, os.ErrNotExist
	}
	translations := map[string]string{"Hello": "Bonjour", "World": "Monde"}
	calls := 0
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		calls++
		translated, ok := translations[req.Source]
		if !ok {
			t.Fatalf("expected independent segment source, got %q", req.Source)
		}
		return translated, nil
	}
	svc.writeFile = func(path string, content []byte) error {
		if path != targetPath {
			t.Fatalf("unexpected write path: %s", path)
		}
		written = append([]byte(nil), content...)
		return nil
	}
	lock := &lockfile.File{}
	svc.loadLock = func(_ string) (*lockfile.File, error) { return lock, nil }
	svc.saveLock = func(_ string, value lockfile.File) error { lock = &value; return nil }
	if _, err := svc.Run(context.Background(), Input{Workers: 1}); err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("expected two translations, got %d", calls)
	}
	for _, want := range []string{`<source>Hello</source><target>Bonjour</target>`, `<source>World</source><target>Monde</target>`} {
		if !strings.Contains(string(written), want) {
			t.Fatalf("missing %s in %s", want, written)
		}
	}
	entries, err := (translationfileparser.XLIFFParser{}).Parse(written)
	if err != nil || entries["greeting#segment=one"] != "Bonjour" || entries["greeting#segment=two"] != "Monde" {
		t.Fatalf("output entries: %#v, %v", entries, err)
	}
	if _, err := svc.Run(context.Background(), Input{Workers: 1}); err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("unchanged segments were retranslated: %d calls", calls)
	}
}
