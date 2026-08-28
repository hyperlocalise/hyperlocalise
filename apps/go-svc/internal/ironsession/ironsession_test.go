package ironsession

import (
	"encoding/json"
	"strings"
	"testing"
)

const testPassword = "this-is-a-test-cookie-password-at-least-32-characters"

func TestIsSealed(t *testing.T) {
	t.Parallel()

	if !IsSealed("Fe26.2*1*abc") {
		t.Fatal("expected Fe26.2 prefix to be sealed")
	}
	if IsSealed("dGVzdA==") {
		t.Fatal("raw base64 should not look like iron-session")
	}
	if IsSealed("") {
		t.Fatal("empty should not look like iron-session")
	}
}

func TestRoundTrip(t *testing.T) {
	t.Parallel()

	payload := map[string]any{
		"accessToken":  "tok",
		"refreshToken": "ref",
		"user":         map[string]any{"id": "user_1"},
	}
	sealed, err := Seal(payload, testPassword)
	if err != nil {
		t.Fatalf("seal: %v", err)
	}
	if !IsSealed(sealed) {
		t.Fatalf("sealed cookie missing Fe26.2 prefix: %s", sealed)
	}
	if !strings.HasSuffix(sealed, "~2") {
		t.Fatalf("sealed cookie missing ~2 suffix: %s", sealed)
	}

	var got map[string]any
	if err := Unseal(sealed, testPassword, &got); err != nil {
		t.Fatalf("unseal: %v", err)
	}
	if got["accessToken"] != "tok" || got["refreshToken"] != "ref" {
		t.Fatalf("round-trip mismatch: %#v", got)
	}
	user, ok := got["user"].(map[string]any)
	if !ok || user["id"] != "user_1" {
		t.Fatalf("round-trip user mismatch: %#v", got["user"])
	}
}

func TestUnsealRejectsWrongPassword(t *testing.T) {
	t.Parallel()

	sealed, err := Seal(map[string]any{"ok": true}, testPassword)
	if err != nil {
		t.Fatal(err)
	}
	var dest map[string]any
	if err := Unseal(sealed, "this-is-a-different-password-32chars!!", &dest); err == nil {
		t.Fatal("expected wrong password to fail")
	}
}

func TestUnsealRejectsShortPassword(t *testing.T) {
	t.Parallel()

	var dest map[string]any
	if err := Unseal("Fe26.2*1*a*b*c**d*e", "too-short", &dest); err == nil {
		t.Fatal("expected short password to fail")
	}
}

func TestUnsealNodeAuthKitCookie(t *testing.T) {
	t.Parallel()

	// Generated with iron-session@8.0.4 sealData({ password, ttl: 0 }) — the
	// same call AuthKit uses for wos-session. Payload is camelCase.
	sealed := "Fe26.2*1*fa67fa919f1d22ae7cf035dc3d4ac085aedd51c4a8826432ace797d7521aaf86*nlWwonA1c8Ml2eRM6hD1nQ*erJmrxU_OzI_H_NiyEtn3Egw8hRZXCcSmVOfY-ohLIzV7XdXR20qJkFe9NqAiU26TNimFlrJw1devrxbzYIiZfvRiEJv0Nm29FZTBqtLvHRmCCUO7h2xgV9WM_LuiMXaaxgPKDJYNv3RcTCFlrPHG9sZs1AHGGSghldWJGl7T6-cam8o4dzl9JyUO10t-lICZ_ig2Q3J8uhk-raNVH4srgG1Yy9WgMecebgLCwuPsgygP_Jk2Buv17ejK4SK-8FibyOKTcFkh0UDpAAfTXXP38Xq1yJWuUdlMBA3Vnd-1uESlVI6pNA8ZOiKUUon0hjsOGlpViTVU7ixgG5x6_xO0QrfMl12tjgcoWdEUnyrVLMzsO9pzzazp1mOmPB0Gt_uERuDYHAmxYUe4M5OSZuLr-J72C9kNbijXlkd7PvdXUK_SzwX1BArm0TcJnlJaIsWfi3Emn_3BACrgYWPbKTEjLDPjKFvq1t4bv9vZvpaupQfYr_6n5DElvXPx6kPtcdPtSDYVB6rmIyz_bxnzcLd6tFjxO66vETMSQs-uHjjabc**d0a5746c69d150f525cf3a077421f8501184e6058b9c9c757a45472866c55feb*6YA3OEOh6v-8vMf7dxnhoTaVy6uJcq3DM0UE-c_p-04~2"

	var session struct {
		AccessToken  string `json:"accessToken"`
		RefreshToken string `json:"refreshToken"`
		User         struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	if err := Unseal(sealed, testPassword, &session); err != nil {
		t.Fatalf("unseal node cookie: %v", err)
	}
	if session.User.ID != "user_golden" {
		t.Fatalf("user id: got %q", session.User.ID)
	}
	if session.RefreshToken != "refresh_golden" {
		t.Fatalf("refresh token: got %q", session.RefreshToken)
	}
	if session.AccessToken == "" {
		t.Fatal("missing access token")
	}

	var raw map[string]json.RawMessage
	if err := Unseal(sealed, testPassword, &raw); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw["user"]), `"id":"user_golden"`) && !strings.Contains(string(raw["user"]), `"id": "user_golden"`) {
		t.Fatalf("expected camelCase user object, got %s", raw["user"])
	}
}
