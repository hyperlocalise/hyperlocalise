package syncsvc

import "testing"

func TestIsLengthSpike(t *testing.T) {
	t.Run("spike detected", func(t *testing.T) {
		ok, ratio := isLengthSpike(30, 10, 1.8)
		if !ok {
			t.Fatalf("expected spike")
		}
		if ratio != 3.0 {
			t.Fatalf("unexpected ratio: %f", ratio)
		}
	})

	t.Run("short baseline ignored", func(t *testing.T) {
		ok, _ := isLengthSpike(12, 5, 1.8)
		if ok {
			t.Fatalf("did not expect spike for short baseline")
		}
	})
}

func TestHasPlaceholderEdit(t *testing.T) {
	if !hasPlaceholderEdit([]string{"placeholder parity mismatch (expected [name], got [])"}) {
		t.Fatalf("expected placeholder edit detection")
	}
	if !hasPlaceholderEdit([]string{"ICU parity mismatch (expected [count:plural[one]], got [])"}) {
		t.Fatalf("expected ICU parity detection")
	}
	if hasPlaceholderEdit([]string{"length changed"}) {
		t.Fatalf("did not expect placeholder edit detection")
	}
}
