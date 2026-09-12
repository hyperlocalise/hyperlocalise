package cmd

import (
	"os"
	"path/filepath"
	"testing"

	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
	"github.com/stretchr/testify/require"
)

func TestResolveCheckDictionaryDirFlagOverridesConfig(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "i18n.yml")
	require.NoError(t, os.WriteFile(configPath, []byte(`
locales:
  source: en-US
  targets:
    - fr-FR
buckets:
  ui:
    files:
      - from: a.json
        to: b.json
llm:
  profiles:
    default:
      provider: openai
      model: x
spellcheck:
  dictionary_dir: .hyperlocalise/dictionaries
`), 0o600))

	cfg, err := config.Load(configPath)
	require.NoError(t, err)

	fromConfig, err := resolveCheckDictionaryDir(cfg, "", configPath)
	require.NoError(t, err)
	require.Equal(t, filepath.Join(dir, ".hyperlocalise/dictionaries"), fromConfig)

	override := filepath.Join(dir, "override-dicts")
	fromFlag, err := resolveCheckDictionaryDir(cfg, override, configPath)
	require.NoError(t, err)
	require.Equal(t, override, fromFlag)
}

func TestResolveCheckDictionaryDirRejectsTraversal(t *testing.T) {
	_, err := resolveCheckDictionaryDir(nil, "../secrets", "")
	require.Error(t, err)
}

func TestLoadCheckAcceptedWordsFromLocaleFile(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "en-US.txt"), []byte("Hyperlocalise\nAuthKit\n"), 0o600))

	accepted, err := loadCheckAcceptedWords(dir, "en-US")
	require.NoError(t, err)
	require.True(t, accepted.Accept("hyperlocalise"))
	require.True(t, accepted.Accept("AUTHKIT"))

	missing, err := loadCheckAcceptedWords(dir, "de-DE")
	require.NoError(t, err)
	require.True(t, missing.Empty())
}
