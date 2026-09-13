package spellcheck

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNewAcceptedWordsFoldsCaseAndSkipsInvalid(t *testing.T) {
	accepted := NewAcceptedWords([]string{" Hyperlocalise ", "AUTHKIT", "too many words", "", "ok"})

	require.True(t, accepted.Accept("hyperlocalise"))
	require.True(t, accepted.Accept("HYPERLOCALISE"))
	require.True(t, accepted.Accept("AuthKit"))
	require.True(t, accepted.Accept("ok"))
	require.False(t, accepted.Accept("missing"))
	require.Equal(t, 3, accepted.Len())
}

func TestAcceptedWordsEmptySetRejectsEverything(t *testing.T) {
	var accepted AcceptedWords

	require.True(t, accepted.Empty())
	require.False(t, Accept("Hyperlocalise", accepted))
	require.Equal(t, []string{"Hyperlocalise"}, RejectedWords([]string{"Hyperlocalise"}, accepted))
}

func TestRejectedWordsDropsAcceptedTokens(t *testing.T) {
	accepted := NewAcceptedWords([]string{"Hyperlocalise", "AuthKit"})
	words := []string{"Please", "update", "Hyperlocalise", "and", "AuthKit"}

	require.Equal(t, []string{"Please", "update", "and"}, RejectedWords(words, accepted))
}

func TestNewAcceptedWordsCapsResolvedSetStably(t *testing.T) {
	words := make([]string, 0, MaxResolvedWords+10)
	for i := MaxResolvedWords + 9; i >= 0; i-- {
		words = append(words, "w"+strings.Repeat("x", i%8)+strconv.Itoa(i))
	}

	accepted := NewAcceptedWords(words)
	require.Equal(t, MaxResolvedWords, accepted.Len())

	again := NewAcceptedWords(words)
	require.Equal(t, accepted.folded, again.folded)
}

func TestNormalizeWordRejectsPhrasesAndOverlongTokens(t *testing.T) {
	_, ok := NormalizeWord("too many words")
	require.False(t, ok)

	_, ok = NormalizeWord(strings.Repeat("a", MaxWordLength+1))
	require.False(t, ok)

	word, ok := NormalizeWord("  Café  ")
	require.True(t, ok)
	require.Equal(t, "Café", word)
}

func TestLoadAcceptedWordsFromDir(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "en-US.txt"), []byte("# brands\nHyperlocalise\nAuthKit\n\nbad phrase\n"), 0o600))

	accepted, err := LoadAcceptedWordsFromDir(dir, "en-US")
	require.NoError(t, err)
	require.True(t, accepted.Accept("hyperlocalise"))
	require.True(t, accepted.Accept("authkit"))
	require.False(t, accepted.Accept("phrase"))

	missing, err := LoadAcceptedWordsFromDir(dir, "de-DE")
	require.NoError(t, err)
	require.True(t, missing.Empty())

	_, err = LoadAcceptedWordsFromDir(dir, "../en-US")
	require.Error(t, err)
}
