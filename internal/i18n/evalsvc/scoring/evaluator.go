package scoring

import (
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"github.com/quiet-circles/hyperlocalise/internal/i18n/icuparser"
	"golang.org/x/text/language"
)

const (
	HardFailEmptyOutput      = "empty_output"
	HardFailSourceCopied     = "source_copied_unchanged"
	HardFailMalformedICU     = "malformed_icu"
	HardFailPlaceholderDrop  = "placeholder_integrity_failed"
	HardFailTagMismatch      = "tag_integrity_failed"
	HardFailLengthOutOfBound = "length_bounds_failed"
	HardFailForbiddenTerms   = "forbidden_terms_failed"
	HardFailInvalidLocale    = "locale_script_invalid"
)

type Weights struct {
	PlaceholderIntegrity float64
	TagIntegrity         float64
	LengthCompliance     float64
	TermCompliance       float64
	LocaleValidity       float64
	ReferenceExact       float64
	ReferenceNormalized  float64
	ReferenceSimilarity  float64
}

type Result struct {
	PlaceholderIntegrity float64            `json:"placeholderIntegrity"`
	TagIntegrity         float64            `json:"tagIntegrity"`
	LengthCompliance     float64            `json:"lengthCompliance"`
	TermCompliance       float64            `json:"termCompliance"`
	LocaleValidity       float64            `json:"localeValidity"`
	ReferenceExact       *float64           `json:"referenceExact,omitempty"`
	ReferenceNormalized  *float64           `json:"referenceNormalized,omitempty"`
	ReferenceSimilarity  *float64           `json:"referenceSimilarity,omitempty"`
	WeightedAggregate    float64            `json:"weightedAggregate"`
	HardFails            []string           `json:"hardFails,omitempty"`
	Details              map[string]float64 `json:"details,omitempty"`
}

type Evaluator struct {
	weights Weights
}

func NewEvaluator() *Evaluator {
	return &Evaluator{weights: Weights{
		PlaceholderIntegrity: 0.3,
		TagIntegrity:         0.2,
		LengthCompliance:     0.1,
		TermCompliance:       0.05,
		LocaleValidity:       0.05,
		ReferenceExact:       0.1,
		ReferenceNormalized:  0.1,
		ReferenceSimilarity:  0.1,
	}}
}

func (e *Evaluator) Evaluate(source, translated, reference, targetLocale string, tags []string) Result {
	result := Result{Details: map[string]float64{}}

	srcTrimmed := strings.TrimSpace(source)
	translatedTrimmed := strings.TrimSpace(translated)
	referenceTrimmed := strings.TrimSpace(reference)

	result.PlaceholderIntegrity = placeholderIntegrityScore(srcTrimmed, translatedTrimmed)
	result.TagIntegrity = tagIntegrityScore(srcTrimmed, translatedTrimmed)
	result.LengthCompliance = lengthComplianceScore(srcTrimmed, translatedTrimmed, tags)
	result.TermCompliance = termComplianceScore(translatedTrimmed, tags)
	result.LocaleValidity = localeValidityScore(targetLocale, translatedTrimmed)
	result.Details["placeholderIntegrity"] = round3(result.PlaceholderIntegrity)
	result.Details["tagIntegrity"] = round3(result.TagIntegrity)
	result.Details["lengthCompliance"] = round3(result.LengthCompliance)
	result.Details["termCompliance"] = round3(result.TermCompliance)
	result.Details["localeValidity"] = round3(result.LocaleValidity)

	hardFailSet := map[string]struct{}{}
	if translatedTrimmed == "" {
		hardFailSet[HardFailEmptyOutput] = struct{}{}
	}
	if normalizeText(source) == normalizeText(translated) {
		hardFailSet[HardFailSourceCopied] = struct{}{}
	}

	srcInv, srcErr := icuparser.ParseInvariant(srcTrimmed)
	translatedInv, translatedErr := icuparser.ParseInvariant(translatedTrimmed)
	if srcErr == nil && (len(srcInv.Placeholders) > 0 || len(srcInv.ICUBlocks) > 0) && translatedErr != nil {
		hardFailSet[HardFailMalformedICU] = struct{}{}
	}
	if srcErr == nil && translatedErr == nil && !sameBlocks(srcInv.ICUBlocks, translatedInv.ICUBlocks) {
		hardFailSet[HardFailPlaceholderDrop] = struct{}{}
	}
	if result.PlaceholderIntegrity < 1 {
		hardFailSet[HardFailPlaceholderDrop] = struct{}{}
	}
	if result.TagIntegrity < 1 {
		hardFailSet[HardFailTagMismatch] = struct{}{}
	}
	if result.LengthCompliance < 1 {
		hardFailSet[HardFailLengthOutOfBound] = struct{}{}
	}
	if result.TermCompliance < 1 {
		hardFailSet[HardFailForbiddenTerms] = struct{}{}
	}
	if result.LocaleValidity < 1 {
		hardFailSet[HardFailInvalidLocale] = struct{}{}
	}

	numerator := result.PlaceholderIntegrity*e.weights.PlaceholderIntegrity +
		result.TagIntegrity*e.weights.TagIntegrity +
		result.LengthCompliance*e.weights.LengthCompliance +
		result.TermCompliance*e.weights.TermCompliance +
		result.LocaleValidity*e.weights.LocaleValidity
	denominator := e.weights.PlaceholderIntegrity + e.weights.TagIntegrity + e.weights.LengthCompliance + e.weights.TermCompliance + e.weights.LocaleValidity

	if referenceTrimmed != "" {
		exact := 0.0
		if translatedTrimmed == referenceTrimmed {
			exact = 1
		}
		norm := 0.0
		if normalizeText(translatedTrimmed) == normalizeText(referenceTrimmed) {
			norm = 1
		}
		sim := tokenF1(referenceTrimmed, translatedTrimmed)
		result.ReferenceExact = &exact
		result.ReferenceNormalized = &norm
		result.ReferenceSimilarity = &sim
		result.Details["referenceExact"] = round3(exact)
		result.Details["referenceNormalized"] = round3(norm)
		result.Details["referenceSimilarity"] = round3(sim)
		numerator += exact*e.weights.ReferenceExact + norm*e.weights.ReferenceNormalized + sim*e.weights.ReferenceSimilarity
		denominator += e.weights.ReferenceExact + e.weights.ReferenceNormalized + e.weights.ReferenceSimilarity
	}

	if denominator > 0 {
		result.WeightedAggregate = numerator / denominator
	}

	if len(hardFailSet) > 0 {
		result.HardFails = make([]string, 0, len(hardFailSet))
		for fail := range hardFailSet {
			result.HardFails = append(result.HardFails, fail)
		}
		sort.Strings(result.HardFails)
		result.WeightedAggregate = 0
	}

	result.WeightedAggregate = round3(result.WeightedAggregate)
	return result
}

var (
	bracePlaceholderPattern  = regexp.MustCompile(`\{\s*([A-Za-z_$][A-Za-z0-9_.$-]*)\s*\}`)
	printfPlaceholderPattern = regexp.MustCompile(`%(?:\[[0-9]+\])?[-+#0 ]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[hlLzjt]*[bcdeEfFgGosxXqvTt]`)
	htmlTagPattern           = regexp.MustCompile(`</?[A-Za-z][A-Za-z0-9-]*(?:\s+[^>]+)?>`)
	markdownTokenPattern     = regexp.MustCompile(`(\*\*|__|~~|` + "`" + `|\[[^\]]*\]\([^\)]*\)|#+\s)`)
)

func placeholderIntegrityScore(source, translated string) float64 {
	sourceTokens := placeholderTokens(source)
	if len(sourceTokens) == 0 {
		return 1
	}
	translatedTokens := placeholderTokens(translated)

	sourceCount := map[string]int{}
	for _, token := range sourceTokens {
		sourceCount[token]++
	}
	translatedCount := map[string]int{}
	for _, token := range translatedTokens {
		translatedCount[token]++
	}

	matched := 0
	for token, count := range sourceCount {
		matched += min(count, translatedCount[token])
	}
	return float64(matched) / float64(len(sourceTokens))
}

func tagIntegrityScore(source, translated string) float64 {
	sourceTokens := tagTokens(source)
	if len(sourceTokens) == 0 {
		return 1
	}
	translatedTokens := tagTokens(translated)
	sourceCount := map[string]int{}
	translatedCount := map[string]int{}
	for _, token := range sourceTokens {
		sourceCount[token]++
	}
	for _, token := range translatedTokens {
		translatedCount[token]++
	}
	matched := 0
	for token, count := range sourceCount {
		matched += min(count, translatedCount[token])
	}
	return float64(matched) / float64(len(sourceTokens))
}

func lengthComplianceScore(source, translated string, tags []string) float64 {
	if !hasTag(tags, "ui") {
		return 1
	}
	srcLen := len([]rune(strings.TrimSpace(source)))
	transLen := len([]rune(strings.TrimSpace(translated)))
	if srcLen == 0 {
		if transLen == 0 {
			return 1
		}
		return 0
	}
	minLen := int(math.Ceil(float64(srcLen) * 0.5))
	maxLen := int(math.Ceil(float64(srcLen) * 1.8))
	if transLen < minLen || transLen > maxLen {
		return 0
	}
	return 1
}

func termComplianceScore(translated string, tags []string) float64 {
	translatedLower := strings.ToLower(translated)
	for _, tag := range tags {
		normalizedTag := strings.ToLower(strings.TrimSpace(tag))
		if !strings.HasPrefix(normalizedTag, "forbidden:") {
			continue
		}
		term := strings.TrimSpace(strings.TrimPrefix(normalizedTag, "forbidden:"))
		if term == "" {
			continue
		}
		if strings.Contains(translatedLower, term) {
			return 0
		}
	}
	return 1
}

func localeValidityScore(targetLocale, translated string) float64 {
	if strings.TrimSpace(targetLocale) == "" {
		return 1
	}
	tag, err := language.Parse(strings.TrimSpace(targetLocale))
	if err != nil {
		return 0
	}
	script, _ := tag.Script()
	if !script.IsPrivateUse() && script.String() != "Zzzz" {
		if !containsScriptRune(translated, script.String()) {
			if hasLetter(translated) {
				return 0
			}
		}
	}
	return 1
}

func containsScriptRune(text, script string) bool {
	table := unicodeRangeTableForScript(script)
	if table == nil {
		return true
	}
	for _, r := range text {
		if unicode.In(r, table) {
			return true
		}
	}
	return false
}

func hasLetter(text string) bool {
	for _, r := range text {
		if unicode.IsLetter(r) {
			return true
		}
	}
	return false
}

func hasTag(tags []string, target string) bool {
	for _, tag := range tags {
		if strings.EqualFold(strings.TrimSpace(tag), target) {
			return true
		}
	}
	return false
}

func tagTokens(s string) []string {
	tokens := make([]string, 0)
	for _, match := range htmlTagPattern.FindAllString(s, -1) {
		tokens = append(tokens, "html:"+strings.ToLower(strings.TrimSpace(match)))
	}
	for _, match := range markdownTokenPattern.FindAllString(s, -1) {
		tokens = append(tokens, "md:"+strings.TrimSpace(match))
	}
	sort.Strings(tokens)
	return tokens
}

func unicodeRangeTableForScript(script string) *unicode.RangeTable {
	switch script {
	case "Arab":
		return unicode.Arabic
	case "Armn":
		return unicode.Armenian
	case "Beng":
		return unicode.Bengali
	case "Cans":
		return unicode.Canadian_Aboriginal
	case "Cher":
		return unicode.Cherokee
	case "Cyrl":
		return unicode.Cyrillic
	case "Deva":
		return unicode.Devanagari
	case "Ethi":
		return unicode.Ethiopic
	case "Geor":
		return unicode.Georgian
	case "Grek":
		return unicode.Greek
	case "Gujr":
		return unicode.Gujarati
	case "Guru":
		return unicode.Gurmukhi
	case "Hang":
		return unicode.Hangul
	case "Hans", "Hant", "Hani", "Jpan":
		return unicode.Han
	case "Hebr":
		return unicode.Hebrew
	case "Hira":
		return unicode.Hiragana
	case "Kana":
		return unicode.Katakana
	case "Khmr":
		return unicode.Khmer
	case "Knda":
		return unicode.Kannada
	case "Laoo":
		return unicode.Lao
	case "Latn":
		return unicode.Latin
	case "Mlym":
		return unicode.Malayalam
	case "Mong":
		return unicode.Mongolian
	case "Mymr":
		return unicode.Myanmar
	case "Orya":
		return unicode.Oriya
	case "Sinh":
		return unicode.Sinhala
	case "Taml":
		return unicode.Tamil
	case "Telu":
		return unicode.Telugu
	case "Thai":
		return unicode.Thai
	case "Tibt":
		return unicode.Tibetan
	default:
		return nil
	}
}

func placeholderTokens(s string) []string {
	tokens := make([]string, 0)
	inv, err := icuparser.ParseInvariant(s)
	if err == nil {
		for _, ph := range inv.Placeholders {
			tokens = append(tokens, fmt.Sprintf("icu:%s", ph))
		}
		for _, block := range inv.ICUBlocks {
			tokens = append(tokens, fmt.Sprintf("icu-block:%s:%s:%s", block.Arg, block.Type, strings.Join(block.Options, ",")))
		}
	}
	for _, match := range bracePlaceholderPattern.FindAllStringSubmatch(s, -1) {
		tokens = append(tokens, fmt.Sprintf("brace:%s", match[1]))
	}
	for _, match := range printfPlaceholderPattern.FindAllString(s, -1) {
		tokens = append(tokens, fmt.Sprintf("printf:%s", match))
	}
	sort.Strings(tokens)
	return dedupAdjacent(tokens)
}

func sameBlocks(a, b []icuparser.BlockSignature) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].Arg != b[i].Arg || a[i].Type != b[i].Type || strings.Join(a[i].Options, "|") != strings.Join(b[i].Options, "|") {
			return false
		}
	}
	return true
}

func tokenF1(reference, candidate string) float64 {
	r := tokenize(reference)
	c := tokenize(candidate)
	if len(r) == 0 && len(c) == 0 {
		return 1
	}
	if len(r) == 0 || len(c) == 0 {
		return 0
	}
	rCount := map[string]int{}
	for _, tok := range r {
		rCount[tok]++
	}
	cCount := map[string]int{}
	for _, tok := range c {
		cCount[tok]++
	}
	matches := 0
	for tok, cnt := range rCount {
		matches += min(cnt, cCount[tok])
	}
	precision := float64(matches) / float64(len(c))
	recall := float64(matches) / float64(len(r))
	if precision+recall == 0 {
		return 0
	}
	return 2 * precision * recall / (precision + recall)
}

func tokenize(s string) []string {
	s = normalizeText(s)
	if s == "" {
		return nil
	}
	return strings.Fields(s)
}

func normalizeText(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return ""
	}
	var b strings.Builder
	lastSpace := false
	for _, r := range s {
		if unicode.IsPunct(r) && r != '_' && r != '$' && r != '%' && r != '{' && r != '}' {
			continue
		}
		if unicode.IsSpace(r) {
			if !lastSpace {
				b.WriteByte(' ')
				lastSpace = true
			}
			continue
		}
		lastSpace = false
		b.WriteRune(r)
	}
	return strings.TrimSpace(b.String())
}

func dedupAdjacent(items []string) []string {
	if len(items) == 0 {
		return nil
	}
	out := items[:1]
	for i := 1; i < len(items); i++ {
		if items[i] != items[i-1] {
			out = append(out, items[i])
		}
	}
	return out
}

func round3(v float64) float64 {
	return math.Round(v*1000) / 1000
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
