package cmd

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestUpdateCommand(t *testing.T) {
	originalRunner := selfUpdateRunner
	t.Cleanup(func() {
		selfUpdateRunner = originalRunner
	})

	called := false
	selfUpdateRunner = func(_ context.Context, version string, stdout, _ io.Writer) error {
		called = true
		if version != "" {
			t.Fatalf("unexpected version: %q", version)
		}
		_, _ = io.WriteString(stdout, "updated\n")
		return nil
	}

	cmd := newUpdateCmd()
	out := &bytes.Buffer{}
	cmd.SetOut(out)

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute update command: %v", err)
	}

	if !called {
		t.Fatalf("expected selfUpdateRunner to be called")
	}

	if got, want := out.String(), "updated\n"; got != want {
		t.Fatalf("unexpected output: got %q want %q", got, want)
	}
}

func TestUpdateCommandVersionArg(t *testing.T) {
	originalRunner := selfUpdateRunner
	t.Cleanup(func() {
		selfUpdateRunner = originalRunner
	})

	selfUpdateRunner = func(_ context.Context, version string, _, _ io.Writer) error {
		if got, want := version, "v1.2.3"; got != want {
			t.Fatalf("version mismatch: got %q want %q", got, want)
		}
		return nil
	}

	cmd := newUpdateCmd()
	cmd.SetArgs([]string{"v1.2.3"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute update command with version: %v", err)
	}
}

func TestUpdateCommandRunnerError(t *testing.T) {
	originalRunner := selfUpdateRunner
	t.Cleanup(func() {
		selfUpdateRunner = originalRunner
	})

	selfUpdateRunner = func(_ context.Context, _ string, _, _ io.Writer) error {
		return errors.New("network failure")
	}

	cmd := newUpdateCmd()
	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected error")
	}

	if !strings.Contains(err.Error(), "self update: network failure") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRunSelfUpdateDownloadsTaggedInstallerScript(t *testing.T) {
	originalClient := updateHTTPClient
	originalExecutor := selfUpdateExecutor
	t.Cleanup(func() {
		updateHTTPClient = originalClient
		selfUpdateExecutor = originalExecutor
	})

	var requested []string
	updateHTTPClient = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			requested = append(requested, req.URL.String())

			switch req.URL.String() {
			case githubReleaseAPIBase + "/latest":
				return httpResponse(http.StatusOK, `{"tag_name":"v1.2.3","assets":[]}`), nil
			case installerScriptURL("v1.2.3"):
				return httpResponse(http.StatusOK, "#!/usr/bin/env bash\necho install\n"), nil
			default:
				return httpResponse(http.StatusNotFound, "not found"), nil
			}
		}),
	}

	executedVersion := ""
	executedScript := ""
	selfUpdateExecutor = func(_ context.Context, script []byte, version string, _, _ io.Writer) error {
		executedVersion = version
		executedScript = string(script)
		return nil
	}

	if err := runSelfUpdate(context.Background(), "", io.Discard, io.Discard); err != nil {
		t.Fatalf("runSelfUpdate returned error: %v", err)
	}

	if executedVersion != "v1.2.3" {
		t.Fatalf("unexpected version: got %q want %q", executedVersion, "v1.2.3")
	}

	if !strings.Contains(executedScript, "echo install") {
		t.Fatalf("unexpected installer script: %q", executedScript)
	}

	if len(requested) != 2 {
		t.Fatalf("unexpected request count: got %d want %d", len(requested), 2)
	}
}

func TestRunSelfUpdateReportsInstallerDownloadFailure(t *testing.T) {
	originalClient := updateHTTPClient
	originalExecutor := selfUpdateExecutor
	t.Cleanup(func() {
		updateHTTPClient = originalClient
		selfUpdateExecutor = originalExecutor
	})

	updateHTTPClient = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			switch req.URL.String() {
			case githubReleaseAPIBase + "/latest":
				return httpResponse(http.StatusOK, `{"tag_name":"v1.2.3","assets":[]}`), nil
			case installerScriptURL("v1.2.3"):
				return httpResponse(http.StatusNotFound, "missing"), nil
			default:
				return httpResponse(http.StatusNotFound, "not found"), nil
			}
		}),
	}

	selfUpdateExecutor = func(_ context.Context, _ []byte, _ string, _, _ io.Writer) error {
		t.Fatal("executor should not be called when installer download fails")
		return nil
	}

	err := runSelfUpdate(context.Background(), "", io.Discard, io.Discard)
	if err == nil {
		t.Fatalf("expected error")
	}

	if !strings.Contains(err.Error(), "download installer script for v1.2.3") {
		t.Fatalf("unexpected error: %v", err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func httpResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     make(http.Header),
	}
}
