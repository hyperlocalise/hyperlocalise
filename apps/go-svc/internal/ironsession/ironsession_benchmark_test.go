package ironsession

import (
	"strings"
	"testing"
)

// benchmarkSession mirrors the shape of an AuthKit session cookie: two JWTs and
// a user object, which puts the sealed cookie around 2-3 KiB.
type benchmarkSession struct {
	AccessToken  string         `json:"accessToken"`
	RefreshToken string         `json:"refreshToken"`
	User         map[string]any `json:"user"`
}

func newBenchmarkSession() benchmarkSession {
	return benchmarkSession{
		AccessToken:  "eyJhbGciOiJSUzI1NiJ9." + strings.Repeat("a", 900) + ".sig",
		RefreshToken: strings.Repeat("r", 32),
		User: map[string]any{
			"id":            "user_01HXYZ",
			"email":         "someone@example.com",
			"firstName":     "Ada",
			"lastName":      "Lovelace",
			"emailVerified": true,
		},
	}
}

func BenchmarkSeal(b *testing.B) {
	session := newBenchmarkSession()
	b.ReportAllocs()
	for b.Loop() {
		if _, err := Seal(session, testPassword); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkUnseal(b *testing.B) {
	sealed, err := Seal(newBenchmarkSession(), testPassword)
	if err != nil {
		b.Fatal(err)
	}
	b.SetBytes(int64(len(sealed)))
	b.ReportAllocs()
	for b.Loop() {
		var out benchmarkSession
		if err := Unseal(sealed, testPassword, &out); err != nil {
			b.Fatal(err)
		}
	}
}

// BenchmarkUnsealRejectsTampered measures the cost of rejecting a forged
// cookie, which should stop at the HMAC check before any decryption.
func BenchmarkUnsealRejectsTampered(b *testing.B) {
	sealed, err := Seal(newBenchmarkSession(), testPassword)
	if err != nil {
		b.Fatal(err)
	}
	parts := strings.Split(strings.TrimSuffix(sealed, "~2"), "*")
	parts[7] = strings.Repeat("A", len(parts[7]))
	tampered := strings.Join(parts, "*")
	b.ReportAllocs()
	for b.Loop() {
		var out benchmarkSession
		if err := Unseal(tampered, testPassword, &out); err == nil {
			b.Fatal("expected tampered seal to fail")
		}
	}
}
