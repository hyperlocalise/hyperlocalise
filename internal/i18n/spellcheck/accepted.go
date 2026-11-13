package spellcheck

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

const (
	MaxWordLength     = 64
	MaxLibraryWords   = 20_000
	MaxResolvedWords  = 5_000
	dictionaryFileExt = ".txt"
)

// localeFilePattern matches BCP 47-like tags used as dictionary filenames.
var localeFilePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]*$`)

type AcceptedWords struct {
	folded map[string]struct{}
}

func NewAcceptedWords(words []string) AcceptedWords {
	unique := make(map[string]struct{}, len(words))
	for _, word := range words {
		normalized, ok := NormalizeWord(word)
		if !ok {
			continue
		}
		unique[FoldWord(normalized)] = struct{}{}
	}

	if len(unique) > MaxResolvedWords {
		keys := make([]string, 0, len(unique))
		for key := range unique {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		capped := make(map[string]struct{}, MaxResolvedWords)
		for _, key := range keys[:MaxResolvedWords] {
			capped[key] = struct{}{}
		}
		unique = capped
	}

	return AcceptedWords{folded: unique}
}

func (a AcceptedWords) Empty() bool {
	return len(a.folded) == 0
}

func (a AcceptedWords) Len() int {
	return len(a.folded)
}

func (a AcceptedWords) Accept(word string) bool {
	if len(a.folded) == 0 {
		return false
	}
	_, ok := a.folded[FoldWord(word)]
	return ok
}

func Accept(word string, accepted AcceptedWords) bool {
	return accepted.Accept(word)
}

func RejectedWords(words []string, accepted AcceptedWords) []string {
	if accepted.Empty() {
		return words
	}

	out := make([]string, 0, len(words))
	for _, word := range words {
		if accepted.Accept(word) {
			continue
		}
		out = append(out, word)
	}
	return out
}

func FoldWord(word string) string {
	return strings.ToLower(strings.TrimSpace(word))
}

func NormalizeWord(word string) (string, bool) {
	trimmed := strings.TrimSpace(word)
	if trimmed == "" {
		return "", false
	}

	normalized := norm.NFC.String(trimmed)
	if normalized == "" || utf8.RuneCountInString(normalized) > MaxWordLength {
		return "", false
	}

	hasWordChar := false
	for _, r := range normalized {
		if unicode.IsSpace(r) {
			return "", false
		}
		if isWordChar(r) || isApostrophe(r) || isHyphen(r) {
			hasWordChar = true
			continue
		}
		if unicode.IsLetter(r) || unicode.IsMark(r) || unicode.IsDigit(r) {
			hasWordChar = true
			continue
		}
		return "", false
	}

	if !hasWordChar {
		return "", false
	}

	return normalized, true
}

func LoadAcceptedWordsFromDir(dir, locale string) (AcceptedWords, error) {
	if strings.TrimSpace(dir) == "" {
		return AcceptedWords{}, nil
	}

	filename, err := dictionaryFilename(locale)
	if err != nil {
		return AcceptedWords{}, err
	}

	path := filepath.Join(dir, filename)
	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return AcceptedWords{}, nil
		}
		return AcceptedWords{}, fmt.Errorf("read dictionary %q: %w", path, err)
	}

	return ParseAcceptedWordsFile(string(content)), nil
}

func ParseAcceptedWordsFile(content string) AcceptedWords {
	scanner := bufio.NewScanner(strings.NewReader(content))
	words := make([]string, 0)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if word, ok := NormalizeWord(line); ok {
			words = append(words, word)
		}
	}
	return NewAcceptedWords(words)
}

func dictionaryFilename(locale string) (string, error) {
	trimmed := strings.TrimSpace(locale)
	if trimmed == "" || !localeFilePattern.MatchString(trimmed) {
		return "", fmt.Errorf("invalid dictionary locale %q", locale)
	}
	return trimmed + dictionaryFileExt, nil
}
