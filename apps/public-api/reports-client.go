package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// Reports are read through go-svc's internal reports route, the one the MCP get_report tool
// uses, as the token's own member: go-svc applies that member's workspace, project access, the
// Reports flag and billing access, and its own limits on how many reports read at once. This
// service holds no Reports SQL of its own.

const (
	goSvcReportsPath = "/internal/reports/"
	// go-svc gives a report 30 s; the extra covers the way there and back.
	reportsRequestTimeout = 40 * time.Second
	// The largest report answer passed on: a CSV of every row of a long period.
	reportsMaxBodyBytes = 64 << 20
)

var errReportsUnavailable = errors.New("reports unavailable")

// reportAnswer is go-svc's answer as it came: its status, its type and download name, and body.
type reportAnswer struct {
	status             int
	contentType        string
	contentDisposition string
	body               []byte
}

type reportsReader interface {
	report(ctx context.Context, p principal, kind string, query map[string]string, format string) (reportAnswer, error)
}

type reportsDoer interface {
	Do(*http.Request) (*http.Response, error)
}

type goSvcReportsClient struct {
	baseURL        string
	cookiePassword string
	http           reportsDoer
}

func goSvcBaseURLFromEnv() string {
	if value := strings.TrimSpace(os.Getenv("GO_SVC_INTERNAL_URL")); value != "" {
		return value
	}
	return strings.TrimSpace(os.Getenv("GO_SVC_URL"))
}

// newReportsReaderFromEnv is nil, so the reports routes answer unavailable, until go-svc's
// address and the service token's secret are both set.
func newReportsReaderFromEnv() reportsReader {
	client, err := newGoSvcReportsClient(goSvcBaseURLFromEnv(), os.Getenv("WORKOS_COOKIE_PASSWORD"), nil)
	if err != nil {
		slog.Warn("reports disabled", "reason", err.Error())
		return nil
	}
	return client
}

func newGoSvcReportsClient(baseURL, cookiePassword string, doer reportsDoer) (*goSvcReportsClient, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return nil, fmt.Errorf("missing go-svc base URL")
	}
	parsed, err := url.Parse(baseURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return nil, fmt.Errorf("invalid go-svc base URL")
	}
	if strings.TrimSpace(cookiePassword) == "" {
		return nil, fmt.Errorf("missing cookie password")
	}
	if doer == nil {
		doer = &http.Client{
			Timeout: reportsRequestTimeout,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
	}
	return &goSvcReportsClient{baseURL: baseURL, cookiePassword: strings.TrimSpace(cookiePassword), http: doer}, nil
}

func (c *goSvcReportsClient) report(ctx context.Context, p principal, kind string, query map[string]string, format string) (reportAnswer, error) {
	payload, err := json.Marshal(struct {
		OrganizationID string            `json:"organizationId"`
		UserID         string            `json:"userId"`
		Query          map[string]string `json:"query"`
		Format         string            `json:"format"`
	}{p.OrganizationID, p.UserID, query, format})
	if err != nil {
		return reportAnswer{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+goSvcReportsPath+url.PathEscape(kind), bytes.NewReader(payload))
	if err != nil {
		return reportAnswer{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(goSvcServiceTokenHeader, goSvcServiceToken(c.cookiePassword))
	res, err := c.http.Do(req)
	if err != nil {
		return reportAnswer{}, fmt.Errorf("%w: %w", errReportsUnavailable, err)
	}
	defer func() { _ = res.Body.Close() }()
	body, err := io.ReadAll(io.LimitReader(res.Body, reportsMaxBodyBytes+1))
	if err != nil {
		return reportAnswer{}, fmt.Errorf("%w: read answer: %w", errReportsUnavailable, err)
	}
	if len(body) > reportsMaxBodyBytes {
		return reportAnswer{}, errReportTooLarge
	}
	return reportAnswer{
		status:             res.StatusCode,
		contentType:        res.Header.Get("Content-Type"),
		contentDisposition: res.Header.Get("Content-Disposition"),
		body:               body,
	}, nil
}

var errReportTooLarge = errors.New("report too large")
