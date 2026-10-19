package translationfileparser

import (
	"strconv"
	"strings"
)

const (
	// poKeySeparator matches Phrase Strings: msgctxt and msgid join as "context||msgid".
	// Plural categories append the same way: "msgid||one", "context||msgid||other".
	poKeySeparator = "||"

	poMaxPluralForms = 18
)

// poPluralSpec is one GNU gettext plural rule with CLDR category names in msgstr index order.
// Crowdin and Phrase write these Plural-Forms headers and label the slots with the same categories.
type poPluralSpec struct {
	categories []string
	formula    string
}

func (s poPluralSpec) nplurals() int {
	return len(s.categories)
}

func (s poPluralSpec) headerValue() string {
	return "nplurals=" + strconv.Itoa(s.nplurals()) + "; plural=" + s.formula + ";"
}

var (
	poPluralOther  = poPluralSpec{categories: []string{"other"}, formula: "0"}
	poPluralTwo    = poPluralSpec{categories: []string{"one", "other"}, formula: "(n != 1)"}
	poPluralFrench = poPluralSpec{categories: []string{"one", "other"}, formula: "(n > 1)"}
	poPluralCzech  = poPluralSpec{
		categories: []string{"one", "few", "other"},
		formula:    "(n==1) ? 0 : (n>=2 && n<=4) ? 1 : 2",
	}
	poPluralSlavic = poPluralSpec{
		categories: []string{"one", "few", "many"},
		formula:    "(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2)",
	}
	// Croatian, Serbian, and Bosnian share the Slavic formula. CLDR names the
	// last slot "other" rather than Russian "many".
	poPluralSlavicOther = poPluralSpec{
		categories: []string{"one", "few", "other"},
		formula:    poPluralSlavic.formula,
	}
	poPluralPolish = poPluralSpec{
		categories: []string{"one", "few", "many", "other"},
		formula:    "(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : n%100>=10 && n%100<=20 ? 2 : 3)",
	}
	poPluralSlovenian = poPluralSpec{
		categories: []string{"one", "two", "few", "other"},
		formula:    "(n%100==1 ? 0 : n%100==2 ? 1 : n%100==3 || n%100==4 ? 2 : 3)",
	}
	poPluralRomanian = poPluralSpec{
		categories: []string{"one", "few", "other"},
		formula:    "(n==1 ? 0 : (n==0 || (n%100 > 0 && n%100 < 20)) ? 1 : 2)",
	}
	poPluralLithuanian = poPluralSpec{
		categories: []string{"one", "few", "other"},
		formula:    "(n%10==1 && n%100!=11 ? 0 : n%10>=2 && (n%100<10 || n%100>=20) ? 1 : 2)",
	}
	poPluralArabic = poPluralSpec{
		categories: []string{"zero", "one", "two", "few", "many", "other"},
		formula:    "(n==0 ? 0 : n==1 ? 1 : n==2 ? 2 : n%100>=3 && n%100<=10 ? 3 : n%100>=11 ? 4 : 5)",
	}
)

var (
	poPluralByLanguage map[string]poPluralSpec
	poPluralByFormula  map[string]poPluralSpec
)

func init() {
	specs := []poPluralSpec{
		poPluralOther,
		poPluralTwo,
		poPluralFrench,
		poPluralCzech,
		poPluralSlavic,
		poPluralPolish,
		poPluralSlovenian,
		poPluralRomanian,
		poPluralLithuanian,
		poPluralArabic,
	}
	poPluralByFormula = make(map[string]poPluralSpec, len(specs))
	for _, spec := range specs {
		poPluralByFormula[normalizePOPluralFormula(spec.formula)] = spec
	}

	poPluralByLanguage = map[string]poPluralSpec{}
	for _, lang := range []string{"ja", "zh", "ko", "vi", "id", "th", "ms", "my", "km", "lo", "jv"} {
		poPluralByLanguage[lang] = poPluralOther
	}
	for _, lang := range []string{
		"en", "de", "nl", "sv", "da", "no", "nb", "nn", "fi", "et", "hu", "el", "he", "it", "es", "pt", "ca", "bg", "tr", "sq",
	} {
		poPluralByLanguage[lang] = poPluralTwo
	}
	poPluralByLanguage["fr"] = poPluralFrench
	poPluralByLanguage["cs"] = poPluralCzech
	poPluralByLanguage["sk"] = poPluralCzech
	for _, lang := range []string{"ru", "uk", "be"} {
		poPluralByLanguage[lang] = poPluralSlavic
	}
	for _, lang := range []string{"hr", "sr", "bs"} {
		poPluralByLanguage[lang] = poPluralSlavicOther
	}
	poPluralByLanguage["pl"] = poPluralPolish
	poPluralByLanguage["sl"] = poPluralSlovenian
	poPluralByLanguage["ro"] = poPluralRomanian
	poPluralByLanguage["lt"] = poPluralLithuanian
	poPluralByLanguage["ar"] = poPluralArabic
}

func normalizePOPluralFormula(formula string) string {
	return strings.Map(func(r rune) rune {
		switch r {
		case ' ', '\t', '\n', '\r':
			return -1
		default:
			return r
		}
	}, strings.TrimSpace(formula))
}

func poLanguageSubtag(locale string) string {
	locale = strings.TrimSpace(locale)
	locale = strings.ReplaceAll(locale, "_", "-")
	if i := strings.IndexByte(locale, '.'); i >= 0 {
		locale = locale[:i]
	}
	if i := strings.IndexByte(locale, '@'); i >= 0 {
		locale = locale[:i]
	}
	if i := strings.IndexByte(locale, '-'); i >= 0 {
		locale = locale[:i]
	}
	return strings.ToLower(locale)
}

func poHeaderLanguage(locale string) string {
	locale = strings.TrimSpace(locale)
	if locale == "" {
		return ""
	}
	return strings.ReplaceAll(locale, "-", "_")
}

func poPluralSpecForLanguage(language string) (poPluralSpec, bool) {
	spec, ok := poPluralByLanguage[poLanguageSubtag(language)]
	return spec, ok
}

func poPluralSpecForLocale(locale string) poPluralSpec {
	if spec, ok := poPluralSpecForLanguage(locale); ok {
		return spec
	}
	return poPluralTwo
}

func poPluralSpecByFormula(formula string) (poPluralSpec, bool) {
	spec, ok := poPluralByFormula[normalizePOPluralFormula(formula)]
	return spec, ok
}

// parsePOPluralForms reads "nplurals=N; plural=EXPR;". Placeholder headers such as
// "nplurals=INTEGER; plural=EXPRESSION;" are rejected.
func parsePOPluralForms(header string) (n int, formula string, ok bool) {
	header = strings.TrimSpace(header)
	idx := strings.Index(header, "nplurals=")
	if idx < 0 {
		return 0, "", false
	}
	rest := header[idx+len("nplurals="):]
	end := 0
	for end < len(rest) && rest[end] >= '0' && rest[end] <= '9' {
		end++
	}
	if end == 0 {
		return 0, "", false
	}
	parsed, err := strconv.Atoi(rest[:end])
	if err != nil || parsed <= 0 || parsed > poMaxPluralForms {
		return 0, "", false
	}
	pidx := strings.Index(header, "plural=")
	if pidx < 0 {
		return parsed, "", true
	}
	formula = strings.TrimSpace(header[pidx+len("plural="):])
	if cut, _, found := strings.Cut(formula, ";"); found {
		formula = cut
	}
	formula = strings.TrimSpace(formula)
	return parsed, formula, true
}

// poCategoriesForCatalog chooses msgstr index names from the catalog header.
// explicitForms is how many msgstr slots the entry actually contains.
func poCategoriesForCatalog(language, pluralHeader string, explicitForms int) []string {
	if n, formula, ok := parsePOPluralForms(pluralHeader); ok {
		formulaSpec, formulaOK := poPluralSpecByFormula(formula)
		langSpec, langOK := poPluralSpecForLanguage(language)
		// The same gettext expression can name its last slot differently.
		// Prefer the language when it uses that expression, so a Croatian
		// catalog is one/few/other while an English file that copied the
		// Russian header stays one/few/many.
		if formulaOK && formulaSpec.nplurals() == n && langOK && langSpec.nplurals() == n &&
			normalizePOPluralFormula(langSpec.formula) == normalizePOPluralFormula(formula) {
			return langSpec.categories
		}
		if formulaOK && formulaSpec.nplurals() == n {
			return formulaSpec.categories
		}
		if langOK && langSpec.nplurals() == n {
			return langSpec.categories
		}
		if explicitForms == 0 || explicitForms == n {
			switch n {
			case 1:
				return poPluralOther.categories
			case 2:
				return poPluralTwo.categories
			default:
				return poIndexedCategories(n)
			}
		}
	}
	if spec, ok := poPluralSpecForLanguage(language); ok {
		if explicitForms == 0 || explicitForms == 1 || explicitForms == spec.nplurals() {
			return spec.categories
		}
	}
	if explicitForms <= 2 {
		return poPluralTwo.categories
	}
	return poIndexedCategories(explicitForms)
}

func poIndexedCategories(n int) []string {
	if n < 1 {
		n = 1
	}
	if n > poMaxPluralForms {
		n = poMaxPluralForms
	}
	out := make([]string, n)
	for i := 0; i < n; i++ {
		out[i] = "plural" + strconv.Itoa(i)
	}
	return out
}

func poCategoryAt(categories []string, index int) string {
	if index >= 0 && index < len(categories) {
		return categories[index]
	}
	return "plural" + strconv.Itoa(index)
}

func poMessageKey(msgctxt, msgid string) string {
	if msgctxt == "" {
		return msgid
	}
	return msgctxt + poKeySeparator + msgid
}

func poPluralFormKey(base, category string) string {
	return base + poKeySeparator + category
}

func poPluralSlotCount(explicit int, categories []string) int {
	if explicit < 0 {
		explicit = 0
	}
	if len(categories) > explicit {
		return len(categories)
	}
	if explicit == 0 {
		return 1
	}
	return explicit
}
