package config

import (
	"strings"
	"testing"
)

func TestLoadTranslationRouting(t *testing.T) {
	testCases := []struct {
		name        string
		content     string
		errContains string
	}{
		{
			name: "translation absent preserves legacy llm-only behavior",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {"g": {"targets": ["es-ES"], "buckets": ["ui"]}},
			  "llm": {
			    "profiles": {"default": {"provider": "openai", "model": "x", "prompt": "p"}},
			    "rules": [{"priority": 1, "group": "g", "profile": "default"}]
			  }
			}`,
		},
		{
			name: "valid translation default llm and mt rule",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {"g": {"targets": ["es-ES"], "buckets": ["ui"]}, "bulk-ui": {"targets": ["es-ES"], "buckets": ["ui"]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x", "prompt": "p"}}},
			  "mt": {"profiles": {"google": {"provider": "google", "api_key_env": "GOOGLE_TRANSLATE_API_KEY"}}},
			  "translation": {
			    "default": {"type": "llm", "profile": "default"},
			    "rules": [{"priority": 100, "group": "bulk-ui", "type": "mt", "profile": "google"}]
			  }
			}`,
		},
		{
			name: "invalid translation default type",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {"g": {"targets": ["es-ES"], "buckets": ["ui"]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x", "prompt": "p"}}},
			  "translation": {"default": {"type": "bogus", "profile": "default"}}
			}`,
			errContains: "translation.default.type: unsupported type",
		},
		{
			name: "translation default references unknown llm profile",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {"g": {"targets": ["es-ES"], "buckets": ["ui"]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x", "prompt": "p"}}},
			  "translation": {"default": {"type": "llm", "profile": "missing"}}
			}`,
			errContains: "translation.default.profile: unknown llm profile",
		},
		{
			name: "translation rule references unknown mt profile",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {"g": {"targets": ["es-ES"], "buckets": ["ui"]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x", "prompt": "p"}}},
			  "mt": {"profiles": {"google": {"provider": "google", "api_key_env": "K"}}},
			  "translation": {
			    "default": {"type": "llm", "profile": "default"},
			    "rules": [{"priority": 1, "group": "g", "type": "mt", "profile": "missing"}]
			  }
			}`,
			errContains: "translation.rules[0].profile: unknown mt profile",
		},
		{
			name: "translation rule crosses namespace llm type referencing mt-only profile",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {"g": {"targets": ["es-ES"], "buckets": ["ui"]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x", "prompt": "p"}}},
			  "mt": {"profiles": {"google": {"provider": "google", "api_key_env": "K"}}},
			  "translation": {
			    "default": {"type": "llm", "profile": "default"},
			    "rules": [{"priority": 1, "group": "g", "type": "llm", "profile": "google"}]
			  }
			}`,
			errContains: "translation.rules[0].profile: unknown llm profile",
		},
		{
			name: "translation rule references unknown group",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {"g": {"targets": ["es-ES"], "buckets": ["ui"]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x", "prompt": "p"}}},
			  "translation": {
			    "default": {"type": "llm", "profile": "default"},
			    "rules": [{"priority": 1, "group": "missing", "type": "llm", "profile": "default"}]
			  }
			}`,
			errContains: "translation.rules[0].group: unknown group",
		},
		{
			name: "translation rules reject duplicate priority within same group",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {"g": {"targets": ["es-ES"], "buckets": ["ui"]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x", "prompt": "p"}, "other": {"provider": "openai", "model": "x", "prompt": "p"}}},
			  "translation": {
			    "default": {"type": "llm", "profile": "default"},
			    "rules": [
			      {"priority": 100, "group": "g", "type": "llm", "profile": "default"},
			      {"priority": 100, "group": "g", "type": "llm", "profile": "other"}
			    ]
			  }
			}`,
			errContains: "translation.rules[1].priority: duplicate priority",
		},
		{
			name: "translation rules allow same priority across different groups",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {
			    "g1": {"targets": ["es-ES"], "buckets": ["ui"]},
			    "g2": {"targets": ["es-ES"], "buckets": ["ui"]}
			  },
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x", "prompt": "p"}}},
			  "translation": {
			    "default": {"type": "llm", "profile": "default"},
			    "rules": [
			      {"priority": 100, "group": "g1", "type": "llm", "profile": "default"},
			      {"priority": 100, "group": "g2", "type": "llm", "profile": "default"}
			    ]
			  }
			}`,
		},
		{
			name: "translation rules combined with legacy llm rules is rejected",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {"g": {"targets": ["es-ES"], "buckets": ["ui"]}},
			  "llm": {
			    "profiles": {"default": {"provider": "openai", "model": "x", "prompt": "p"}},
			    "rules": [{"priority": 1, "group": "g", "profile": "default"}]
			  },
			  "translation": {
			    "default": {"type": "llm", "profile": "default"},
			    "rules": [{"priority": 1, "group": "g", "type": "llm", "profile": "default"}]
			  }
			}`,
			errContains: "translation.rules: must not be combined with llm.rules",
		},
		{
			name: "translation default with only legacy llm rules is rejected",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {"g": {"targets": ["es-ES"], "buckets": ["ui"]}},
			  "llm": {
			    "profiles": {"default": {"provider": "openai", "model": "x", "prompt": "p"}},
			    "rules": [{"priority": 100, "group": "g", "profile": "default"}]
			  },
			  "translation": {"default": {"type": "llm", "profile": "default"}}
			}`,
			errContains: "translation.rules: must not be combined with llm.rules",
		},
		{
			name: "mt profile google missing api key env",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {"g": {"targets": ["es-ES"], "buckets": ["ui"]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x", "prompt": "p"}}},
			  "mt": {"profiles": {"google": {"provider": "google"}}}
			}`,
			errContains: "mt.profiles.google.api_key_env: must not be empty",
		},
		{
			name: "mt profile deepl missing api key env",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {"g": {"targets": ["es-ES"], "buckets": ["ui"]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x", "prompt": "p"}}},
			  "mt": {"profiles": {"deepl": {"provider": "deepl", "base_url": "https://api-free.deepl.com"}}}
			}`,
			errContains: "mt.profiles.deepl.api_key_env: must not be empty",
		},
		{
			name: "mt profile deepl missing base url",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {"g": {"targets": ["es-ES"], "buckets": ["ui"]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x", "prompt": "p"}}},
			  "mt": {"profiles": {"deepl": {"provider": "deepl", "api_key_env": "DEEPL_API_KEY"}}}
			}`,
			errContains: "mt.profiles.deepl.base_url: must not be empty",
		},
		{
			name: "mt profile amazon is not yet an accepted provider",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {"g": {"targets": ["es-ES"], "buckets": ["ui"]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x", "prompt": "p"}}},
			  "mt": {"profiles": {"amazon": {"provider": "amazon", "access_key_id_env": "A", "secret_access_key_env": "S", "region": "us-east-1"}}}
			}`,
			errContains: "mt.profiles.amazon.provider: unsupported provider",
		},
		{
			name: "mt profile microsoft is not yet an accepted provider",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {"g": {"targets": ["es-ES"], "buckets": ["ui"]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x", "prompt": "p"}}},
			  "mt": {"profiles": {"microsoft": {"provider": "microsoft", "subscription_key_env": "K", "region": "westus"}}}
			}`,
			errContains: "mt.profiles.microsoft.provider: unsupported provider",
		},
		{
			name: "mt profiles must not be empty when mt section present",
			content: `{
			  "locales": {"source": "en-US", "targets": ["es-ES"]},
			  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
			  "groups": {"g": {"targets": ["es-ES"], "buckets": ["ui"]}},
			  "llm": {"profiles": {"default": {"provider": "openai", "model": "x", "prompt": "p"}}},
			  "mt": {"profiles": {}}
			}`,
			errContains: "mt.profiles: must not be empty",
		},
	}

	for _, tc := range testCases {
		tc := tc

		t.Run(tc.name, func(t *testing.T) {
			path := writeConfigFile(t, tc.content)

			_, err := Load(path)
			if tc.errContains == "" {
				if err != nil {
					t.Fatalf("load config: %v", err)
				}

				return
			}

			if err == nil {
				t.Fatalf("expected error containing %q", tc.errContains)
			}

			if !strings.Contains(err.Error(), tc.errContains) {
				t.Fatalf("unexpected error: got %q want substring %q", err.Error(), tc.errContains)
			}
		})
	}
}

func TestLoadTranslationRoutingYAML(t *testing.T) {
	path := writeConfigFileNamed(t, "config.yml", `
locales:
  source: en-US
  targets:
    - es-ES
buckets:
  ui:
    files:
      - from: a
        to: b
groups:
  bulk-ui:
    targets:
      - es-ES
    buckets:
      - ui
llm:
  profiles:
    default:
      provider: openai
      model: x
      prompt: p
translation:
  default:
    type: llm
    profile: default
  rules:
    - priority: 100
      group: bulk-ui
      type: mt
      profile: google
mt:
  profiles:
    google:
      provider: google
      api_key_env: GOOGLE_TRANSLATE_API_KEY
    deepl:
      provider: deepl
      api_key_env: DEEPL_API_KEY
      base_url: https://api-free.deepl.com
`)

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("load yaml config: %v", err)
	}

	if cfg.Translation == nil {
		t.Fatalf("expected translation config to be set")
	}
	if cfg.Translation.Default.Type != TranslationTypeLLM {
		t.Fatalf("translation.default.type=%q, want %q", cfg.Translation.Default.Type, TranslationTypeLLM)
	}
	if len(cfg.Translation.Rules) != 1 || cfg.Translation.Rules[0].Type != TranslationTypeMT {
		t.Fatalf("unexpected translation rules: %+v", cfg.Translation.Rules)
	}
	if cfg.MT == nil || len(cfg.MT.Profiles) != 2 {
		t.Fatalf("expected 2 mt profiles, got %+v", cfg.MT)
	}
	if got := cfg.MT.Profiles["deepl"].BaseURL; got != "https://api-free.deepl.com" {
		t.Fatalf("deepl base_url=%q", got)
	}
}
