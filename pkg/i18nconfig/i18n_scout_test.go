package config

import (
	"strings"
	"testing"
)

func TestLoad_ScoutEdgeCases(t *testing.T) {
	testCases := []struct {
		name        string
		content     string
		errContains string
	}{
		{
			name: "invalid locales source empty",
			content: `{
			  "locales": {"source": "", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}}
			}`,
			errContains: "locales.source: must not be empty",
		},
		{
			name: "invalid locales source with space",
			content: `{
			  "locales": {"source": "en US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}}
			}`,
			errContains: "locales.source: invalid locale",
		},
		{
			name: "invalid locales targets empty list",
			content: `{
			  "locales": {"source": "en-US", "targets": []},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}}
			}`,
			errContains: "locales.targets: must not be empty",
		},
		{
			name: "invalid locales target empty string",
			content: `{
			  "locales": {"source": "en-US", "targets": [""]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}}
			}`,
			errContains: "locales.targets[0]: must not be empty",
		},
		{
			name: "invalid locales target invalid characters",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es?ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}}
			}`,
			errContains: "invalid locale",
		},
		{
			name: "invalid locales duplicate target",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES", "es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}}
			}`,
			errContains: "duplicate locale",
		},
		{
			name: "invalid fallbacks empty chain",
			content: `{
			  "locales": {
			    "source": "en-US",
			    "targets": ["es-ES"],
			    "fallbacks": {"es-ES": []}
			  },
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}}
			}`,
			errContains: "fallback chain must not be empty",
		},
		{
			name: "invalid fallbacks self reference",
			content: `{
			  "locales": {
			    "source": "en-US",
			    "targets": ["es-ES"],
			    "fallbacks": {"es-ES": ["es-ES"]}
			  },
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}}
			}`,
			errContains: "self-reference is not allowed",
		},
		{
			name: "invalid fallbacks empty candidate in chain",
			content: `{
			  "locales": {
			    "source": "en-US",
			    "targets": ["es-ES"],
			    "fallbacks": {"es-ES": [""]}
			  },
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}}
			}`,
			errContains: "must not be empty",
		},
		{
			name: "invalid fallbacks duplicate candidate in chain",
			content: `{
			  "locales": {
			    "source": "en-US",
			    "targets": ["es-ES", "fr-FR"],
			    "fallbacks": {"es-ES": ["fr-FR", "fr-FR"]}
			  },
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}}
			}`,
			errContains: "duplicate locale",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			path := writeConfigFile(t, tc.content)

			_, err := Load(path)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tc.errContains)
			}

			if !strings.Contains(err.Error(), tc.errContains) {
				t.Fatalf("expected error containing %q, got: %v", tc.errContains, err)
			}
		})
	}
}
