package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func BenchmarkParseAutomationListQuery(b *testing.B) {
	req := httptest.NewRequest(
		http.MethodGet,
		"/v1/orgs/acme/automations?status=paused&projectId=project_1&limit=50&offset=25",
		nil,
	)
	b.ReportAllocs()
	for b.Loop() {
		status, projectID, limit, offset, err := parseAutomationListQuery(req, workspaceAutomationStatuses)
		if err != nil || status != "paused" || projectID != "project_1" || limit != 50 || offset != 25 {
			b.Fatal("unexpected list query parse")
		}
	}
}

func BenchmarkParseWorkspaceAutomationCreate(b *testing.B) {
	body := `{
        "name": "Nightly sync",
        "instructions": "Translate new source files.",
        "status": "paused",
        "projectId": "project_1",
        "triggerConfig": {"mode": "manual"},
        "repositoryTarget": {"kind": "none"},
        "toolConfig": {},
        "skillIds": ["review-translation-changes"]
    }`
	b.ReportAllocs()
	b.SetBytes(int64(len(body)))
	for b.Loop() {
		req := httptest.NewRequest(http.MethodPost, "/v1/orgs/acme/automations", strings.NewReader(body))
		write, err := parseWorkspaceAutomationCreate(req)
		if err != nil || write.name != "Nightly sync" || len(write.skillIDs) != 1 {
			b.Fatal("unexpected workspace automation create parse")
		}
	}
}

func BenchmarkParseVisualWorkflowCreate(b *testing.B) {
	body := `{"name":"Publish flow","projectId":"project_1"}`
	b.ReportAllocs()
	b.SetBytes(int64(len(body)))
	for b.Loop() {
		req := httptest.NewRequest(http.MethodPost, "/v1/orgs/acme/visual-workflows", strings.NewReader(body))
		write, err := parseVisualWorkflowCreate(req)
		if err != nil || write.name != "Publish flow" || write.projectID == nil {
			b.Fatal("unexpected visual workflow create parse")
		}
	}
}

func BenchmarkNormalizeVisualWorkflowDefinition(b *testing.B) {
	cases := []struct {
		name string
		raw  json.RawMessage
	}{
		{
			name: "V3",
			raw: json.RawMessage(`{
                "schemaVersion": 3,
                "name": "Publish flow",
                "nodes": [
                    {"id": "trigger", "type": "trigger.manual", "config": {"kind": "trigger.manual"}},
                    {"id": "http", "type": "action.http", "config": {"kind": "action.http", "url": "https://example.com"}}
                ],
                "edges": [{
                    "id": "e1",
                    "source": "trigger",
                    "target": "http",
                    "kind": "execution",
                    "sourcePortId": "success",
                    "targetPortId": "input"
                }],
                "editor": {"positions": {"trigger": {"x": 40, "y": 160}, "http": {"x": 240, "y": 160}}}
            }`),
		},
		{
			name: "V2Migrate",
			raw: json.RawMessage(`{
                "schemaVersion": 2,
                "name": "Legacy",
                "nodes": [{"id": "trigger", "type": "trigger.manual", "config": {"kind": "trigger.manual"}}],
                "edges": [{"id": "e1", "source": "trigger", "target": "http", "sourceHandle": "success", "targetHandle": null}],
                "editor": {"positions": {"trigger": {"x": 1, "y": 2}}}
            }`),
		},
	}
	for _, tc := range cases {
		b.Run(tc.name, func(b *testing.B) {
			b.ReportAllocs()
			b.SetBytes(int64(len(tc.raw)))
			for b.Loop() {
				normalized, name, err := normalizeVisualWorkflowDefinition(tc.raw, "Fallback")
				if err != nil || name == "" || len(normalized) == 0 {
					b.Fatal("unexpected definition normalize")
				}
			}
		})
	}
}

func BenchmarkEmptyVisualWorkflowDefinition(b *testing.B) {
	b.ReportAllocs()
	for b.Loop() {
		raw := emptyVisualWorkflowDefinition("Publish flow")
		if len(raw) == 0 {
			b.Fatal("empty definition")
		}
	}
}

func BenchmarkParseSkillIDs(b *testing.B) {
	raw := json.RawMessage(`["review-translation-changes","apply-glossary","sync-content"]`)
	b.ReportAllocs()
	for b.Loop() {
		ids, err := parseSkillIDs(raw)
		if err != nil || len(ids) != 3 {
			b.Fatal("unexpected skill id parse")
		}
	}
}
