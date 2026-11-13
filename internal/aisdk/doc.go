// Package aisdk is a Go client for the Vercel AI SDK evaluation protocol.
//
// ExperimentalEvaluate mirrors experimental_evaluate from AI SDK 7.0.105+:
// it posts typed Choice, Score, and Boolean questions plus one shared state
// to AI Gateway's /evaluation-model endpoint. The default model is
// TypeSafe AI's Jev (typesafe-ai/jev).
//
// Evaluation is not available on the OpenAI-compatible /v1 chat endpoints.
// The default base URL is https://ai-gateway.vercel.sh/v4/ai.
package aisdk
