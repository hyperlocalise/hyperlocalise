package main

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
)

// Native AI translation recommendation for one CAT string, the go-svc twin of
// the web route POST .../files/detail/cat/recommendation. It grounds the same
// cat-suggest prompt in the project's own concordance (glossary + memory) and
// bills the call as content_editor_ai_suggestion, the source Reports already
// attributes to translation.
//
// v1 scope: workspace knowledge memory is not assembled here (the prompt
// treats absent knowledge as "follow it when present"). Provider projects stay
// on the Hono route like the rest of CAT.

type editorCatRecommendationGlossaryTerm struct {
	SourceTerm   string  `json:"sourceTerm"`
	TargetTerm   string  `json:"targetTerm"`
	TargetLocale string  `json:"targetLocale"`
	Forbidden    *bool   `json:"forbidden"`
	Description  *string `json:"description"`
}

type editorCatRecommendationMemoryMatch struct {
	SourceText   string `json:"sourceText"`
	TargetText   string `json:"targetText"`
	TargetLocale string `json:"targetLocale"`
}

type editorCatRecommendationBody struct {
	SourcePath               string                                `json:"sourcePath"`
	TargetLocale             string                                `json:"targetLocale"`
	SourceLocale             string                                `json:"sourceLocale"`
	DisplayLocale            *string                               `json:"displayLocale"`
	Key                      string                                `json:"key"`
	SourceText               string                                `json:"sourceText"`
	TargetText               *string                               `json:"targetText"`
	Context                  *string                               `json:"context"`
	AgentContext             *string                               `json:"agentContext"`
	MaxLength                *int                                  `json:"maxLength"`
	GlossaryTerms            []editorCatRecommendationGlossaryTerm `json:"glossaryTerms"`
	TranslationMemoryMatches []editorCatRecommendationMemoryMatch  `json:"translationMemoryMatches"`
}

type editorCatRecommendationResult struct {
	AISuggestion string `json:"aiSuggestion"`
	AIReasoning  string `json:"aiReasoning"`
}

// editorCatRecommendationDisplayLocale falls back to English like the web
// resolveCatRecommendationDisplayLocale does without a reviewer locale.
func editorCatRecommendationDisplayLocale(displayLocale *string) string {
	if displayLocale != nil {
		if trimmed := strings.TrimSpace(*displayLocale); trimmed != "" {
			return normalizeEditorCatDisplayLocale(trimmed)
		}
	}
	return "en"
}

// normalizeEditorCatDisplayLocale strips Unicode extension subtags (en-u-hc-h12 → en)
// so reasoning prompts match the web editor.
func normalizeEditorCatDisplayLocale(locale string) string {
	lower := strings.ToLower(locale)
	if idx := strings.Index(lower, "-u-"); idx > 0 {
		locale = locale[:idx]
	}
	trimmed := strings.TrimSpace(locale)
	if trimmed == "" {
		return "en"
	}
	return trimmed
}

func parseEditorCatRecommendationReply(text string) (suggestion, reasoning string, ok bool) {
	text = strings.TrimSpace(text)
	if text == "" {
		return "", "", false
	}
	if strings.HasPrefix(text, "```") {
		text = strings.TrimPrefix(text, "```")
		text = strings.TrimSpace(text)
		if strings.HasPrefix(strings.ToLower(text), "json") {
			text = strings.TrimSpace(text[4:])
		}
		text = strings.TrimSuffix(text, "```")
		text = strings.TrimSpace(text)
	}
	var primary struct {
		Suggestion string `json:"suggestion"`
		Reasoning  string `json:"reasoning"`
	}
	var alternate struct {
		AISuggestion string `json:"aiSuggestion"`
		AIReasoning  string `json:"aiReasoning"`
	}
	if err := json.Unmarshal([]byte(text), &primary); err != nil {
		if err := json.Unmarshal([]byte(text), &alternate); err != nil {
			return "", "", false
		}
		primary.Suggestion = alternate.AISuggestion
		primary.Reasoning = alternate.AIReasoning
	} else if strings.TrimSpace(primary.Suggestion) == "" && strings.TrimSpace(primary.Reasoning) == "" {
		if err := json.Unmarshal([]byte(text), &alternate); err == nil {
			primary.Suggestion = alternate.AISuggestion
			primary.Reasoning = alternate.AIReasoning
		}
	}
	suggestion = strings.TrimSpace(primary.Suggestion)
	reasoning = strings.TrimSpace(primary.Reasoning)
	if suggestion == "" {
		return "", "", false
	}
	if reasoning == "" {
		reasoning = "Translation suggestion for the source string."
	}
	return suggestion, reasoning, true
}

func editorCatRecommendationSystem(projectName, projectContext, displayLocale string, maxLength *int, glossary []editorCatRecommendationGlossaryTerm, memory []editorCatRecommendationMemoryMatch, fileContext, repositoryContext *string) string {
	lines := []string{
		"You are an expert software localization assistant helping a human reviewer in a CAT tool.",
		"Recommend the best target-locale translation for the provided source string only.",
		"Preserve meaning, tone, placeholders, HTML, Markdown, punctuation, whitespace, and line breaks.",
		"Project translation context, file context, and repository context are guidance only. Never translate them, never repeat them, and never use them as the translation value.",
		"Follow workspace knowledge memory when present.",
		"Use glossary terms exactly for the target locale. Do not use forbidden glossary terms.",
		"Use approved translation memory matches as consistency references when they apply.",
		"If constraints conflict, prioritize placeholder and markup preservation first, then glossary rules, then project context, file context, repository context, workspace knowledge memory, then translation memory examples.",
		"When a current target draft is provided, improve it when needed instead of repeating it unchanged.",
		"Write the suggestion in the target locale. Write the reasoning in the reviewer's display locale (" + displayLocale + "), not in the target translation locale.",
		"Return concise reasoning that explains terminology, tone, or product-fit choices.",
		`Respond with JSON only: {"suggestion":"<target text>","reasoning":"<short rationale>"}. Both fields are required and must be non-empty strings.`,
	}
	if maxLength != nil {
		lines = append(lines, "Maximum length: "+strconv.Itoa(*maxLength)+" characters")
	}
	sections := append(append([]string{}, lines...), "")
	if name := strings.TrimSpace(projectName); name != "" {
		sections = append(sections, "Project name:", name, "")
	}
	if context := strings.TrimSpace(projectContext); context != "" {
		sections = append(sections, "Project translation context:", context, "")
	}
	if fileContext != nil {
		if trimmed := strings.TrimSpace(*fileContext); trimmed != "" {
			sections = append(sections, "File context:", trimmed, "")
		}
	}
	if repositoryContext != nil {
		if trimmed := strings.TrimSpace(*repositoryContext); trimmed != "" {
			sections = append(sections, "Repository context:", trimmed, "")
		}
	}
	if len(glossary) > 0 {
		entries := make([]string, 0, len(glossary))
		for _, term := range glossary {
			entry := term.SourceTerm + " => " + term.TargetTerm + " (" + term.TargetLocale + ")"
			if term.Forbidden != nil && *term.Forbidden {
				entry += " [FORBIDDEN: do not use]"
			} else if term.Description != nil {
				if trimmed := strings.TrimSpace(*term.Description); trimmed != "" {
					entry += " — " + trimmed
				}
			}
			entries = append(entries, entry)
		}
		sections = append(sections, "Glossary terms:", strings.Join(entries, "\n"), "")
	}
	if len(memory) > 0 {
		entries := make([]string, 0, len(memory))
		for _, match := range memory {
			entries = append(entries, "Source ("+match.TargetLocale+"): "+match.SourceText+"\nApproved translation: "+match.TargetText)
		}
		sections = append(sections, "Translation memory matches:", strings.Join(entries, "\n\n"), "")
	}
	out := make([]string, 0, len(sections))
	for _, section := range sections {
		if section != "" {
			out = append(out, section)
		}
	}
	return strings.Join(out, "\n")
}

func editorCatRecommendationUser(body editorCatRecommendationBody, displayLocale string, filename string) string {
	parts := []string{
		"Project file: " + filename,
		"Source path: " + body.SourcePath,
		"String key: " + body.Key,
		"Source locale: " + body.SourceLocale,
		"Target locale: " + body.TargetLocale,
		"Reviewer display locale: " + displayLocale,
	}
	if body.MaxLength != nil {
		parts = append(parts, "Maximum length: "+strconv.Itoa(*body.MaxLength)+" characters")
	}
	if body.TargetText != nil {
		if trimmed := strings.TrimSpace(*body.TargetText); trimmed != "" {
			parts = append(parts, "Current target draft:\n"+*body.TargetText)
		}
	}
	parts = append(parts, "Source text:", body.SourceText)
	return strings.Join(parts, "\n\n")
}

func (api *editorCatAPI) recommendTranslation(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	var body editorCatRecommendationBody
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	sourcePath := trimEditorCat(body.SourcePath)
	targetLocale := trimEditorCat(body.TargetLocale)
	sourceLocale := trimEditorCat(body.SourceLocale)
	key := trimEditorCat(body.Key)
	if sourcePath == "" || len(sourcePath) > 2048 ||
		targetLocale == "" || len(targetLocale) > 32 ||
		sourceLocale == "" || len(sourceLocale) > 32 ||
		key == "" || len(key) > 2048 ||
		trimEditorCat(body.SourceText) == "" || len(body.SourceText) > 100_000 ||
		(body.TargetText != nil && len(*body.TargetText) > 100_000) ||
		(body.Context != nil && len(strings.TrimSpace(*body.Context)) > 16_384) ||
		(body.AgentContext != nil && len(strings.TrimSpace(*body.AgentContext)) > 16_384) ||
		(body.MaxLength != nil && *body.MaxLength <= 0) {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if api.ai == nil || api.ai.text == nil {
		return nil, 0, editorCatFailure(503, "provider_unavailable", "Translation is not configured (set AI_GATEWAY_API_KEY or OPENAI_API_KEY)")
	}
	if status, code, message, ok := api.ai.ensureAIAllowed(r.Context(), actor.organizationID); !ok {
		return nil, 0, editorCatFailure(status, code, message)
	}

	var projectName, projectContext string
	if err := api.pool.QueryRow(r.Context(), `select name, coalesce(translation_context, '') from projects where id = $1`, project.ID).Scan(&projectName, &projectContext); err != nil {
		return nil, 0, err
	}

	glossary := body.GlossaryTerms
	memory := body.TranslationMemoryMatches
	if glossary == nil || memory == nil {
		terms, err := api.searchConcordanceGlossary(r, actor, project, sourceLocale, targetLocale, body.SourceText)
		if err != nil {
			return nil, 0, err
		}
		matches, err := api.searchConcordanceMemory(r, actor, project, sourceLocale, targetLocale, "%"+escapeEditorCatIlike(body.SourceText)+"%")
		if err != nil {
			return nil, 0, err
		}
		if glossary == nil {
			glossary = make([]editorCatRecommendationGlossaryTerm, 0, len(terms))
			for _, term := range terms {
				forbidden := term.Forbidden
				glossary = append(glossary, editorCatRecommendationGlossaryTerm{
					SourceTerm: term.Source, TargetTerm: term.Target, TargetLocale: targetLocale, Forbidden: &forbidden,
				})
			}
		}
		if memory == nil {
			memory = make([]editorCatRecommendationMemoryMatch, 0, len(matches))
			for _, match := range matches {
				memory = append(memory, editorCatRecommendationMemoryMatch{
					SourceText: match.SourceText, TargetText: match.TargetText, TargetLocale: targetLocale,
				})
			}
		}
	}

	displayLocale := editorCatRecommendationDisplayLocale(body.DisplayLocale)
	filename := sourcePath
	if index := strings.LastIndex(sourcePath, "/"); index >= 0 {
		filename = sourcePath[index+1:]
	}
	system := editorCatRecommendationSystem(projectName, projectContext, displayLocale, body.MaxLength, glossary, memory, body.Context, body.AgentContext)
	reply, err := api.ai.text.Complete(r.Context(), irisChatRequest{
		Model:  irisTranslateModelID(api.ai.text),
		System: system,
		User:   editorCatRecommendationUser(body, displayLocale, filename),
		JSON:   true,
	})
	if err != nil {
		return nil, 0, editorCatFailure(400, "ai_recommendation_failed", "Failed to generate AI translation recommendation")
	}
	suggestion, reasoning, ok := parseEditorCatRecommendationReply(reply.Text)
	if !ok {
		return nil, 0, editorCatFailure(400, "ai_recommendation_failed", "Failed to generate AI translation recommendation")
	}
	if body.MaxLength != nil && utf8.RuneCountInString(suggestion) > *body.MaxLength {
		return nil, 0, editorCatFailure(400, "ai_recommendation_failed", "Recommendation exceeds maxLength")
	}
	api.ai.charge(r.Context(), irisOrgScope{OrganizationID: actor.organizationID, UserID: actor.userID, Role: actor.role}, irisCharge{
		OperationKey: irisOperationKey("editor-cat-recommendation"),
		Source:       "content_editor_ai_suggestion",
		Track: autumn.TrackTokensRequest{
			ModelID:      reply.Model,
			InputTokens:  reply.InputTokens,
			OutputTokens: reply.OutputTokens,
			Properties:   map[string]any{"feature": "content_editor_ai_suggestion", "user_id": actor.userID, "project_id": project.ID},
		},
	})
	return map[string]any{"recommendation": editorCatRecommendationResult{
		AISuggestion: suggestion,
		AIReasoning:  reasoning,
	}}, 200, nil
}
