package mt

import "context"

// Engine translates batches of text between locales.
type Engine interface {
	// Translate returns translations in the same order as req.Sources.
	// Context cancellation and deadline errors remain detectable with errors.Is.
	Translate(ctx context.Context, req Request) (Response, error)
}
