package hyperlocaliseapi

import "testing"

func TestValidateAPIBaseURL(t *testing.T) {
	t.Parallel()

	allowed := []string{
		"https://hyperlocalise.com/api",
		"https://api.hyperlocalise.com",
		"http://localhost:3000/api",
		"http://127.0.0.1:3000/api",
	}
	for _, value := range allowed {
		if err := ValidateAPIBaseURL(value); err != nil {
			t.Fatalf("ValidateAPIBaseURL(%q): %v", value, err)
		}
	}

	blocked := []string{
		"http://hyperlocalise.com/api",
		"https://attacker.example/api",
		"https://hyperlocalise.com/api?token=1",
		"https://169.254.169.254/latest/meta-data",
	}
	for _, value := range blocked {
		if err := ValidateAPIBaseURL(value); err == nil {
			t.Fatalf("ValidateAPIBaseURL(%q): expected error", value)
		}
	}
}
