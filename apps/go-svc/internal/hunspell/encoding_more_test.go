package hunspell

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/text/encoding/charmap"
)

// legacyEncodingCases pairs each SET alias Hunspell dictionaries ship with a
// word that only round-trips if the matching charmap is used.
var legacyEncodingCases = []struct {
	set  string
	word string
}{
	{set: "ISO8859-1", word: "café"},
	{set: "latin1", word: "naïve"},
	{set: "ISO8859-2", word: "żółć"},
	{set: "LATIN2", word: "příliš"},
	{set: "ISO8859-3", word: "ĉiuĝ"},
	{set: "ISO8859-4", word: "ķēniņš"},
	{set: "ISO8859-5", word: "привет"},
	{set: "ISO8859-6", word: "مرحبا"},
	{set: "ISO8859-7", word: "γεια"},
	{set: "ISO8859-8", word: "שלום"},
	{set: "ISO8859-9", word: "şığ"},
	{set: "ISO8859-10", word: "ŋŧ"},
	{set: "ISO8859-13", word: "ąčęė"},
	{set: "ISO8859-14", word: "ẁŵ"},
	{set: "ISO8859-15", word: "œuvre€"},
	{set: "latin9", word: "œ"},
	{set: "ISO8859-16", word: "șț"},
	{set: "KOI8-R", word: "слово"},
	{set: "koi8r", word: "мир"},
	{set: "KOI8-U", word: "їжак"},
	{set: "CP1250", word: "łódź"},
	{set: "windows-1250", word: "šťastný"},
	{set: "microsoft-cp1250", word: "ő"},
	{set: "CP1251", word: "дом"},
	{set: "windows-1251", word: "ёлка"},
	{set: "CP1252", word: "façade"},
	{set: "windows_1252", word: "€uro"},
	{set: "microsoft-cp1252", word: "smörgåsbord"},
}

func TestDecoderForHunspellEncodingSupportsLegacyCharsets(t *testing.T) {
	t.Parallel()
	if decoder, ok := decoderForHunspellEncoding("utf8"); !ok || decoder != nil {
		t.Fatalf("UTF-8 = %v, %v; want nil decoder and ok", decoder, ok)
	}
	for _, unsupported := range []string{"EBCDIC", "TIS-620", "ISCII-DEVANAGARI", ""} {
		if _, ok := decoderForHunspellEncoding(unsupported); ok {
			t.Errorf("decoderForHunspellEncoding(%q) ok = true, want false", unsupported)
		}
	}
	for _, tc := range legacyEncodingCases {
		decoder, ok := decoderForHunspellEncoding(tc.set)
		if !ok || decoder == nil {
			t.Errorf("decoderForHunspellEncoding(%q) = %v, %v", tc.set, decoder, ok)
			continue
		}
		encoded, err := decoder.NewEncoder().String(tc.word)
		if err != nil {
			t.Errorf("%s cannot encode %q: %v", tc.set, tc.word, err)
			continue
		}
		decoded, err := decoder.NewDecoder().String(encoded)
		if err != nil || decoded != tc.word {
			t.Errorf("%s round trip of %q = %q, %v", tc.set, tc.word, decoded, err)
		}
	}
}

func TestPrepareUTF8DictionaryTranscodesLegacyCharsets(t *testing.T) {
	t.Parallel()
	for _, tc := range legacyEncodingCases {
		t.Run(tc.set, func(t *testing.T) {
			t.Parallel()
			decoder, _ := decoderForHunspellEncoding(tc.set)
			encode := func(s string) []byte {
				out, err := decoder.NewEncoder().Bytes([]byte(s))
				if err != nil {
					t.Fatalf("encode %q: %v", s, err)
				}
				return out
			}
			dir := t.TempDir()
			aff := filepath.Join(dir, "test.aff")
			dic := filepath.Join(dir, "test.dic")
			affText := "# comment\nSET " + tc.set + "\nTRY " + tc.word + "\n"
			if err := os.WriteFile(aff, encode(affText), 0o600); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(dic, encode("1\n"+tc.word+"\n"), 0o600); err != nil {
				t.Fatal(err)
			}

			loadAff, loadDic, cleanup, err := prepareUTF8Dictionary(aff, dic)
			if err != nil {
				t.Fatalf("prepareUTF8Dictionary: %v", err)
			}
			if loadAff == aff || loadDic == dic {
				t.Fatalf("expected transcoded temp files, got %q, %q", loadAff, loadDic)
			}
			affOut, err := os.ReadFile(loadAff)
			if err != nil {
				t.Fatal(err)
			}
			if want := "# comment\nSET UTF-8\nTRY " + tc.word + "\n"; string(affOut) != want {
				t.Fatalf("affix = %q, want %q", affOut, want)
			}
			dicOut, err := os.ReadFile(loadDic)
			if err != nil {
				t.Fatal(err)
			}
			if want := "1\n" + tc.word + "\n"; string(dicOut) != want {
				t.Fatalf("dictionary = %q, want %q", dicOut, want)
			}

			cleanup()
			if _, err := os.Stat(filepath.Dir(loadAff)); !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("cleanup left staging dir: %v", err)
			}
		})
	}
}

func TestPrepareUTF8DictionaryErrors(t *testing.T) {
	t.Parallel()
	write := func(t *testing.T, aff, dic string) (string, string) {
		t.Helper()
		dir := t.TempDir()
		affPath := filepath.Join(dir, "test.aff")
		dicPath := filepath.Join(dir, "test.dic")
		if aff != "" {
			if err := os.WriteFile(affPath, []byte(aff), 0o600); err != nil {
				t.Fatal(err)
			}
		}
		if dic != "" {
			if err := os.WriteFile(dicPath, []byte(dic), 0o600); err != nil {
				t.Fatal(err)
			}
		}
		return affPath, dicPath
	}

	t.Run("missing affix", func(t *testing.T) {
		aff, dic := write(t, "", "1\nword\n")
		if _, _, _, err := prepareUTF8Dictionary(aff, dic); err == nil || !strings.Contains(err.Error(), "reading affix file") {
			t.Fatalf("err = %v", err)
		}
	})
	t.Run("missing dictionary", func(t *testing.T) {
		aff, dic := write(t, "SET UTF-8\n", "")
		if _, _, _, err := prepareUTF8Dictionary(aff, dic); err == nil || !strings.Contains(err.Error(), "reading dictionary file") {
			t.Fatalf("err = %v", err)
		}
	})
	t.Run("undeclared encoding", func(t *testing.T) {
		aff, dic := write(t, "TRY abc\n", "1\nword\n")
		if _, _, _, err := prepareUTF8Dictionary(aff, dic); !errors.Is(err, errAffixEncodingUndeclared) {
			t.Fatalf("err = %v", err)
		}
	})
	t.Run("unsupported encoding", func(t *testing.T) {
		aff, dic := write(t, "SET TIS-620\n", "1\nword\n")
		if _, _, _, err := prepareUTF8Dictionary(aff, dic); !errors.Is(err, errAffixEncodingNotUTF8) {
			t.Fatalf("err = %v", err)
		}
	})
	t.Run("legacy dictionary with bad header", func(t *testing.T) {
		aff, dic := write(t, "SET ISO8859-1\n", "words\nword\n")
		if _, _, _, err := prepareUTF8Dictionary(aff, dic); !errors.Is(err, errDicWordCountHeader) {
			t.Fatalf("err = %v", err)
		}
	})
	t.Run("utf-8 affix with bom is staged without bom", func(t *testing.T) {
		aff, dic := write(t, "\ufeffSET UTF-8\nTRY abc\n", "1\nword\n")
		loadAff, loadDic, cleanup, err := prepareUTF8Dictionary(aff, dic)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(cleanup)
		if loadDic != dic {
			t.Fatalf("dictionary path = %q, want original", loadDic)
		}
		affOut, err := os.ReadFile(loadAff)
		if err != nil {
			t.Fatal(err)
		}
		if bytes.HasPrefix(affOut, utf8BOM) || string(affOut) != "SET UTF-8\nTRY abc\n" {
			t.Fatalf("affix = %q", affOut)
		}
	})
}

// BenchmarkPrepareUTF8Dictionary measures dictionary staging at the size of a
// typical shipped dictionary (100k words).
func BenchmarkPrepareUTF8Dictionary(b *testing.B) {
	const words = 100000
	build := func(header string) []byte {
		var sb strings.Builder
		sb.WriteString(header)
		for i := 0; i < words; i++ {
			fmt.Fprintf(&sb, "café%d/S\n", i)
		}
		return []byte(sb.String())
	}
	cases := []struct {
		name   string
		set    string
		header string
	}{
		{name: "utf8-passthrough", set: "UTF-8", header: fmt.Sprintf("%d\n", words)},
		{name: "utf8-header-rewrite", set: "UTF-8", header: fmt.Sprintf("#%d\n", words)},
		{name: "iso8859-1-transcode", set: "ISO8859-1", header: fmt.Sprintf("%d\n", words)},
	}
	for _, tc := range cases {
		b.Run(tc.name, func(b *testing.B) {
			dir := b.TempDir()
			aff := filepath.Join(dir, "bench.aff")
			dic := filepath.Join(dir, "bench.dic")
			dicData := build(tc.header)
			if tc.set != "UTF-8" {
				encoded, err := charmap.ISO8859_1.NewEncoder().Bytes(dicData)
				if err != nil {
					b.Fatal(err)
				}
				dicData = encoded
			}
			if err := os.WriteFile(aff, []byte("SET "+tc.set+"\nTRY esianrtolcdugmphbyfvkwz\n"), 0o600); err != nil {
				b.Fatal(err)
			}
			if err := os.WriteFile(dic, dicData, 0o600); err != nil {
				b.Fatal(err)
			}
			b.SetBytes(int64(len(dicData)))
			b.ReportAllocs()
			for b.Loop() {
				_, _, cleanup, err := prepareUTF8Dictionary(aff, dic)
				if err != nil {
					b.Fatal(err)
				}
				cleanup()
			}
		})
	}
}
