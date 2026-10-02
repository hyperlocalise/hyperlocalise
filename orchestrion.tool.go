// This file is managed by Orchestrion and selects the Datadog integrations
// enabled during compile-time instrumentation.

//go:build tools

package tools

import (
	_ "github.com/DataDog/dd-trace-go/contrib/aws/aws-sdk-go-v2/v2/aws" // integration
	_ "github.com/DataDog/dd-trace-go/contrib/jackc/pgx.v5/v2"          // integration
	_ "github.com/DataDog/dd-trace-go/contrib/log/slog/v2"              // integration
	_ "github.com/DataDog/dd-trace-go/contrib/net/http/v2"              // integration
	_ "github.com/DataDog/dd-trace-go/contrib/valkey-io/valkey-go/v2"   // integration
	_ "github.com/DataDog/dd-trace-go/v2/contrib/os"                    // integration
	_ "github.com/DataDog/dd-trace-go/v2/ddtrace/tracer"                // integration
	_ "github.com/DataDog/dd-trace-go/v2/orchestrion"                   // integration
	_ "github.com/DataDog/orchestrion"                                  // integration
)
