package storageregistry

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

func TestRegistry_RegisterValidationEdgeCases(t *testing.T) {
	tests := []struct {
		name        string
		adapterName string
		factory     Factory
		errContains string
	}{
		{
			name:        "empty adapter name",
			adapterName: "",
			factory:     func(_ json.RawMessage) (storage.StorageAdapter, error) { return stubAdapter{}, nil },
			errContains: "name must not be empty",
		},
		{
			name:        "whitespace-only adapter name",
			adapterName: "   \t\n  ",
			factory:     func(_ json.RawMessage) (storage.StorageAdapter, error) { return stubAdapter{}, nil },
			errContains: "name must not be empty",
		},
		{
			name:        "nil factory function",
			adapterName: "valid-name",
			factory:     nil,
			errContains: "factory must not be nil",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			reg := New()
			err := reg.Register(tc.adapterName, tc.factory)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tc.errContains)
			}
			if !strings.Contains(err.Error(), tc.errContains) {
				t.Fatalf("expected error containing %q, got %q", tc.errContains, err.Error())
			}
		})
	}
}

func TestRegistry_NameNormalizationAndCaseInsensitivity(t *testing.T) {
	reg := New()
	factory := func(_ json.RawMessage) (storage.StorageAdapter, error) {
		return stubAdapter{}, nil
	}

	// Register with mixed case and surrounding whitespace
	if err := reg.Register("  Crowdin-V2  ", factory); err != nil {
		t.Fatalf("register with mixed case and spaces failed: %v", err)
	}

	// Lookup via uppercase, lowercase, and whitespace variations
	lookups := []string{"CROWDIN-V2", "crowdin-v2", "  crowdin-v2\t", " CrOwDiN-v2 "}
	for _, lookup := range lookups {
		adapter, err := reg.New(lookup, nil)
		if err != nil {
			t.Fatalf("New(%q) failed: %v", lookup, err)
		}
		if adapter == nil {
			t.Fatalf("New(%q) returned nil adapter", lookup)
		}
	}

	// List should return the normalized lowercase trimmed name
	list := reg.List()
	if want := []string{"crowdin-v2"}; !reflect.DeepEqual(list, want) {
		t.Fatalf("List() = %v, want %v", list, want)
	}
}

func TestRegistry_NewValidationAndFactoryErrorWrapping(t *testing.T) {
	reg := New()

	// New with empty name
	if _, err := reg.New("", nil); err == nil || !strings.Contains(err.Error(), "name must not be empty") {
		t.Fatalf("expected empty name error, got %v", err)
	}

	// New with whitespace name
	if _, err := reg.New("   ", nil); err == nil || !strings.Contains(err.Error(), "name must not be empty") {
		t.Fatalf("expected empty name error for whitespace, got %v", err)
	}

	// New with unknown adapter
	if _, err := reg.New("non-existent", nil); err == nil || !strings.Contains(err.Error(), "unknown adapter") {
		t.Fatalf("expected unknown adapter error, got %v", err)
	}

	// Factory returns error -> New wraps it
	errSentinel := errors.New("invalid JSON payload")
	failingFactory := func(_ json.RawMessage) (storage.StorageAdapter, error) {
		return nil, errSentinel
	}
	if err := reg.Register("failing", failingFactory); err != nil {
		t.Fatalf("register failing factory: %v", err)
	}

	_, err := reg.New("failing", json.RawMessage(`{}`))
	if err == nil {
		t.Fatalf("expected error from failing factory, got nil")
	}
	if !errors.Is(err, errSentinel) {
		t.Fatalf("expected wrapped sentinel error, got %v", err)
	}
	if !strings.Contains(err.Error(), "new storage adapter \"failing\":") {
		t.Fatalf("expected contextual error message, got %q", err.Error())
	}
}

func TestRegistry_MustRegisterPanics(t *testing.T) {
	tests := []struct {
		name        string
		adapterName string
		factory     Factory
		panicMsg    string
	}{
		{
			name:        "empty name",
			adapterName: "",
			factory:     func(_ json.RawMessage) (storage.StorageAdapter, error) { return stubAdapter{}, nil },
			panicMsg:    "name must not be empty",
		},
		{
			name:        "nil factory",
			adapterName: "stub",
			factory:     nil,
			panicMsg:    "factory must not be nil",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			reg := New()
			defer func() {
				r := recover()
				if r == nil {
					t.Fatalf("expected panic, got nil")
				}
				if msg := fmt.Sprint(r); !strings.Contains(msg, tc.panicMsg) {
					t.Fatalf("expected panic containing %q, got %q", tc.panicMsg, msg)
				}
			}()

			reg.MustRegister(tc.adapterName, tc.factory)
		})
	}
}

func TestRegistry_ListEmptyAndOrder(t *testing.T) {
	reg := New()

	// Empty registry returns empty slice (len 0)
	emptyList := reg.List()
	if len(emptyList) != 0 {
		t.Fatalf("expected empty list, got %v", emptyList)
	}

	factory := func(_ json.RawMessage) (storage.StorageAdapter, error) { return stubAdapter{}, nil }

	// Register multiple adapters out of alphabetical order
	_ = reg.Register("smartling", factory)
	_ = reg.Register("lokalise", factory)
	_ = reg.Register("crowdin", factory)
	_ = reg.Register("phrase", factory)

	want := []string{"crowdin", "lokalise", "phrase", "smartling"}
	if got := reg.List(); !reflect.DeepEqual(got, want) {
		t.Fatalf("List() = %v, want %v", got, want)
	}
}
