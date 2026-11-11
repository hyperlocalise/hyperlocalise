package main

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPipesCredentialOwnerWorkosUserID(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name, actor, author, want string
	}{
		{name: "prefers actor", actor: "user_actor", author: "user_author", want: "user_actor"},
		{name: "falls back to author", actor: "", author: "user_author", want: "user_author"},
		{name: "trims whitespace", actor: "  user_actor  ", author: "", want: "user_actor"},
		{name: "skips invited actor", actor: invitedWorkosUserIDPrefix + "abc", author: "user_author", want: "user_author"},
		{name: "skips invited author", actor: "", author: invitedWorkosUserIDPrefix + "abc", want: ""},
		{name: "empty", actor: " ", author: "", want: ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tt.want, pipesCredentialOwnerWorkosUserID(tt.actor, tt.author))
		})
	}
}

func TestStampPipesUsersOnToolConfigOverwritesForeignOwner(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		input  string
		owner  string
		tool   string
		wantID string
		wantOK bool
	}{
		{
			name:   "mailchimp foreign id overwritten",
			input:  `{"mailchimp":{"enabled":true,"workosUserId":"user_victim","campaignIds":["c1"]}}`,
			owner:  "user_actor",
			tool:   "mailchimp",
			wantID: "user_actor",
			wantOK: true,
		},
		{
			name:   "hubspot foreign id overwritten",
			input:  `{"hubspot":{"enabled":true,"workosUserId":"user_victim","sourceLocale":"en"}}`,
			owner:  "user_actor",
			tool:   "hubspot",
			wantID: "user_actor",
			wantOK: true,
		},
		{
			name:   "gitlab stamps actor when client omitted owner",
			input:  `{"gitlab":{"enabled":true}}`,
			owner:  "user_actor",
			tool:   "gitlab",
			wantID: "user_actor",
			wantOK: true,
		},
		{
			name:   "webflow foreign id overwritten",
			input:  `{"webflow":{"enabled":true,"workosUserId":"user_victim","siteId":"site_1"}}`,
			owner:  "user_actor",
			tool:   "webflow",
			wantID: "user_actor",
			wantOK: true,
		},
		{
			name:   "unknown enabled tool with owner field overwritten",
			input:  `{"futurePipes":{"enabled":true,"workosUserId":"user_victim"}}`,
			owner:  "user_actor",
			tool:   "futurePipes",
			wantID: "user_actor",
			wantOK: true,
		},
		{
			name:   "empty owner strips client id",
			input:  `{"ahrefs":{"enabled":true,"workosUserId":"user_victim"}}`,
			owner:  "",
			tool:   "ahrefs",
			wantID: "",
			wantOK: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			stamped := stampPipesUsersOnToolConfig(json.RawMessage(tt.input), tt.owner)
			id, ok := toolConfigWorkosUserID(t, stamped, tt.tool)
			require.Equal(t, tt.wantOK, ok)
			require.Equal(t, tt.wantID, id)
			if tt.tool == "mailchimp" {
				require.Equal(t, []any{"c1"}, toolConfigField(t, stamped, "mailchimp", "campaignIds"))
			}
			if tt.tool == "hubspot" {
				require.Equal(t, "en", toolConfigField(t, stamped, "hubspot", "sourceLocale"))
			}
			if tt.tool == "webflow" {
				require.Equal(t, "site_1", toolConfigField(t, stamped, "webflow", "siteId"))
			}
		})
	}
}

func TestStampPipesUsersOnToolConfigLeavesNonPipesTools(t *testing.T) {
	t.Parallel()

	input := json.RawMessage(`{
        "github":{"enabled":true,"mode":"agent"},
        "mailchimp":{"enabled":false,"workosUserId":"user_victim"}
    }`)
	stamped := stampPipesUsersOnToolConfig(input, "user_actor")

	var tools map[string]map[string]any
	require.NoError(t, json.Unmarshal(stamped, &tools))
	require.Equal(t, "agent", tools["github"]["mode"])
	require.Nil(t, tools["github"]["workosUserId"])
	require.Equal(t, "user_victim", tools["mailchimp"]["workosUserId"])
}

func toolConfigWorkosUserID(t *testing.T, raw json.RawMessage, tool string) (string, bool) {
	t.Helper()
	var tools map[string]map[string]any
	require.NoError(t, json.Unmarshal(raw, &tools))
	value, ok := tools[tool]["workosUserId"].(string)
	return value, ok
}

func toolConfigField(t *testing.T, raw json.RawMessage, tool, field string) any {
	t.Helper()
	var tools map[string]map[string]any
	require.NoError(t, json.Unmarshal(raw, &tools))
	return tools[tool][field]
}
