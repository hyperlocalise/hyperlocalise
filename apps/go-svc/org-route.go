package main

import "net/http"

const orgRoutePrefix = "/v1/orgs/{organizationSlug}"

func bindActor[API any, Actor any](api *API, fn func(*API, *http.Request, Actor) (any, int, error)) func(*http.Request, Actor) (any, int, error) {
	return func(r *http.Request, actor Actor) (any, int, error) {
		return fn(api, r, actor)
	}
}

func registerAuthenticated(mux *http.ServeMux, verifier SessionVerifier, pattern string, handler http.Handler) {
	mux.Handle(pattern, authMiddleware(verifier)(handler))
}
