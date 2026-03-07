package translator

import "strings"

func buildSystemPrompt(req Request) string {
	base := strings.TrimSpace(req.SystemPrompt)
	if base == "" {
		return "You are a translation assistant. Return only the translated text with no explanations, labels, markdown, or quotes unless the translated content itself requires them."
	}

	return base
}

func buildUserPrompt(req Request) string {
	if custom := strings.TrimSpace(req.UserPrompt); custom != "" {
		return custom
	}

	b := strings.Builder{}
	b.WriteString("Translate the following source text into the requested target language. Preserve placeholders, variables, and formatting.\n\n")
	b.WriteString("Target language: ")
	b.WriteString(strings.TrimSpace(req.TargetLanguage))
	b.WriteString("\n")

	b.WriteString("Source text:\n")
	b.WriteString(req.Source)
	return b.String()
}
