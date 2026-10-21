package segmentvalidate

import (
	"fmt"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/icuparser"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/pluralrules"
)

// UnreachablePluralCases returns CLDR plural or selectordinal categories in
// message that locale never selects.
func UnreachablePluralCases(locale, message string) []string {
	if strings.TrimSpace(locale) == "" || !strings.ContainsAny(message, "{") {
		return nil
	}
	inv, err := icuparser.ParseInvariant(message)
	if err != nil {
		return nil
	}
	var out []string
	seen := map[string]struct{}{}
	for _, block := range inv.ICUBlocks {
		if block.Type != "plural" && block.Type != "selectordinal" {
			continue
		}
		for _, category := range pluralrules.Unreachable(locale, block.Type, block.Options) {
			if _, ok := seen[category]; ok {
				continue
			}
			seen[category] = struct{}{}
			out = append(out, category)
		}
	}
	return out
}

func UnreachablePluralMessage(locale string, cases []string) string {
	if len(cases) == 1 {
		return fmt.Sprintf("Locale %s never selects plural case %q.", locale, cases[0])
	}
	quoted := make([]string, len(cases))
	for i, category := range cases {
		quoted[i] = fmt.Sprintf("%q", category)
	}
	return fmt.Sprintf("Locale %s never selects plural cases %s.", locale, strings.Join(quoted, ", "))
}
