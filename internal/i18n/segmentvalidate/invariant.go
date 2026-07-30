package segmentvalidate

import (
	"fmt"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/icuparser"
)

func validateICUInvariantWithTokens(source, translated string) (bool, error) {
	// BOLT OPTIMIZATION: Fast-path for plain text without any potential ICU structures or HTML tags.
	// If neither the source nor the translated text contains '{' or '<', neither can contain any ICU
	// blocks, placeholders, or tags. We can immediately return nil, skipping space trimming and the
	// expensive ICU AST parser for both.
	if !strings.ContainsAny(source, "{<") && !strings.ContainsAny(translated, "{<") {
		return false, nil
	}

	// BOLT OPTIMIZATION: If source and translated are identical, we only parse the source itself.
	// This avoids duplicate AST construction and verification of the translated string entirely.
	if source == translated {
		trimmed := trimSpace(source)
		srcInv, srcErr := icuparser.ParseInvariant(trimmed)
		if srcErr != nil {
			return false, nil
		}
		hasTokens := len(srcInv.Placeholders) > 0 || len(srcInv.ICUBlocks) > 0
		if !hasTokens {
			return false, nil
		}
		if icuparser.HasDuplicatePounds(srcInv.ICUBlocks) {
			return hasTokens, fmt.Errorf(
				"translation invariant violation: duplicate # tokens in ICU plural/selectordinal branch (got %s) | %s",
				icuparser.FormatICUBlocks(srcInv.ICUBlocks),
				formatInvariantDebugContext(source, translated),
			)
		}
		return hasTokens, nil
	}

	source = trimSpace(source)
	translated = trimSpace(translated)

	srcInv, srcErr := icuparser.ParseInvariant(source)
	if srcErr != nil {
		return false, nil
	}
	hasTokens := len(srcInv.Placeholders) > 0 || len(srcInv.ICUBlocks) > 0
	if !hasTokens {
		return false, nil
	}

	translatedInv, translatedErr := icuparser.ParseInvariant(translated)
	if translatedErr != nil {
		return hasTokens, fmt.Errorf(
			"translation invariant violation: invalid ICU/braces structure | %s",
			formatInvariantDebugContext(source, translated),
		)
	}
	if !icuparser.SamePlaceholderSet(srcInv.Placeholders, translatedInv.Placeholders) {
		return hasTokens, fmt.Errorf(
			"translation invariant violation: placeholder parity mismatch (expected %q, got %q) | %s",
			srcInv.Placeholders,
			translatedInv.Placeholders,
			formatInvariantDebugContext(source, translated),
		)
	}
	if !icuparser.SameICUBlocks(srcInv.ICUBlocks, translatedInv.ICUBlocks) {
		return hasTokens, fmt.Errorf(
			"translation invariant violation: ICU parity mismatch (expected %s, got %s) | %s",
			icuparser.FormatICUBlocks(srcInv.ICUBlocks),
			icuparser.FormatICUBlocks(translatedInv.ICUBlocks),
			formatInvariantDebugContext(source, translated),
		)
	}
	if icuparser.HasDuplicatePounds(translatedInv.ICUBlocks) {
		return hasTokens, fmt.Errorf(
			"translation invariant violation: duplicate # tokens in ICU plural/selectordinal branch (got %s) | %s",
			icuparser.FormatICUBlocks(translatedInv.ICUBlocks),
			formatInvariantDebugContext(source, translated),
		)
	}
	return hasTokens, nil
}
