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
		{
			name: "invalid hyperlocalise api_base_url invalid scheme/host",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}},
			  "hyperlocalise": {
			    "api_base_url": "http://production-attacker-domain.com/api",
			    "project_id": "p123"
			  }
			}`,
			errContains: "must use https",
		},
		{
			name: "invalid hyperlocalise negative timeout seconds",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}},
			  "hyperlocalise": {
			    "api_base_url": "https://hyperlocalise.com/api",
			    "project_id": "p123",
			    "timeout_seconds": -5
			  }
			}`,
			errContains: "hyperlocalise.timeout_seconds: must be >= 0",
		},
		{
			name: "invalid empty bucket name",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {
			    "  ": {"files": [{"from": "a", "to": "b"}]}
			  },
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}}
			}`,
			errContains: "buckets: bucket name must not be empty",
		},
		{
			name: "invalid empty group name",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {
			    " ": {"targets": ["es-ES"], "buckets": ["ui"]}
			  },
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}}
			}`,
			errContains: "groups: group name must not be empty",
		},
		{
			name: "invalid bucket file mapping missing to",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": ""}]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}}
			}`,
			errContains: ".to: must not be empty",
		},
		{
			name: "invalid group duplicate targets",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES", "fr-FR"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {
			    "g1": {"targets": ["es-ES", "es-ES"], "buckets": ["ui"]}
			  },
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}}
			}`,
			errContains: "duplicate locale",
		},
		{
			name: "invalid group duplicate buckets",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {
			    "ui": {"files": [{"from": "a", "to": "b"}]},
			    "docs": {"files": [{"from": "c", "to": "d"}]}
			  },
			  "groups": {
			    "g1": {"targets": ["es-ES"], "buckets": ["ui", "ui"]}
			  },
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}}
			}`,
			errContains: "duplicate bucket",
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

func TestI18NConfig_ValidateDirect_Scout(t *testing.T) {
	t.Parallel()

	baseConfig := func() I18NConfig {
		return I18NConfig{
			Locales: LocaleConfig{
				Source:  "en-US",
				Targets: []string{"es-ES"},
			},
			Buckets: map[string]BucketConfig{
				"ui": {
					Files: []BucketFileMapping{
						{From: "a", To: "b"},
					},
				},
			},
			LLM: LLMConfig{
				Profiles: map[string]LLMProfile{
					"default": {
						Provider: "openai",
						Model:    "gpt-4",
					},
				},
			},
		}
	}

	tests := []struct {
		name        string
		modify      func(*I18NConfig)
		errContains string
	}{
		{
			name: "invalid hyperlocalise api_base_url empty",
			modify: func(c *I18NConfig) {
				c.Hyperlocalise = &HyperlocaliseConfig{
					APIBaseURL: "  ",
					ProjectID:  "p123",
					APIKeyEnv:  "KEY",
				}
			},
			errContains: "hyperlocalise.api_base_url: must not be empty",
		},
		{
			name: "invalid hyperlocalise api_key_env empty",
			modify: func(c *I18NConfig) {
				c.Hyperlocalise = &HyperlocaliseConfig{
					APIBaseURL: "https://hyperlocalise.com/api",
					ProjectID:  "p123",
					APIKeyEnv:  "   ",
				}
			},
			errContains: "hyperlocalise.api_key_env: must not be empty",
		},
		{
			name: "invalid hyperlocalise project_id and project_id_env both empty",
			modify: func(c *I18NConfig) {
				c.Hyperlocalise = &HyperlocaliseConfig{
					APIBaseURL:   "https://hyperlocalise.com/api",
					APIKeyEnv:    "KEY",
					ProjectID:    "",
					ProjectIDEnv: "",
				}
			},
			errContains: "hyperlocalise.project_id: must be set when hyperlocalise.project_id_env is empty",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := baseConfig()
			tt.modify(&cfg)

			err := cfg.Validate()
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.errContains)
			}
			if !strings.Contains(err.Error(), tt.errContains) {
				t.Fatalf("expected error containing %q, got: %v", tt.errContains, err)
			}
		})
	}
}
