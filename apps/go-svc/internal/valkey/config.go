package valkey

import (
	"fmt"
	"strings"

	valkeygo "github.com/valkey-io/valkey-go"
)

const defaultClientName = "go-svc"

// Config configures a Valkey client.
type Config struct {
	// URL is a redis://, rediss://, valkey://, valkeys://, or unix:// URL.
	// When set, it is parsed first; Username and Password overlay credentials.
	URL string
	// Address is host:port used when URL is empty. Multiple addresses may be
	// comma-separated for cluster or replica setups.
	Address  string
	Username string
	Password string
	// ClientName is sent as CLIENT SETNAME. Empty uses "go-svc".
	ClientName string
}

// Enabled reports whether the config names at least one Valkey endpoint.
func (c Config) Enabled() bool {
	return strings.TrimSpace(c.URL) != "" || strings.TrimSpace(c.Address) != ""
}

// ClientOption builds valkey-go options without opening a connection.
func (c Config) ClientOption() (valkeygo.ClientOption, error) {
	var opt valkeygo.ClientOption
	url := strings.TrimSpace(c.URL)
	if url != "" {
		parsed, err := valkeygo.ParseURL(url)
		if err != nil {
			return valkeygo.ClientOption{}, fmt.Errorf("valkey: parse URL: %w", err)
		}
		opt = parsed
	}

	if addrs := splitAddresses(c.Address); len(addrs) > 0 {
		if url == "" {
			opt.InitAddress = addrs
		} else if len(opt.InitAddress) == 0 {
			opt.InitAddress = addrs
		}
	}

	if len(opt.InitAddress) == 0 {
		return valkeygo.ClientOption{}, fmt.Errorf("valkey: URL or Address is required")
	}

	if username := strings.TrimSpace(c.Username); username != "" {
		opt.Username = username
	}
	if password := strings.TrimSpace(c.Password); password != "" {
		opt.Password = password
	}

	name := strings.TrimSpace(c.ClientName)
	if name == "" {
		name = defaultClientName
	}
	opt.ClientName = name
	return opt, nil
}

func splitAddresses(raw string) []string {
	parts := strings.Split(raw, ",")
	addrs := make([]string, 0, len(parts))
	for _, part := range parts {
		addr := strings.TrimSpace(part)
		if addr != "" {
			addrs = append(addrs, addr)
		}
	}
	return addrs
}
