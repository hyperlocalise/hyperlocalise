package hunspell

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/text/encoding"
	"golang.org/x/text/encoding/charmap"
)

var (
	errAffixEncodingUndeclared = errors.New("hunspell: affix file has no SET declaration")
	errAffixEncodingNotUTF8    = errors.New("hunspell: affix file declares a non-UTF-8 encoding")
)

var utf8BOM = []byte{0xEF, 0xBB, 0xBF}

func prepareUTF8Dictionary(affPath, dicPath string) (loadAff, loadDic string, cleanup func(), err error) {
	cleanup = func() {}

	affData, err := os.ReadFile(affPath)
	if err != nil {
		return "", "", cleanup, fmt.Errorf("hunspell: reading affix file encoding: %w", err)
	}

	declaredEncoding, declared, bom := parseAffEncoding(affData)
	if !declared {
		return "", "", cleanup, fmt.Errorf("%w: %q (Hunspell defaults undeclared dictionaries to ISO8859-1, not UTF-8)", errAffixEncodingUndeclared, affPath)
	}

	decoder, ok := decoderForHunspellEncoding(declaredEncoding)
	if !ok {
		return "", "", cleanup, fmt.Errorf("%w: %q declares %q, which cannot be transcoded to UTF-8", errAffixEncodingNotUTF8, affPath, declaredEncoding)
	}

	if decoder == nil && !bom {
		return affPath, dicPath, cleanup, nil
	}

	tmpDir, err := os.MkdirTemp("", "hunspell-utf8-")
	if err != nil {
		return "", "", cleanup, fmt.Errorf("hunspell: create utf-8 staging dir: %w", err)
	}
	cleanup = func() { _ = os.RemoveAll(tmpDir) }

	loadAff = filepath.Join(tmpDir, filepath.Base(affPath))
	if decoder == nil {
		if err := os.WriteFile(loadAff, bytes.TrimPrefix(affData, utf8BOM), 0o600); err != nil {
			cleanup()
			return "", "", func() {}, fmt.Errorf("hunspell: write utf-8 affix file: %w", err)
		}
		return loadAff, dicPath, cleanup, nil
	}

	affUTF8, err := decoder.NewDecoder().Bytes(affData)
	if err != nil {
		cleanup()
		return "", "", func() {}, fmt.Errorf("hunspell: transcode affix file %q from %s: %w", affPath, declaredEncoding, err)
	}
	affUTF8, err = rewriteSETToUTF8(affUTF8)
	if err != nil {
		cleanup()
		return "", "", func() {}, fmt.Errorf("hunspell: rewrite affix SET in %q: %w", affPath, err)
	}

	dicData, err := os.ReadFile(dicPath)
	if err != nil {
		cleanup()
		return "", "", func() {}, fmt.Errorf("hunspell: reading dictionary file: %w", err)
	}
	dicUTF8, err := decoder.NewDecoder().Bytes(dicData)
	if err != nil {
		cleanup()
		return "", "", func() {}, fmt.Errorf("hunspell: transcode dictionary file %q from %s: %w", dicPath, declaredEncoding, err)
	}

	loadDic = filepath.Join(tmpDir, filepath.Base(dicPath))
	if err := os.WriteFile(loadAff, affUTF8, 0o600); err != nil {
		cleanup()
		return "", "", func() {}, fmt.Errorf("hunspell: write utf-8 affix file: %w", err)
	}
	if err := os.WriteFile(loadDic, dicUTF8, 0o600); err != nil {
		cleanup()
		return "", "", func() {}, fmt.Errorf("hunspell: write utf-8 dictionary file: %w", err)
	}

	return loadAff, loadDic, cleanup, nil
}

func parseAffEncoding(affData []byte) (name string, declared, bom bool) {
	if bytes.HasPrefix(affData, utf8BOM) {
		bom = true
		affData = affData[len(utf8BOM):]
	}

	scanner := bufio.NewScanner(bytes.NewReader(affData))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) == 0 || fields[0] != "SET" {
			continue
		}
		if len(fields) > 1 {
			return fields[1], true, bom
		}
		return "", true, bom
	}
	return "", false, bom
}

func rewriteSETToUTF8(data []byte) ([]byte, error) {
	var out bytes.Buffer
	scanner := bufio.NewScanner(bytes.NewReader(data))
	rewritten := false
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if !rewritten && len(fields) > 0 && fields[0] == "SET" {
			out.WriteString("SET UTF-8")
			rewritten = true
		} else {
			out.WriteString(line)
		}
		out.WriteByte('\n')
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func canonicalHunspellEncoding(name string) string {
	n := strings.ToUpper(strings.TrimSpace(name))
	n = strings.ReplaceAll(n, "_", "-")
	switch n {
	case "UTF-8", "UTF8":
		return "UTF-8"
	case "ISO8859-1", "ISO-8859-1", "LATIN1", "LATIN-1":
		return "ISO-8859-1"
	case "ISO8859-2", "ISO-8859-2", "LATIN2", "LATIN-2":
		return "ISO-8859-2"
	case "ISO8859-3", "ISO-8859-3":
		return "ISO-8859-3"
	case "ISO8859-4", "ISO-8859-4":
		return "ISO-8859-4"
	case "ISO8859-5", "ISO-8859-5":
		return "ISO-8859-5"
	case "ISO8859-6", "ISO-8859-6":
		return "ISO-8859-6"
	case "ISO8859-7", "ISO-8859-7":
		return "ISO-8859-7"
	case "ISO8859-8", "ISO-8859-8":
		return "ISO-8859-8"
	case "ISO8859-9", "ISO-8859-9":
		return "ISO-8859-9"
	case "ISO8859-10", "ISO-8859-10":
		return "ISO-8859-10"
	case "ISO8859-13", "ISO-8859-13":
		return "ISO-8859-13"
	case "ISO8859-14", "ISO-8859-14":
		return "ISO-8859-14"
	case "ISO8859-15", "ISO-8859-15", "LATIN9", "LATIN-9":
		return "ISO-8859-15"
	case "ISO8859-16", "ISO-8859-16":
		return "ISO-8859-16"
	case "KOI8-R", "KOI8R":
		return "KOI8-R"
	case "KOI8-U", "KOI8U":
		return "KOI8-U"
	case "CP1250", "WINDOWS-1250", "MICROSOFT-CP1250":
		return "WINDOWS-1250"
	case "CP1251", "WINDOWS-1251", "MICROSOFT-CP1251":
		return "WINDOWS-1251"
	case "CP1252", "WINDOWS-1252", "MICROSOFT-CP1252":
		return "WINDOWS-1252"
	default:
		return n
	}
}

func decoderForHunspellEncoding(name string) (encoding.Encoding, bool) {
	switch canonicalHunspellEncoding(name) {
	case "UTF-8":
		return nil, true
	case "ISO-8859-1":
		return charmap.ISO8859_1, true
	case "ISO-8859-2":
		return charmap.ISO8859_2, true
	case "ISO-8859-3":
		return charmap.ISO8859_3, true
	case "ISO-8859-4":
		return charmap.ISO8859_4, true
	case "ISO-8859-5":
		return charmap.ISO8859_5, true
	case "ISO-8859-6":
		return charmap.ISO8859_6, true
	case "ISO-8859-7":
		return charmap.ISO8859_7, true
	case "ISO-8859-8":
		return charmap.ISO8859_8, true
	case "ISO-8859-9":
		return charmap.ISO8859_9, true
	case "ISO-8859-10":
		return charmap.ISO8859_10, true
	case "ISO-8859-13":
		return charmap.ISO8859_13, true
	case "ISO-8859-14":
		return charmap.ISO8859_14, true
	case "ISO-8859-15":
		return charmap.ISO8859_15, true
	case "ISO-8859-16":
		return charmap.ISO8859_16, true
	case "KOI8-R":
		return charmap.KOI8R, true
	case "KOI8-U":
		return charmap.KOI8U, true
	case "WINDOWS-1250":
		return charmap.Windows1250, true
	case "WINDOWS-1251":
		return charmap.Windows1251, true
	case "WINDOWS-1252":
		return charmap.Windows1252, true
	default:
		return nil, false
	}
}
