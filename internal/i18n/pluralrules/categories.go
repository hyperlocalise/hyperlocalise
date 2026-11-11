package pluralrules

import (
	"sync"

	"golang.org/x/text/feature/plural"
	"golang.org/x/text/language"
)

const (
	CategoryZero = "zero"
	CategoryOne  = "one"
	CategoryTwo  = "two"
	CategoryFew  = "few"
	CategoryMany = "many"
)

var cldrCategories = map[string]struct{}{
	CategoryZero: {},
	CategoryOne:  {},
	CategoryTwo:  {},
	CategoryFew:  {},
	CategoryMany: {},
}

var (
	cardinalCache sync.Map
	ordinalCache  sync.Map
)

var probeIntegers = []int{
	0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
	20, 21, 22, 24, 25, 100, 101, 102, 111, 1000, 10000, 100000, 1000000, 2000000,
}

// Unreachable returns CLDR plural categories in options that locale never selects.
// Exact matches such as "=0" and the required "other" case are ignored.
// An empty or unparsable locale produces no findings.
func Unreachable(locale, pluralType string, options []string) []string {
	allowed := Categories(locale, pluralType)
	if allowed == nil {
		return nil
	}
	var out []string
	seen := map[string]struct{}{}
	for _, option := range options {
		if _, ok := cldrCategories[option]; !ok {
			continue
		}
		if _, ok := allowed[option]; ok {
			continue
		}
		if _, ok := seen[option]; ok {
			continue
		}
		seen[option] = struct{}{}
		out = append(out, option)
	}
	return out
}

// Categories returns the CLDR category set for locale, not including "other".
func Categories(locale, pluralType string) map[string]struct{} {
	tag, err := language.Parse(locale)
	if err != nil {
		return nil
	}
	base, confidence := tag.Base()
	if confidence == language.No {
		return nil
	}
	cacheKey := base.String()
	cache := &cardinalCache
	rules := plural.Cardinal
	if pluralType == "selectordinal" {
		cache = &ordinalCache
		rules = plural.Ordinal
	}
	if cached, ok := cache.Load(cacheKey); ok {
		return cached.(map[string]struct{})
	}
	found := probeCategories(rules, tag)
	actual, _ := cache.LoadOrStore(cacheKey, found)
	return actual.(map[string]struct{})
}

func probeCategories(rules *plural.Rules, tag language.Tag) map[string]struct{} {
	found := map[string]struct{}{}
	for _, n := range probeIntegers {
		if name := formName(rules.MatchPlural(tag, n, 0, 0, 0, 0)); name != "" {
			found[name] = struct{}{}
		}
	}
	for _, n := range []int{0, 1, 2} {
		if name := formName(rules.MatchPlural(tag, n, 1, 1, 1, 0)); name != "" {
			found[name] = struct{}{}
		}
	}
	return found
}

func formName(form plural.Form) string {
	switch form {
	case plural.Zero:
		return CategoryZero
	case plural.One:
		return CategoryOne
	case plural.Two:
		return CategoryTwo
	case plural.Few:
		return CategoryFew
	case plural.Many:
		return CategoryMany
	default:
		return ""
	}
}
