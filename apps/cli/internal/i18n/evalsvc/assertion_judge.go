package evalsvc

import (
	"context"
	"fmt"
	"strings"
)

const (
	AssertionLLMRubric       = "llm-rubric"
	AssertionFactuality      = "factuality"
	AssertionGEval           = "g-eval"
	AssertionClosedQA        = "model-graded-closedqa"
	AssertionAnswerRelevance = "answer-relevance"
	AssertionContextFaithful = "context-faithfulness"
	AssertionContextRecall   = "context-recall"
)

type rubricCriterion struct {
	key         string
	description string
	weight      float64
}

type assertionSpec struct {
	kind            string
	systemPrompt    string
	buildUserPrompt judgeUserPromptFunc
	parse           judgeParseFunc
}

var localizationRubricPack = []rubricCriterion{
	{key: "accuracy", description: "meaning preserved from source", weight: 0.35},
	{key: "terminology", description: "glossary adherence", weight: 0.20},
	{key: "fluency", description: "natural target-language output", weight: 0.20},
	{key: "localeFit", description: "region conventions (date/currency/formality)", weight: 0.15},
	{key: "formattingSafety", description: "placeholders/tags untouched", weight: 0.10},
	{key: "policyTone", description: "clear, concise, not apologetic", weight: 0.00},
}

type AssertionJudgeScorer struct {
	spec assertionSpec
	base *LLMJudgeScorer
}

func NewAssertionJudgeScorer(assertion, provider, model, prompt string, translate judgeTranslateFunc) (JudgeScorer, bool) {
	spec, ok := assertionSpecFor(assertion)
	if !ok {
		return nil, false
	}
	finalPrompt := spec.systemPrompt
	if strings.TrimSpace(prompt) != "" {
		finalPrompt = strings.TrimSpace(prompt) + "\n\n" + spec.systemPrompt
	}
	return &AssertionJudgeScorer{
		spec: spec,
		base: newLLMJudgeScorerWithOptions(
			fmt.Sprintf("judge:%s", spec.kind),
			provider,
			model,
			finalPrompt,
			translate,
			spec.parse,
			spec.buildUserPrompt,
		),
	}, true
}

func (s *AssertionJudgeScorer) Name() string {
	return s.base.Name()
}

func (s *AssertionJudgeScorer) ScoreJudge(ctx context.Context, in ScoreInput) (JudgeResult, error) {
	result, err := s.base.ScoreJudge(ctx, in)
	if err != nil {
		return JudgeResult{}, err
	}
	if result.Details == nil {
		result.Details = map[string]any{}
	}
	result.Details["assertion"] = s.spec.kind
	return result, nil
}

func assertionPromptFor(assertion string) (string, bool) {
	spec, ok := assertionSpecFor(assertion)
	if !ok {
		return "", false
	}
	return spec.systemPrompt, true
}

func assertionSpecFor(assertion string) (assertionSpec, bool) {
	kind := strings.ToLower(strings.TrimSpace(assertion))
	switch kind {
	case AssertionLLMRubric:
		return assertionSpec{
			kind:            kind,
			systemPrompt:    llmRubricTemplate(),
			buildUserPrompt: buildLLMJudgeUserPrompt,
			parse:           parseJudgeResult,
		}, true
	case AssertionFactuality:
		return assertionSpec{
			kind:            kind,
			systemPrompt:    factualityTemplate(),
			buildUserPrompt: buildSourceGroundedPrompt("Assess factual consistency of the candidate translation against the source and any provided reference/context."),
			parse:           parseFactualityJudgeResult,
		}, true
	case AssertionGEval:
		return assertionSpec{
			kind:            kind,
			systemPrompt:    gEvalTemplate(),
			buildUserPrompt: buildSourceGroundedPrompt("Run a g-eval style quality assessment. Evaluate coherence, adequacy, tone control, and style conformance."),
			parse:           parseGEvalJudgeResult,
		}, true
	case AssertionClosedQA:
		return assertionSpec{
			kind:            kind,
			systemPrompt:    closedQATemplate(),
			buildUserPrompt: buildSourceGroundedPrompt("Treat the source as the gold answer and grade whether the candidate translation is correct."),
			parse:           parseClosedQAJudgeResult,
		}, true
	case AssertionAnswerRelevance:
		return assertionSpec{
			kind:            kind,
			systemPrompt:    answerRelevanceTemplate(),
			buildUserPrompt: buildSourceGroundedPrompt("Assess whether the candidate directly addresses the source intent and user need."),
			parse:           parseAnswerRelevanceJudgeResult,
		}, true
	case AssertionContextFaithful:
		return assertionSpec{
			kind:            kind,
			systemPrompt:    contextFaithfulnessTemplate(),
			buildUserPrompt: buildSourceGroundedPrompt("Assess whether the candidate stays faithful to the source and optional context without unsupported additions."),
			parse:           parseContextFaithfulnessJudgeResult,
		}, true
	case AssertionContextRecall:
		return assertionSpec{
			kind:            kind,
			systemPrompt:    contextRecallTemplate(),
			buildUserPrompt: buildSourceGroundedPrompt("Assess whether all material facts from the source and optional context are preserved in the candidate."),
			parse:           parseContextRecallJudgeResult,
		}, true
	default:
		return assertionSpec{}, false
	}
}

func llmRubricTemplate() string {
	var b strings.Builder
	b.WriteString("Use this localization rubric. Score each criterion from 1 (poor) to 5 (excellent).")
	b.WriteString(" Weighted aggregate: accuracy 35%, terminology 20%, fluency 20%, locale fit 15%, formatting safety 10%. ")
	b.WriteString("Policy tone must still be scored 1-5 and reflected in rationale, but it is not part of the weighted aggregate.\n\n")
	for _, criterion := range localizationRubricPack {
		b.WriteString("- ")
		b.WriteString(criterion.key)
		b.WriteString(": ")
		b.WriteString(criterion.description)
		if criterion.weight > 0 {
			_, _ = fmt.Fprintf(&b, " (weight %.0f%%)", criterion.weight*100)
		}
		b.WriteString("\n")
	}
	b.WriteString("\nReturn JSON with at least these keys: ")
	b.WriteString(`{"score":0.0,"rationale":"brief explanation in English","rubric":{"accuracy":1,"terminology":1,"fluency":1,"localeFit":1,"formattingSafety":1,"policyTone":1}}`)
	b.WriteString(". `score` must be the normalized weighted aggregate in [0,1].")
	b.WriteString(" Write the rationale in English.")
	return b.String()
}

func factualityTemplate() string {
	return `Evaluate factuality against the source text, optional reference, and optional context only.
Penalize unsupported additions, contradictions, and fabricated details.
Write the rationale in English.
Return strict JSON with this shape:
{"score":0.0,"rationale":"brief explanation in English","grounded":true,"hallucinations":["..."]}`
}

func gEvalTemplate() string {
	return `Perform a g-eval style translation quality review.
Score coherence, adequacy, toneControl, and styleConformance individually in [0,1], then return their average as score.
Write the rationale in English.
Return strict JSON with this shape:
{"score":0.0,"rationale":"brief explanation in English","dimensions":{"coherence":0.0,"adequacy":0.0,"toneControl":0.0,"styleConformance":0.0}}`
}

func closedQATemplate() string {
	return `Grade the candidate in model-graded closed QA mode.
Use the source text as the gold answer and optional reference/context as supporting evidence.
Write the rationale in English.
Return strict JSON with this shape:
{"score":0.0,"rationale":"brief explanation in English","verdict":"correct|partially_correct|incorrect","coverage":0.0}`
}

func answerRelevanceTemplate() string {
	return `Evaluate answer relevance.
Score whether the candidate directly addresses the source intent and preserves the user-facing ask.
Write the rationale in English.
Return strict JSON with this shape:
{"score":0.0,"rationale":"brief explanation in English","focus":0.0,"intentAlignment":0.0}`
}

func contextFaithfulnessTemplate() string {
	return `Evaluate context faithfulness.
Decide whether the candidate stays faithful to the source and optional context without unsupported claims.
Write the rationale in English.
Return strict JSON with this shape:
{"score":0.0,"rationale":"brief explanation in English","faithful":true,"unsupportedClaims":["..."]}`
}

func contextRecallTemplate() string {
	return `Evaluate context recall.
Count how many material facts from the source and optional context are preserved in the candidate.
Write the rationale in English.
Return strict JSON with this shape:
{"score":0.0,"rationale":"brief explanation in English","coveredFacts":0,"expectedFacts":0}`
}

func buildSourceGroundedPrompt(task string) judgeUserPromptFunc {
	return func(in ScoreInput) string {
		var b strings.Builder
		b.WriteString(task)
		b.WriteString("\n\nSource text:\n")
		b.WriteString(strings.TrimSpace(in.Case.Source))
		b.WriteString("\n\nTarget locale:\n")
		b.WriteString(strings.TrimSpace(in.Case.TargetLocale))
		if ctx := sanitizeEvalCaseContext(in.Case.Context); ctx != "" {
			b.WriteString("\n\nContext:\n")
			b.WriteString(ctx)
		}
		if ref := strings.TrimSpace(in.Case.Reference); ref != "" {
			b.WriteString("\n\nReference translation:\n")
			b.WriteString(ref)
		}
		b.WriteString("\n\nCandidate translation:\n")
		b.WriteString(strings.TrimSpace(in.Translated))
		return b.String()
	}
}

func parseFactualityJudgeResult(raw string) (JudgeResult, error) {
	payload, err := parseJudgePayload(raw)
	if err != nil {
		return JudgeResult{}, err
	}
	score, err := parseJudgeScoreValue(payload["score"])
	if err != nil {
		return JudgeResult{}, err
	}
	rationale, err := parseRequiredString(payload, "rationale")
	if err != nil {
		return JudgeResult{}, err
	}
	grounded, err := parseRequiredBool(payload, "grounded")
	if err != nil {
		return JudgeResult{}, err
	}
	hallucinations, err := parseRequiredStringArray(payload, "hallucinations")
	if err != nil {
		return JudgeResult{}, err
	}
	return JudgeResult{
		Score:     &score,
		Rationale: rationale,
		Details: map[string]any{
			"grounded":       grounded,
			"hallucinations": hallucinations,
		},
	}, nil
}

func parseGEvalJudgeResult(raw string) (JudgeResult, error) {
	payload, err := parseJudgePayload(raw)
	if err != nil {
		return JudgeResult{}, err
	}
	rationale, err := parseRequiredString(payload, "rationale")
	if err != nil {
		return JudgeResult{}, err
	}
	dimensions, err := parseRequiredObject(payload, "dimensions")
	if err != nil {
		return JudgeResult{}, err
	}
	keys := []string{"coherence", "adequacy", "toneControl", "styleConformance"}
	detailScores := map[string]float64{}
	total := 0.0
	for _, key := range keys {
		rawValue, ok := dimensions[key]
		if !ok {
			return JudgeResult{}, fmt.Errorf("parse judge response: missing dimensions.%s", key)
		}
		score, err := parseJudgeScoreValue(rawValue)
		if err != nil {
			return JudgeResult{}, fmt.Errorf("parse judge response: dimensions.%s %w", key, err)
		}
		detailScores[key] = score
		total += score
	}
	score := round3(total / float64(len(keys)))
	if explicit, err := parseOptionalScore(payload, "score"); err != nil {
		return JudgeResult{}, err
	} else if explicit != nil {
		score = *explicit
	}
	return JudgeResult{
		Score:     &score,
		Rationale: rationale,
		Details: map[string]any{
			"dimensions": detailScores,
		},
	}, nil
}

func parseClosedQAJudgeResult(raw string) (JudgeResult, error) {
	payload, err := parseJudgePayload(raw)
	if err != nil {
		return JudgeResult{}, err
	}
	rationale, err := parseRequiredString(payload, "rationale")
	if err != nil {
		return JudgeResult{}, err
	}
	verdict, err := parseRequiredString(payload, "verdict")
	if err != nil {
		return JudgeResult{}, err
	}
	coverage, err := parseJudgeScoreValue(payload["coverage"])
	if err != nil {
		return JudgeResult{}, fmt.Errorf("parse judge response: coverage %w", err)
	}
	score := deriveClosedQAScore(verdict, coverage)
	if explicit, err := parseOptionalScore(payload, "score"); err != nil {
		return JudgeResult{}, err
	} else if explicit != nil {
		score = *explicit
	}
	return JudgeResult{
		Score:     &score,
		Rationale: rationale,
		Details: map[string]any{
			"verdict":  verdict,
			"coverage": coverage,
		},
	}, nil
}

func deriveClosedQAScore(verdict string, coverage float64) float64 {
	switch strings.ToLower(strings.TrimSpace(verdict)) {
	case "correct":
		return round3(coverage)
	case "partially_correct":
		return round3(coverage * 0.5)
	case "incorrect":
		return 0
	default:
		return 0
	}
}

func parseAnswerRelevanceJudgeResult(raw string) (JudgeResult, error) {
	payload, err := parseJudgePayload(raw)
	if err != nil {
		return JudgeResult{}, err
	}
	rationale, err := parseRequiredString(payload, "rationale")
	if err != nil {
		return JudgeResult{}, err
	}
	focus, err := parseJudgeScoreValue(payload["focus"])
	if err != nil {
		return JudgeResult{}, fmt.Errorf("parse judge response: focus %w", err)
	}
	intentAlignment, err := parseJudgeScoreValue(payload["intentAlignment"])
	if err != nil {
		return JudgeResult{}, fmt.Errorf("parse judge response: intentAlignment %w", err)
	}
	score := round3((focus + intentAlignment) / 2)
	if explicit, err := parseOptionalScore(payload, "score"); err != nil {
		return JudgeResult{}, err
	} else if explicit != nil {
		score = *explicit
	}
	return JudgeResult{
		Score:     &score,
		Rationale: rationale,
		Details: map[string]any{
			"focus":           focus,
			"intentAlignment": intentAlignment,
		},
	}, nil
}

func parseContextFaithfulnessJudgeResult(raw string) (JudgeResult, error) {
	payload, err := parseJudgePayload(raw)
	if err != nil {
		return JudgeResult{}, err
	}
	rationale, err := parseRequiredString(payload, "rationale")
	if err != nil {
		return JudgeResult{}, err
	}
	faithful, err := parseRequiredBool(payload, "faithful")
	if err != nil {
		return JudgeResult{}, err
	}
	unsupportedClaims, err := parseRequiredStringArray(payload, "unsupportedClaims")
	if err != nil {
		return JudgeResult{}, err
	}
	score := 0.0
	if faithful {
		score = 1
	}
	if explicit, err := parseOptionalScore(payload, "score"); err != nil {
		return JudgeResult{}, err
	} else if explicit != nil {
		score = *explicit
	}
	return JudgeResult{
		Score:     &score,
		Rationale: rationale,
		Details: map[string]any{
			"faithful":          faithful,
			"unsupportedClaims": unsupportedClaims,
		},
	}, nil
}

func parseContextRecallJudgeResult(raw string) (JudgeResult, error) {
	payload, err := parseJudgePayload(raw)
	if err != nil {
		return JudgeResult{}, err
	}
	rationale, err := parseRequiredString(payload, "rationale")
	if err != nil {
		return JudgeResult{}, err
	}
	coveredFacts, err := parseRequiredInt(payload, "coveredFacts")
	if err != nil {
		return JudgeResult{}, err
	}
	expectedFacts, err := parseRequiredInt(payload, "expectedFacts")
	if err != nil {
		return JudgeResult{}, err
	}
	score := 0.0
	if expectedFacts > 0 {
		score = round3(float64(coveredFacts) / float64(expectedFacts))
		if score > 1 {
			score = 1
		}
	}
	if explicit, err := parseOptionalScore(payload, "score"); err != nil {
		return JudgeResult{}, err
	} else if explicit != nil {
		score = *explicit
	}
	return JudgeResult{
		Score:     &score,
		Rationale: rationale,
		Details: map[string]any{
			"coveredFacts":  coveredFacts,
			"expectedFacts": expectedFacts,
		},
	}, nil
}
