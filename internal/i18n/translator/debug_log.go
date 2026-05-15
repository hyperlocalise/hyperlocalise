package translator

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	envPromptDebugEnabled = "HYPERLOCALISE_PROMPT_DEBUG"
	envPromptDebugPath    = "HYPERLOCALISE_PROMPT_DEBUG_FILE"
	envGenericDebug       = "DEBUG"
	defaultPromptLogPath  = ".hyperlocalise/logs/prompt.log"
)

type promptDebugLogger struct {
	mu sync.Mutex
}

type promptDebugEvent struct {
	Timestamp      string `json:"timestamp"`
	Event          string `json:"event"`
	Provider       string `json:"provider"`
	Model          string `json:"model"`
	Source         string `json:"source,omitempty"`
	TargetLanguage string `json:"target_language"`
	SystemPrompt   string `json:"system_prompt,omitempty"`
	UserPrompt     string `json:"user_prompt,omitempty"`
	Output         string `json:"output,omitempty"`
	Error          string `json:"error,omitempty"`
	DurationMS     int64  `json:"duration_ms,omitempty"`
}

var (
	translatorPromptDebugLogger promptDebugLogger
	secretRegex                 = regexp.MustCompile(`\b(?i:(?:sk-[a-z0-9-]{20,}|hl_[a-z0-9]{20,}|gsk_[a-z0-9]{20,}|mistral_[a-z0-9]{20,}|AIza[a-z0-9_-]{35,}))\b|\bAKIA[A-Z0-9]{16}\b`)
	awsSecretAccessKeyRegex     = regexp.MustCompile(`(?i)\b((?:aws[ \t_-]*)?secret[ \t_-]*access[ \t_-]*key)(["']?\s*[:=]\s*["']?)([A-Za-z0-9/+=]{40})(["']?)([^A-Za-z0-9/+=]|$)`)
)

func logPromptCall(req Request, providerName, systemPrompt, userPrompt string) {
	translatorPromptDebugLogger.write(promptDebugEvent{
		Timestamp:      time.Now().UTC().Format(time.RFC3339Nano),
		Event:          "prompt_call",
		Provider:       providerName,
		Model:          strings.TrimSpace(req.Model),
		Source:         strings.TrimSpace(req.Source),
		TargetLanguage: strings.TrimSpace(req.TargetLanguage),
		SystemPrompt:   maskSecrets(systemPrompt),
		UserPrompt:     maskSecrets(userPrompt),
	})
}

func logPromptResult(req Request, providerName, output string, err error, duration time.Duration) {
	event := promptDebugEvent{
		Timestamp:      time.Now().UTC().Format(time.RFC3339Nano),
		Event:          "prompt_result",
		Provider:       providerName,
		Model:          strings.TrimSpace(req.Model),
		Source:         strings.TrimSpace(req.Source),
		TargetLanguage: strings.TrimSpace(req.TargetLanguage),
		Output:         maskSecrets(output),
		DurationMS:     duration.Milliseconds(),
	}
	if err != nil {
		event.Error = maskSecrets(err.Error())
	}
	translatorPromptDebugLogger.write(event)
}

func (l *promptDebugLogger) write(event promptDebugEvent) {
	enabled, path := resolvePromptDebugConfig()
	if !enabled {
		return
	}

	data, err := json.Marshal(event)
	if err != nil {
		return
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return
	}

	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer func() {
		_ = f.Close()
	}()

	_, _ = f.Write(append(data, '\n'))
}

func resolvePromptDebugConfig() (bool, string) {
	enabled := parsePromptDebugBool(os.Getenv(envPromptDebugEnabled))
	if !enabled {
		enabled = parsePromptDebugBool(os.Getenv(envGenericDebug))
	}
	path := strings.TrimSpace(os.Getenv(envPromptDebugPath))
	if path == "" {
		path = defaultPromptLogPath
	}
	return enabled, path
}

func parsePromptDebugBool(raw string) bool {
	if raw == "" {
		return false
	}
	parsed, err := strconv.ParseBool(strings.TrimSpace(raw))
	if err == nil {
		return parsed
	}

	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "on", "yes", "y":
		return true
	case "off", "no", "n":
		return false
	default:
		return false
	}
}

func maskSecrets(text string) string {
	if text == "" {
		return ""
	}
	text = secretRegex.ReplaceAllStringFunc(text, func(match string) string {
		return maskSecretValue(match)
	})
	return awsSecretAccessKeyRegex.ReplaceAllStringFunc(text, func(match string) string {
		parts := awsSecretAccessKeyRegex.FindStringSubmatch(match)
		if len(parts) != 6 {
			return match
		}
		return parts[1] + parts[2] + maskSecretValue(parts[3]) + parts[4] + parts[5]
	})
}

func maskSecretValue(value string) string {
	if len(value) < 12 {
		return "****"
	}
	return value[:8] + "..." + value[len(value)-4:]
}
