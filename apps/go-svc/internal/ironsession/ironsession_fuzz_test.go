package ironsession

import (
	"reflect"
	"strings"
	"testing"
)

// FuzzUnseal checks that arbitrary cookie values never panic and never unseal
// unless they carry a valid HMAC, which random input cannot produce.
func FuzzUnseal(f *testing.F) {
	// A fixed genuine cookie: Seal is randomized, and each fuzz worker process
	// re-runs this setup, so a freshly sealed value would differ per worker.
	// This is the iron-session@8.0.4 fixture from TestUnsealNodeAuthKitCookie.
	const sealed = "Fe26.2*1*fa67fa919f1d22ae7cf035dc3d4ac085aedd51c4a8826432ace797d7521aaf86*nlWwonA1c8Ml2eRM6hD1nQ*erJmrxU_OzI_H_NiyEtn3Egw8hRZXCcSmVOfY-ohLIzV7XdXR20qJkFe9NqAiU26TNimFlrJw1devrxbzYIiZfvRiEJv0Nm29FZTBqtLvHRmCCUO7h2xgV9WM_LuiMXaaxgPKDJYNv3RcTCFlrPHG9sZs1AHGGSghldWJGl7T6-cam8o4dzl9JyUO10t-lICZ_ig2Q3J8uhk-raNVH4srgG1Yy9WgMecebgLCwuPsgygP_Jk2Buv17ejK4SK-8FibyOKTcFkh0UDpAAfTXXP38Xq1yJWuUdlMBA3Vnd-1uESlVI6pNA8ZOiKUUon0hjsOGlpViTVU7ixgG5x6_xO0QrfMl12tjgcoWdEUnyrVLMzsO9pzzazp1mOmPB0Gt_uERuDYHAmxYUe4M5OSZuLr-J72C9kNbijXlkd7PvdXUK_SzwX1BArm0TcJnlJaIsWfi3Emn_3BACrgYWPbKTEjLDPjKFvq1t4bv9vZvpaupQfYr_6n5DElvXPx6kPtcdPtSDYVB6rmIyz_bxnzcLd6tFjxO66vETMSQs-uHjjabc**d0a5746c69d150f525cf3a077421f8501184e6058b9c9c757a45472866c55feb*6YA3OEOh6v-8vMf7dxnhoTaVy6uJcq3DM0UE-c_p-04~2"
	genuine, _, _ := strings.Cut(sealed, "~")
	var want map[string]any
	if err := Unseal(sealed, testPassword, &want); err != nil {
		f.Fatal(err)
	}
	f.Add(sealed)
	f.Add(genuine)
	f.Add("Fe26.2*1*salt*iv*data*0*hsalt*digest")
	f.Add("Fe26.2*1*****~2")
	f.Add("")
	f.Fuzz(func(t *testing.T, cookie string) {
		var out map[string]any
		if err := Unseal(cookie, testPassword, &out); err != nil {
			return
		}
		// The cookie string itself is malleable (non-canonical base64 trailing
		// bits decode to the same bytes), so the property is on the content: a
		// cookie that unseals must carry exactly the genuine payload.
		if !reflect.DeepEqual(out, want) {
			t.Fatalf("cookie %q unsealed to %v, want genuine payload %v", cookie, out, want)
		}
	})
}
