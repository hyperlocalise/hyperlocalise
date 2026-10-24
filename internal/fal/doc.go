// Package fal provides a typed HTTP client for the fal.ai queue API.
//
// Callers submit a model request to https://queue.fal.run/{endpoint}, poll the
// returned status URL until the job completes, then fetch the result URL.
// Authentication uses an API key (FAL_KEY) sent as `Authorization: Key ...`.
//
// The package is a library client and does not expose an HTTP route.
package fal
