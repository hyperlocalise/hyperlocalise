package main

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

type workspaceIdentityParityCases struct {
	Identity []struct {
		Input   string `json:"input"`
		Allowed bool   `json:"allowed"`
	} `json:"identity"`
	Payload []struct {
		Name   string                     `json:"name"`
		Body   json.RawMessage            `json:"body"`
		Data   map[string]string          `json:"data"`
		Issues []workspaceValidationIssue `json:"issues"`
	} `json:"payload"`
}

func loadWorkspaceIdentityParityCases(t *testing.T) workspaceIdentityParityCases {
	t.Helper()
	raw, err := os.ReadFile("testdata/workspace-identity/cases.json")
	require.NoError(t, err)
	var cases workspaceIdentityParityCases
	require.NoError(t, json.Unmarshal(raw, &cases))
	require.NotEmpty(t, cases.Identity)
	require.NotEmpty(t, cases.Payload)
	return cases
}

func TestWorkspaceIdentityParityFixtures(t *testing.T) {
	for _, tc := range loadWorkspaceIdentityParityCases(t).Identity {
		require.Equal(t, tc.Allowed, isAllowedWorkspaceIdentity(tc.Input), "%q", tc.Input)
	}
}

func TestWorkspaceSettingsPayloadParityFixtures(t *testing.T) {
	for _, tc := range loadWorkspaceIdentityParityCases(t).Payload {
		t.Run(tc.Name, func(t *testing.T) {
			var body any
			require.NoError(t, json.Unmarshal(tc.Body, &body))
			update, issues := validateWorkspaceSettingsUpdate(body)
			if tc.Issues != nil {
				require.Equal(t, tc.Issues, issues)
				return
			}
			require.Empty(t, issues)
			got := map[string]string{}
			if update.name != nil {
				got["name"] = *update.name
			}
			if update.slug != nil {
				got["slug"] = *update.slug
			}
			require.Equal(t, tc.Data, got)
		})
	}
}

func TestWorkspaceIdentityProfanityListEmbedded(t *testing.T) {
	require.Len(t, workspaceIdentityProfaneWords, 449)
	require.Contains(t, workspaceIdentityProfaneWords, "s.o.b.")
}

func TestJSTrimMatchesStringTrim(t *testing.T) {
	require.Equal(t, "a", jsTrim("\uFEFFa\uFEFF"))
	require.Equal(t, "\u0085a\u0085", jsTrim("\u0085a\u0085"))
	require.Equal(t, "a", jsTrim("\u00A0\u3000a\u2028\u2029"))
}
