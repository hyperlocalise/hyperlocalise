package config

import (
	"fmt"
	"strings"

	"github.com/Masterminds/semver/v3"
)

const (
	pinnedCLIToolHyperlocalise = "hyperlocalise"
	pinnedCLIToolHL            = "hl"
)

var currentCLIVersion string

// SetCLIVersion records the running Hyperlocalise CLI version for pinned-version checks.
func SetCLIVersion(version string) {
	currentCLIVersion = strings.TrimSpace(version)
}

// CurrentCLIVersion returns the running Hyperlocalise CLI version set by SetCLIVersion.
func CurrentCLIVersion() string {
	return currentCLIVersion
}

// ParsePinnedCLIVersion parses a pinned CLI version string such as hyperlocalise@1.2.3.
func ParsePinnedCLIVersion(value string) (*semver.Version, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil, fmt.Errorf("version: must not be empty")
	}

	tool, versionPart, ok := strings.Cut(trimmed, "@")
	if !ok {
		return nil, fmt.Errorf("version: expected %q or %q, got %q", pinnedCLIToolHyperlocalise+"@<version>", pinnedCLIToolHL+"@<version>", trimmed)
	}

	switch strings.ToLower(strings.TrimSpace(tool)) {
	case pinnedCLIToolHyperlocalise, pinnedCLIToolHL:
	default:
		return nil, fmt.Errorf("version: unsupported tool %q (expected %q or %q)", tool, pinnedCLIToolHyperlocalise, pinnedCLIToolHL)
	}

	versionPart = strings.TrimSpace(versionPart)
	if versionPart == "" {
		return nil, fmt.Errorf("version: missing semver after @")
	}

	versionPart = strings.TrimPrefix(versionPart, "v")
	parsed, err := semver.NewVersion(versionPart)
	if err != nil {
		return nil, fmt.Errorf("version: invalid semver %q: %w", versionPart, err)
	}

	return parsed, nil
}

// InstallerVersionFromConfigFile reads the pinned CLI installer version from an i18n config file.
func InstallerVersionFromConfigFile(path string) (string, error) {
	cfg, err := Load(path)
	if err != nil {
		return "", fmt.Errorf("resolve version from config: %w", err)
	}

	if strings.TrimSpace(cfg.Version) == "" {
		return "", fmt.Errorf("version is not set in %s", path)
	}

	pinned, err := ParsePinnedCLIVersion(cfg.Version)
	if err != nil {
		return "", err
	}

	return pinned.Original(), nil
}

// CheckPinnedCLIVersion verifies the running CLI matches the pinned version in the config.
// When version is omitted or the running CLI version is unavailable, the check is skipped.
func (c I18NConfig) CheckPinnedCLIVersion(cliVersion string) error {
	if strings.TrimSpace(c.Version) == "" {
		return nil
	}

	pinned, err := ParsePinnedCLIVersion(c.Version)
	if err != nil {
		return err
	}

	current, ok := normalizeCLIVersion(cliVersion)
	if !ok {
		return nil
	}

	if !current.Equal(pinned) {
		return fmt.Errorf(
			"version: running %s %s does not match pinned %s (upgrade or update i18n.yml)",
			pinnedCLIToolHyperlocalise,
			current.Original(),
			c.Version,
		)
	}

	return nil
}

// LoadForCLI loads and validates i18n config, then checks the pinned CLI version when set.
func LoadForCLI(path string) (*I18NConfig, error) {
	cfg, err := Load(path)
	if err != nil {
		return nil, err
	}

	if err := cfg.CheckPinnedCLIVersion(CurrentCLIVersion()); err != nil {
		return nil, fmt.Errorf("validate i18n config: %w", err)
	}

	return cfg, nil
}

func (c I18NConfig) validateVersion() error {
	if strings.TrimSpace(c.Version) == "" {
		return nil
	}

	_, err := ParsePinnedCLIVersion(c.Version)
	if err != nil {
		return err
	}

	return nil
}

func normalizeCLIVersion(version string) (*semver.Version, bool) {
	trimmed := strings.TrimSpace(version)
	if trimmed == "" {
		return nil, false
	}

	trimmed = strings.TrimPrefix(trimmed, "v")
	parsed, err := semver.NewVersion(trimmed)
	if err != nil {
		return nil, false
	}

	return parsed, true
}
