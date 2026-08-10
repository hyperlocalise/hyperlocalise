package translator

import (
	"context"
	"strings"
	"testing"
)

type scoutEmptyNameProvider struct{}

func (p scoutEmptyNameProvider) Name() string { return "  " }
func (p scoutEmptyNameProvider) Translate(ctx context.Context, req Request) (string, error) {
	return "ok", nil
}

type scoutSimpleProvider struct {
	name string
}

func (p scoutSimpleProvider) Name() string { return p.name }
func (p scoutSimpleProvider) Translate(ctx context.Context, req Request) (string, error) {
	return "ok", nil
}

func TestRegister_ScoutEdgeCases(t *testing.T) {
	t.Parallel()

	t.Run("nil provider error", func(t *testing.T) {
		t.Parallel()
		tool := &Tool{providers: map[string]Provider{}}
		err := tool.Register(nil)
		if err == nil {
			t.Fatal("expected error registering nil provider, got nil")
		}
		if !strings.Contains(err.Error(), "provider must not be nil") {
			t.Fatalf("unexpected error message: %v", err)
		}
	})

	t.Run("empty/whitespace provider name error", func(t *testing.T) {
		t.Parallel()
		tool := &Tool{providers: map[string]Provider{}}
		err := tool.Register(scoutEmptyNameProvider{})
		if err == nil {
			t.Fatal("expected error registering empty name provider, got nil")
		}
		if !strings.Contains(err.Error(), "name must not be empty") {
			t.Fatalf("unexpected error message: %v", err)
		}
	})
}

func TestMustRegister_ScoutEdgeCases(t *testing.T) {
	t.Run("success registration", func(t *testing.T) {
		tool := &Tool{providers: map[string]Provider{}}
		p := scoutSimpleProvider{name: "scout-p1"}

		// Should not panic
		tool.MustRegister(p)

		tool.mu.RLock()
		registered, exists := tool.providers["scout-p1"]
		tool.mu.RUnlock()

		if !exists {
			t.Fatal("expected provider to be registered")
		}
		if registered.Name() != "scout-p1" {
			t.Fatalf("expected registered name 'scout-p1', got %q", registered.Name())
		}
	})

	t.Run("panic on duplicate registration", func(t *testing.T) {
		tool := &Tool{providers: map[string]Provider{}}
		p := scoutSimpleProvider{name: "scout-duplicate"}

		tool.MustRegister(p)

		defer func() {
			r := recover()
			if r == nil {
				t.Fatal("expected MustRegister to panic on duplicate provider registration, but it did not")
			}
			err, ok := r.(error)
			if !ok {
				t.Fatalf("expected panic value to be an error, got %T", r)
			}
			if !strings.Contains(err.Error(), "already registered") {
				t.Fatalf("unexpected panic message: %v", err)
			}
		}()

		tool.MustRegister(p)
	})
}

func TestEditImage_UnsupportedProvider(t *testing.T) {
	t.Parallel()

	tool := &Tool{providers: map[string]Provider{}}
	p := scoutSimpleProvider{name: "no-image-support"}
	if err := tool.Register(p); err != nil {
		t.Fatalf("unexpected registration error: %v", err)
	}

	req := ImageEditRequest{
		SourceImage:    []byte("some-image-data"),
		TargetLanguage: "es",
		Model:          "some-model",
		Prompt:         "translate text",
		OutputFormat:   "png",
		ModelProvider:  "no-image-support",
	}

	_, err := tool.EditImage(context.Background(), req)
	if err == nil {
		t.Fatal("expected EditImage to fail for provider that does not implement ImageProvider, got nil")
	}
	if !strings.Contains(err.Error(), "does not support image editing") {
		t.Fatalf("unexpected error message: %v", err)
	}
}

func TestParsePromptDebugBool_Scout(t *testing.T) {
	t.Parallel()

	tests := []struct {
		in   string
		want bool
	}{
		// Empty / whitespace
		{"", false},
		{"   ", false},
		// Truthy strings
		{"on", true},
		{"yes", true},
		{"y", true},
		{"ON", true},
		{"Yes", true},
		{"Y  ", true},
		// Falsy strings
		{"off", false},
		{"no", false},
		{"n", false},
		{"OFF", false},
		{"No", false},
		{"N", false},
		// Standard boolean representations
		{"1", true},
		{"true", true},
		{"t", true},
		{"TRUE", true},
		{"True", true},
		{"0", false},
		{"false", false},
		{"f", false},
		{"FALSE", false},
		{"False", false},
		// Invalid fallbacks
		{"invalid", false},
		{"maybe", false},
		{"123", false},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.in, func(t *testing.T) {
			t.Parallel()
			got := parsePromptDebugBool(tt.in)
			if got != tt.want {
				t.Errorf("parsePromptDebugBool(%q) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}

func TestAppendRuntimeContextToSystemPrompt_EmptyBase(t *testing.T) {
	t.Parallel()

	t.Run("empty base prompt with context", func(t *testing.T) {
		t.Parallel()
		got := appendRuntimeContextToSystemPrompt("", "some context")
		expected := "Runtime translation context (guidance only; never translate, repeat, or use as the translation value):\nsome context"
		if got != expected {
			t.Fatalf("expected:\n%q\ngot:\n%q", expected, got)
		}
	})

	t.Run("whitespace base prompt with context", func(t *testing.T) {
		t.Parallel()
		got := appendRuntimeContextToSystemPrompt("   \n\t  ", "some context")
		expected := "Runtime translation context (guidance only; never translate, repeat, or use as the translation value):\nsome context"
		if got != expected {
			t.Fatalf("expected:\n%q\ngot:\n%q", expected, got)
		}
	})

	t.Run("whitespace context is no-op", func(t *testing.T) {
		t.Parallel()
		got := appendRuntimeContextToSystemPrompt("base system", "   \t\n  ")
		if got != "base system" {
			t.Fatalf("expected 'base system', got %q", got)
		}
	})
}

func TestMaskSecrets_ShortSecrets(t *testing.T) {
	t.Parallel()

	// Direct test of maskSecretValue with values less than 12 characters.
	t.Run("maskSecretValue short value", func(t *testing.T) {
		t.Parallel()
		got := maskSecretValue("short")
		if got != "****" {
			t.Fatalf("expected '****', got %q", got)
		}
	})

	t.Run("maskSecretValue boundary at 12 characters", func(t *testing.T) {
		t.Parallel()
		got := maskSecretValue("123456789012") // length 12
		expected := "12345678...9012"
		if got != expected {
			t.Fatalf("expected %q, got %q", expected, got)
		}
	})

	t.Run("maskSecretValue longer value", func(t *testing.T) {
		t.Parallel()
		got := maskSecretValue("123456789012345") // length 15
		expected := "12345678...2345"
		if got != expected {
			t.Fatalf("expected %q, got %q", expected, got)
		}
	})
}
