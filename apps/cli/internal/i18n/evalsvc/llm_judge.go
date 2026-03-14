package evalsvc

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/quiet-circles/hyperlocalise/internal/i18n/translator"
)

const llmJudgeName = "llm_judge"

const defaultLLMJudgePrompt = `You are an expert translation evaluator.
Score the candidate translation from 0.0 to 1.0.
Consider accuracy, fluency, terminology, tone, locale fit, and placeholder preservation.
Use the reference only as optional style and tone guidance, not as an exact-match target.
Write the rationale in English.
Return strict JSON with at least this shape: {"score":0.0,"rationale":"brief explanation in English"}.`

type (
	judgeTranslateFunc  func(ctx context.Context, req translator.Request) (string, error)
	judgeParseFunc      func(raw string) (JudgeResult, error)
	judgeUserPromptFunc func(in ScoreInput) string
)

type LLMJudgeScorer struct {
	name       string
	provider   string
	model      string
	prompt     string
	translate  judgeTranslateFunc
	parse      judgeParseFunc
	userPrompt judgeUserPromptFunc
}

func NewLLMJudgeScorer(provider, model, prompt string, translate judgeTranslateFunc) *LLMJudgeScorer {
	return newLLMJudgeScorerWithOptions(llmJudgeName, provider, model, prompt, translate, parseJudgeResult, buildLLMJudgeUserPrompt)
}

func newLLMJudgeScorerWithOptions(name, provider, model, prompt string, translate judgeTranslateFunc, parse judgeParseFunc, userPrompt judgeUserPromptFunc) *LLMJudgeScorer {
	if translate == nil {
		translate = translator.Translate
	}
	if parse == nil {
		parse = parseJudgeResult
	}
	if userPrompt == nil {
		userPrompt = buildLLMJudgeUserPrompt
	}

	return &LLMJudgeScorer{
		name:       strings.TrimSpace(name),
		provider:   strings.TrimSpace(provider),
		model:      strings.TrimSpace(model),
		prompt:     effectiveLLMJudgePrompt(prompt),
		translate:  translate,
		parse:      parse,
		userPrompt: userPrompt,
	}
}

func (s *LLMJudgeScorer) Name() string {
	if strings.TrimSpace(s.name) == "" {
		return llmJudgeName
	}
	return s.name
}

func (s *LLMJudgeScorer) ScoreJudge(ctx context.Context, in ScoreInput) (JudgeResult, error) {
	if strings.TrimSpace(in.Translated) == "" {
		return JudgeResult{}, fmt.Errorf("judge translation is empty")
	}

	judgeSystem := s.prompt
	if caseCtx := sanitizeEvalCaseContext(in.Case.Context); caseCtx != "" {
		if sp := strings.TrimSpace(judgeSystem); sp != "" {
			judgeSystem = sp + "\n\nEval case context:\n" + caseCtx
		} else {
			judgeSystem = "Eval case context:\n" + caseCtx
		}
	}
	resp, err := s.translate(ctx, translator.Request{
		Source:         in.Case.Source,
		TargetLanguage: in.Case.TargetLocale,
		ModelProvider:  s.provider,
		Model:          s.model,
		SystemPrompt:   judgeSystem,
		UserPrompt:     s.userPrompt(in),
	})
	if err != nil {
		return JudgeResult{}, err
	}

	result, err := s.parse(resp)
	if err != nil {
		return JudgeResult{}, err
	}
	return result, nil
}

func effectiveLLMJudgePrompt(prompt string) string {
	base := strings.TrimSpace(prompt)
	if base == "" {
		return defaultLLMJudgePrompt
	}
	return base + "\n\nWrite the rationale in English.\nReturn strict JSON with at least this shape: {\"score\":0.0,\"rationale\":\"brief explanation in English\"}. You may include additional fields."
}

func buildLLMJudgeUserPrompt(in ScoreInput) string {
	var b strings.Builder
	b.WriteString("Evaluate this translation and return only the requested JSON.\n\n")
	b.WriteString("Source text:\n")
	b.WriteString(strings.TrimSpace(in.Case.Source))
	b.WriteString("\n\nTarget locale:\n")
	b.WriteString(strings.TrimSpace(in.Case.TargetLocale))
	b.WriteString("\n\nCandidate translation:\n")
	b.WriteString(strings.TrimSpace(in.Translated))

	if ref := strings.TrimSpace(in.Case.Reference); ref != "" {
		b.WriteString("\n\nReference translation (optional style guidance only):\n")
		b.WriteString(ref)
	}

	return b.String()
}

func parseJudgeResult(raw string) (JudgeResult, error) {
	payload, err := parseJudgePayload(raw)
	if err == nil {
		return payloadToJudgeResult(payload)
	}

	cleaned := normalizeRawJudgeResponse(raw)
	score, err := strconv.ParseFloat(cleaned, 64)
	if err != nil {
		return JudgeResult{}, fmt.Errorf("parse judge response: invalid JSON score payload")
	}
	if score < 0 || score > 1 {
		return JudgeResult{}, fmt.Errorf("parse judge response: score %.3f out of range [0,1]", score)
	}
	rounded := round3(score)
	return JudgeResult{Score: &rounded}, nil
}

func parseJudgePayload(raw string) (map[string]any, error) {
	cleaned := normalizeRawJudgeResponse(raw)
	start := strings.Index(cleaned, "{")
	if start < 0 {
		return nil, fmt.Errorf("parse judge response: invalid JSON score payload")
	}
	var payload map[string]any
	decoder := json.NewDecoder(strings.NewReader(cleaned[start:]))
	if err := decoder.Decode(&payload); err != nil {
		return nil, fmt.Errorf("parse judge response: invalid JSON score payload")
	}
	return payload, nil
}

func normalizeRawJudgeResponse(raw string) string {
	cleaned := strings.TrimSpace(raw)
	cleaned = strings.TrimPrefix(cleaned, "```json")
	cleaned = strings.TrimPrefix(cleaned, "```")
	cleaned = strings.TrimSuffix(cleaned, "```")
	return strings.TrimSpace(cleaned)
}

func parseJudgeScoreValue(value any) (float64, error) {
	switch v := value.(type) {
	case float64:
		return parseBoundedScore(v, "score")
	case string:
		score, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		if err != nil {
			return 0, fmt.Errorf("parse judge response: invalid score %q", v)
		}
		return parseBoundedScore(score, "score")
	default:
		return 0, fmt.Errorf("parse judge response: missing score")
	}
}

func parseBoundedScore(score float64, label string) (float64, error) {
	if score < 0 || score > 1 {
		return 0, fmt.Errorf("parse judge response: %s %.3f out of range [0,1]", label, score)
	}
	return round3(score), nil
}

func payloadToJudgeResult(payload map[string]any) (JudgeResult, error) {
	result := JudgeResult{}
	if rationale, ok := payload["rationale"].(string); ok {
		result.Rationale = strings.TrimSpace(rationale)
	}

	score, err := parseJudgeScoreValue(payload["score"])
	if err == nil {
		result.Score = &score
		return result, nil
	}

	rubricScore, rubricErr := parseRubricWeightedScore(payload)
	if rubricErr != nil {
		return JudgeResult{}, err
	}
	result.Score = &rubricScore
	return result, nil
}

func parseRubricWeightedScore(payload map[string]any) (float64, error) {
	rawRubric, ok := payload["rubric"].(map[string]any)
	if !ok {
		return 0, fmt.Errorf("parse judge response: missing score")
	}
	weights := map[string]float64{
		"accuracy":         0.35,
		"terminology":      0.20,
		"fluency":          0.20,
		"localeFit":        0.15,
		"formattingSafety": 0.10,
	}
	total := 0.0
	for key, weight := range weights {
		score, err := parseRubricDimension(rawRubric[key])
		if err != nil {
			return 0, fmt.Errorf("parse judge response: rubric.%s %w", key, err)
		}
		total += (score / 5.0) * weight
	}
	if _, err := parseRubricDimension(rawRubric["policyTone"]); err != nil {
		return 0, fmt.Errorf("parse judge response: rubric.policyTone %w", err)
	}
	return round3(total), nil
}

func parseRubricDimension(value any) (float64, error) {
	switch v := value.(type) {
	case float64:
		if v < 1 || v > 5 {
			return 0, fmt.Errorf("score %.3f out of range [1,5]", v)
		}
		return v, nil
	case string:
		score, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		if err != nil {
			return 0, fmt.Errorf("invalid score %q", v)
		}
		if score < 1 || score > 5 {
			return 0, fmt.Errorf("score %.3f out of range [1,5]", score)
		}
		return score, nil
	default:
		return 0, fmt.Errorf("missing")
	}
}

func parseRequiredString(payload map[string]any, key string) (string, error) {
	value, ok := payload[key]
	if !ok {
		return "", fmt.Errorf("parse judge response: missing %s", key)
	}
	text, ok := value.(string)
	if !ok || strings.TrimSpace(text) == "" {
		return "", fmt.Errorf("parse judge response: invalid %s", key)
	}
	return strings.TrimSpace(text), nil
}

func parseRequiredBool(payload map[string]any, key string) (bool, error) {
	value, ok := payload[key]
	if !ok {
		return false, fmt.Errorf("parse judge response: missing %s", key)
	}
	flag, ok := value.(bool)
	if !ok {
		return false, fmt.Errorf("parse judge response: invalid %s", key)
	}
	return flag, nil
}

func parseRequiredStringArray(payload map[string]any, key string) ([]string, error) {
	value, ok := payload[key]
	if !ok {
		return nil, fmt.Errorf("parse judge response: missing %s", key)
	}
	raw, ok := value.([]any)
	if !ok {
		return nil, fmt.Errorf("parse judge response: invalid %s", key)
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		text, ok := item.(string)
		if !ok {
			return nil, fmt.Errorf("parse judge response: invalid %s", key)
		}
		out = append(out, strings.TrimSpace(text))
	}
	return out, nil
}

func parseRequiredObject(payload map[string]any, key string) (map[string]any, error) {
	value, ok := payload[key]
	if !ok {
		return nil, fmt.Errorf("parse judge response: missing %s", key)
	}
	obj, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("parse judge response: invalid %s", key)
	}
	return obj, nil
}

func parseOptionalScore(payload map[string]any, key string) (*float64, error) {
	value, ok := payload[key]
	if !ok {
		return nil, nil
	}
	score, err := parseJudgeScoreValue(value)
	if err != nil {
		return nil, err
	}
	return &score, nil
}

func parseRequiredInt(payload map[string]any, key string) (int, error) {
	value, ok := payload[key]
	if !ok {
		return 0, fmt.Errorf("parse judge response: missing %s", key)
	}
	switch v := value.(type) {
	case float64:
		return int(v), nil
	case string:
		num, err := strconv.Atoi(strings.TrimSpace(v))
		if err != nil {
			return 0, fmt.Errorf("parse judge response: invalid %s", key)
		}
		return num, nil
	default:
		return 0, fmt.Errorf("parse judge response: invalid %s", key)
	}
}
