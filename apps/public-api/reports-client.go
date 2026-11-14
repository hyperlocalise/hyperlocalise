package main

import (
	"context"
	"errors"

	"github.com/hyperlocalise/hyperlocalise/internal/reporting"
)

// Reports are read from PostgreSQL through the shared reporting package, as the token's own
// member: the same workspace, project access, Reports flag and billing rules as the page.

const reportsMaxBodyBytes = 64 << 20

var (
	errReportsUnavailable = errors.New("reports unavailable")
	errReportTooLarge     = errors.New("report too large")
)

type reportAnswer struct {
	status             int
	contentType        string
	contentDisposition string
	body               []byte
}

type reportsReader interface {
	report(ctx context.Context, p principal, kind string, query map[string]string, format string) (reportAnswer, error)
}

type postgresReports struct {
	api *reporting.API
}

func newPostgresReports(pool reporting.Pool) reportsReader {
	if pool == nil {
		return nil
	}
	api := reporting.New()
	api.Pool = pool
	return &postgresReports{api: api}
}

func (s *postgresReports) report(ctx context.Context, p principal, kind string, query map[string]string, format string) (reportAnswer, error) {
	actor := reporting.NewActor(p.UserID, p.OrganizationID, p.Role, "", "")
	result, err := s.api.Report(ctx, actor, kind, format, query)
	if err != nil {
		return encodeReportError(err)
	}
	if len(result.Body) > reportsMaxBodyBytes {
		return reportAnswer{}, errReportTooLarge
	}
	return reportAnswer{
		status:             result.Status,
		contentType:        result.ContentType,
		contentDisposition: result.ContentDisposition,
		body:               result.Body,
	}, nil
}

func encodeReportError(err error) (reportAnswer, error) {
	if encoded, ok := reporting.EncodeError(err); ok {
		return reportAnswer{status: encoded.Status, contentType: encoded.ContentType, body: encoded.Body}, nil
	}
	return reportAnswer{}, err
}
