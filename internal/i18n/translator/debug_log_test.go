package translator

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestTranslateWritesPromptDebugLogWhenEnabled(t *testing.T) {
	logPath := filepath.Join(t.TempDir(), ".hyperlocalise", "logs", "prompt.log")
	t.Setenv(envPromptDebugEnabled, "1")
	t.Setenv(envPromptDebugPath, logPath)

	tool := &Tool{providers: map[string]Provider{}}
	if err := tool.Register(fakeProvider{name: ProviderOpenAI, result: "bonjour"}); err != nil {
		t.Fatalf("register provider: %v", err)
	}

	_, err := tool.Translate(context.Background(), Request{
		Source:         "hello",
		TargetLanguage: "fr",
		ModelProvider:  ProviderOpenAI,
		Model:          "gpt-5-mini",
		SystemPrompt:   "system prompt",
		UserPrompt:     "user prompt",
	})
	if err != nil {
		t.Fatalf("translate: %v", err)
	}

	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read log: %v", err)
	}

	lines := splitNonEmptyLines(string(data))
	if len(lines) != 2 {
		t.Fatalf("expected 2 log lines, got %d: %q", len(lines), string(data))
	}

	var callEvent promptDebugEvent
	if err := json.Unmarshal([]byte(lines[0]), &callEvent); err != nil {
		t.Fatalf("unmarshal call event: %v", err)
	}
	if callEvent.Event != "prompt_call" {
		t.Fatalf("call event type = %q, want prompt_call", callEvent.Event)
	}
	if callEvent.SystemPrompt != "system prompt" {
		t.Fatalf("call system prompt = %q, want system prompt", callEvent.SystemPrompt)
	}
	if callEvent.UserPrompt != "user prompt" {
		t.Fatalf("call user prompt = %q, want user prompt", callEvent.UserPrompt)
	}

	var resultEvent promptDebugEvent
	if err := json.Unmarshal([]byte(lines[1]), &resultEvent); err != nil {
		t.Fatalf("unmarshal result event: %v", err)
	}
	if resultEvent.Event != "prompt_result" {
		t.Fatalf("result event type = %q, want prompt_result", resultEvent.Event)
	}
	if resultEvent.Output != "bonjour" {
		t.Fatalf("result output = %q, want bonjour", resultEvent.Output)
	}
	if resultEvent.Error != "" {
		t.Fatalf("result error = %q, want empty", resultEvent.Error)
	}
}

func TestTranslateWritesPromptDebugLogWhenGenericDebugEnabled(t *testing.T) {
	logPath := filepath.Join(t.TempDir(), ".hyperlocalise", "logs", "prompt.log")
	t.Setenv(envPromptDebugEnabled, "")
	t.Setenv(envGenericDebug, "1")
	t.Setenv(envPromptDebugPath, logPath)

	tool := &Tool{providers: map[string]Provider{}}
	if err := tool.Register(fakeProvider{name: ProviderOpenAI, result: "bonjour"}); err != nil {
		t.Fatalf("register provider: %v", err)
	}

	_, err := tool.Translate(context.Background(), Request{
		Source:         "hello",
		TargetLanguage: "fr",
		ModelProvider:  ProviderOpenAI,
		Model:          "gpt-5-mini",
	})
	if err != nil {
		t.Fatalf("translate: %v", err)
	}

	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read log: %v", err)
	}
	lines := splitNonEmptyLines(string(data))
	if len(lines) != 2 {
		t.Fatalf("expected 2 log lines, got %d: %q", len(lines), string(data))
	}
}

func splitNonEmptyLines(s string) []string {
	lines := []string{}
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] != '\n' {
			continue
		}
		if i > start {
			lines = append(lines, s[start:i])
		}
		start = i + 1
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}

func TestMaskSecrets(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "openai secret",
			in:   "my key is sk-proj-1234567890abcdef1234567890abcdef1234567890abcdef",
			want: "my key is sk-proj-...cdef",
		},
		{
			name: "hyperlocalise secret",
			in:   "secret hl_abc1234567890abcdef1234567890abcdef",
			want: "secret hl_abc12...cdef",
		},
		{
			name: "google secret",
			in:   "google AIzaSyA1234567890abcdef1234567890abcdefGH",
			want: "google AIzaSyA1...efGH",
		},
		{
			name: "anthropic secret",
			in:   "anthropic sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef",
			want: "anthropic sk-ant-a...cdef",
		},
		{
			name: "groq secret",
			in:   "groq gsk_1234567890abcdef1234567890abcdef1234567890abcdef",
			want: "groq gsk_1234...cdef",
		},
		{
			name: "mistral secret",
			in:   "mistral mistral_1234567890abcdef1234567890abcdef",
			want: "mistral mistral_...cdef",
		},
		{
			name: "aws access key",
			in:   "aws AKIA1234567890ABCDEF",
			want: "aws AKIA1234...CDEF",
		},
		{
			name: "lowercase aws access key lookalike",
			in:   "aws akia1234567890abcdef",
			want: "aws akia1234567890abcdef",
		},
		{
			name: "aws secret access key env var",
			in:   "AWS_SECRET_ACCESS_KEY=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/+=A",
			want: "AWS_SECRET_ACCESS_KEY=AbCdEfGh.../+=A",
		},
		{
			name: "aws bedrock credentials",
			in:   "AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF AWS_SECRET_ACCESS_KEY=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/+=A",
			want: "AWS_ACCESS_KEY_ID=AKIA1234...CDEF AWS_SECRET_ACCESS_KEY=AbCdEfGh.../+=A",
		},
		{
			name: "aws secret access key json",
			in:   `{"secretAccessKey":"AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/+=A","region":"us-east-1"}`,
			want: `{"secretAccessKey":"AbCdEfGh.../+=A","region":"us-east-1"}`,
		},
		{
			name: "unlabeled aws secret lookalike",
			in:   "token AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/+=A",
			want: "token AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/+=A",
		},
		{
			name: "multiple secrets",
			in:   "keys: sk-proj-1234567890abcdef1234567890abcdef1234567890abcdef and hl_abc1234567890abcdef1234567890abcdef",
			want: "keys: sk-proj-...cdef and hl_abc12...cdef",
		},
		{
			name: "no secrets",
			in:   "Translate to fr: hello world",
			want: "Translate to fr: hello world",
		},
		{
			name: "empty",
			in:   "",
			want: "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := maskSecrets(tc.in)
			if got != tc.want {
				t.Errorf("maskSecrets(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestTranslateSanitizesPromptDebugLog(t *testing.T) {
	logPath := filepath.Join(t.TempDir(), "prompt.log")
	t.Setenv(envPromptDebugEnabled, "1")
	t.Setenv(envPromptDebugPath, logPath)

	tool := &Tool{providers: map[string]Provider{}}
	if err := tool.Register(fakeProvider{
		name:   ProviderOpenAI,
		result: "output with hl_abc1234567890abcdef1234567890abcdef",
	}); err != nil {
		t.Fatalf("register provider: %v", err)
	}

	_, _ = tool.Translate(context.Background(), Request{
		Source:         "hello",
		TargetLanguage: "fr",
		ModelProvider:  ProviderOpenAI,
		Model:          "gpt-5-mini",
		SystemPrompt:   "system sk-proj-1234567890abcdef1234567890abcdef1234567890abcdef",
		UserPrompt:     "user sk-proj-1234567890abcdef1234567890abcdef1234567890abcdef",
	})

	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read log: %v", err)
	}

	lines := splitNonEmptyLines(string(data))
	if len(lines) != 2 {
		t.Fatalf("expected 2 log lines, got %d", len(lines))
	}

	var callEvent promptDebugEvent
	_ = json.Unmarshal([]byte(lines[0]), &callEvent)
	if callEvent.SystemPrompt != "system sk-proj-...cdef" {
		t.Errorf("system prompt not sanitized: %q", callEvent.SystemPrompt)
	}
	if callEvent.UserPrompt != "user sk-proj-...cdef" {
		t.Errorf("user prompt not sanitized: %q", callEvent.UserPrompt)
	}

	var resultEvent promptDebugEvent
	_ = json.Unmarshal([]byte(lines[1]), &resultEvent)
	if resultEvent.Output != "output with hl_abc12...cdef" {
		t.Errorf("output not sanitized: %q", resultEvent.Output)
	}
}

func TestTranslateSanitizesErrorInPromptDebugLog(t *testing.T) {
	logPath := filepath.Join(t.TempDir(), "prompt.log")
	t.Setenv(envPromptDebugEnabled, "1")
	t.Setenv(envPromptDebugPath, logPath)

	tool := &Tool{providers: map[string]Provider{}}
	if err := tool.Register(fakeProvider{
		name: ProviderOpenAI,
		err:  errors.New("failed with secret hl_abc1234567890abcdef1234567890abcdef"),
	}); err != nil {
		t.Fatalf("register provider: %v", err)
	}

	_, _ = tool.Translate(context.Background(), Request{
		Source:         "hello",
		TargetLanguage: "fr",
		ModelProvider:  ProviderOpenAI,
		Model:          "gpt-5-mini",
	})

	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read log: %v", err)
	}

	lines := splitNonEmptyLines(string(data))
	if len(lines) != 2 {
		t.Fatalf("expected 2 log lines, got %d", len(lines))
	}

	var resultEvent promptDebugEvent
	_ = json.Unmarshal([]byte(lines[1]), &resultEvent)
	if resultEvent.Error != "failed with secret hl_abc12...cdef" {
		t.Errorf("error not sanitized: %q", resultEvent.Error)
	}
}
