package crowdin

import (
	"context"
)

type GraphQL struct {
	client *Client
}

// Request represents a GraphQL request.
type Request struct {
	q      string
	vars   map[string]any
	opName string
}

// NewRequest creates a new GraphQL request with the given query.
func (g *GraphQL) NewRequest(query string) *Request {
	return &Request{
		q: query,
	}
}

// Var adds a variable to the request.
func (r *Request) Var(name string, value any) {
	if r.vars == nil {
		r.vars = make(map[string]any)
	}
	r.vars[name] = value
}

// Operation sets the operation name for the request.
func (r *Request) Operation(name string) {
	r.opName = name
}

// Query sends a request to the GraphQL server with the given query and then
// unmarshals the response into the given v which should be a pointer.
func (g *GraphQL) Query(ctx context.Context, req *Request, v any) error {
	body := struct {
		Query         string         `json:"query"`
		Variables     map[string]any `json:"variables,omitempty"`
		OperationName string         `json:"operationName,omitempty"`
	}{
		Query:         req.q,
		Variables:     req.vars,
		OperationName: req.opName,
	}

	_, err := g.client.Post(ctx, "/api/graphql", body, v)
	return err
}
