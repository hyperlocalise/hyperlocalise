package elevenlabs

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCloneVoiceUploadsEverySample(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "test-key", r.Header.Get("xi-api-key"))
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/v1/voices/add", r.URL.Path)
		require.NoError(t, r.ParseMultipartForm(1<<20))
		require.Equal(t, "Acme CEO", r.FormValue("name"))
		require.Equal(t, "Warm, measured", r.FormValue("description"))
		require.Equal(t, "false", r.FormValue("remove_background_noise"))
		var labels map[string]string
		require.NoError(t, json.Unmarshal([]byte(r.FormValue("labels")), &labels))
		require.Equal(t, map[string]string{"workspace": "org-1"}, labels)
		files := r.MultipartForm.File["files"]
		require.Len(t, files, 2)
		require.Equal(t, "sample-1.mp3", files[0].Filename)
		require.Equal(t, "sample-2.wav", files[1].Filename)
		first, err := files[0].Open()
		require.NoError(t, err)
		body, _ := io.ReadAll(first)
		require.Equal(t, "one", string(body))
		_, _ = w.Write([]byte(`{"voice_id":"c38kUX8pkfYO2kHyqfFy"}`))
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{APIKey: "test-key", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)
	id, err := client.CloneVoice(t.Context(), CloneVoiceRequest{
		Name:        " Acme CEO ",
		Description: "Warm, measured",
		Labels:      map[string]string{"workspace": "org-1"},
		Samples: []VoiceSample{
			{Bytes: []byte("one"), ContentType: "audio/mpeg"},
			{Bytes: []byte("two"), ContentType: "audio/wav"},
		},
	})
	require.NoError(t, err)
	require.Equal(t, "c38kUX8pkfYO2kHyqfFy", id)
}

func TestCloneVoiceValidates(t *testing.T) {
	client, err := NewClient(Config{APIKey: "test-key"})
	require.NoError(t, err)

	_, err = client.CloneVoice(t.Context(), CloneVoiceRequest{Samples: []VoiceSample{{Bytes: []byte("x")}}})
	require.Equal(t, ErrorCodeValidation, mustElevenLabsError(t, err).Code)

	_, err = client.CloneVoice(t.Context(), CloneVoiceRequest{Name: "Voice"})
	require.Equal(t, ErrorCodeValidation, mustElevenLabsError(t, err).Code)

	_, err = client.CloneVoice(t.Context(), CloneVoiceRequest{Name: "Voice", Samples: []VoiceSample{{}}})
	require.Equal(t, ErrorCodeValidation, mustElevenLabsError(t, err).Code)

	_, err = client.CloneVoice(t.Context(), CloneVoiceRequest{Name: "Voice", Samples: make([]VoiceSample, MaxCloneSamples+1)})
	require.Equal(t, ErrorCodeValidation, mustElevenLabsError(t, err).Code)
}

func TestDeleteVoiceTreatsMissingVoiceAsDeleted(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodDelete, r.Method)
		paths = append(paths, r.URL.Path)
		if r.URL.Path == "/v1/voices/goneVoiceId0000000" {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"detail":{"message":"voice not found"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{APIKey: "test-key", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)
	require.NoError(t, client.DeleteVoice(t.Context(), "c38kUX8pkfYO2kHyqfFy"))
	require.NoError(t, client.DeleteVoice(t.Context(), "goneVoiceId0000000"))
	require.Equal(t, []string{"/v1/voices/c38kUX8pkfYO2kHyqfFy", "/v1/voices/goneVoiceId0000000"}, paths)

	err = client.DeleteVoice(t.Context(), "../other")
	require.Equal(t, ErrorCodeValidation, mustElevenLabsError(t, err).Code)
}

func TestResolveVoiceMatchesPremadeNamesOnly(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/voices", r.URL.Path)
		_, _ = w.Write([]byte(`{"voices":[
			{"voice_id":"21m00Tcm4TlvDq8ikWAM","name":"Roger","category":"premade"},
			{"voice_id":"c38kUX8pkfYO2kHyqfFy","name":"Acme CEO","category":"cloned"},
			{"voice_id":"d48kUX8pkfYO2kHyqfFy","name":"Robot","category":"generated"}
		]}`))
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{APIKey: "test-key", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)

	id, err := client.ResolveVoice(t.Context(), "roger")
	require.NoError(t, err)
	require.Equal(t, "21m00Tcm4TlvDq8ikWAM", id)

	_, err = client.ResolveVoice(t.Context(), "Acme CEO")
	require.Equal(t, ErrorCodeValidation, mustElevenLabsError(t, err).Code)
	_, err = client.ResolveVoice(t.Context(), "Robot")
	require.Equal(t, ErrorCodeValidation, mustElevenLabsError(t, err).Code)
}
