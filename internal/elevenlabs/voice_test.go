package elevenlabs

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestIsolateVoiceUploadsMedia(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "test-key", r.Header.Get("xi-api-key"))
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/v1/audio-isolation", r.URL.Path)
		require.NoError(t, r.ParseMultipartForm(1<<20))
		file, header, err := r.FormFile("audio")
		require.NoError(t, err)
		body, _ := io.ReadAll(file)
		require.Equal(t, "video-bytes", string(body))
		require.Equal(t, "media.mp4", header.Filename)
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write([]byte("speech"))
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{APIKey: "test-key", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)
	audio, err := client.IsolateVoice(t.Context(), IsolationRequest{Media: []byte("video-bytes"), ContentType: "video/mp4"})
	require.NoError(t, err)
	require.Equal(t, []byte("speech"), audio.Bytes)
	require.Equal(t, "audio/mpeg", audio.ContentType)
}

func TestChangeVoiceSendsVoiceAndOptions(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/speech-to-speech/21m00Tcm4TlvDq8ikWAM", r.URL.Path)
		require.Equal(t, "mp3_44100_128", r.URL.Query().Get("output_format"))
		require.NoError(t, r.ParseMultipartForm(1<<20))
		require.Equal(t, "eleven_multilingual_sts_v2", r.FormValue("model_id"))
		require.Equal(t, "true", r.FormValue("remove_background_noise"))
		file, _, err := r.FormFile("audio")
		require.NoError(t, err)
		body, _ := io.ReadAll(file)
		require.Equal(t, "audio-bytes", string(body))
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write([]byte("revoiced"))
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{APIKey: "test-key", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)
	audio, err := client.ChangeVoice(t.Context(), VoiceChangeRequest{
		Media:                 []byte("audio-bytes"),
		ContentType:           "audio/mpeg",
		Voice:                 "21m00Tcm4TlvDq8ikWAM",
		RemoveBackgroundNoise: true,
	})
	require.NoError(t, err)
	require.Equal(t, []byte("revoiced"), audio.Bytes)
}

func TestVoiceToolsValidate(t *testing.T) {
	client, err := NewClient(Config{APIKey: "test-key"})
	require.NoError(t, err)

	_, err = client.IsolateVoice(t.Context(), IsolationRequest{})
	require.Equal(t, ErrorCodeValidation, mustElevenLabsError(t, err).Code)

	_, err = client.ChangeVoice(t.Context(), VoiceChangeRequest{Voice: "21m00Tcm4TlvDq8ikWAM"})
	require.Equal(t, ErrorCodeValidation, mustElevenLabsError(t, err).Code)

	_, err = client.ChangeVoice(t.Context(), VoiceChangeRequest{Media: []byte("x")})
	require.Equal(t, ErrorCodeValidation, mustElevenLabsError(t, err).Code)
}
