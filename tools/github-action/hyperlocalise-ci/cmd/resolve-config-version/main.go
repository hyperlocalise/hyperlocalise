package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: resolve-config-version <latest|config|version> [config-path] [working-directory]")
		os.Exit(2)
	}

	requested := os.Args[1]
	if requested != "config" {
		fmt.Println(requested)
		return
	}

	configPath := "i18n.yml"
	if len(os.Args) >= 3 && strings.TrimSpace(os.Args[2]) != "" {
		configPath = os.Args[2]
	}

	workingDirectory := "."
	if len(os.Args) >= 4 && strings.TrimSpace(os.Args[3]) != "" {
		workingDirectory = os.Args[3]
	}

	resolvedPath, err := resolveConfigPath(workingDirectory, configPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	version, err := config.InstallerVersionFromConfigFile(resolvedPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	fmt.Println(version)
}

func resolveConfigPath(workingDirectory, configPath string) (string, error) {
	if filepath.IsAbs(configPath) {
		return configPath, nil
	}

	workingDirectory = filepath.Clean(workingDirectory)
	if workingDirectory == "" {
		workingDirectory = "."
	}

	return filepath.Join(workingDirectory, configPath), nil
}
