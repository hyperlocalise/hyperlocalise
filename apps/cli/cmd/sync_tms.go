package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/localstore"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/storage/bootstrap"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/storageregistry"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/syncsvc"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

type syncMode int

const (
	syncModeNone syncMode = iota
	syncModeNative
	syncModeTMS
)

func resolveSyncMode(cfg *config.I18NConfig) (syncMode, error) {
	if cfg == nil {
		return syncModeNone, fmt.Errorf("sync requires top-level \"hyperlocalise\" or \"storage.adapter\"")
	}
	if cfg.Hyperlocalise != nil {
		return syncModeNative, nil
	}
	if cfg.Storage != nil {
		return syncModeTMS, nil
	}
	return syncModeNone, fmt.Errorf("sync requires top-level \"hyperlocalise\" or \"storage.adapter\"")
}

func resolveTMSLocales(cfg *config.I18NConfig, requested []string) ([]string, error) {
	if cfg == nil {
		return nil, fmt.Errorf("sync locales: config is required")
	}
	if len(requested) == 0 {
		return append([]string(nil), cfg.Locales.Targets...), nil
	}

	allowed := make(map[string]struct{}, len(cfg.Locales.Targets)+1)
	if source := strings.TrimSpace(cfg.Locales.Source); source != "" {
		allowed[source] = struct{}{}
	}
	for _, locale := range cfg.Locales.Targets {
		locale = strings.TrimSpace(locale)
		if locale == "" {
			continue
		}
		allowed[locale] = struct{}{}
	}

	targets := make([]string, 0, len(requested))
	seen := map[string]struct{}{}
	for _, locale := range requested {
		locale = strings.TrimSpace(locale)
		if locale == "" {
			continue
		}
		if _, ok := allowed[locale]; !ok {
			return nil, fmt.Errorf("locale %q is not configured in locales.source or locales.targets", locale)
		}
		if _, ok := seen[locale]; ok {
			continue
		}
		seen[locale] = struct{}{}
		targets = append(targets, locale)
	}
	if len(targets) == 0 {
		return nil, fmt.Errorf("at least one target locale is required")
	}
	return targets, nil
}

func newTMSAdapter(cfg *config.I18NConfig) (storage.StorageAdapter, error) {
	if cfg == nil || cfg.Storage == nil {
		return nil, fmt.Errorf("storage.adapter is required")
	}
	reg := storageregistry.New()
	if err := bootstrap.RegisterBuiltins(reg); err != nil {
		return nil, err
	}
	return reg.New(cfg.Storage.Adapter, cfg.Storage.Config)
}

func newTMSLocalStore(cfg *config.I18NConfig, configPath string) (syncsvc.LocalStore, error) {
	root, err := config.ConfigDirectory(configPath)
	if err != nil {
		return nil, fmt.Errorf("resolve config directory: %w", err)
	}
	return localstore.NewJSONStoreInRoot(cfg, root)
}

func runTMSPush(ctx context.Context, adapter storage.StorageAdapter, local syncsvc.LocalStore, read syncsvc.LocalReadRequest, opts syncsvc.PushOptions) (syncsvc.Report, error) {
	return syncsvc.New().Push(ctx, syncsvc.PushInput{
		Adapter: adapter,
		Local:   local,
		Read:    read,
		Options: opts,
	})
}

func runTMSPull(ctx context.Context, adapter storage.StorageAdapter, local syncsvc.LocalStore, read syncsvc.LocalReadRequest, opts syncsvc.PullOptions) (syncsvc.Report, error) {
	return syncsvc.New().Pull(ctx, syncsvc.PullInput{
		Adapter: adapter,
		Local:   local,
		Read:    read,
		Request: storage.PullRequest{
			Locales:     read.Locales,
			KeyPrefixes: read.KeyPrefixes,
		},
		Options: opts,
	})
}

func writeTMSReport(w io.Writer, report syncsvc.Report, output string, dryRun bool) error {
	switch strings.ToLower(strings.TrimSpace(output)) {
	case "", "text":
		_, err := fmt.Fprintf(
			w,
			"action=%s creates=%d updates=%d unchanged=%d conflicts=%d applied=%d skipped=%d dry_run=%t\n",
			report.Action,
			len(report.Creates),
			len(report.Updates),
			len(report.Unchanged),
			len(report.Conflicts),
			len(report.Applied),
			len(report.Skipped),
			dryRun,
		)
		return err
	case "json":
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		return enc.Encode(report)
	case "md", "markdown":
		var b strings.Builder
		_, _ = fmt.Fprintf(
			&b,
			"## Sync %s\n\n- Creates: `%d`\n- Updates: `%d`\n- Unchanged: `%d`\n- Conflicts: `%d`\n- Applied: `%d`\n- Skipped: `%d`\n",
			report.Action,
			len(report.Creates),
			len(report.Updates),
			len(report.Unchanged),
			len(report.Conflicts),
			len(report.Applied),
			len(report.Skipped),
		)
		if len(report.Conflicts) > 0 {
			_, _ = fmt.Fprintf(&b, "\n### Conflicts\n\n")
			for _, conflict := range report.Conflicts {
				_, _ = fmt.Fprintf(
					&b,
					"- `%s` `%s` `%s`: %s\n",
					conflict.ID.Locale,
					conflict.ID.Key,
					conflict.ID.Context,
					conflict.Reason,
				)
			}
		}
		_, err := io.WriteString(w, b.String())
		return err
	default:
		return fmt.Errorf("unsupported output format %q", output)
	}
}
