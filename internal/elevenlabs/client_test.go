package elevenlabs

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNewClientRequiresAPIKey(t *testing.T) {
	_, err := NewClient(Config{})
	require.Error(t, err)
}

func TestCreateSpeechResolvesVoiceName(t *testing.T) {
	var speechBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "test-key", r.Header.Get("xi-api-key"))
		switch r.URL.Path {
		case "/v1/voices":
			require.Equal(t, http.MethodGet, r.Method)
			_, _ = w.Write([]byte(`{"voices":[{"voice_id":"21m00Tcm4TlvDq8ikWAM","name":"Roger"}]}`))
		case "/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM":
			require.Equal(t, http.MethodPost, r.Method)
			require.Equal(t, "mp3_44100_128", r.URL.Query().Get("output_format"))
			require.NoError(t, json.NewDecoder(r.Body).Decode(&speechBody))
			w.Header().Set("Content-Type", "audio/mpeg")
			_, _ = w.Write([]byte("mp3-bytes"))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{APIKey: "test-key", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)

	audio, err := client.CreateSpeech(t.Context(), SpeechRequest{
		Text:    "hello",
		Voice:   "Roger",
		ModelID: "eleven_v3",
	})
	require.NoError(t, err)
	require.Equal(t, []byte("mp3-bytes"), audio.Bytes)
	require.Equal(t, "audio/mpeg", audio.ContentType)
	require.Equal(t, "hello", speechBody["text"])
	require.Equal(t, "eleven_v3", speechBody["model_id"])
}

func TestCreateSpeechUsesVoiceIDDirectly(t *testing.T) {
	var voicesCalled bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/voices" {
			voicesCalled = true
			_, _ = w.Write([]byte(`{"voices":[]}`))
			return
		}
		require.Equal(t, "/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM", r.URL.Path)
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write([]byte("ok"))
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{APIKey: "test-key", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)
	audio, err := client.CreateSpeech(t.Context(), SpeechRequest{
		Text:  "hello",
		Voice: "21m00Tcm4TlvDq8ikWAM",
	})
	require.NoError(t, err)
	require.Equal(t, []byte("ok"), audio.Bytes)
	require.False(t, voicesCalled)
}

func TestComposeMusicAndSoundEffect(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		path string
		run  func(*Client) (Audio, error)
		want map[string]any
	}{
		{
			name: "music",
			path: "/v1/music",
			run: func(client *Client) (Audio, error) {
				return client.ComposeMusic(t.Context(), MusicRequest{Prompt: "a score", DurationSeconds: 12})
			},
			want: map[string]any{"prompt": "a score", "model_id": "music_v1", "music_length_ms": float64(12000)},
		},
		{
			name: "sound effect",
			path: "/v1/sound-generation",
			run: func(client *Client) (Audio, error) {
				return client.CreateSoundEffect(t.Context(), SoundEffectRequest{Text: "rain", DurationSeconds: 8})
			},
			want: map[string]any{"text": "rain", "model_id": "eleven_text_to_sound_v2", "duration_seconds": float64(8)},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			var payload map[string]any
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				require.Equal(t, tc.path, r.URL.Path)
				body, err := io.ReadAll(r.Body)
				require.NoError(t, err)
				require.NoError(t, json.Unmarshal(body, &payload))
				w.Header().Set("Content-Type", "audio/mpeg")
				_, _ = w.Write([]byte("audio"))
			}))
			t.Cleanup(server.Close)

			client, err := NewClientWithHTTPClient(Config{APIKey: "key", BaseURL: server.URL}, server.Client())
			require.NoError(t, err)
			audio, err := tc.run(client)
			require.NoError(t, err)
			require.Equal(t, []byte("audio"), audio.Bytes)
			require.Equal(t, tc.want, payload)
		})
	}
}

func TestClientMapsHTTPErrors(t *testing.T) {
	t.Parallel()
	cases := []struct {
		status int
		body   string
		code   ErrorCode
	}{
		{status: http.StatusUnauthorized, body: `{"detail":{"message":"invalid key"}}`, code: ErrorCodeAuthFailed},
		{status: http.StatusTooManyRequests, body: `{"detail":"slow down"}`, code: ErrorCodeRateLimited},
		{status: http.StatusUnprocessableEntity, body: `{"detail":"bad voice"}`, code: ErrorCodeValidation},
		{status: http.StatusBadGateway, body: `upstream`, code: ErrorCodeUpstreamUnavailable},
	}
	for _, tc := range cases {
		t.Run(string(tc.code), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			t.Cleanup(server.Close)
			client, err := NewClientWithHTTPClient(Config{APIKey: "key", BaseURL: server.URL}, server.Client())
			require.NoError(t, err)
			_, err = client.CreateSoundEffect(t.Context(), SoundEffectRequest{Text: "boom"})
			typed, ok := AsError(err)
			require.True(t, ok)
			require.Equal(t, tc.code, typed.Code)
		})
	}
}

func TestCreateSpeechValidation(t *testing.T) {
	client, err := NewClient(Config{APIKey: "key"})
	require.NoError(t, err)
	_, err = client.CreateSpeech(t.Context(), SpeechRequest{Voice: "Roger"})
	require.Equal(t, ErrorCodeValidation, mustElevenLabsError(t, err).Code)
	_, err = client.ComposeMusic(t.Context(), MusicRequest{})
	require.Equal(t, ErrorCodeValidation, mustElevenLabsError(t, err).Code)
}

func mustElevenLabsError(t *testing.T, err error) *Error {
	t.Helper()
	typed, ok := AsError(err)
	require.True(t, ok)
	return typed
}
