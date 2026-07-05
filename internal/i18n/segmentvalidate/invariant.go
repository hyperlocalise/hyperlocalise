package segmentvalidate

import (
	"fmt"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/icuparser"
)

func validateICUInvariant(source, translated string) error {
	source = trimSpace(source)
	translated = trimSpace(translated)

	srcInv, srcErr := icuparser.ParseInvariant(source)
	if srcErr != nil {
		return nil
	}
	if len(srcInv.Placeholders) == 0 && len(srcInv.ICUBlocks) == 0 {
		return nil
	}

	translatedInv, translatedErr := icuparser.ParseInvariant(translated)
	if translatedErr != nil {
		return fmt.Errorf(
			"translation invariant violation: invalid ICU/braces structure | %s",
			formatInvariantDebugContext(source, translated),
		)
	}
	if !icuparser.SamePlaceholderSet(srcInv.Placeholders, translatedInv.Placeholders) {
		return fmt.Errorf(
			"translation invariant violation: placeholder parity mismatch (expected %q, got %q) | %s",
			srcInv.Placeholders,
			translatedInv.Placeholders,
			formatInvariantDebugContext(source, translated),
		)
	}
	if !icuparser.SameICUBlocks(srcInv.ICUBlocks, translatedInv.ICUBlocks) {
		return fmt.Errorf(
			"translation invariant violation: ICU parity mismatch (expected %s, got %s) | %s",
			icuparser.FormatICUBlocks(srcInv.ICUBlocks),
			icuparser.FormatICUBlocks(translatedInv.ICUBlocks),
			formatInvariantDebugContext(source, translated),
		)
	}
	if icuparser.HasDuplicatePounds(translatedInv.ICUBlocks) {
		return fmt.Errorf(
			"translation invariant violation: duplicate # tokens in ICU plural/selectordinal branch (got %s) | %s",
			icuparser.FormatICUBlocks(translatedInv.ICUBlocks),
			formatInvariantDebugContext(source, translated),
		)
	}
	return nil
}
