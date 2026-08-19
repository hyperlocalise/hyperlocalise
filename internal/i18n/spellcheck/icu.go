package spellcheck

import (
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/icuparser"
)

// splitICULiterals returns user-visible literal text from ICU messages.
// Placeholder values are skipped, while plural/select branch text is retained.
func splitICULiterals(s string) []string {
	if !strings.Contains(s, "{") {
		return []string{s}
	}

	elems, err := icuparser.Parse(s, nil)
	if err != nil {
		// Malformed ICU is treated as opaque fragment.
		return []string{s}
	}

	return appendICULiterals(nil, elems)
}

func appendICULiterals(out []string, elems []icuparser.Element) []string {
	for _, elem := range elems {
		switch e := elem.(type) {
		case icuparser.LiteralElement:
			if e.Value != "" {
				out = append(out, e.Value)
			}
		case icuparser.SelectElement:
			for _, opt := range e.Options {
				out = appendICULiterals(out, opt.Value)
			}
		case icuparser.PluralElement:
			for _, opt := range e.Options {
				out = appendICULiterals(out, opt.Value)
			}
		}
	}
	return out
}
