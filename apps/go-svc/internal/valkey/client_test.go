package valkey

import (
	"strings"
	"testing"
)

func TestConfigEnabled(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		cfg  Config
		want bool
	}{
		{name: "empty", cfg: Config{}, want: false},
		{name: "url", cfg: Config{URL: " redis://127.0.0.1:6379 "}, want: true},
		{name: "address", cfg: Config{Address: "127.0.0.1:6379"}, want: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := tc.cfg.Enabled(); got != tc.want {
				t.Fatalf("Enabled() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestClientOptionFromURL(t *testing.T) {
	t.Parallel()

	opt, err := Config{
		URL:      "redis://alice:s3cret@127.0.0.1:6380/2",
		Password: "overlay-pass",
		Username: "bob",
	}.ClientOption()
	if err != nil {
		t.Fatal(err)
	}
	if len(opt.InitAddress) != 1 || opt.InitAddress[0] != "127.0.0.1:6380" {
		t.Fatalf("InitAddress = %#v", opt.InitAddress)
	}
	if opt.SelectDB != 2 {
		t.Fatalf("SelectDB = %d", opt.SelectDB)
	}
	if opt.Username != "bob" {
		t.Fatalf("Username = %q", opt.Username)
	}
	if opt.Password != "overlay-pass" {
		t.Fatalf("Password = %q", opt.Password)
	}
	if opt.ClientName != defaultClientName {
		t.Fatalf("ClientName = %q", opt.ClientName)
	}
}

func TestClientOptionFromAddress(t *testing.T) {
	t.Parallel()

	opt, err := Config{
		Address:    " 10.0.0.1:6379 , 10.0.0.2:6379 ",
		ClientName: "go-svc-test",
	}.ClientOption()
	if err != nil {
		t.Fatal(err)
	}
	if len(opt.InitAddress) != 2 {
		t.Fatalf("InitAddress = %#v", opt.InitAddress)
	}
	if opt.InitAddress[0] != "10.0.0.1:6379" || opt.InitAddress[1] != "10.0.0.2:6379" {
		t.Fatalf("InitAddress = %#v", opt.InitAddress)
	}
	if opt.ClientName != "go-svc-test" {
		t.Fatalf("ClientName = %q", opt.ClientName)
	}
}

func TestClientOptionTLSSchemes(t *testing.T) {
	t.Parallel()

	for _, scheme := range []string{"rediss", "valkeys"} {
		opt, err := Config{URL: scheme + "://cache.example:6379"}.ClientOption()
		if err != nil {
			t.Fatalf("%s: %v", scheme, err)
		}
		if opt.TLSConfig == nil {
			t.Fatalf("%s: expected TLSConfig", scheme)
		}
	}
}

func TestClientOptionRejectsMissingEndpoint(t *testing.T) {
	t.Parallel()

	_, err := Config{}.ClientOption()
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "URL or Address is required") {
		t.Fatalf("error = %v", err)
	}
}

func TestClientOptionRejectsBadURL(t *testing.T) {
	t.Parallel()

	_, err := Config{URL: "http://127.0.0.1:6379"}.ClientOption()
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "parse URL") {
		t.Fatalf("error = %v", err)
	}
}

func TestNewClientRejectsEmptyConfig(t *testing.T) {
	t.Parallel()

	_, err := NewClient(Config{})
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestPingNilClient(t *testing.T) {
	t.Parallel()

	var client *Client
	if err := client.Ping(t.Context()); err == nil {
		t.Fatal("expected error")
	}
	client.Close()
}
