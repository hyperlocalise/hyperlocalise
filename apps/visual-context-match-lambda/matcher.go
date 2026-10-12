package main

import (
	"math"
	"regexp"
	"sort"
	"strings"
	"unicode"
)

const (
	minCandidateRunes      = 2
	shortCandidateRunes    = 4
	shortStringThreshold   = 0.9
	longStringThreshold    = 0.82
	shortStringLengthLimit = 12
	placeholderMinCoverage = 0.5
	placeholderMinLiteral  = 3
	minLineConfidence      = 40
	maxSegmentLines        = 3
	lineGapFactor          = 1.2
	markerPaddingPercent   = 0.5
	minMarkerPercent       = 0.1
)

var (
	icuPlaceholderPattern    = regexp.MustCompile(`\{[^{}]*\}`)
	printfPlaceholderPattern = regexp.MustCompile(`%(\d+\$)?[-+ 0#]*\d*(\.\d+)?[sdifuxXoeEgGcp@]`)
	htmlTagPattern           = regexp.MustCompile(`<[^<>]+>`)
)

// ocrBox uses Textract's page-relative ratios in [0, 1].
type ocrBox struct {
	Left, Top, Width, Height float64
}

type ocrLine struct {
	Text       string
	Confidence float64
	Box        ocrBox
}

type matchCandidate struct {
	KeyID      string
	SourceText string
}

// markerPercent matches the binding marker contract: percentages of the image.
type markerPercent struct {
	Left, Top, Width, Height float64
}

type stringMatch struct {
	KeyIDs []string
	Marker markerPercent
	Score  float64
}

type candidateGroup struct {
	keyIDs         []string
	compact        []rune
	parts          []string
	literalRunes   int
	hasPlaceholder bool
	bigrams        map[uint64]int
}

type ocrSegment struct {
	lines   []int
	compact []rune
	text    string
	box     ocrBox
}

type scoredMatch struct {
	group   int
	segment int
	score   float64
}

// matchStrings binds candidate source strings to OCR text regions. Each key is
// bound at most once and each OCR line is claimed by at most one string.
func matchStrings(lines []ocrLine, candidates []matchCandidate) []stringMatch {
	groups := groupCandidates(candidates)
	segments := buildSegments(lines)
	if len(groups) == 0 || len(segments) == 0 {
		return nil
	}
	exact := make(map[string][]int, len(segments))
	index := make(map[uint64][]bigramPosting)
	segmentBigrams := make([]map[uint64]int, len(segments))
	for i, segment := range segments {
		exact[segment.text] = append(exact[segment.text], i)
		segmentBigrams[i] = runeBigrams(segment.compact)
		for bigram, count := range segmentBigrams[i] {
			index[bigram] = append(index[bigram], bigramPosting{segment: i, count: count})
		}
	}
	scored := make([]scoredMatch, 0)
	shared := make(map[int]int)
	for g := range groups {
		group := &groups[g]
		if group.hasPlaceholder {
			scored = append(scored, matchPlaceholderGroup(g, group, segments)...)
			continue
		}
		if hits, ok := exact[string(group.compact)]; ok {
			for _, s := range hits {
				scored = append(scored, scoredMatch{group: g, segment: s, score: 1})
			}
			continue
		}
		if len(group.compact) <= shortCandidateRunes {
			continue
		}
		clear(shared)
		for bigram, count := range group.bigrams {
			for _, posting := range index[bigram] {
				shared[posting.segment] += min(count, posting.count)
			}
		}
		threshold := fuzzyThreshold(len(group.compact))
		for s, common := range shared {
			segment := segments[s]
			longest := max(len(group.compact), len(segment.compact))
			maxDistance := int(math.Floor((1 - threshold) * float64(longest)))
			if abs(len(group.compact)-len(segment.compact)) > maxDistance {
				continue
			}
			// q-gram lemma: strings within edit distance d share at least
			// longest-1-2d bigrams, so cheaper pairs are skipped before Levenshtein.
			if common < longest-1-2*maxDistance {
				continue
			}
			distance := boundedLevenshtein(group.compact, segment.compact, maxDistance)
			if distance > maxDistance {
				continue
			}
			score := 1 - float64(distance)/float64(longest)
			if score >= threshold {
				scored = append(scored, scoredMatch{group: g, segment: s, score: score})
			}
		}
	}
	return assignMatches(scored, groups, segments)
}

type bigramPosting struct {
	segment int
	count   int
}

func matchPlaceholderGroup(g int, group *candidateGroup, segments []ocrSegment) []scoredMatch {
	if group.literalRunes < placeholderMinLiteral {
		return nil
	}
	matches := make([]scoredMatch, 0)
	for s, segment := range segments {
		if !containsPartsInOrder(segment.text, group.parts) {
			continue
		}
		coverage := float64(group.literalRunes) / float64(len(segment.compact))
		if coverage < placeholderMinCoverage {
			continue
		}
		matches = append(matches, scoredMatch{group: g, segment: s, score: 0.8 + 0.2*min(coverage, 1)})
	}
	return matches
}

func assignMatches(scored []scoredMatch, groups []candidateGroup, segments []ocrSegment) []stringMatch {
	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].score != scored[j].score {
			return scored[i].score > scored[j].score
		}
		li, lj := groups[scored[i].group].literalRunes, groups[scored[j].group].literalRunes
		if li != lj {
			return li > lj
		}
		return len(segments[scored[i].segment].lines) < len(segments[scored[j].segment].lines)
	})
	usedGroups := make(map[int]bool)
	usedLines := make(map[int]bool)
	out := make([]stringMatch, 0)
	for _, match := range scored {
		if usedGroups[match.group] {
			continue
		}
		segment := segments[match.segment]
		claimed := false
		for _, line := range segment.lines {
			if usedLines[line] {
				claimed = true
				break
			}
		}
		if claimed {
			continue
		}
		usedGroups[match.group] = true
		for _, line := range segment.lines {
			usedLines[line] = true
		}
		out = append(out, stringMatch{
			KeyIDs: groups[match.group].keyIDs,
			Marker: markerFromBox(segment.box),
			Score:  match.score,
		})
	}
	return out
}

func groupCandidates(candidates []matchCandidate) []candidateGroup {
	byKey := make(map[string]int)
	groups := make([]candidateGroup, 0)
	for _, candidate := range candidates {
		parts, hasPlaceholder := literalParts(candidate.SourceText)
		compact := strings.Join(parts, "")
		literalRunes := len([]rune(compact))
		if literalRunes < minCandidateRunes {
			continue
		}
		groupKey := compact
		if hasPlaceholder {
			groupKey = "\x00" + strings.Join(parts, "\x00")
		}
		if existing, ok := byKey[groupKey]; ok {
			groups[existing].keyIDs = append(groups[existing].keyIDs, candidate.KeyID)
			continue
		}
		runes := []rune(compact)
		byKey[groupKey] = len(groups)
		groups = append(groups, candidateGroup{
			keyIDs:         []string{candidate.KeyID},
			compact:        runes,
			parts:          parts,
			literalRunes:   literalRunes,
			hasPlaceholder: hasPlaceholder,
			bigrams:        runeBigrams(runes),
		})
	}
	return groups
}

// literalParts strips placeholders and markup, returning compact literal runs.
func literalParts(source string) ([]string, bool) {
	text := htmlTagPattern.ReplaceAllString(source, " ")
	const sentinel = "\x00"
	hasPlaceholder := false
	for {
		next := icuPlaceholderPattern.ReplaceAllString(text, sentinel)
		if next == text {
			break
		}
		hasPlaceholder = true
		text = next
	}
	if printfPlaceholderPattern.MatchString(text) {
		hasPlaceholder = true
		text = printfPlaceholderPattern.ReplaceAllString(text, sentinel)
	}
	raw := strings.Split(text, sentinel)
	parts := make([]string, 0, len(raw))
	for _, part := range raw {
		if compact := compactText(part); compact != "" {
			parts = append(parts, compact)
		}
	}
	return parts, hasPlaceholder
}

// compactText lowercases and keeps only letters, digits, and combining marks so
// OCR spacing and punctuation differences do not affect comparison.
func compactText(value string) string {
	var builder strings.Builder
	for _, r := range strings.ToLower(value) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsMark(r) {
			builder.WriteRune(r)
		}
	}
	return builder.String()
}

func buildSegments(lines []ocrLine) []ocrSegment {
	kept := make([]ocrLine, 0, len(lines))
	for _, line := range lines {
		if line.Confidence >= minLineConfidence && compactText(line.Text) != "" && line.Box.Width > 0 && line.Box.Height > 0 {
			kept = append(kept, line)
		}
	}
	segments := make([]ocrSegment, 0, len(kept)*maxSegmentLines)
	for start := range kept {
		box := kept[start].Box
		text := compactText(kept[start].Text)
		indices := []int{start}
		segments = append(segments, ocrSegment{lines: append([]int(nil), indices...), compact: []rune(text), text: text, box: box})
		for next := start + 1; next < len(kept) && len(indices) < maxSegmentLines; next++ {
			if !linesContinue(kept[next-1].Box, kept[next].Box) {
				break
			}
			indices = append(indices, next)
			text += compactText(kept[next].Text)
			box = unionBox(box, kept[next].Box)
			segments = append(segments, ocrSegment{lines: append([]int(nil), indices...), compact: []rune(text), text: text, box: box})
		}
	}
	return segments
}

// linesContinue treats the next line as part of the same wrapped string when it
// sits just below and overlaps horizontally.
func linesContinue(prev, next ocrBox) bool {
	gap := next.Top - (prev.Top + prev.Height)
	if next.Top < prev.Top || gap > prev.Height*lineGapFactor {
		return false
	}
	return math.Max(prev.Left, next.Left) < math.Min(prev.Left+prev.Width, next.Left+next.Width)
}

func unionBox(a, b ocrBox) ocrBox {
	left := math.Min(a.Left, b.Left)
	top := math.Min(a.Top, b.Top)
	right := math.Max(a.Left+a.Width, b.Left+b.Width)
	bottom := math.Max(a.Top+a.Height, b.Top+b.Height)
	return ocrBox{Left: left, Top: top, Width: right - left, Height: bottom - top}
}

func markerFromBox(box ocrBox) markerPercent {
	left := clampPercent(box.Left*100 - markerPaddingPercent)
	top := clampPercent(box.Top*100 - markerPaddingPercent)
	right := clampPercent((box.Left+box.Width)*100 + markerPaddingPercent)
	bottom := clampPercent((box.Top+box.Height)*100 + markerPaddingPercent)
	left = math.Min(left, 100-minMarkerPercent)
	top = math.Min(top, 100-minMarkerPercent)
	return markerPercent{
		Left:   roundPercent(left),
		Top:    roundPercent(top),
		Width:  roundPercent(math.Max(right-left, minMarkerPercent)),
		Height: roundPercent(math.Max(bottom-top, minMarkerPercent)),
	}
}

func clampPercent(value float64) float64 {
	return math.Max(0, math.Min(100, value))
}

// roundPercent rounds down so left+width never exceeds the DB's 100% bound.
func roundPercent(value float64) float64 {
	return math.Floor(value*10000) / 10000
}

func fuzzyThreshold(length int) float64 {
	if length < shortStringLengthLimit {
		return shortStringThreshold
	}
	return longStringThreshold
}

func containsPartsInOrder(text string, parts []string) bool {
	offset := 0
	for _, part := range parts {
		index := strings.Index(text[offset:], part)
		if index < 0 {
			return false
		}
		offset += index + len(part)
	}
	return true
}

func runeBigrams(runes []rune) map[uint64]int {
	bigrams := make(map[uint64]int, len(runes))
	for i := 0; i+1 < len(runes); i++ {
		bigrams[uint64(runes[i])<<32|uint64(runes[i+1])]++
	}
	return bigrams
}

// boundedLevenshtein returns maxDistance+1 once the distance must exceed it.
func boundedLevenshtein(a, b []rune, maxDistance int) int {
	if len(a) < len(b) {
		a, b = b, a
	}
	previous := make([]int, len(b)+1)
	current := make([]int, len(b)+1)
	for j := range previous {
		previous[j] = j
	}
	for i := 1; i <= len(a); i++ {
		current[0] = i
		rowMin := current[0]
		for j := 1; j <= len(b); j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			current[j] = min(previous[j]+1, current[j-1]+1, previous[j-1]+cost)
			rowMin = min(rowMin, current[j])
		}
		if rowMin > maxDistance {
			return maxDistance + 1
		}
		previous, current = current, previous
	}
	return previous[len(b)]
}

func abs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
