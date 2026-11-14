package check

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"strings"
)

const (
	// classifyCacheKeyPrefix includes a version so a question-schema change drops old entries.
	classifyCacheKeyPrefix = "go-svc:guideline-check:v2:"
	classifySchemaVersion  = "v2-per-segment-passage-boolean"

	// Jev state is limited to 32k tokens. Keep JSON well under that after questions.
	maxClassifyPassageRunes = 20000
	maxClassifyStateBytes   = 96 << 10

	classifyViolationMin = 0.75
	classifyUncertainMin = 0.40

	// ClassifierFindingMessage is the canned English copy until Luna explains a finding.
	ClassifierFindingMessage = "This text may not match a project guideline."
)

// BooleanQuestion is one Jev predicate about shared classification state.
type BooleanQuestion struct {
	Instructions string
	True         string
	False        string
}

// Classifier returns P(true) for each named boolean question against one state.
type Classifier interface {
	Classify(ctx context.Context, state any, questions map[string]BooleanQuestion) (map[string]float64, error)
	Name() string
}

type labeledPassage struct {
	Label string `json:"label"`
	Text  string `json:"text"`
}

type classifyState struct {
	SourceLocale string           `json:"sourceLocale"`
	TargetLocale string           `json:"targetLocale"`
	Checks       []string         `json:"checks"`
	Segments     []Segment        `json:"segments"`
	Passages     []labeledPassage `json:"passages"`
}

func classifyQuestionID(segmentIndex, passageIndex int) string {
	return fmt.Sprintf("s%d_P%d", segmentIndex+1, passageIndex+1)
}

func parseClassifyQuestionID(id string) (segmentIndex, passageIndex int, ok bool) {
	var segmentNumber, passageNumber int
	if _, err := fmt.Sscanf(id, "s%d_P%d", &segmentNumber, &passageNumber); err != nil {
		return 0, 0, false
	}
	if segmentNumber < 1 || passageNumber < 1 {
		return 0, 0, false
	}
	return segmentNumber - 1, passageNumber - 1, true
}

func classifyQuestions(req Request, passages []Passage) map[string]BooleanQuestion {
	questions := make(map[string]BooleanQuestion, len(req.Segments)*len(passages))
	for segmentIndex, segment := range req.Segments {
		for passageIndex := range passages {
			questions[classifyQuestionID(segmentIndex, passageIndex)] = BooleanQuestion{
				Instructions: fmt.Sprintf(
					"Does segment %q violate guideline passage P%d? True only for a clear, attributable breach of this passage in a requested field. False for no match, a style preference, or a rule that does not apply. A quoted span of the segment must exist for a true result, except omissions which may cover the whole field.",
					segment.ID, passageIndex+1,
				),
				True:  "The named segment clearly breaks this passage.",
				False: "The passage does not apply, or the segment complies.",
			}
		}
	}
	return questions
}

func buildClassifyState(req Request, passages []Passage) classifyState {
	checks := make([]string, 0, len(req.Checks))
	for _, field := range req.Checks {
		checks = append(checks, string(field))
	}
	labeled := make([]labeledPassage, 0, len(passages))
	for i, passage := range passages {
		labeled = append(labeled, labeledPassage{Label: fmt.Sprintf("P%d", i+1), Text: passage.Text})
	}
	return classifyState{
		SourceLocale: orUnknown(req.SourceLocale),
		TargetLocale: orUnknown(req.TargetLocale),
		Checks:       checks,
		Segments:     req.Segments,
		Passages:     labeled,
	}
}

func fitClassifyState(req Request, passages []Passage, mandatoryCount int) ([]Passage, classifyState, error) {
	trimmed := append([]Passage(nil), passages...)
	if mandatoryCount < 0 {
		mandatoryCount = 0
	}
	if mandatoryCount > len(trimmed) {
		mandatoryCount = len(trimmed)
	}
	for {
		state := buildClassifyState(req, trimmed)
		raw, err := json.Marshal(state)
		if err != nil {
			return nil, classifyState{}, fmt.Errorf("encode classification state: %w", err)
		}
		if len(raw) <= maxClassifyStateBytes {
			return trimmed, state, nil
		}
		if len(trimmed) <= mandatoryCount {
			return nil, classifyState{}, ErrMandatoryPassagesOverBudget
		}
		trimmed = trimmed[:len(trimmed)-1]
	}
}

func classifyCacheKey(organizationID, modelName string, state classifyState) string {
	raw, _ := json.Marshal(state)
	sum := sha256Sum(modelName + "\x00" + classifySchemaVersion + "\x00" + string(raw))
	return classifyCacheKeyPrefix + organizationID + ":" + sum
}

type classifyCachePayload struct {
	Probabilities map[string]float64 `json:"probabilities"`
}

func encodeClassifyCache(probabilities map[string]float64) string {
	raw, err := json.Marshal(classifyCachePayload{Probabilities: probabilities})
	if err != nil {
		return ""
	}
	return string(raw)
}

func decodeClassifyCache(raw string) (map[string]float64, bool) {
	var payload classifyCachePayload
	if err := json.Unmarshal([]byte(raw), &payload); err != nil || payload.Probabilities == nil {
		return nil, false
	}
	return payload.Probabilities, true
}

func findingsFromProbabilities(ctx context.Context, req Request, passages []Passage, probabilities map[string]float64) ([]Finding, []Passage) {
	type ranked struct {
		questionID   string
		probability  float64
		segmentIndex int
		passageIndex int
	}
	rankedQuestions := make([]ranked, 0, len(probabilities))
	for questionID, probability := range probabilities {
		segmentIndex, passageIndex, ok := parseClassifyQuestionID(questionID)
		if !ok || segmentIndex >= len(req.Segments) || passageIndex >= len(passages) {
			continue
		}
		rankedQuestions = append(rankedQuestions, ranked{questionID, probability, segmentIndex, passageIndex})
	}
	sort.Slice(rankedQuestions, func(i, j int) bool {
		if rankedQuestions[i].segmentIndex != rankedQuestions[j].segmentIndex {
			return rankedQuestions[i].segmentIndex < rankedQuestions[j].segmentIndex
		}
		return rankedQuestions[i].passageIndex < rankedQuestions[j].passageIndex
	})

	findings := []Finding{}
	cited := []Passage{}
	citedIndex := map[int]bool{}
	seen := map[string]bool{}
	for _, item := range rankedQuestions {
		switch {
		case item.probability >= classifyViolationMin:
			segment := req.Segments[item.segmentIndex]
			field, text, ok := findingField(req, segment)
			if !ok {
				continue
			}
			finding := Finding{
				SegmentID:          segment.ID,
				Field:              field,
				Severity:           "warning",
				Start:              0,
				End:                utf16Len(text),
				Message:            ClassifierFindingMessage,
				PassageID:          passages[item.passageIndex].ID,
				ReasoningAvailable: true,
			}
			key := fmt.Sprintf("%s\x00%s\x00%s", finding.SegmentID, finding.Field, finding.PassageID)
			if seen[key] {
				continue
			}
			seen[key] = true
			findings = append(findings, finding)
			if !citedIndex[item.passageIndex] {
				citedIndex[item.passageIndex] = true
				cited = append(cited, passages[item.passageIndex])
			}
		case item.probability >= classifyUncertainMin:
			slog.InfoContext(ctx, "guideline_check_uncertain", "question", item.questionID, "probability", item.probability)
		}
	}
	return findings, cited
}

func findingField(req Request, segment Segment) (Field, string, bool) {
	wantTarget, wantSource := false, false
	for _, field := range req.Checks {
		switch field {
		case FieldTarget:
			wantTarget = true
		case FieldSource:
			wantSource = true
		}
	}
	if wantTarget && strings.TrimSpace(segment.Target) != "" {
		return FieldTarget, segment.Target, true
	}
	if wantSource && strings.TrimSpace(segment.Source) != "" {
		return FieldSource, segment.Source, true
	}
	return "", "", false
}
