package main

import (
	"math"
	"regexp"
	"sort"
	"strings"
	"unicode"
)

type knowledgeMemoryPreviewSegment struct {
	ID          string   `json:"id"`
	HeadingPath []string `json:"headingPath"`
	StartLine   int      `json:"startLine"`
	EndLine     int      `json:"endLine"`
	Preview     string   `json:"preview"`
}

type knowledgeMemoryPreviewMetrics struct {
	SelectedMemoryCount int      `json:"selectedMemoryCount"`
	SelectedMemoryChars int      `json:"selectedMemoryChars"`
	WholeMemoryChars    int      `json:"wholeMemoryChars"`
	ReductionPercent    float64  `json:"reductionPercent"`
	MatchedHeadingPaths []string `json:"matchedHeadingPaths"`
	FallbackMode        string   `json:"fallbackMode"`
}

type knowledgeMemoryPreview struct {
	CompactText string                          `json:"compactText"`
	Segments    []knowledgeMemoryPreviewSegment `json:"segments"`
	Metrics     knowledgeMemoryPreviewMetrics   `json:"metrics"`
}

type knowledgeMemoryHeading struct {
	Level int
	Text  string
}

type knowledgeMemorySegment struct {
	ID          string
	HeadingPath []string
	Text        string
	SearchText  string
	StartLine   int
	EndLine     int
	StartOffset int
}

type rankedKnowledgeMemorySegment struct {
	segment knowledgeMemorySegment
	score   int
}

var (
	knowledgeMemoryHeadingPattern = regexp.MustCompile(`^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$`)
	knowledgeMemoryBulletPattern  = regexp.MustCompile(`^\s*(?:[-*+]\s+|\d+[.)]\s+)`)
	knowledgeMemoryLocalePattern  = regexp.MustCompile(`^[a-z]{2,3}(?:[-_][a-z0-9]{1,8})*$`)
)

var knowledgeMemoryStopWords = map[string]struct{}{
	"a": {}, "an": {}, "and": {}, "are": {}, "as": {}, "be": {}, "copy": {}, "for": {}, "from": {},
	"in": {}, "into": {}, "is": {}, "it": {}, "not": {}, "of": {}, "or": {}, "please": {}, "text": {},
	"the": {}, "to": {}, "translate": {}, "translated": {}, "translating": {}, "translation": {}, "using": {},
	"with": {}, "your": {},
}

var knowledgeMemoryTokenVariants = map[string][]string{
	"basket": {"cart"}, "cart": {"basket"}, "checkout": {"purchase"}, "color": {"colour"},
	"colors": {"colours"}, "colorful": {"colourful"}, "colored": {"coloured"},
	"customize": {"customise"}, "customized": {"customised"}, "customizes": {"customises"},
	"customizing": {"customising"}, "localize": {"localise"}, "localized": {"localised"},
	"localizes": {"localises"}, "localizing": {"localising"}, "localization": {"localisation"},
	"flow": {"funnel"}, "funnel": {"flow"}, "label": {"labels"}, "labels": {"label"},
	"organize": {"organise"}, "organized": {"organised"}, "organizes": {"organises"},
	"organizing": {"organising"}, "purchase": {"checkout"},
}

func init() {
	for token, variants := range knowledgeMemoryTokenVariants {
		for _, variant := range variants {
			if !containsString(knowledgeMemoryTokenVariants[variant], token) {
				knowledgeMemoryTokenVariants[variant] = append(knowledgeMemoryTokenVariants[variant], token)
			}
		}
	}
}

func selectKnowledgeMemoryContext(rawContent string, input knowledgeMemoryPreviewPayload) knowledgeMemoryPreview {
	content := normalizeKnowledgeMemoryForSelection(rawContent)
	wholeChars := utf16Length(content)
	if content == "" {
		return emptyKnowledgeMemoryPreview(0, "empty")
	}
	maxChars := knowledgeMemoryMaxPreview
	if input.MaxChars != nil {
		maxChars = *input.MaxChars
	}
	if wholeChars < maxChars {
		maxChars = wholeChars
	}
	if wholeChars <= knowledgeMemorySmallLimit && maxChars == wholeChars {
		return knowledgeMemoryPreview{
			CompactText: content,
			Segments:    []knowledgeMemoryPreviewSegment{},
			Metrics: knowledgeMemoryPreviewMetrics{
				SelectedMemoryChars: wholeChars,
				WholeMemoryChars:    wholeChars,
				MatchedHeadingPaths: []string{},
				FallbackMode:        "whole_small",
			},
		}
	}

	segments, headings := parseKnowledgeMemorySegments(content)
	if len(segments) == 0 {
		return rawKnowledgeMemoryFallback(content, headings, wholeChars, maxChars)
	}
	queryTokens, inputLocales := knowledgeMemoryQuery(input)
	ranked := rankKnowledgeMemorySegments(segments, queryTokens, inputLocales)
	if len(ranked) > 0 {
		selected := selectKnowledgeMemoryTargetSegments(ranked, input)
		selectedSegments := make([]knowledgeMemorySegment, 0, len(selected))
		for _, item := range selected {
			selectedSegments = append(selectedSegments, item.segment)
		}
		budget := balancedKnowledgeMemorySegmentBudget(maxChars, len(selectedSegments), 0)
		return buildKnowledgeMemorySelectedContext(content, wholeChars, maxChars, selectedSegments, "selective", "", queryTokens, inputLocales, budget)
	}

	if general := findGeneralKnowledgeMemorySegment(segments); general != nil {
		selected := []knowledgeMemorySegment{*general}
		preferred := defaultKnowledgeMemoryFallbackSegments(segments, general.ID)
		if len(preferred) == 0 {
			preferred = orderKnowledgeMemoryFallbackSegments(segments, general.ID)
		}
		for _, segment := range preferred {
			if len(selected) == 5 {
				break
			}
			selected = append(selected, segment)
		}
		headingText := buildKnowledgeMemoryHeadingFallback(content, headings)
		budget := balancedKnowledgeMemorySegmentBudget(maxChars, len(selected), utf16Length(headingText)+1)
		return buildKnowledgeMemorySelectedContext(content, wholeChars, maxChars, selected, "general", headingText, nil, inputLocales, budget)
	}

	preferred := defaultKnowledgeMemoryFallbackSegments(segments, "")
	if len(preferred) > 0 {
		headingText := buildKnowledgeMemoryHeadingFallback(content, headings)
		budget := balancedKnowledgeMemorySegmentBudget(maxChars, len(preferred), utf16Length(headingText)+1)
		return buildKnowledgeMemorySelectedContext(content, wholeChars, maxChars, preferred, "fallback", headingText, nil, inputLocales, budget)
	}
	all := orderKnowledgeMemoryFallbackSegments(segments, "")
	if len(all) > 5 {
		all = all[:5]
	}
	headingText := buildKnowledgeMemoryHeadingFallback(content, headings)
	budget := balancedKnowledgeMemorySegmentBudget(maxChars, len(all), utf16Length(headingText)+1)
	return buildKnowledgeMemorySelectedContext(content, wholeChars, maxChars, all, "fallback", headingText, nil, inputLocales, budget)
}

func emptyKnowledgeMemoryPreview(wholeChars int, fallbackMode string) knowledgeMemoryPreview {
	return knowledgeMemoryPreview{
		CompactText: "",
		Segments:    []knowledgeMemoryPreviewSegment{},
		Metrics: knowledgeMemoryPreviewMetrics{
			WholeMemoryChars:    wholeChars,
			ReductionPercent:    reductionPercent(wholeChars, 0),
			MatchedHeadingPaths: []string{},
			FallbackMode:        fallbackMode,
		},
	}
}

func normalizeKnowledgeMemoryForSelection(content string) string {
	content = strings.ReplaceAll(content, "\r\n", "\n")
	content = strings.ReplaceAll(content, "\r", "\n")
	return javascriptTrim(content)
}

func parseKnowledgeMemorySegments(content string) ([]knowledgeMemorySegment, []knowledgeMemoryHeading) {
	lines := strings.Split(content, "\n")
	var stack []knowledgeMemoryHeading
	var headings []knowledgeMemoryHeading
	var segments []knowledgeMemorySegment
	var block []string
	blockStart, blockEnd := 0, 0
	blockBullet := false
	fenced := byte(0)
	fenceLength := 0

	path := func() []string {
		result := []string{"Memory.md"}
		for _, heading := range stack {
			result = append(result, heading.Text)
		}
		return result
	}
	flush := func() {
		if len(block) == 0 {
			return
		}
		text := strings.TrimSpace(strings.Join(block, "\n"))
		if text != "" {
			segments = append(segments, knowledgeMemorySegment{
				ID:          "memory-segment-" + itoa(len(segments)+1),
				HeadingPath: path(),
				Text:        text,
				StartLine:   blockStart,
				EndLine:     blockEnd,
				StartOffset: blockStart,
			})
		}
		block = nil
	}

	for index, line := range lines {
		lineNo := index + 1
		if marker, length := knowledgeMemoryFenceMarker(line); marker != 0 {
			if fenced == 0 {
				fenced, fenceLength = marker, length
			} else if marker == fenced && length >= fenceLength && strings.TrimSpace(line) == strings.Repeat(string(marker), length) {
				fenced, fenceLength = 0, 0
			}
			if len(block) == 0 {
				blockStart = lineNo
			}
			block = append(block, line)
			blockEnd = lineNo
			continue
		}
		if fenced == 0 {
			if heading, ok := parseKnowledgeMemoryHeading(line); ok {
				flush()
				headings = append(headings, heading)
				if heading.Level == 1 && len(stack) == 0 && strings.EqualFold(heading.Text, "Memory.md") {
					continue
				}
				for len(stack) > 0 && stack[len(stack)-1].Level >= heading.Level {
					stack = stack[:len(stack)-1]
				}
				stack = append(stack, heading)
				continue
			}
		}
		if strings.TrimSpace(line) == "" {
			flush()
			continue
		}
		isBullet := fenced == 0 && knowledgeMemoryBulletPattern.MatchString(line)
		if len(block) > 0 && fenced == 0 && blockBullet != isBullet {
			flush()
		}
		if len(block) == 0 {
			blockStart = lineNo
			blockBullet = isBullet
		}
		block = append(block, line)
		blockEnd = lineNo
	}
	flush()

	for i := range segments {
		parts := []string{strings.Join(segments[i].HeadingPath, " > "), segments[i].Text}
		if i > 0 && equalKnowledgeMemoryPath(segments[i-1].HeadingPath, segments[i].HeadingPath) {
			parts = append(parts, segments[i-1].Text)
		}
		if i+1 < len(segments) && equalKnowledgeMemoryPath(segments[i+1].HeadingPath, segments[i].HeadingPath) {
			parts = append(parts, segments[i+1].Text)
		}
		segments[i].SearchText = strings.Join(parts, "\n")
	}
	return segments, headings
}

func parseKnowledgeMemoryHeading(line string) (knowledgeMemoryHeading, bool) {
	match := knowledgeMemoryHeadingPattern.FindStringSubmatch(line)
	if len(match) != 3 {
		return knowledgeMemoryHeading{}, false
	}
	return knowledgeMemoryHeading{Level: len(match[1]), Text: strings.TrimSpace(match[2])}, true
}

func knowledgeMemoryFenceMarker(line string) (byte, int) {
	trimmed := strings.TrimLeft(line, " \t")
	if len(line)-len(trimmed) > 3 || len(trimmed) < 3 || trimmed[0] != '`' && trimmed[0] != '~' {
		return 0, 0
	}
	marker := trimmed[0]
	length := 0
	for length < len(trimmed) && trimmed[length] == marker {
		length++
	}
	if length < 3 {
		return 0, 0
	}
	return marker, length
}

func equalKnowledgeMemoryPath(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}

func knowledgeMemoryQuery(input knowledgeMemoryPreviewPayload) (map[string]struct{}, []string) {
	parts := make([]string, 0, len(input.TargetLocales)+10+len(input.Metadata))
	if input.TargetLocale != nil {
		parts = append(parts, *input.TargetLocale)
	}
	parts = append(parts, input.TargetLocales...)
	if input.SourceLocale != nil {
		parts = append(parts, *input.SourceLocale)
	}
	for _, value := range []*string{input.SourceText, input.Context, input.Key, input.Path} {
		if value != nil {
			parts = append(parts, *value)
		}
	}
	for _, value := range input.Metadata {
		parts = append(parts, value)
	}
	locales := make([]string, 0)
	for _, part := range parts {
		if knowledgeMemoryLocalePattern.MatchString(part) {
			locale := normalizeKnowledgeMemoryLocale(part)
			if !containsString(locales, locale) {
				locales = append(locales, locale)
			}
		}
	}
	nonLocaleParts := make([]string, 0, len(parts))
	for _, part := range parts {
		if !knowledgeMemoryLocalePattern.MatchString(part) {
			nonLocaleParts = append(nonLocaleParts, part)
		}
	}
	return expandKnowledgeMemoryTokens(strings.Join(nonLocaleParts, " ")), locales
}

func expandKnowledgeMemoryTokens(value string) map[string]struct{} {
	tokens := map[string]struct{}{}
	for _, token := range tokenizeKnowledgeMemory(value) {
		tokens[token] = struct{}{}
		for _, variant := range knowledgeMemoryTokenVariants[token] {
			tokens[variant] = struct{}{}
		}
	}
	return tokens
}

func tokenizeKnowledgeMemory(value string) []string {
	value = strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(value, "'", ""), "’", ""))
	var tokens []string
	var current strings.Builder
	flush := func() {
		if current.Len() == 0 {
			return
		}
		token := current.String()
		current.Reset()
		if len([]rune(token)) > 1 {
			if _, stop := knowledgeMemoryStopWords[token]; !stop {
				tokens = append(tokens, token)
			}
		}
	}
	for _, r := range value {
		if unicode.IsLetter(r) || unicode.IsNumber(r) || r == '-' {
			current.WriteRune(r)
		} else {
			flush()
		}
	}
	flush()
	return tokens
}

func rankKnowledgeMemorySegments(segments []knowledgeMemorySegment, queryTokens map[string]struct{}, locales []string) []rankedKnowledgeMemorySegment {
	if len(queryTokens) == 0 {
		return nil
	}
	ranked := make([]rankedKnowledgeMemorySegment, 0)
	for _, segment := range segments {
		headingTokens := expandKnowledgeMemoryTokens(strings.Join(segment.HeadingPath, " "))
		searchTokens := expandKnowledgeMemoryTokens(segment.SearchText)
		score := 0
		for token := range queryTokens {
			if _, ok := headingTokens[token]; ok {
				score += 4
			}
			if _, ok := searchTokens[token]; ok {
				score += 3
				if strings.ContainsAny(token, "-0123456789") {
					score += 6
				}
			}
		}
		for _, locale := range locales {
			heading := normalizeKnowledgeMemoryLocale(strings.Join(segment.HeadingPath, " "))
			search := normalizeKnowledgeMemoryLocale(segment.SearchText)
			if knowledgeMemoryTextHasLocale(heading, locale, true) {
				score += 12
				continue
			}
			if strings.Contains(locale, "-") && knowledgeMemoryTextHasLocale(search, locale, false) {
				score += 6
			}
		}
		if score >= 3 {
			ranked = append(ranked, rankedKnowledgeMemorySegment{segment: segment, score: score})
		}
	}
	sort.SliceStable(ranked, func(i, j int) bool {
		if ranked[i].score != ranked[j].score {
			return ranked[i].score > ranked[j].score
		}
		return ranked[i].segment.StartOffset < ranked[j].segment.StartOffset
	})
	return ranked
}

func knowledgeMemoryTextHasLocale(text, locale string, includeLanguage bool) bool {
	text = strings.ToLower(strings.ReplaceAll(text, "_", "-"))
	locale = normalizeKnowledgeMemoryLocale(locale)
	if includesKnowledgeMemoryMarker(text, locale, false) {
		return true
	}
	if includeLanguage {
		language := strings.Split(locale, "-")[0]
		return includesKnowledgeMemoryMarker(text, language, true)
	}
	return false
}

func includesKnowledgeMemoryMarker(text, marker string, language bool) bool {
	for start := 0; start <= len(text)-len(marker); start++ {
		if text[start:start+len(marker)] != marker {
			continue
		}
		beforeOK := start == 0 || !isASCIIAlphaNumeric(text[start-1])
		end := start + len(marker)
		if language {
			beforeOK = start == 0 || !isASCIIAlphaNumeric(text[start-1])
			if end < len(text) && (isASCIIAlphaNumeric(text[end]) || text[end] == '-') {
				continue
			}
		} else if end < len(text) && isASCIIAlphaNumeric(text[end]) {
			continue
		}
		if beforeOK {
			return true
		}
	}
	return false
}

func isASCIIAlphaNumeric(value byte) bool {
	return value >= 'a' && value <= 'z' || value >= '0' && value <= '9'
}

func selectKnowledgeMemoryTargetSegments(ranked []rankedKnowledgeMemorySegment, input knowledgeMemoryPreviewPayload) []rankedKnowledgeMemorySegment {
	selected := map[string]struct{}{}
	locales := requestedKnowledgeMemoryTargetLocales(input)
	for _, locale := range locales {
		covered := false
		for _, item := range ranked {
			if _, ok := selected[item.segment.ID]; ok && knowledgeMemoryHeadingMatchesLocales(item.segment.HeadingPath, []string{locale}) {
				covered = true
				break
			}
		}
		if covered {
			continue
		}
		for _, item := range ranked {
			if knowledgeMemoryHeadingMatchesLocales(item.segment.HeadingPath, []string{locale}) {
				selected[item.segment.ID] = struct{}{}
				break
			}
		}
	}
	limit := 5
	if len(locales) > limit {
		limit = len(locales)
	}
	for _, item := range ranked {
		if len(selected) >= limit {
			break
		}
		selected[item.segment.ID] = struct{}{}
	}
	result := make([]rankedKnowledgeMemorySegment, 0, len(selected))
	for _, item := range ranked {
		if _, ok := selected[item.segment.ID]; ok {
			result = append(result, item)
		}
	}
	return result
}

func requestedKnowledgeMemoryTargetLocales(input knowledgeMemoryPreviewPayload) []string {
	values := make([]string, 0, len(input.TargetLocales)+1)
	if input.TargetLocale != nil {
		values = append(values, *input.TargetLocale)
	}
	values = append(values, input.TargetLocales...)
	result := make([]string, 0, len(values))
	for _, value := range values {
		locale := normalizeKnowledgeMemoryLocale(value)
		if locale != "" && !containsString(result, locale) {
			result = append(result, locale)
		}
	}
	return result
}

func knowledgeMemoryHeadingMatchesLocales(path, locales []string) bool {
	text := normalizeKnowledgeMemoryLocale(strings.Join(path, " "))
	for _, locale := range locales {
		if knowledgeMemoryTextHasLocale(text, locale, true) {
			return true
		}
	}
	return false
}

func findGeneralKnowledgeMemorySegment(segments []knowledgeMemorySegment) *knowledgeMemorySegment {
	for i := range segments {
		for _, heading := range segments[i].HeadingPath {
			switch strings.ToLower(strings.TrimSpace(heading)) {
			case "general", "overview", "summary":
				return &segments[i]
			}
		}
	}
	return nil
}

func defaultKnowledgeMemoryFallbackSegments(segments []knowledgeMemorySegment, exceptID string) []knowledgeMemorySegment {
	ordered := orderKnowledgeMemoryFallbackSegments(segments, exceptID)
	result := make([]knowledgeMemorySegment, 0, 5)
	for _, segment := range ordered {
		if preferredKnowledgeMemoryFallbackSegment(segment) {
			result = append(result, segment)
			if len(result) == 5 {
				break
			}
		}
	}
	return result
}

func orderKnowledgeMemoryFallbackSegments(segments []knowledgeMemorySegment, exceptID string) []knowledgeMemorySegment {
	result := make([]knowledgeMemorySegment, 0, len(segments))
	for _, segment := range segments {
		if segment.ID != exceptID {
			result = append(result, segment)
		}
	}
	sort.SliceStable(result, func(i, j int) bool {
		left, right := knowledgeMemoryFallbackPriority(result[i]), knowledgeMemoryFallbackPriority(result[j])
		if left != right {
			return left < right
		}
		return result[i].StartLine < result[j].StartLine
	})
	return result
}

func knowledgeMemoryFallbackPriority(segment knowledgeMemorySegment) int {
	priority := 1
	for _, heading := range segment.HeadingPath {
		if knowledgeMemoryHeadingPriority(heading) == 0 {
			return 0
		}
	}
	return priority
}

func preferredKnowledgeMemoryFallbackSegment(segment knowledgeMemorySegment) bool {
	return knowledgeMemoryFallbackPriority(segment) == 0
}

func knowledgeMemoryHeadingPriority(heading string) int {
	if regexp.MustCompile(`(?i)brand|voice|tone|style|glossary|terminology|protected|token|never|avoid|locale|rule`).MatchString(heading) {
		return 0
	}
	return 1
}

func buildKnowledgeMemoryHeadingFallback(content string, headings []knowledgeMemoryHeading) string {
	if len(headings) == 0 {
		return content
	}
	ordered := append([]knowledgeMemoryHeading(nil), headings...)
	sort.SliceStable(ordered, func(i, j int) bool {
		left, right := knowledgeMemoryHeadingPriority(ordered[i].Text), knowledgeMemoryHeadingPriority(ordered[j].Text)
		return left < right
	})
	var lines []string
	lines = append(lines, "Memory.md heading fallback:")
	for _, heading := range ordered {
		lines = append(lines, strings.Repeat("  ", max(0, heading.Level-1))+"- "+heading.Text)
	}
	return strings.Join(lines, "\n")
}

func rawKnowledgeMemoryFallback(content string, headings []knowledgeMemoryHeading, wholeChars, maxChars int) knowledgeMemoryPreview {
	compact := truncateKnowledgeMemoryToBudget(buildKnowledgeMemoryHeadingFallback(content, headings), maxChars)
	return knowledgeMemoryPreview{
		CompactText: compact,
		Segments:    []knowledgeMemoryPreviewSegment{},
		Metrics: knowledgeMemoryPreviewMetrics{
			SelectedMemoryChars: utf16Length(compact),
			WholeMemoryChars:    wholeChars,
			ReductionPercent:    reductionPercent(wholeChars, utf16Length(compact)),
			MatchedHeadingPaths: []string{},
			FallbackMode:        "fallback",
		},
	}
}

func buildKnowledgeMemorySelectedContext(content string, wholeChars, maxChars int, selected []knowledgeMemorySegment, mode, headingFallback string, queryTokens map[string]struct{}, locales []string, segmentBudget int) knowledgeMemoryPreview {
	lines := make([]string, 0, len(selected)+1)
	segments := make([]knowledgeMemoryPreviewSegment, 0, len(selected))
	used := 0
	if headingFallback != "" {
		headingFallback = truncateKnowledgeMemoryToBudget(headingFallback, min(maxChars, 1200))
		if appended, chars, ok := appendKnowledgeMemoryBudget(lines, headingFallback, used, maxChars); ok {
			lines, used = appended, chars
		}
	}
	for _, segment := range selected {
		budget := maxChars
		if segmentBudget > 0 && segmentBudget < budget {
			budget = segmentBudget
		}
		preview := buildKnowledgeMemorySegmentExcerpt(segment, budget, queryTokens, locales)
		appended, chars, ok := appendKnowledgeMemoryBudget(lines, preview, used, maxChars)
		if !ok {
			break
		}
		lines, used = appended, chars
		segments = append(segments, knowledgeMemoryPreviewSegment{
			ID:          segment.ID,
			HeadingPath: segment.HeadingPath,
			StartLine:   segment.StartLine,
			EndLine:     segment.EndLine,
			Preview:     preview,
		})
	}
	compact := strings.Join(lines, "\n")
	paths := make([]string, 0, len(segments))
	for _, segment := range segments {
		path := strings.Join(segment.HeadingPath, " > ")
		if !containsString(paths, path) {
			paths = append(paths, path)
		}
	}
	return knowledgeMemoryPreview{
		CompactText: compact,
		Segments:    segments,
		Metrics: knowledgeMemoryPreviewMetrics{
			SelectedMemoryCount: len(segments),
			SelectedMemoryChars: utf16Length(compact),
			WholeMemoryChars:    wholeChars,
			ReductionPercent:    reductionPercent(wholeChars, utf16Length(compact)),
			MatchedHeadingPaths: paths,
			FallbackMode:        mode,
		},
	}
}

func buildKnowledgeMemorySegmentExcerpt(segment knowledgeMemorySegment, budget int, queryTokens map[string]struct{}, locales []string) string {
	text := normalizeKnowledgeMemorySegmentText(segment.Text)
	if utf16Length(text) <= budget {
		return text
	}
	units := splitKnowledgeMemoryExcerptUnits(text)
	if len(queryTokens) > 0 {
		for _, unit := range units {
			if knowledgeMemoryTextScore(unit, queryTokens) > 0 && utf16Length(unit) <= budget {
				return unit
			}
		}
	}
	if len(locales) > 0 && knowledgeMemoryHeadingMatchesLocales(segment.HeadingPath, locales) && len(units) > 0 && utf16Length(units[0]) <= budget {
		return units[0]
	}
	for _, unit := range units {
		if utf16Length(unit) > budget {
			return truncateKnowledgeMemoryAroundMatch(unit, budget, queryTokens)
		}
	}
	return truncateKnowledgeMemoryAroundMatch(text, budget, queryTokens)
}

func normalizeKnowledgeMemorySegmentText(text string) string {
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		lines[i] = knowledgeMemoryBulletPattern.ReplaceAllString(line, "")
	}
	return strings.Join(strings.Fields(strings.Join(lines, " ")), " ")
}

func splitKnowledgeMemoryExcerptUnits(text string) []string {
	var units []string
	start := 0
	for i, r := range text {
		if r != '.' && r != '!' && r != '?' && r != '。' && r != '！' && r != '？' {
			continue
		}
		end := i + len(string(r))
		if end < len(text) && !unicode.IsSpace(rune(text[end])) && r != '。' && r != '！' && r != '？' {
			continue
		}
		unit := strings.TrimSpace(text[start:end])
		if unit != "" {
			units = append(units, unit)
		}
		start = end
	}
	if unit := strings.TrimSpace(text[start:]); unit != "" {
		units = append(units, unit)
	}
	if len(units) == 0 {
		return []string{text}
	}
	return units
}

func knowledgeMemoryTextScore(value string, queryTokens map[string]struct{}) int {
	score := 0
	for token := range expandKnowledgeMemoryTokens(value) {
		if _, ok := queryTokens[token]; ok {
			score++
		}
	}
	return score
}

func truncateKnowledgeMemoryAroundMatch(text string, maxChars int, queryTokens map[string]struct{}) string {
	if utf16Length(text) <= maxChars {
		return text
	}
	if maxChars <= 0 {
		return ""
	}
	bestOffset := -1
	lower := strings.ToLower(text)
	for token := range queryTokens {
		if offset := strings.Index(lower, token); offset >= 0 && (bestOffset < 0 || offset < bestOffset) {
			bestOffset = offset
		}
	}
	if bestOffset < 0 {
		return truncateKnowledgeMemoryToBudget(text, maxChars)
	}
	lead := maxChars / 4
	start := max(0, bestOffset-lead)
	prefix := ""
	if start > 0 {
		prefix = "..."
	}
	remaining := max(0, maxChars-utf16Length(prefix)-3)
	body := sliceKnowledgeMemoryUTF16(text[start:], remaining)
	return prefix + body + "..."
}

func truncateKnowledgeMemoryToBudget(text string, maxChars int) string {
	if utf16Length(text) <= maxChars {
		return text
	}
	if maxChars < 3 {
		return sliceKnowledgeMemoryUTF16(text, maxChars)
	}
	return strings.TrimRightFunc(sliceKnowledgeMemoryUTF16(text, maxChars-3), unicode.IsSpace) + "..."
}

func sliceKnowledgeMemoryUTF16(value string, maxChars int) string {
	if maxChars <= 0 {
		return ""
	}
	var result strings.Builder
	used := 0
	for _, r := range value {
		units := 1
		if r > 0xFFFF {
			units = 2
		}
		if used+units > maxChars {
			break
		}
		result.WriteRune(r)
		used += units
	}
	return result.String()
}

func appendKnowledgeMemoryBudget(lines []string, line string, used, maxChars int) ([]string, int, bool) {
	separator := 0
	if len(lines) > 0 {
		separator = 1
	}
	needed := separator + utf16Length(line)
	if used+needed <= maxChars {
		return append(lines, line), used + needed, true
	}
	if len(lines) > 0 {
		return lines, used, false
	}
	return []string{truncateKnowledgeMemoryToBudget(line, maxChars)}, maxChars, true
}

func balancedKnowledgeMemorySegmentBudget(maxChars, count, reserved int) int {
	if count <= 1 {
		return 0
	}
	available := max(0, maxChars-reserved)
	return max(80, int(math.Floor(float64(available-max(0, count-1))/float64(count))))
}

func reductionPercent(wholeChars, selectedChars int) float64 {
	if wholeChars == 0 {
		return 0
	}
	return math.Round(((float64(wholeChars-selectedChars)/float64(wholeChars))*100)*100) / 100
}

func normalizeKnowledgeMemoryLocale(locale string) string {
	return strings.ToLower(strings.ReplaceAll(strings.TrimSpace(locale), "_", "-"))
}

func containsString(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}
