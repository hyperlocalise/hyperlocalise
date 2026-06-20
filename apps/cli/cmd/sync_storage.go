package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/localstore"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/storage/bootstrap"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/storageregistry"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/syncsvc"
	hyperlocalisestorage "github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/hyperlocalise"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func usesHyperlocaliseKeySync(cfg *config.I18NConfig) bool {
	return cfg != nil && cfg.Storage != nil && strings.TrimSpace(cfg.Storage.Adapter) == hyperlocalisestorage.AdapterName
}

func runStorageSyncPull(ctx context.Context, configPath string, o syncCommonOptions) error {
	cfg, adapter, local, err := newStorageSyncRuntime(configPath)
	if err != nil {
		return err
	}

	locales, err := resolveStorageSyncLocales(cfg, o.locales)
	if err != nil {
		return err
	}

	report, err := syncsvc.New().Pull(ctx, syncsvc.PullInput{
		Adapter: adapter,
		Local:   local,
		Request: storage.PullRequest{
			Locales: locales,
		},
		Read: syncsvc.LocalReadRequest{
			Locales: locales,
		},
		Options: syncsvc.PullOptions{
			DryRun:                o.dryRun,
			ApplyCuratedOverDraft: true,
			Policy:                syncsvc.PolicyConservativeCurationPull,
		},
	})
	if writeErr := writeStorageSyncReport(os.Stdout, "pull", report, o.output); writeErr != nil {
		return fmt.Errorf("write sync pull report: %w", writeErr)
	}
	if err != nil {
		return err
	}
	return nil
}

func runStorageSyncPush(ctx context.Context, configPath string, o syncCommonOptions, forceConflicts bool) error {
	cfg, adapter, local, err := newStorageSyncRuntime(configPath)
	if err != nil {
		return err
	}

	locales, err := resolveStorageSyncLocales(cfg, o.locales)
	if err != nil {
		return err
	}

	report, err := syncsvc.New().Push(ctx, syncsvc.PushInput{
		Adapter: adapter,
		Local:   local,
		Read: syncsvc.LocalReadRequest{
			Locales: locales,
		},
		Options: syncsvc.PushOptions{
			DryRun:         o.dryRun,
			ForceConflicts: forceConflicts,
		},
	})
	if writeErr := writeStorageSyncReport(os.Stdout, "push", report, o.output); writeErr != nil {
		return fmt.Errorf("write sync push report: %w", writeErr)
	}
	if err != nil {
		return err
	}
	return nil
}

func newStorageSyncRuntime(configPath string) (*config.I18NConfig, storage.StorageAdapter, *localstore.JSONStore, error) {
	cfg, err := config.Load(configPath)
	if err != nil {
		return nil, nil, nil, err
	}
	if !usesHyperlocaliseKeySync(cfg) {
		return nil, nil, nil, fmt.Errorf("storage.adapter must be %q for key sync", hyperlocalisestorage.AdapterName)
	}

	adapterConfig, err := enrichHyperlocaliseAdapterConfig(cfg)
	if err != nil {
		return nil, nil, nil, err
	}

	reg := storageregistry.New()
	if err := bootstrap.RegisterBuiltins(reg); err != nil {
		return nil, nil, nil, fmt.Errorf("register storage adapters: %w", err)
	}

	adapter, err := reg.New(hyperlocalisestorage.AdapterName, adapterConfig)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("initialize hyperlocalise storage adapter: %w", err)
	}

	local, err := localstore.NewJSONStore(cfg)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("initialize local translation store: %w", err)
	}

	return cfg, adapter, local, nil
}

func enrichHyperlocaliseAdapterConfig(cfg *config.I18NConfig) (json.RawMessage, error) {
	var adapterConfig map[string]json.RawMessage
	if len(cfg.Storage.Config) > 0 {
		if err := json.Unmarshal(cfg.Storage.Config, &adapterConfig); err != nil {
			return nil, fmt.Errorf("decode storage.config: %w", err)
		}
	}
	if adapterConfig == nil {
		adapterConfig = map[string]json.RawMessage{}
	}

	setStringField := func(key, value string) {
		if strings.TrimSpace(value) == "" {
			return
		}
		raw, err := json.Marshal(value)
		if err != nil {
			return
		}
		adapterConfig[key] = raw
	}

	if cfg.Hyperlocalise != nil {
		projectID := strings.TrimSpace(cfg.Hyperlocalise.ProjectID)
		if projectID == "" && strings.TrimSpace(cfg.Hyperlocalise.ProjectIDEnv) != "" {
			projectID = strings.TrimSpace(os.Getenv(strings.TrimSpace(cfg.Hyperlocalise.ProjectIDEnv)))
		}
		setStringField("projectID", projectID)
		setStringField("apiBaseURL", cfg.Hyperlocalise.APIBaseURL)
		setStringField("apiKeyEnv", cfg.Hyperlocalise.APIKeyEnv)
	}

	if _, ok := adapterConfig["sourcePath"]; !ok {
		sourcePath, err := defaultHyperlocaliseSourcePath(cfg)
		if err != nil {
			return nil, err
		}
		setStringField("sourcePath", sourcePath)
	}

	if _, ok := adapterConfig["sourceLanguage"]; !ok {
		setStringField("sourceLanguage", cfg.Locales.Source)
	}

	if _, ok := adapterConfig["targetLanguages"]; !ok && len(cfg.Locales.Targets) > 0 {
		raw, err := json.Marshal(cfg.Locales.Targets)
		if err != nil {
			return nil, fmt.Errorf("encode target languages: %w", err)
		}
		adapterConfig["targetLanguages"] = raw
	}

	return json.Marshal(adapterConfig)
}

func defaultHyperlocaliseSourcePath(cfg *config.I18NConfig) (string, error) {
	plans, err := planHyperlocaliseFilesWithOptions(cfg, nil, false)
	if err != nil {
		return "", err
	}
	if len(plans) == 0 {
		return "", fmt.Errorf("storage.config.sourcePath is required when no i18n bucket files are configured")
	}
	return plans[0].SourcePath, nil
}

func resolveStorageSyncLocales(cfg *config.I18NConfig, requested []string) ([]string, error) {
	if len(requested) > 0 {
		return resolveHyperlocaliseTargetLocales(cfg.Locales.Targets, requested)
	}
	locales := append([]string{cfg.Locales.Source}, cfg.Locales.Targets...)
	return locales, nil
}

func writeStorageSyncReport(w io.Writer, action string, report syncsvc.Report, format string) error {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "json":
		payload := struct {
			Action string         `json:"action"`
			Report syncsvc.Report `json:"report"`
		}{
			Action: action,
			Report: report,
		}
		encoder := json.NewEncoder(w)
		encoder.SetIndent("", "  ")
		return encoder.Encode(payload)
	default:
		_, err := fmt.Fprintf(
			w,
			"action=%s creates=%d updates=%d unchanged=%d conflicts=%d applied=%d\n",
			action,
			len(report.Creates),
			len(report.Updates),
			len(report.Unchanged),
			len(report.Conflicts),
			len(report.Applied),
		)
		return err
	}
}
