package runsvc

import (
	"crypto/sha512"
	"encoding/hex"
	"testing"
)

func TestHashSourceTextOracle(t *testing.T) {
	t.Parallel()

	cases := []string{"", "Hello", "café", "a\nb"}
	for _, source := range cases {
		got := hashSourceText(source)
		sum := sha512.Sum512([]byte(source))
		want := hex.EncodeToString(sum[:])
		if got != want {
			t.Fatalf("hashSourceText(%q) = %q, want %q", source, got, want)
		}
		if len(got) != 128 {
			t.Fatalf("hashSourceText(%q) length = %d, want 128", source, len(got))
		}
		for _, r := range got {
			if (r < '0' || r > '9') && (r < 'a' || r > 'f') {
				t.Fatalf("hashSourceText(%q) has non-lowercase-hex rune %q", source, r)
			}
		}
	}
}

func TestLockStoredFingerprintOracle(t *testing.T) {
	t.Parallel()

	preimage := "source=Hello\ncontext="
	got := lockStoredFingerprint(preimage)
	sum := sha512.Sum512([]byte(preimage))
	want := hex.EncodeToString(sum[:16])
	if got != want {
		t.Fatalf("lockStoredFingerprint = %q, want %q", got, want)
	}
	if len(got) != 32 {
		t.Fatalf("lockStoredFingerprint length = %d, want 32", len(got))
	}
}

func TestLockFingerprintEqualLegacyAndCompact(t *testing.T) {
	t.Parallel()

	preimage := "canonical-task"
	full := hashSourceText(preimage)
	compact := lockStoredFingerprint(preimage)

	if !lockFingerprintEqual(compact, compact) {
		t.Fatal("compact fingerprint should equal itself")
	}
	if !lockFingerprintEqual(full, compact) {
		t.Fatal("legacy full SHA-512 digest should match compact prefix")
	}
	if lockFingerprintEqual(compact, full) {
		t.Fatal("argument order is load-bearing: (computed, stored) must not match")
	}
	if lockFingerprintEqual("not-hex!!!", compact) {
		t.Fatal("non-hex stored digest must not match")
	}
	if lockFingerprintEqual(full[:127], compact) {
		t.Fatal("wrong-length hex digest must not match")
	}
	if lockFingerprintEqual(hashSourceText("other"), compact) {
		t.Fatal("unrelated digest must not match")
	}
}

func TestImageSourceFingerprintOracle(t *testing.T) {
	t.Parallel()

	content := []byte("localized-image")
	got := imageSourceFingerprint(content)
	sum := sha512.Sum512(content)
	want := hex.EncodeToString(sum[:])
	if got != want {
		t.Fatalf("imageSourceFingerprint = %q, want %q", got, want)
	}

	checkpoint := encodeImageCheckpoint(content)
	if checkpoint != imageCheckpointPrefix+got {
		t.Fatalf("encodeImageCheckpoint = %q, want prefix + fingerprint", checkpoint)
	}
	if len(got) != 128 {
		t.Fatalf("imageSourceFingerprint length = %d, want 128", len(got))
	}
}
