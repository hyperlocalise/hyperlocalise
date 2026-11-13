package pathguard

import (
	"os"
	"path/filepath"
	"testing"
)

func BenchmarkEnsureUnderRoot(b *testing.B) {
	root := b.TempDir()
	nested := filepath.Join(root, "locales", "fr-FR", "app")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		b.Fatal(err)
	}
	existing := filepath.Join(nested, "messages.json")
	if err := os.WriteFile(existing, []byte("{}"), 0o644); err != nil {
		b.Fatal(err)
	}
	linked := filepath.Join(root, "linked")
	if err := os.Symlink(nested, linked); err != nil {
		b.Fatal(err)
	}

	benchmarks := []struct {
		name      string
		candidate string
	}{
		{"ExistingFile", existing},
		{"MissingFile", filepath.Join(nested, "new.json")},
		{"MissingDeepPath", filepath.Join(root, "locales", "de-DE", "app", "screens", "checkout", "new.json")},
		{"ThroughSymlink", filepath.Join(linked, "messages.json")},
		{"Escapes", filepath.Join(root, "..", "outside.json")},
	}

	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_ = EnsureUnderRoot(root, bm.candidate)
			}
		})
	}
}

func BenchmarkCanonicalForContainment(b *testing.B) {
	root := b.TempDir()
	nested := filepath.Join(root, "locales", "fr-FR")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		b.Fatal(err)
	}

	benchmarks := []struct {
		name string
		path string
	}{
		{"Existing", nested},
		{"MissingLeaf", filepath.Join(nested, "messages.json")},
		{"Missing4Levels", filepath.Join(nested, "a", "b", "c", "messages.json")},
	}

	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_, _ = CanonicalForContainment(bm.path)
			}
		})
	}
}

func BenchmarkEnsureCanonicalUnderRoot(b *testing.B) {
	benchmarks := []struct {
		name      string
		root      string
		candidate string
	}{
		{"Inside", "/srv/project", "/srv/project/locales/fr-FR/messages.json"},
		{"PrefixSibling", "/srv/project", "/srv/project-evil/messages.json"},
		{"Escapes", "/srv/project", "/etc/passwd"},
	}

	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				_ = EnsureCanonicalUnderRoot(bm.root, bm.candidate)
			}
		})
	}
}
