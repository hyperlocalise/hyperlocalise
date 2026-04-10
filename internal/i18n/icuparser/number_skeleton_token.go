package icuparser

import "strings"

// NumberSkeletonToken is a single stem with optional slash-separated options,
// matching formatjs/icu-skeleton-parser (icu_skeleton_parser/number_skeleton_token.rs).
type NumberSkeletonToken struct {
	Stem    string
	Options []string
}

// isNumberSkeletonWhitespace matches formatjs WHITE_SPACE_REGEX (icu-skeleton-parser).
func isNumberSkeletonWhitespace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', '\u0085', '\u200e', '\u200f', '\u2028', '\u2029':
		return true
	default:
		return false
	}
}

// ParseNumberSkeletonTokens splits an ICU number skeleton string into tokens.
// It returns an error for empty input or invalid slash placement (e.g. "currency//").
func ParseNumberSkeletonTokens(skeleton string) ([]NumberSkeletonToken, error) {
	skeleton = strings.TrimSpace(skeleton)
	if skeleton == "" {
		return nil, errInvalidNumberSkeleton("number skeleton cannot be empty")
	}
	parts := strings.FieldsFunc(skeleton, isNumberSkeletonWhitespace)
	var out []NumberSkeletonToken
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		tok, err := parseOneNumberSkeletonToken(p)
		if err != nil {
			return nil, err
		}
		out = append(out, tok)
	}
	if len(out) == 0 {
		return nil, errInvalidNumberSkeleton("number skeleton cannot be empty")
	}
	return out, nil
}

func parseOneNumberSkeletonToken(token string) (NumberSkeletonToken, error) {
	parts := strings.Split(token, "/")
	stem := parts[0]
	opts := make([]string, 0, len(parts)-1)
	for _, o := range parts[1:] {
		if o == "" {
			return NumberSkeletonToken{}, errInvalidNumberSkeleton("invalid number skeleton")
		}
		opts = append(opts, o)
	}
	return NumberSkeletonToken{Stem: stem, Options: opts}, nil
}
