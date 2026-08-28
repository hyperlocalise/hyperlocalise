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

func TestNewEncoding(t *testing.T) {
	t.Run("ISO8859-1 ASCII dictionary loads", func(t *testing.T) {
		d, err := New(nonUTF8Aff, nonUTF8Dic)
		if err != nil {
			t.Fatalf("New() error = %v, want nil (ISO8859-1 is transcoded to UTF-8)", err)
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
		if !got {
			t.Error(`Spell("hello") = false, want true after ISO8859-1 transcoding`)
		}
	})

	t.Run("ISO8859-1 latin-1 word is queryable as UTF-8", func(t *testing.T) {
		dir := t.TempDir()
		aff := filepath.Join(dir, "test.aff")
		dic := filepath.Join(dir, "test.dic")
		if err := os.WriteFile(aff, []byte("SET ISO8859-1\n"), 0o600); err != nil {
			t.Fatalf("write aff: %v", err)
		}
		if err := os.WriteFile(dic, []byte{'1', '\n', 'c', 'a', 'f', 0xE9, '\n'}, 0o600); err != nil {
			t.Fatalf("write dic: %v", err)
		}

		d, err := New(aff, dic)
		if err != nil {
			t.Fatalf("New() error = %v, want nil", err)
		}
		t.Cleanup(func() {
			if err := d.Close(); err != nil {
				t.Errorf("Close() error = %v, want nil", err)
			}
		})

		got, err := d.Spell("café")
		if err != nil {
			t.Fatalf("Spell() error = %v, want nil", err)
		}
		if !got {
			t.Error(`Spell("café") = false, want true: the ISO8859-1 byte 0xE9 must become UTF-8 before Hunspell_create`)
		}
	})

	t.Run("ISO8859-2 word is queryable as UTF-8", func(t *testing.T) {
		dir := t.TempDir()
		aff := filepath.Join(dir, "test.aff")
		dic := filepath.Join(dir, "test.dic")
		if err := os.WriteFile(aff, []byte("SET ISO8859-2\n"), 0o600); err != nil {
			t.Fatalf("write aff: %v", err)
		}
		if err := os.WriteFile(dic, []byte{'1', '\n', 0xB3, '\n'}, 0o600); err != nil {
			t.Fatalf("write dic: %v", err)
		}

		d, err := New(aff, dic)
		if err != nil {
			t.Fatalf("New() error = %v, want nil", err)
		}
		t.Cleanup(func() {
			if err := d.Close(); err != nil {
				t.Errorf("Close() error = %v, want nil", err)
			}
		})

		got, err := d.Spell("ł")
		if err != nil {
			t.Fatalf("Spell() error = %v, want nil", err)
		}
		if !got {
			t.Error(`Spell("ł") = false, want true after ISO8859-2 transcoding`)
		}
	})

	t.Run("UTF-8 BOM is stripped so SET is recognized", func(t *testing.T) {
		dir := t.TempDir()
		aff := filepath.Join(dir, "test.aff")
		valid, err := os.ReadFile(validAff)
		if err != nil {
			t.Fatalf("read valid aff: %v", err)
		}
		if err := os.WriteFile(aff, append(append([]byte{}, utf8BOM...), valid...), 0o600); err != nil {
			t.Fatalf("write bom aff: %v", err)
		}

		d, err := New(aff, validDic)
		if err != nil {
			t.Fatalf("New() error = %v, want nil for a UTF-8 dictionary that starts with a BOM", err)
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
		if !got {
			t.Error(`Spell("hello") = false, want true after BOM stripping`)
		}
	})

	t.Run("SET UTF8 alias is treated as UTF-8", func(t *testing.T) {
		dir := t.TempDir()
		aff := filepath.Join(dir, "test.aff")
		if err := os.WriteFile(aff, []byte("SET UTF8\n"), 0o600); err != nil {
			t.Fatalf("write aff: %v", err)
		}

		d, err := New(aff, validDic)
		if err != nil {
			t.Fatalf("New() error = %v, want nil for SET UTF8", err)
		}
		if err := d.Close(); err != nil {
			t.Errorf("Close() error = %v, want nil", err)
		}
	})

	t.Run("unknown encoding is rejected", func(t *testing.T) {
		dir := t.TempDir()
		aff := filepath.Join(dir, "test.aff")
		dic := filepath.Join(dir, "test.dic")
		if err := os.WriteFile(aff, []byte("SET EBCDIC\n"), 0o600); err != nil {
			t.Fatalf("write aff: %v", err)
		}
		if err := os.WriteFile(dic, []byte("1\nhello\n"), 0o600); err != nil {
			t.Fatalf("write dic: %v", err)
		}

		_, err := New(aff, dic)
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
