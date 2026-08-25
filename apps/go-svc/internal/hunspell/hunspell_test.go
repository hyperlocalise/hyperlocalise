//go:build cgo_hunspell

package hunspell

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

var (
	validAff = filepath.Join("testdata", "valid", "test.aff")
	validDic = filepath.Join("testdata", "valid", "test.dic")
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
