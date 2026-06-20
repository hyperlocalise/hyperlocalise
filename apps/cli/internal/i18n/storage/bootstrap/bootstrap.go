package bootstrap

import (
	"fmt"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/storageregistry"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/crowdin"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/lilt"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/lokalise"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/phrase"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/poeditor"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/smartling"
)

// RegisterBuiltins registers all built-in storage adapters with the provided registry.
func RegisterBuiltins(reg *storageregistry.Registry) error {
	if reg == nil {
		return fmt.Errorf("register built-in storage adapters: registry must not be nil")
	}

	registrations := []struct {
		name    string
		factory storageregistry.Factory
	}{
		{name: poeditor.AdapterName, factory: poeditor.New},
		{name: crowdin.AdapterName, factory: crowdin.New},
		{name: lilt.AdapterName, factory: lilt.New},
		{name: lokalise.AdapterName, factory: lokalise.New},
		{name: phrase.AdapterName, factory: phrase.New},
		{name: smartling.AdapterName, factory: smartling.New},
	}

	for _, registration := range registrations {
		if err := reg.Register(registration.name, registration.factory); err != nil {
			return fmt.Errorf("register built-in storage adapters: %w", err)
		}
	}

	return nil
}
