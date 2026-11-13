package icuparser

import "strings"

// Interpolation is a mustache or i18next-style placeholder such as {{name}},
// {{{name}}}, {{- name}}, or {{name, uppercase}}.
type Interpolation struct {
	Name     string
	Literal  string
	Format   string
	Start    int
	End      int
	Triple   bool
	Unescape bool
}

// ExtractInterpolations returns mustache/i18next placeholders. Nested ICU
// messages such as {{count, plural, ...}} are skipped so option-open braces
// are not treated as interpolation.
func ExtractInterpolations(s string) []Interpolation {
	if !strings.Contains(s, "{{") {
		return nil
	}

	var out []Interpolation
	for i := 0; i < len(s); {
		span, ok := nextInterpolation(s, i)
		if !ok {
			break
		}
		out = append(out, span)
		i = span.End
	}
	return out
}

func nextInterpolation(s string, start int) (Interpolation, bool) {
	for i := start; i < len(s); i++ {
		rel := strings.Index(s[i:], "{{")
		if rel < 0 {
			return Interpolation{}, false
		}
		i += rel
		span, ok := interpolationAt(s, i)
		if ok {
			return span, true
		}
		i++
	}
	return Interpolation{}, false
}

func interpolationAt(s string, i int) (Interpolation, bool) {
	if i+3 > len(s) || s[i] != '{' || s[i+1] != '{' {
		return Interpolation{}, false
	}

	triple := i+2 < len(s) && s[i+2] == '{'
	openLen := 2
	if triple {
		openLen = 3
	}

	j := i + openLen
	for j < len(s) && s[j] != '}' {
		j++
	}

	for k := 0; k < openLen; k++ {
		if j+k >= len(s) || s[j+k] != '}' {
			return Interpolation{}, false
		}
	}

	interior := s[i+openLen : j]
	name, format, unescape, ok := splitInterpolation(interior)
	if !ok {
		return Interpolation{}, false
	}

	end := j + openLen
	return Interpolation{
		Name:     name,
		Literal:  normalizeInterpolationLiteral(triple, unescape, name, format),
		Format:   format,
		Start:    i,
		End:      end,
		Triple:   triple,
		Unescape: unescape,
	}, true
}

func splitInterpolation(interior string) (name, format string, unescape, ok bool) {
	interior = strings.TrimSpace(interior)
	if strings.HasPrefix(interior, "-") {
		unescape = true
		interior = strings.TrimSpace(interior[1:])
	}

	namePart, formatPart, found := strings.Cut(interior, ",")
	name = strings.TrimSpace(namePart)
	if !isPlaceholderName(name) {
		return "", "", false, false
	}
	if !found {
		return name, "", unescape, true
	}

	format = strings.TrimSpace(formatPart)
	if interpolationFormatIsICU(format) {
		return "", "", false, false
	}
	return name, format, unescape, true
}

func interpolationFormatIsICU(format string) bool {
	first, _, _ := strings.Cut(format, ",")
	first = strings.TrimSpace(first)
	if idx := strings.IndexByte(first, '('); idx >= 0 {
		first = first[:idx]
	}
	switch strings.ToLower(first) {
	case "plural", "select", "selectordinal":
		return true
	default:
		return false
	}
}

func isSimpleInterpolationFormat(format string) bool {
	return format != "" && isPlaceholderName(format) && !strings.ContainsAny(format, ".[]")
}

func normalizeInterpolationLiteral(triple, unescape bool, name, format string) string {
	if triple {
		return "{{{" + name + "}}}"
	}
	var b strings.Builder
	b.Grow(len(name) + len(format) + 8)
	b.WriteString("{{")
	if unescape {
		b.WriteByte('-')
	}
	b.WriteString(name)
	if isSimpleInterpolationFormat(format) {
		b.WriteString(", ")
		b.WriteString(format)
	}
	b.WriteString("}}")
	return b.String()
}

func interpolationRewrite(interior string) (string, bool) {
	name, format, _, ok := splitInterpolation(interior)
	if !ok {
		return "", false
	}
	if isSimpleInterpolationFormat(format) {
		return "{" + name + ", " + format + "}", true
	}
	return "{" + name + "}", true
}
