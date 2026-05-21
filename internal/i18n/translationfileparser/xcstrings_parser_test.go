package translationfileparser

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestXCStringsParserParsesSourceStringsVariantsAndContext(t *testing.T) {
	content := []byte(`{
  "sourceLanguage": "en",
  "strings": {
    "hello": {
      "comment": "Shown on the welcome screen",
      "extractionState": "manual",
      "localizations": {
        "en": {
          "stringUnit": {
            "state": "translated",
            "value": "Hello %@"
          }
        },
        "fr": {
          "stringUnit": {
            "state": "translated",
            "value": "Bonjour %@"
          }
        }
      }
    },
    "item_count": {
      "comment": "Cart item count",
      "localizations": {
        "en": {
          "variations": {
            "plural": {
              "one": {
                "stringUnit": {
                  "state": "translated",
                  "value": "%lld item"
                }
              },
              "other": {
                "stringUnit": {
                  "state": "translated",
                  "value": "%lld items"
                }
              }
            }
          }
        }
      }
    },
    "search_label": {
      "localizations": {
        "en": {
          "variations": {
            "device": {
              "mac": {
                "stringUnit": {
                  "state": "translated",
                  "value": "Find"
                }
              },
              "other": {
                "stringUnit": {
                  "state": "translated",
                  "value": "Search"
                }
              }
            }
          }
        }
      }
    },
    "%d of %d left": {
      "localizations": {
        "en": {
          "substitutions": {
            "left_count": {
              "argNum": 2,
              "formatSpecifier": "d",
              "variations": {
                "plural": {
                  "other": {
                    "stringUnit": {
                      "state": "translated",
                      "value": "%@ left"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  "version": "1.0"
}`)

	values, contextByKey, err := (XCStringsParser{}).ParseWithContext(content)
	if err != nil {
		t.Fatalf("parse xcstrings: %v", err)
	}

	assertStringMapValue(t, values, "hello", "Hello %@")
	assertStringMapValue(t, values, "item_count::plural.one", "%lld item")
	assertStringMapValue(t, values, "item_count::plural.other", "%lld items")
	assertStringMapValue(t, values, "search_label::device.mac", "Find")
	assertStringMapValue(t, values, "%d of %d left::substitution.left_count::plural.other", "%@ left")

	if ctx := contextByKey["item_count::plural.one"]; !strings.Contains(ctx, "Cart item count") || !strings.Contains(ctx, "plural.one") {
		t.Fatalf("expected comment and variation context, got %q", ctx)
	}
}

func TestParseXCStringsLocaleReadsRequestedTargetLocale(t *testing.T) {
	content := []byte(`{
  "sourceLanguage": "en",
  "strings": {
    "hello": {
      "localizations": {
        "en": {
          "stringUnit": {
            "state": "translated",
            "value": "Hello"
          }
        },
        "fr": {
          "stringUnit": {
            "state": "translated",
            "value": "Bonjour"
          }
        }
      }
    },
    "missing_in_fr": {
      "localizations": {
        "en": {
          "stringUnit": {
            "state": "translated",
            "value": "Only source"
          }
        }
      }
    }
  },
  "version": "1.0"
}`)

	got, err := ParseXCStringsLocale(content, "fr")
	if err != nil {
		t.Fatalf("parse target locale: %v", err)
	}
	assertStringMapValue(t, got, "hello", "Bonjour")
	if _, ok := got["missing_in_fr"]; ok {
		t.Fatalf("did not expect missing target locale key, got %#v", got)
	}
}

func TestXCStringsParserFallsBackToCatalogKeyForSimpleSourceEntries(t *testing.T) {
	content := []byte(`{
  "sourceLanguage": "en",
  "strings": {
    "Hello, world!": {},
    "Settings": {
      "localizations": {
        "fr": {
          "stringUnit": {
            "state": "translated",
            "value": "Reglages"
          }
        }
      }
    }
  },
  "version": "1.0"
}`)

	got, err := (XCStringsParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse source fallback: %v", err)
	}
	assertStringMapValue(t, got, "Hello, world!", "Hello, world!")
	assertStringMapValue(t, got, "Settings", "Settings")
}

func TestXCStringsParserRejectsVariantWithoutSourceLocalization(t *testing.T) {
	content := []byte(`{
  "sourceLanguage": "en",
  "strings": {
    "item_count": {
      "localizations": {
        "fr": {
          "variations": {
            "plural": {
              "one": {
                "stringUnit": {
                  "state": "translated",
                  "value": "%lld article"
                }
              }
            }
          }
        }
      }
    }
  },
  "version": "1.0"
}`)

	_, err := (XCStringsParser{}).Parse(content)
	if err == nil || !strings.Contains(err.Error(), "source localization") {
		t.Fatalf("expected missing source localization error, got %v", err)
	}
}

func TestXCStringsParserRejectsNonStringUnitValue(t *testing.T) {
	content := []byte(`{
  "sourceLanguage": "en",
  "strings": {
    "hello": {
      "localizations": {
        "en": {
          "stringUnit": {
            "state": "translated",
            "value": 123
          }
        }
      }
    }
  },
  "version": "1.0"
}`)

	_, err := (XCStringsParser{}).Parse(content)
	if err == nil || !strings.Contains(err.Error(), "stringUnit.value must be a string") {
		t.Fatalf("expected stringUnit value error, got %v", err)
	}
}

func TestMarshalXCStringsWritesTargetLocaleAndPreservesMetadata(t *testing.T) {
	source := []byte(`{
  "sourceLanguage": "en",
  "strings": {
    "hello": {
      "comment": "Shown on launch",
      "extractionState": "manual",
      "localizations": {
        "en": {
          "stringUnit": {
            "state": "translated",
            "value": "Hello %@"
          }
        }
      }
    },
    "item_count": {
      "comment": "Cart item count",
      "localizations": {
        "en": {
          "variations": {
            "plural": {
              "one": {
                "stringUnit": {
                  "state": "translated",
                  "value": "%lld item"
                }
              },
              "other": {
                "stringUnit": {
                  "state": "translated",
                  "value": "%lld items"
                }
              }
            }
          }
        }
      }
    },
    "%d of %d left": {
      "localizations": {
        "en": {
          "substitutions": {
            "left_count": {
              "argNum": 2,
              "formatSpecifier": "d",
              "variations": {
                "plural": {
                  "other": {
                    "stringUnit": {
                      "state": "translated",
                      "value": "%@ left"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  "version": "1.0"
}`)
	targetTemplate := []byte(`{
  "sourceLanguage": "en",
  "strings": {
    "hello": {
      "comment": "Target-side translator note",
      "localizations": {
        "fr": {
          "customMetadata": "keep-me",
          "stringUnit": {
            "state": "needs_review",
            "value": "Salut %@"
          }
        }
      }
    }
  },
  "version": "1.0"
}`)

	values := map[string]string{
		"hello":                    "Bonjour %@",
		"item_count::plural.one":   "%lld article",
		"item_count::plural.other": "%lld articles",
		"%d of %d left::substitution.left_count::plural.other": "%@ restants",
	}
	out, err := MarshalXCStrings(targetTemplate, source, values, "en", "fr")
	if err != nil {
		t.Fatalf("marshal xcstrings: %v", err)
	}
	outAgain, err := MarshalXCStrings(targetTemplate, source, values, "en", "fr")
	if err != nil {
		t.Fatalf("marshal xcstrings again: %v", err)
	}
	if string(out) != string(outAgain) {
		t.Fatalf("marshal output must be deterministic")
	}

	parsed, err := ParseXCStringsLocale(out, "fr")
	if err != nil {
		t.Fatalf("parse marshaled target locale: %v", err)
	}
	assertStringMapValue(t, parsed, "hello", "Bonjour %@")
	assertStringMapValue(t, parsed, "item_count::plural.one", "%lld article")
	assertStringMapValue(t, parsed, "%d of %d left::substitution.left_count::plural.other", "%@ restants")

	var catalog map[string]any
	if err := json.Unmarshal(out, &catalog); err != nil {
		t.Fatalf("decode marshaled catalog: %v", err)
	}
	hello := nestedXCStringsMap(t, catalog, "strings", "hello")
	if got := hello["comment"]; got != "Target-side translator note" {
		t.Fatalf("target entry metadata was not preserved: %#v", got)
	}
	helloFR := nestedXCStringsMap(t, catalog, "strings", "hello", "localizations", "fr")
	if got := helloFR["customMetadata"]; got != "keep-me" {
		t.Fatalf("target localization metadata was not preserved: %#v", got)
	}
	if got := nestedXCStringsMap(t, catalog, "strings", "%d of %d left", "localizations", "fr", "substitutions", "left_count")["formatSpecifier"]; got != "d" {
		t.Fatalf("substitution metadata was not preserved: %#v", got)
	}
}

func assertStringMapValue(t *testing.T, got map[string]string, key, want string) {
	t.Helper()
	if got[key] != want {
		t.Fatalf("value for %q = %q, want %q (all values: %#v)", key, got[key], want, got)
	}
}

func nestedXCStringsMap(t *testing.T, root map[string]any, path ...string) map[string]any {
	t.Helper()
	current := root
	for _, segment := range path {
		next, ok := current[segment].(map[string]any)
		if !ok {
			t.Fatalf("path segment %q is not an object in %#v", segment, current)
		}
		current = next
	}
	return current
}
