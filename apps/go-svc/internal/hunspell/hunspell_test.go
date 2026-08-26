//go:build cgo_hunspell

package hunspell

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

var (
	validAff = filepath.Join("testdata", "valid", "test.aff")
	validDic = filepath.Join("testdata", "valid", "test.dic")

	malformedAff = filepath.Join("testdata", "malformed", "test.aff")
	malformedDic = filepath.Join("testdata", "malformed", "test.dic")

	nonUTF8Aff = filepath.Join("testdata", "non_utf8", "test.aff")
	nonUTF8Dic = filepath.Join("testdata", "non_utf8", "test.dic")

	noSetAff = filepath.Join("testdata", "no_set", "test.aff")
	noSetDic = filepath.Join("testdata", "no_set", "test.dic")
)

func TestNew(t *testing.T) {
	t.Run("valid dictionary", func(t *testing.T) {
		d, err := New(validAff, validDic)
		if err != nil {
			t.Fatalf("New() error = %v, want nil", err)
		}
		if err := d.Close(); err != nil {
			t.Errorf("Close() error = %v, want nil", err)
		}
	})

	t.Run("missing affix file", func(t *testing.T) {
		missing := filepath.Join(t.TempDir(), "missing.aff")

		_, err := New(missing, validDic)
		if err == nil {
			t.Fatal("New() error = nil, want error for missing affix file")
		}
		if !errors.Is(err, os.ErrNotExist) {
			t.Errorf("New() error = %v, want wrapped os.ErrNotExist", err)
		}
	})

	t.Run("missing dictionary file", func(t *testing.T) {
		missing := filepath.Join(t.TempDir(), "missing.dic")

		_, err := New(validAff, missing)
		if err == nil {
			t.Fatal("New() error = nil, want error for missing dictionary file")
		}
		if !errors.Is(err, os.ErrNotExist) {
			t.Errorf("New() error = %v, want wrapped os.ErrNotExist", err)
		}
	})
}

func TestNewRejectsNonUTF8Dictionaries(t *testing.T) {
	t.Run("declared non-UTF-8 encoding", func(t *testing.T) {
		_, err := New(nonUTF8Aff, nonUTF8Dic)
		if !errors.Is(err, errAffixEncodingNotUTF8) {
			t.Fatalf("New() error = %v, want error wrapping errAffixEncodingNotUTF8", err)
		}
	})

	t.Run("missing SET declaration", func(t *testing.T) {
		_, err := New(noSetAff, noSetDic)
		if !errors.Is(err, errAffixEncodingUndeclared) {
			t.Fatalf("New() error = %v, want error wrapping errAffixEncodingUndeclared", err)
		}
	})
}

// Hunspell_create empirically tolerates malformed-but-readable dictionaries,
// returning a non-NULL handle with no usable entries rather than failing.
func TestNewToleratesMalformedDictionaryData(t *testing.T) {
	d, err := New(malformedAff, malformedDic)
	if err != nil {
		t.Fatalf("New() error = %v, want nil (Hunspell tolerates this input instead of failing construction)", err)
	}
	t.Cleanup(func() {
		if err := d.Close(); err != nil {
			t.Errorf("Close() error = %v, want nil", err)
		}
	})

	got, err := d.Spell("hello")
	if err != nil {
		t.Fatalf("Spell() error = %v, want nil", err)
	}
	if got {
		t.Errorf(`Spell("hello") = true, want false: a dictionary loaded from malformed data should have no usable entries`)
	}
}

func TestDictionarySpell(t *testing.T) {
	d, err := New(validAff, validDic)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	t.Cleanup(func() {
		if err := d.Close(); err != nil {
			t.Errorf("Close() error = %v", err)
		}
	})

	tests := []struct {
		name string
		word string
		want bool
	}{
		{name: "known word", word: "hello", want: true},
		{name: "another known word", word: "apple", want: true},
		{name: "misspelling of a known word", word: "helllo", want: false},
		{name: "word absent from the dictionary", word: "zzzqqqxxx", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := d.Spell(tt.word)
			if err != nil {
				t.Fatalf("Spell(%q) error = %v, want nil", tt.word, err)
			}
			if got != tt.want {
				t.Errorf("Spell(%q) = %v, want %v", tt.word, got, tt.want)
			}
		})
	}
}

func TestDictionarySuggest(t *testing.T) {
	d, err := New(validAff, validDic)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	t.Cleanup(func() {
		if err := d.Close(); err != nil {
			t.Errorf("Close() error = %v", err)
		}
	})

	t.Run("misspelling returns suggestions", func(t *testing.T) {
		got, err := d.Suggest("helo")
		if err != nil {
			t.Fatalf("Suggest() error = %v, want nil", err)
		}
		want := []string{"hello"}
		if !slices.Equal(got, want) {
			t.Errorf("Suggest(%q) = %v, want %v", "helo", got, want)
		}
	})

	t.Run("no suggestions for an unrelated word", func(t *testing.T) {
		got, err := d.Suggest("xyzxyz")
		if err != nil {
			t.Fatalf("Suggest() error = %v, want nil", err)
		}
		if len(got) != 0 {
			t.Errorf("Suggest(%q) = %v, want empty", "xyzxyz", got)
		}
	})

	t.Run("bounded by maxSuggestions", func(t *testing.T) {
		got, err := d.Suggest("zat")
		if err != nil {
			t.Fatalf("Suggest() error = %v, want nil", err)
		}
		if len(got) != maxSuggestions {
			t.Errorf("Suggest(%q) returned %d suggestions, want exactly the capped %d", "zat", len(got), maxSuggestions)
		}
	})
}

func TestDictionarySuggestAfterClose(t *testing.T) {
	d, err := New(validAff, validDic)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	if err := d.Close(); err != nil {
		t.Fatalf("Close() error = %v, want nil", err)
	}

	if _, err := d.Suggest("helo"); !errors.Is(err, ErrClosed) {
		t.Errorf("Suggest() after Close() error = %v, want ErrClosed", err)
	}
}

func TestDictionaryCloseIsIdempotent(t *testing.T) {
	d, err := New(validAff, validDic)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	if err := d.Close(); err != nil {
		t.Fatalf("first Close() error = %v, want nil", err)
	}
	if err := d.Close(); err != nil {
		t.Fatalf("second Close() error = %v, want nil (idempotent)", err)
	}
}

func TestDictionarySpellAfterClose(t *testing.T) {
	d, err := New(validAff, validDic)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	if err := d.Close(); err != nil {
		t.Fatalf("Close() error = %v, want nil", err)
	}

	if _, err := d.Spell("hello"); !errors.Is(err, ErrClosed) {
		t.Errorf("Spell() after Close() error = %v, want ErrClosed", err)
	}
}
