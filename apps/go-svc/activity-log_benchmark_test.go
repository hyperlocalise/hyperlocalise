package main

import (
	"fmt"
	"net/url"
	"testing"
	"time"
)

func BenchmarkParseActivityLogQuery(b *testing.B) {
	values := url.Values{
		"actor":      []string{"user:" + testActivityActorUser},
		"eventTypes": []string{"project_created", "project_deleted", "job_failed"},
		"limit":      []string{"50"},
		"range":      []string{"7d"},
		"cursor": []string{encodeActivityLogCursor(activityLogCursor{
			createdAt: testDictionaryTime,
			id:        testActivityEventID,
		}, "deadbeef")},
	}
	b.ReportAllocs()
	for b.Loop() {
		query, err := parseActivityLogQuery(values)
		if err != nil || query.limit != 50 || query.rangeKey != "7d" {
			b.Fatal("unexpected query parse")
		}
	}
}

func BenchmarkActivityLogFilterFingerprint(b *testing.B) {
	query := activityLogQuery{
		actor:      &activityLogActorFilter{kind: "user", userID: testActivityActorUser},
		eventTypes: []string{"project_deleted", "project_created", "job_created", "file_uploaded"},
		rangeKey:   "30d",
	}
	b.ReportAllocs()
	for b.Loop() {
		fingerprint, err := activityLogFilterFingerprint(query)
		if err != nil || fingerprint == "" {
			b.Fatal("unexpected fingerprint")
		}
	}
}

func BenchmarkEncodeDecodeActivityLogCursor(b *testing.B) {
	fingerprint := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	cursor := activityLogCursor{
		createdAt: time.Date(2026, 9, 20, 12, 0, 0, 123000000, time.UTC),
		id:        testActivityEventID,
	}
	b.ReportAllocs()
	for b.Loop() {
		encoded := encodeActivityLogCursor(cursor, fingerprint)
		decoded, err := decodeActivityLogCursor(encoded, fingerprint)
		if err != nil || decoded.id != cursor.id {
			b.Fatal("unexpected cursor round-trip")
		}
	}
}

func BenchmarkPayloadTargetDisplayName(b *testing.B) {
	payloads := []map[string]any{
		{"name": "Website", "integrationKind": "crowdin"},
		{"fileName": "locales/en.json"},
		{"integrationKind": "phrase"},
		{"keyPrefix": "hl_AbCd"},
		{"resourceId": "resource_123"},
	}
	b.ReportAllocs()
	for b.Loop() {
		for _, payload := range payloads {
			_ = payloadTargetDisplayName(payload)
		}
	}
}

func BenchmarkActivityLogActorDisplayName(b *testing.B) {
	first := "Ada"
	last := "Lovelace"
	cases := []struct {
		kind            string
		firstName, last *string
	}{
		{kind: "system"},
		{kind: "agent"},
		{kind: "api_key"},
		{kind: "user", firstName: &first, last: &last},
		{kind: "user"},
	}
	b.ReportAllocs()
	for b.Loop() {
		for _, tc := range cases {
			_ = activityLogActorDisplayName(tc.kind, tc.firstName, tc.last)
		}
	}
}

func BenchmarkActivityLogTargetKey(b *testing.B) {
	for _, size := range []int{10, 50, 100} {
		b.Run(fmt.Sprint(size), func(b *testing.B) {
			kinds := []string{"project", "glossary", "job", "file", "membership"}
			b.ReportAllocs()
			for b.Loop() {
				for i := 0; i < size; i++ {
					_ = activityLogTargetKey(kinds[i%len(kinds)], testActivityEventID)
				}
			}
		})
	}
}
