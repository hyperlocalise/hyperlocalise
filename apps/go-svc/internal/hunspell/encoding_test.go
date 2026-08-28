package hunspell

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseAffEncoding(t *testing.T) {
	tests := []struct {
		name         string
		data         []byte
		wantName     string
		wantDeclared bool
		wantBOM      bool
	}{
		{name: "utf-8", data: []byte("SET UTF-8\n"), wantName: "UTF-8", wantDeclared: true},
		{name: "utf-8 with bom", data: append(append([]byte{}, utf8BOM...), []byte("SET UTF-8\n")...), wantName: "UTF-8", wantDeclared: true, wantBOM: true},
		{name: "iso8859-1 after comment", data: []byte("# comment\nSET ISO8859-1\n"), wantName: "ISO8859-1", wantDeclared: true},
		{name: "missing", data: []byte("TRY abc\n"), wantDeclared: false},
		{name: "set without value", data: []byte("SET\n"), wantDeclared: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotName, gotDeclared, gotBOM := parseAffEncoding(tt.data)
			if gotName != tt.wantName || gotDeclared != tt.wantDeclared || gotBOM != tt.wantBOM {
				t.Errorf("parseAffEncoding() = (%q, %v, %v), want (%q, %v, %v)", gotName, gotDeclared, gotBOM, tt.wantName, tt.wantDeclared, tt.wantBOM)
			}
		})
	}
}

func TestRewriteSETToUTF8(t *testing.T) {
	got, err := rewriteSETToUTF8([]byte("# keep\nSET ISO8859-1\nTRY abc\n"))
	if err != nil {
		t.Fatalf("rewriteSETToUTF8() error = %v, want nil", err)
	}
	want := "# keep\nSET UTF-8\nTRY abc\n"
	if string(got) != want {
		t.Errorf("rewriteSETToUTF8() = %q, want %q", got, want)
	}
}

func TestCanonicalHunspellEncoding(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{in: "UTF-8", want: "UTF-8"},
		{in: "utf8", want: "UTF-8"},
		{in: "ISO8859-1", want: "ISO-8859-1"},
		{in: "iso-8859-1", want: "ISO-8859-1"},
		{in: "LATIN1", want: "ISO-8859-1"},
		{in: "ISO8859-2", want: "ISO-8859-2"},
		{in: "microsoft-cp1251", want: "WINDOWS-1251"},
		{in: "EBCDIC", want: "EBCDIC"},
	}

	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			if got := canonicalHunspellEncoding(tt.in); got != tt.want {
				t.Errorf("canonicalHunspellEncoding(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestPrepareUTF8Dictionary(t *testing.T) {
	t.Run("utf-8 without bom uses original paths", func(t *testing.T) {
		dir := t.TempDir()
		aff := filepath.Join(dir, "test.aff")
		dic := filepath.Join(dir, "test.dic")
		if err := os.WriteFile(aff, []byte("SET UTF-8\n"), 0o600); err != nil {
			t.Fatalf("write aff: %v", err)
		}
		if err := os.WriteFile(dic, []byte("1\nhello\n"), 0o600); err != nil {
			t.Fatalf("write dic: %v", err)
		}

		loadAff, loadDic, cleanup, err := prepareUTF8Dictionary(aff, dic)
		if err != nil {
			t.Fatalf("prepareUTF8Dictionary() error = %v, want nil", err)
		}
		t.Cleanup(cleanup)

		if loadAff != aff || loadDic != dic {
			t.Errorf("prepareUTF8Dictionary() paths = (%q, %q), want the original files", loadAff, loadDic)
		}
	})

	t.Run("iso8859-1 latin-1 word becomes utf-8", func(t *testing.T) {
		dir := t.TempDir()
		aff := filepath.Join(dir, "test.aff")
		dic := filepath.Join(dir, "test.dic")
		if err := os.WriteFile(aff, []byte("SET ISO8859-1\nTRY abc\n"), 0o600); err != nil {
			t.Fatalf("write aff: %v", err)
		}
		if err := os.WriteFile(dic, []byte{'1', '\n', 'c', 'a', 'f', 0xE9, '\n'}, 0o600); err != nil {
			t.Fatalf("write dic: %v", err)
		}

		loadAff, loadDic, cleanup, err := prepareUTF8Dictionary(aff, dic)
		if err != nil {
			t.Fatalf("prepareUTF8Dictionary() error = %v, want nil", err)
		}
		t.Cleanup(cleanup)

		affOut, err := os.ReadFile(loadAff)
		if err != nil {
			t.Fatalf("read converted aff: %v", err)
		}
		if !bytes.HasPrefix(affOut, []byte("SET UTF-8\n")) {
			t.Errorf("converted aff = %q, want SET UTF-8", affOut)
		}

		dicOut, err := os.ReadFile(loadDic)
		if err != nil {
			t.Fatalf("read converted dic: %v", err)
		}
		if !bytes.Contains(dicOut, []byte("café")) {
			t.Errorf("converted dic = %q, want it to contain UTF-8 %q", dicOut, "café")
		}
		if bytes.Contains(dicOut, []byte{0xE9}) {
			t.Errorf("converted dic still contains ISO8859-1 0xE9: %q", dicOut)
		}
	})

	t.Run("iso8859-2 word becomes utf-8", func(t *testing.T) {
		dir := t.TempDir()
		aff := filepath.Join(dir, "test.aff")
		dic := filepath.Join(dir, "test.dic")
		if err := os.WriteFile(aff, []byte("SET ISO8859-2\n"), 0o600); err != nil {
			t.Fatalf("write aff: %v", err)
		}
		if err := os.WriteFile(dic, []byte{'1', '\n', 0xB3, '\n'}, 0o600); err != nil {
			t.Fatalf("write dic: %v", err)
		}

		_, loadDic, cleanup, err := prepareUTF8Dictionary(aff, dic)
		if err != nil {
			t.Fatalf("prepareUTF8Dictionary() error = %v, want nil", err)
		}
		t.Cleanup(cleanup)

		dicOut, err := os.ReadFile(loadDic)
		if err != nil {
			t.Fatalf("read converted dic: %v", err)
		}
		if !bytes.Contains(dicOut, []byte("ł")) {
			t.Errorf("converted dic = %q, want it to contain UTF-8 %q", dicOut, "ł")
		}
	})

	t.Run("utf-8 bom is stripped", func(t *testing.T) {
		dir := t.TempDir()
		aff := filepath.Join(dir, "test.aff")
		dic := filepath.Join(dir, "test.dic")
		if err := os.WriteFile(aff, append(append([]byte{}, utf8BOM...), []byte("SET UTF-8\nTRY abc\n")...), 0o600); err != nil {
			t.Fatalf("write aff: %v", err)
		}
		if err := os.WriteFile(dic, []byte("1\nhello\n"), 0o600); err != nil {
			t.Fatalf("write dic: %v", err)
		}

		loadAff, loadDic, cleanup, err := prepareUTF8Dictionary(aff, dic)
		if err != nil {
			t.Fatalf("prepareUTF8Dictionary() error = %v, want nil", err)
		}
		t.Cleanup(cleanup)

		if loadDic != dic {
			t.Errorf("dictionary path = %q, want original %q", loadDic, dic)
		}
		affOut, err := os.ReadFile(loadAff)
		if err != nil {
			t.Fatalf("read stripped aff: %v", err)
		}
		if bytes.HasPrefix(affOut, utf8BOM) {
			t.Error("converted aff still starts with a UTF-8 BOM")
		}
		if !bytes.HasPrefix(affOut, []byte("SET UTF-8\n")) {
			t.Errorf("stripped aff = %q, want SET UTF-8", affOut)
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

		_, _, _, err := prepareUTF8Dictionary(aff, dic)
		if !errors.Is(err, errAffixEncodingNotUTF8) {
			t.Fatalf("prepareUTF8Dictionary() error = %v, want error wrapping errAffixEncodingNotUTF8", err)
		}
		if err != nil && !strings.Contains(err.Error(), "EBCDIC") {
			t.Errorf("prepareUTF8Dictionary() error = %q, want it to mention the declared encoding", err.Error())
		}
	})

	t.Run("missing SET is rejected", func(t *testing.T) {
		dir := t.TempDir()
		aff := filepath.Join(dir, "test.aff")
		dic := filepath.Join(dir, "test.dic")
		if err := os.WriteFile(aff, []byte("TRY abc\n"), 0o600); err != nil {
			t.Fatalf("write aff: %v", err)
		}
		if err := os.WriteFile(dic, []byte("1\nhello\n"), 0o600); err != nil {
			t.Fatalf("write dic: %v", err)
		}

		_, _, _, err := prepareUTF8Dictionary(aff, dic)
		if !errors.Is(err, errAffixEncodingUndeclared) {
			t.Fatalf("prepareUTF8Dictionary() error = %v, want error wrapping errAffixEncodingUndeclared", err)
		}
	})
}
