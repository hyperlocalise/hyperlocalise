package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

func BenchmarkXCStringsParser_Parse(b *testing.B) {
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
    }
  },
  "version": "1.0"
}`)
	parser := XCStringsParser{}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = parser.Parse(content)
	}
}

func BenchmarkXCStringsParser_ParseLarge(b *testing.B) {
	numEntries := 500
	var sb strings.Builder
	sb.WriteString("{\n  \"sourceLanguage\": \"en\",\n  \"strings\": {")
	for i := 0; i < numEntries; i++ {
		if i > 0 {
			sb.WriteByte(',')
		}
		fmt.Fprintf(&sb, `
    "key_%d": {
      "comment": "Comment for key %d",
      "localizations": {
        "en": {
          "stringUnit": {
            "state": "translated",
            "value": "Value %d"
          }
        }
      }
    }`, i, i, i)
	}
	sb.WriteString("\n  },\n  \"version\": \"1.0\"\n}")
	contentBytes := []byte(sb.String())
	parser := XCStringsParser{}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = parser.Parse(contentBytes)
	}
}

func BenchmarkMarshalXCStrings(b *testing.B) {
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
    }
  },
  "version": "1.0"
}`)
	values := map[string]string{
		"hello": "Bonjour %@",
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = MarshalXCStrings(source, source, values, "en", "fr")
	}
}

func BenchmarkMarshalXCStrings_Large(b *testing.B) {
	numEntries := 500
	var sb strings.Builder
	sb.WriteString("{\n  \"sourceLanguage\": \"en\",\n  \"strings\": {")
	values := map[string]string{}
	for i := 0; i < numEntries; i++ {
		if i > 0 {
			sb.WriteByte(',')
		}
		key := fmt.Sprintf("key_%d", i)
		fmt.Fprintf(&sb, `
    "%s": {
      "localizations": {
        "en": {
          "stringUnit": {
            "state": "translated",
            "value": "Value %d"
          }
        }
      }
    }`, key, i)
		values[key] = fmt.Sprintf("Translated %d", i)
	}
	sb.WriteString("\n  },\n  \"version\": \"1.0\"\n}")
	contentBytes := []byte(sb.String())
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = MarshalXCStrings(contentBytes, contentBytes, values, "en", "fr")
	}
}
