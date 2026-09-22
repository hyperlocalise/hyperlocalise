package valkey

import (
	"context"
	"fmt"

	valkeygo "github.com/valkey-io/valkey-go"
)

// Client is a Valkey connection owned by go-svc.
type Client struct {
	inner valkeygo.Client
}

// NewClient opens a Valkey client from cfg. The caller must Close it.
func NewClient(cfg Config) (*Client, error) {
	opt, err := cfg.ClientOption()
	if err != nil {
		return nil, err
	}
	inner, err := valkeygo.NewClient(opt)
	if err != nil {
		return nil, fmt.Errorf("valkey: connect: %w", err)
	}
	return &Client{inner: inner}, nil
}

// Close releases connections. It is safe on a nil Client.
func (c *Client) Close() {
	if c == nil || c.inner == nil {
		return
	}
	c.inner.Close()
}

// Inner returns the underlying valkey-go client for command builders and Do.
func (c *Client) Inner() valkeygo.Client {
	if c == nil {
		return nil
	}
	return c.inner
}

// Ping sends PING and returns a protocol or transport error.
func (c *Client) Ping(ctx context.Context) error {
	if c == nil || c.inner == nil {
		return fmt.Errorf("valkey: client is not configured")
	}
	if err := c.inner.Do(ctx, c.inner.B().Ping().Build()).Error(); err != nil {
		return fmt.Errorf("valkey: ping: %w", err)
	}
	return nil
}
