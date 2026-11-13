package cmd

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/spellcheck"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func resolveCheckDictionaryDir(cfg *config.I18NConfig, flagDir, configPath string) (string, error) {
	if err := validateDictionaryDirValue(flagDir); err != nil {
		return "", err
	}

	configDir, err := config.ConfigDirectory(configPath)
	if err != nil {
		return "", fmt.Errorf("resolve config directory: %w", err)
	}

	return config.ResolveSpellcheckDictionaryDir(cfg, flagDir, configDir), nil
}

func validateDictionaryDirValue(dir string) error {
	trimmed := strings.TrimSpace(dir)
	if trimmed == "" {
		return nil
	}
	normalized := filepath.ToSlash(trimmed)
	for _, segment := range strings.Split(normalized, "/") {
		if segment == ".." {
			return fmt.Errorf("--dictionary-dir must not contain parent directory traversal")
		}
	}
	return nil
}

func loadCheckAcceptedWords(dir, locale string) (spellcheck.AcceptedWords, error) {
	return spellcheck.LoadAcceptedWordsFromDir(dir, locale)
}
