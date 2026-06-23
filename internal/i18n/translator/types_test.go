package translator

import (
	"strings"
	"testing"
)

func TestValidateRequest(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		req     Request
		wantErr string
	}{
		{
			name: "valid request",
			req: Request{
				Source:         "hello",
				TargetLanguage: "fr",
				Model:          "gpt-4o",
			},
			wantErr: "",
		},
		{
			name: "missing source",
			req: Request{
				Source:         "",
				TargetLanguage: "fr",
				Model:          "gpt-4o",
			},
			wantErr: "source is required",
		},
		{
			name: "whitespace source",
			req: Request{
				Source:         "   ",
				TargetLanguage: "fr",
				Model:          "gpt-4o",
			},
			wantErr: "source is required",
		},
		{
			name: "missing target language",
			req: Request{
				Source:         "hello",
				TargetLanguage: "",
				Model:          "gpt-4o",
			},
			wantErr: "target language is required",
		},
		{
			name: "whitespace target language",
			req: Request{
				Source:         "hello",
				TargetLanguage: "   ",
				Model:          "gpt-4o",
			},
			wantErr: "target language is required",
		},
		{
			name: "missing model",
			req: Request{
				Source:         "hello",
				TargetLanguage: "fr",
				Model:          "",
			},
			wantErr: "model is required",
		},
		{
			name: "whitespace model",
			req: Request{
				Source:         "hello",
				TargetLanguage: "fr",
				Model:          "   ",
			},
			wantErr: "model is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := validateRequest(tt.req)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			} else {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tt.wantErr)
				}
				if !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("error %q does not contain %q", err.Error(), tt.wantErr)
				}
			}
		})
	}
}

func TestValidateImageEditRequest(t *testing.T) {
	t.Parallel()

	validImg := []byte("fake-image-data")

	tests := []struct {
		name    string
		req     ImageEditRequest
		wantErr string
	}{
		{
			name: "valid request",
			req: ImageEditRequest{
				SourceImage:    validImg,
				TargetLanguage: "es",
				Model:          "dall-e-3",
				Prompt:         "translate text in image",
				OutputFormat:   "png",
			},
			wantErr: "",
		},
		{
			name: "missing source image (nil)",
			req: ImageEditRequest{
				SourceImage:    nil,
				TargetLanguage: "es",
				Model:          "dall-e-3",
				Prompt:         "translate text in image",
				OutputFormat:   "png",
			},
			wantErr: "source image is required",
		},
		{
			name: "missing source image (empty slice)",
			req: ImageEditRequest{
				SourceImage:    []byte{},
				TargetLanguage: "es",
				Model:          "dall-e-3",
				Prompt:         "translate text in image",
				OutputFormat:   "png",
			},
			wantErr: "source image is required",
		},
		{
			name: "missing target language",
			req: ImageEditRequest{
				SourceImage:    validImg,
				TargetLanguage: "",
				Model:          "dall-e-3",
				Prompt:         "translate text in image",
				OutputFormat:   "png",
			},
			wantErr: "target language is required",
		},
		{
			name: "whitespace target language",
			req: ImageEditRequest{
				SourceImage:    validImg,
				TargetLanguage: "   ",
				Model:          "dall-e-3",
				Prompt:         "translate text in image",
				OutputFormat:   "png",
			},
			wantErr: "target language is required",
		},
		{
			name: "missing model",
			req: ImageEditRequest{
				SourceImage:    validImg,
				TargetLanguage: "es",
				Model:          "",
				Prompt:         "translate text in image",
				OutputFormat:   "png",
			},
			wantErr: "model is required",
		},
		{
			name: "whitespace model",
			req: ImageEditRequest{
				SourceImage:    validImg,
				TargetLanguage: "es",
				Model:          "   ",
				Prompt:         "translate text in image",
				OutputFormat:   "png",
			},
			wantErr: "model is required",
		},
		{
			name: "missing prompt",
			req: ImageEditRequest{
				SourceImage:    validImg,
				TargetLanguage: "es",
				Model:          "dall-e-3",
				Prompt:         "",
				OutputFormat:   "png",
			},
			wantErr: "prompt is required",
		},
		{
			name: "whitespace prompt",
			req: ImageEditRequest{
				SourceImage:    validImg,
				TargetLanguage: "es",
				Model:          "dall-e-3",
				Prompt:         "   ",
				OutputFormat:   "png",
			},
			wantErr: "prompt is required",
		},
		{
			name: "unsupported format",
			req: ImageEditRequest{
				SourceImage:    validImg,
				TargetLanguage: "es",
				Model:          "dall-e-3",
				Prompt:         "translate",
				OutputFormat:   "bmp",
			},
			wantErr: "unsupported output format \"bmp\"",
		},
		{
			name: "valid formats case-insensitive",
			req: ImageEditRequest{
				SourceImage:    validImg,
				TargetLanguage: "es",
				Model:          "dall-e-3",
				Prompt:         "translate",
				OutputFormat:   " JPEG ",
			},
			wantErr: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := validateImageEditRequest(tt.req)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			} else {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tt.wantErr)
				}
				if !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("error %q does not contain %q", err.Error(), tt.wantErr)
				}
			}
		})
	}
}

func TestNormalizeProvider(t *testing.T) {
	t.Parallel()

	tests := []struct {
		in   string
		want string
	}{
		{"OpenAI", "openai"},
		{"  Anthropic  ", "anthropic"},
		{"", ""},
		{"\tGEMINI\n", "gemini"},
	}

	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			t.Parallel()
			if got := normalizeProvider(tt.in); got != tt.want {
				t.Fatalf("normalizeProvider(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}
