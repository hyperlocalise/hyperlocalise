package evalset

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoad(t *testing.T) {
	testCases := []struct {
		name        string
		content     string
		errContains string
	}{
		{
			name: "decode valid jsonc dataset",
			content: `{
			  // schema metadata for tooling
			  "version": "v1",
			  "metadata": {
			    "owner": "l10n",
			    "domain": "checkout"
			  },
			  "cases": [
			    {
			      "id": "ui.pay.cta",
			      "source": "Pay now",
			      "targetLocale": "fr-FR",
			      "context": "Primary CTA on checkout page",
			      "reference": "Payer maintenant",
			      "tags": ["ui", "short"],
			      "bucket": "checkout",
			      "group": "critical"
			    }
			  ]
			}`,
		},
		{
			name: "reject unknown fields",
			content: `{
			  "cases": [
			    {
			      "id": "a",
			      "source": "Hello",
			      "targetLocale": "es-ES",
			      "unknown": true
			    }
			  ]
			}`,
			errContains: "unknown field",
		},
		{
			name: "validate non-empty cases",
			content: `{
			  "cases": []
			}`,
			errContains: "cases: must not be empty",
		},
		{
			name: "validate required source",
			content: `{
			  "cases": [
			    {
			      "id": "a",
			      "source": "",
			      "targetLocale": "de-DE"
			    }
			  ]
			}`,
			errContains: "source: must not be empty",
		},
		{
			name: "validate required target locale",
			content: `{
			  "cases": [
			    {
			      "id": "a",
			      "source": "Settings",
			      "targetLocale": ""
			    }
			  ]
			}`,
			errContains: "targetLocale: must not be empty",
		},
		{
			name: "validate unique id",
			content: `{
			  "cases": [
			    {
			      "id": "dup",
			      "source": "One",
			      "targetLocale": "ja-JP"
			    },
			    {
			      "id": "dup",
			      "source": "Two",
			      "targetLocale": "ja-JP"
			    }
			  ]
			}`,
			errContains: "duplicate id",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "evalset.jsonc")
			if err := os.WriteFile(path, []byte(tc.content), 0o644); err != nil {
				t.Fatalf("write evalset: %v", err)
			}

			dataset, err := Load(path)
			if tc.errContains != "" {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tc.errContains)
				}

				if !strings.Contains(err.Error(), tc.errContains) {
					t.Fatalf("expected error containing %q, got %q", tc.errContains, err.Error())
				}

				return
			}

			if err != nil {
				t.Fatalf("Load() error = %v", err)
			}

			if dataset == nil {
				t.Fatalf("Load() dataset is nil")
			}

			if len(dataset.Cases) != 1 {
				t.Fatalf("expected 1 case, got %d", len(dataset.Cases))
			}

			if dataset.Cases[0].ID != "ui.pay.cta" {
				t.Fatalf("expected case id ui.pay.cta, got %q", dataset.Cases[0].ID)
			}
		})
	}
}
