package runsvc

import (
	"fmt"
	"strings"
)

var promptLeakSignatures = []string{
	"return only the translated text",
	"return only translated text",
	"do not include any explanations",
	"do not include explanations",
	"do not include labels",
	"do not include markdown",
	"do not include quotes",
	"返回仅包含译文的文本",
	"返回仅包含翻译文本",
	"仅翻译后的文本",
	"不要包含任何解释",
	"不要提供任何说明",
	"不要包含任何标签",
	"不要包含任何 markdown",
	"不要包含任何引号",
	"chỉ chứa bản dịch",
	"không bao gồm bất kỳ giải thích",
	"không bao gồm giải thích",
	"không bao gồm nhãn",
	"không bao gồm markdown",
	"không bao gồm dấu ngoặc kép",
}

func detectPromptLeak(source, translated string) (string, bool) {
	if strings.TrimSpace(translated) == "" {
		return "", false
	}

	sourceLower := strings.ToLower(source)
	translatedLower := strings.ToLower(translated)
	for _, sig := range promptLeakSignatures {
		normalized := strings.ToLower(sig)
		if strings.Contains(translatedLower, normalized) && !strings.Contains(sourceLower, normalized) {
			return sig, true
		}
	}

	return "", false
}

func validateTranslatedOutput(source, translated string) error {
	if signature, leaked := detectPromptLeak(source, translated); leaked {
		return fmt.Errorf("rejected translation output due to suspected prompt leakage (%q)", signature)
	}
	return nil
}
