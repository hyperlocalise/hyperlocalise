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
	sourceAnalysis := analyzeScoringText(srcTrimmed)
	translatedAnalysis := analyzeScoringText(translatedTrimmed)
	referenceNormalized := ""
	if referenceTrimmed != "" {
		referenceNormalized = normalizeText(referenceTrimmed)
	}
	tagFlags := analyzeTags(tags)

	result.PlaceholderIntegrity = tokenIntegrityScore(sourceAnalysis.placeholderCounts, sourceAnalysis.placeholderTotal, translatedAnalysis.placeholderCounts)
	result.TagIntegrity = tokenIntegrityScore(sourceAnalysis.tagCounts, sourceAnalysis.tagTotal, translatedAnalysis.tagCounts)
	result.LengthCompliance = lengthComplianceScore(srcTrimmed, translatedTrimmed, tagFlags.hasUI)
	result.TermCompliance = termComplianceScore(translatedTrimmed, tagFlags.forbiddenTerms)
	result.LocaleValidity = localeValidityScore(targetLocale, translatedTrimmed)
	lengthApplicable := tagFlags.hasUI
	termApplicable := len(tagFlags.forbiddenTerms) > 0
	result.Details["placeholderIntegrity"] = round3(result.PlaceholderIntegrity)
	result.Details["tagIntegrity"] = round3(result.TagIntegrity)
	result.Details["lengthCompliance"] = round3(result.LengthCompliance)
	result.Details["termCompliance"] = round3(result.TermCompliance)
	result.Details["localeValidity"] = round3(result.LocaleValidity)

	hardFailSet := map[string]struct{}{}
	if translatedTrimmed == "" {
		hardFailSet[HardFailEmptyOutput] = struct{}{}
	}
	if sourceAnalysis.normalized == translatedAnalysis.normalized {
		hardFailSet[HardFailSourceCopied] = struct{}{}
	}

	if sourceAnalysis.icuErr == nil && sourceAnalysis.hasICUContent && translatedAnalysis.icuErr != nil {
		hardFailSet[HardFailMalformedICU] = struct{}{}
	}
	if sourceAnalysis.icuErr == nil && translatedAnalysis.icuErr == nil && !sameBlocks(sourceAnalysis.icuBlocks, translatedAnalysis.icuBlocks) {
		hardFailSet[HardFailPlaceholderDrop] = struct{}{}
	}
	if result.PlaceholderIntegrity < 1 {
		hardFailSet[HardFailPlaceholderDrop] = struct{}{}
	}
	if result.TagIntegrity < 1 {
		hardFailSet[HardFailTagMismatch] = struct{}{}
	}
	if lengthApplicable && result.LengthCompliance < 1 {
		hardFailSet[HardFailLengthOutOfBound] = struct{}{}
	}
	if termApplicable && result.TermCompliance < 1 {
		hardFailSet[HardFailForbiddenTerms] = struct{}{}
	}
	if result.LocaleValidity < 1 {
		hardFailSet[HardFailInvalidLocale] = struct{}{}
	}

	numerator := result.PlaceholderIntegrity*e.weights.PlaceholderIntegrity +
		result.TagIntegrity*e.weights.TagIntegrity +
		result.LocaleValidity*e.weights.LocaleValidity
	denominator := e.weights.PlaceholderIntegrity + e.weights.TagIntegrity + e.weights.LocaleValidity
	if lengthApplicable {
		numerator += result.LengthCompliance * e.weights.LengthCompliance
		denominator += e.weights.LengthCompliance
	}
	if termApplicable {
		numerator += result.TermCompliance * e.weights.TermCompliance
		denominator += e.weights.TermCompliance
	}

	if referenceTrimmed != "" {
		exact := 0.0
		if translatedTrimmed == referenceTrimmed {
			exact = 1
		}
		norm := 0.0
		if translatedAnalysis.normalized == referenceNormalized {
			norm = 1
		}
		sim := tokenF1Normalized(referenceNormalized, translatedAnalysis.normalized)
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

type scoringTextAnalysis struct {
	normalized        string
	placeholderCounts map[string]int
	placeholderTotal  int
	tagCounts         map[string]int
	tagTotal          int
	icuBlocks         []icuparser.BlockSignature
	icuErr            error
	hasICUContent     bool
}

type tagAnalysis struct {
	hasUI          bool
	forbiddenTerms []string
}

func analyzeScoringText(text string) scoringTextAnalysis {
	inv, err := icuparser.ParseInvariant(text)
	placeholderCounts, placeholderTotal := placeholderTokenCounts(text, inv, err)
	tagCounts, tagTotal := tagTokenCounts(text)
	return scoringTextAnalysis{
		normalized:        normalizeText(text),
		placeholderCounts: placeholderCounts,
		placeholderTotal:  placeholderTotal,
		tagCounts:         tagCounts,
		tagTotal:          tagTotal,
		icuBlocks:         inv.ICUBlocks,
		icuErr:            err,
		hasICUContent:     len(inv.Placeholders) > 0 || len(inv.ICUBlocks) > 0,
	}
}

func analyzeTags(tags []string) tagAnalysis {
	out := tagAnalysis{}
	for _, tag := range tags {
		normalizedTag := strings.ToLower(strings.TrimSpace(tag))
		if normalizedTag == "" {
			continue
		}
		if normalizedTag == "ui" {
			out.hasUI = true
			continue
		}
		if strings.HasPrefix(normalizedTag, "forbidden:") {
			term := strings.TrimSpace(strings.TrimPrefix(normalizedTag, "forbidden:"))
			if term != "" {
				out.forbiddenTerms = append(out.forbiddenTerms, term)
			}
		}
	}
	return out
}

var (
	bracePlaceholderPattern  = regexp.MustCompile(`\{\s*([A-Za-z_$][A-Za-z0-9_.$-]*)\s*\}`)
	printfPlaceholderPattern = regexp.MustCompile(`%(?:\[[0-9]+\])?[-+#0 ]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[hlLzjt]*[bcdeEfFgGosxXqvTt]`)
	htmlTagPattern           = regexp.MustCompile(`</?[A-Za-z][A-Za-z0-9-]*(?:\s+[^>]+)?>`)
	markdownTokenPattern     = regexp.MustCompile(`(\*\*|__|~~|` + "`" + `|\[[^\]]*\]\([^\)]*\)|#+\s)`)
)

func tokenIntegrityScore(sourceCount map[string]int, sourceTotal int, translatedCount map[string]int) float64 {
	if sourceTotal == 0 {
		return 1
	}
	matched := 0
	for token, count := range sourceCount {
		matched += min(count, translatedCount[token])
	}
	return float64(matched) / float64(sourceTotal)
}

func lengthComplianceScore(source, translated string, hasUITag bool) float64 {
	if !hasUITag {
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

func termComplianceScore(translated string, forbiddenTerms []string) float64 {
	translatedLower := strings.ToLower(translated)
	for _, term := range forbiddenTerms {
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

func tagTokenCounts(s string) (map[string]int, int) {
	tokens := make(map[string]int)
	total := 0
	for _, match := range htmlTagPattern.FindAllString(s, -1) {
		tokens["html:"+strings.ToLower(strings.TrimSpace(match))]++
		total++
	}
	for _, match := range markdownTokenPattern.FindAllString(s, -1) {
		tokens["md:"+strings.TrimSpace(match)]++
		total++
	}
	return tokens, total
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
	inv, err := icuparser.ParseInvariant(s)
	counts, total := placeholderTokenCounts(s, inv, err)
	if total == 0 {
		return nil
	}
	tokens := make([]string, 0, total)
	for token, count := range counts {
		for range count {
			tokens = append(tokens, token)
		}
	}
	sort.Strings(tokens)
	return dedupAdjacent(tokens)
}

func placeholderTokenCounts(s string, inv icuparser.Invariant, err error) (map[string]int, int) {
	tokens := make(map[string]int)
	total := 0
	if err == nil {
		for _, ph := range inv.Placeholders {
			tokens[fmt.Sprintf("icu:%s", ph)]++
			total++
		}
		for _, block := range inv.ICUBlocks {
			tokens[fmt.Sprintf("icu-block:%s:%s:%s", block.Arg, block.Type, strings.Join(block.Options, ","))]++
			total++
		}
	}
	for _, match := range bracePlaceholderPattern.FindAllStringSubmatch(s, -1) {
		tokens[fmt.Sprintf("brace:%s", match[1])]++
		total++
	}
	for _, match := range printfPlaceholderPattern.FindAllString(s, -1) {
		tokens[fmt.Sprintf("printf:%s", match)]++
		total++
	}
	return tokens, total
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
	return tokenF1Normalized(normalizeText(reference), normalizeText(candidate))
}

func tokenF1Normalized(reference, candidate string) float64 {
	r := tokenizeNormalized(reference)
	c := tokenizeNormalized(candidate)
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

func tokenizeNormalized(s string) []string {
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
