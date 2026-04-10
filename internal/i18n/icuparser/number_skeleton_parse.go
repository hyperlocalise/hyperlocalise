package icuparser

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// ParseNumberSkeleton maps tokenized number skeleton stems to NumberFormatOptions.
// Ported from formatjs/packages/icu-skeleton-parser/number.ts (parseNumberSkeleton).
func ParseNumberSkeleton(tokens []NumberSkeletonToken) (NumberFormatOptions, error) {
	result := NumberFormatOptions{}
	for _, token := range tokens {
		switch token.Stem {
		case "percent", "%":
			result.Style = "percent"
			continue
		case "%x100":
			result.Style = "percent"
			result.Scale = 100
			continue
		case "currency":
			result.Style = "currency"
			if len(token.Options) < 1 {
				return NumberFormatOptions{}, errMalformedNumberSkeleton("currency stem requires a currency code option")
			}
			result.Currency = token.Options[0]
			continue
		case "group-off", ",_":
			f := false
			result.UseGrouping = &f
			continue
		case "precision-integer", ".":
			result.MaximumFractionDigits = 0
			continue
		case "measure-unit", "unit":
			result.Style = "unit"
			if len(token.Options) < 1 {
				return NumberFormatOptions{}, errMalformedNumberSkeleton("unit stem requires a unit option")
			}
			result.Unit = icuUnitToEcma(token.Options[0])
			continue
		case "compact-short", "K":
			result.Notation = "compact"
			result.CompactDisplay = "short"
			continue
		case "compact-long", "KK":
			result.Notation = "compact"
			result.CompactDisplay = "long"
			continue
		case "scientific":
			result.Notation = "scientific"
			for _, opt := range token.Options {
				if so := parseNotationSign(opt); so != nil {
					applySignOpts(&result, so)
				}
			}
			continue
		case "engineering":
			result.Notation = "engineering"
			for _, opt := range token.Options {
				if so := parseNotationSign(opt); so != nil {
					applySignOpts(&result, so)
				}
			}
			continue
		case "notation-simple":
			result.Notation = "standard"
			continue
		case "unit-width-narrow":
			result.CurrencyDisplay = "narrowSymbol"
			result.UnitDisplay = "narrow"
			continue
		case "unit-width-short":
			result.CurrencyDisplay = "code"
			result.UnitDisplay = "short"
			continue
		case "unit-width-full-name":
			result.CurrencyDisplay = "name"
			result.UnitDisplay = "long"
			continue
		case "unit-width-iso-code":
			result.CurrencyDisplay = "symbol"
			continue
		case "scale":
			if len(token.Options) < 1 {
				return NumberFormatOptions{}, errMalformedNumberSkeleton("scale stem requires an option")
			}
			v, err := strconv.ParseFloat(token.Options[0], 64)
			if err != nil {
				return NumberFormatOptions{}, err
			}
			result.Scale = v
			continue
		case "rounding-mode-floor":
			result.RoundingMode = "floor"
			continue
		case "rounding-mode-ceiling":
			result.RoundingMode = "ceil"
			continue
		case "rounding-mode-down":
			result.RoundingMode = "trunc"
			continue
		case "rounding-mode-up":
			result.RoundingMode = "expand"
			continue
		case "rounding-mode-half-even":
			result.RoundingMode = "halfEven"
			continue
		case "rounding-mode-half-down":
			result.RoundingMode = "halfTrunc"
			continue
		case "rounding-mode-half-up":
			result.RoundingMode = "halfExpand"
			continue
		case "integer-width":
			if len(token.Options) > 1 {
				return NumberFormatOptions{}, errMalformedNumberSkeleton("integer-width stems only accept a single optional option")
			}
			if len(token.Options) == 1 {
				if err := applyIntegerWidth(&result, token.Options[0]); err != nil {
					return NumberFormatOptions{}, err
				}
			}
			continue
		}

		if conciseIntegerWidth.MatchString(token.Stem) {
			result.MinimumIntegerDigits = len(token.Stem)
			continue
		}

		if fractionPrecisionRE.MatchString(token.Stem) {
			if len(token.Options) > 1 {
				return NumberFormatOptions{}, errMalformedNumberSkeleton("fraction-precision stems only accept a single optional option")
			}
			if err := applyFractionPrecisionStem(&result, token.Stem); err != nil {
				return NumberFormatOptions{}, err
			}
			if len(token.Options) > 0 {
				opt := token.Options[0]
				if opt == "w" {
					result.TrailingZeroDisplay = "stripIfInteger"
				} else if opt != "" {
					sp, err := parseSignificantPrecision(opt)
					if err != nil {
						return NumberFormatOptions{}, err
					}
					mergeSignificantInto(&result, sp)
				}
			}
			continue
		}

		if significantPrecisionRE.MatchString(token.Stem) {
			sp, err := parseSignificantPrecision(token.Stem)
			if err != nil {
				return NumberFormatOptions{}, err
			}
			mergeSignificantInto(&result, sp)
			continue
		}

		var handled bool
		if so := parseSignStem(token.Stem); so != nil {
			applySignOpts(&result, so)
			handled = true
		}
		cse, err := parseConciseScientificAndEngineeringStem(token.Stem)
		if err != nil {
			return NumberFormatOptions{}, err
		}
		if cse != nil {
			mergeConciseScientific(&result, cse)
			handled = true
		}
		if !handled {
			return NumberFormatOptions{}, errMalformedNumberSkeleton(fmt.Sprintf("unknown number skeleton stem: %q", token.Stem))
		}
	}
	return result, nil
}

var (
	conciseIntegerWidth    = regexp.MustCompile(`^(0+)$`)
	fractionPrecisionRE    = regexp.MustCompile(`^\.(?:(0+)(\*)?|(#+)|(0+)(#+))$`)
	significantPrecisionRE = regexp.MustCompile(`^(@+)?(\+|#+)?[rs]?$`)
	integerWidthRE         = regexp.MustCompile(`(\*)(0+)|(#+)(0+)|(0+)`)
)

func icuUnitToEcma(unit string) string {
	if i := strings.Index(unit, "-"); i >= 0 {
		return unit[i+1:]
	}
	return unit
}

func parseNotationSign(opt string) *NumberFormatOptions {
	return parseSignStem(opt)
}

func parseSignStem(str string) *NumberFormatOptions {
	switch str {
	case "sign-auto":
		return &NumberFormatOptions{SignDisplay: "auto"}
	case "sign-accounting", "()":
		return &NumberFormatOptions{CurrencySign: "accounting"}
	case "sign-always", "+!":
		return &NumberFormatOptions{SignDisplay: "always"}
	case "sign-accounting-always", "()!":
		return &NumberFormatOptions{SignDisplay: "always", CurrencySign: "accounting"}
	case "sign-except-zero", "+?":
		return &NumberFormatOptions{SignDisplay: "exceptZero"}
	case "sign-accounting-except-zero", "()?":
		return &NumberFormatOptions{SignDisplay: "exceptZero", CurrencySign: "accounting"}
	case "sign-never", "+_":
		return &NumberFormatOptions{SignDisplay: "never"}
	default:
		return nil
	}
}

func applySignOpts(dst *NumberFormatOptions, src *NumberFormatOptions) {
	if src.SignDisplay != "" {
		dst.SignDisplay = src.SignDisplay
	}
	if src.CurrencySign != "" {
		dst.CurrencySign = src.CurrencySign
	}
}

func parseConciseScientificAndEngineeringStem(stem string) (*NumberFormatOptions, error) {
	s := stem
	var notation, signDisplay string
	if len(s) >= 2 && s[0] == 'E' && s[1] == 'E' {
		notation = "engineering"
		s = s[2:]
	} else if len(s) >= 1 && s[0] == 'E' {
		notation = "scientific"
		s = s[1:]
	} else {
		return nil, nil
	}
	if len(s) >= 2 {
		switch s[:2] {
		case "+!":
			signDisplay = "always"
			s = s[2:]
		case "+?":
			signDisplay = "exceptZero"
			s = s[2:]
		}
	}
	if !conciseIntegerWidth.MatchString(s) {
		return nil, errMalformedNumberSkeleton("Malformed concise eng/scientific notation")
	}
	return &NumberFormatOptions{
		Notation:             notation,
		SignDisplay:          signDisplay,
		MinimumIntegerDigits: len(s),
	}, nil
}

func mergeConciseScientific(dst *NumberFormatOptions, src *NumberFormatOptions) {
	if src == nil {
		return
	}
	if src.Notation != "" {
		dst.Notation = src.Notation
	}
	if src.SignDisplay != "" {
		dst.SignDisplay = src.SignDisplay
	}
	if src.MinimumIntegerDigits != 0 {
		dst.MinimumIntegerDigits = src.MinimumIntegerDigits
	}
}

func applyIntegerWidth(result *NumberFormatOptions, opt string) error {
	idx := 0
	for idx < len(opt) {
		loc := integerWidthRE.FindStringIndex(opt[idx:])
		if loc == nil {
			break
		}
		start := idx + loc[0]
		end := idx + loc[1]
		m := opt[start:end]
		sm := integerWidthRE.FindStringSubmatch(m)
		if len(sm) < 6 {
			idx = end
			continue
		}
		g1, g2, g3, g4, g5 := sm[1], sm[2], sm[3], sm[4], sm[5]
		switch {
		case g1 != "" && g2 != "":
			result.MinimumIntegerDigits = len(g2)
		case g3 != "" && g4 != "":
			return errMalformedNumberSkeleton("We currently do not support maximum integer digits")
		case g5 != "":
			return errMalformedNumberSkeleton("We currently do not support exact integer digits")
		}
		idx = end
	}
	return nil
}

func applyFractionPrecisionStem(result *NumberFormatOptions, stem string) error {
	sm := fractionPrecisionRE.FindStringSubmatch(stem)
	if len(sm) < 6 {
		return nil
	}
	g1, g2, g3, g4, g5 := sm[1], sm[2], sm[3], sm[4], sm[5]
	switch {
	case g2 == "*":
		result.MinimumFractionDigits = len(g1)
	case g3 != "":
		result.MaximumFractionDigits = len(g3)
	case g4 != "" && g5 != "":
		result.MinimumFractionDigits = len(g4)
		result.MaximumFractionDigits = len(g4) + len(g5)
	default:
		result.MinimumFractionDigits = len(g1)
		result.MaximumFractionDigits = len(g1)
	}
	return nil
}

func parseSignificantPrecision(str string) (NumberFormatOptions, error) {
	var result NumberFormatOptions
	if str == "" {
		return result, nil
	}
	s := str
	if last := s[len(s)-1]; last == 'r' {
		result.RoundingPriority = "morePrecision"
		s = s[:len(s)-1]
	} else if last == 's' {
		result.RoundingPriority = "lessPrecision"
		s = s[:len(s)-1]
	}
	if !significantPrecisionRE.MatchString(s) {
		return result, nil
	}
	m := significantPrecisionRE.FindStringSubmatch(s)
	if len(m) < 3 {
		return result, nil
	}
	g1, g2 := m[1], m[2]
	if g1 == "" {
		return result, nil
	}
	if g2 == "" {
		result.MinimumSignificantDigits = len(g1)
		result.MaximumSignificantDigits = len(g1)
	} else if g2 == "+" {
		result.MinimumSignificantDigits = len(g1)
	} else if len(g1) > 0 && g1[0] == '#' {
		result.MaximumSignificantDigits = len(g1)
	} else {
		result.MinimumSignificantDigits = len(g1)
		result.MaximumSignificantDigits = len(g1) + len(g2)
	}
	return result, nil
}

func mergeSignificantInto(dst *NumberFormatOptions, src NumberFormatOptions) {
	if src.RoundingPriority != "" {
		dst.RoundingPriority = src.RoundingPriority
	}
	if src.MinimumSignificantDigits != 0 {
		dst.MinimumSignificantDigits = src.MinimumSignificantDigits
	}
	if src.MaximumSignificantDigits != 0 {
		dst.MaximumSignificantDigits = src.MaximumSignificantDigits
	}
}
