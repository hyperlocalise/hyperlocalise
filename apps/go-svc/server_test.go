package main

import (
	"net/http"
	"testing"
)

func TestNewHTTPServerTimeouts(t *testing.T) {
	srv := newHTTPServer(":8080", http.NewServeMux())

	if srv.ReadHeaderTimeout != serverReadHeaderTimeout {
		t.Fatalf("ReadHeaderTimeout = %s, want %s", srv.ReadHeaderTimeout, serverReadHeaderTimeout)
	}
	if srv.ReadTimeout != serverReadTimeout {
		t.Fatalf("ReadTimeout = %s, want %s", srv.ReadTimeout, serverReadTimeout)
	}
	if srv.WriteTimeout != serverWriteTimeout {
		t.Fatalf("WriteTimeout = %s, want %s", srv.WriteTimeout, serverWriteTimeout)
	}
	if srv.IdleTimeout != serverIdleTimeout {
		t.Fatalf("IdleTimeout = %s, want %s", srv.IdleTimeout, serverIdleTimeout)
	}
}
