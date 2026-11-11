package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
)

const (
	checkIPURL                 = "https://checkip.amazonaws.com"
	defaultNATEgressParameter  = "/hyperlocalise/prod/ecs/public-api/nat_public_ip_addresses"
	natEgressParameterNameEnv  = "NAT_EGRESS_PARAMETER_NAME"
	outboundIPLookupTimeout    = 3 * time.Second
	outboundIPResponseMaxBytes = 64
)

type outboundIPLookup interface {
	observedIP(context.Context) (string, error)
	natAddresses(context.Context) (name string, addresses []string, err error)
}

type outboundIPBody struct {
	OutboundIP      string   `json:"outboundIp,omitempty"`
	OutboundIPError string   `json:"outboundIpError,omitempty"`
	Allowlist       []string `json:"allowlist,omitempty"`
	AllowlistError  string   `json:"allowlistError,omitempty"`
}

type liveOutboundIP struct {
	client   *http.Client
	checkURL string

	once      sync.Once
	ssmClient *ssm.Client
	ssmErr    error
}

func (s apiServer) outboundIP(w http.ResponseWriter, r *http.Request) {
	if !allowRead(w, r) {
		return
	}
	observed, checkErr := s.outbound.observedIP(r.Context())
	name, addresses, parameterErr := s.outbound.natAddresses(r.Context())
	body := outboundIPBody{
		OutboundIP: observed,
		Allowlist:  addresses,
	}
	status := http.StatusOK
	if checkErr != nil {
		slog.Error("outbound IP lookup failed", "error", checkErr)
		body.OutboundIPError = "outbound IP lookup failed"
		status = http.StatusBadGateway
	}
	if parameterErr != nil {
		slog.Error("NAT egress parameter lookup failed", "parameter", name, "error", parameterErr)
		body.AllowlistError = "allowlist lookup failed"
		if status == http.StatusOK {
			status = http.StatusServiceUnavailable
		}
	}
	writeJSON(w, status, body)
}

func (l *liveOutboundIP) observedIP(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, l.checkEndpoint(), nil)
	if err != nil {
		return "", err
	}
	response, err := l.httpClient().Do(req)
	if err != nil {
		return "", err
	}
	defer func() { _ = response.Body.Close() }()
	payload, err := io.ReadAll(io.LimitReader(response.Body, outboundIPResponseMaxBytes))
	if err != nil {
		return "", err
	}
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("checkip returned %d", response.StatusCode)
	}
	address := strings.TrimSpace(string(payload))
	if net.ParseIP(address) == nil {
		return "", errors.New("checkip returned a non-address")
	}
	return address, nil
}

func (l *liveOutboundIP) natAddresses(ctx context.Context) (string, []string, error) {
	name := natEgressParameterName()
	client, err := l.parameterClient(ctx)
	if err != nil {
		return name, nil, err
	}
	output, err := client.GetParameter(ctx, &ssm.GetParameterInput{Name: aws.String(name)})
	if err != nil {
		return name, nil, err
	}
	if output.Parameter == nil || output.Parameter.Value == nil {
		return name, nil, errors.New("NAT egress parameter has no value")
	}
	addresses := splitAddresses(*output.Parameter.Value)
	if len(addresses) == 0 {
		return name, nil, errors.New("NAT egress parameter has no addresses")
	}
	return name, addresses, nil
}

func (l *liveOutboundIP) checkEndpoint() string {
	if l.checkURL != "" {
		return l.checkURL
	}
	return checkIPURL
}

func (l *liveOutboundIP) httpClient() *http.Client {
	if l.client == nil {
		l.client = &http.Client{Timeout: outboundIPLookupTimeout}
	}
	return l.client
}

func (l *liveOutboundIP) parameterClient(ctx context.Context) (*ssm.Client, error) {
	l.once.Do(func() {
		cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(strings.TrimSpace(os.Getenv("AWS_REGION"))))
		if err != nil {
			l.ssmErr = fmt.Errorf("load AWS configuration: %w", err)
			return
		}
		l.ssmClient = ssm.NewFromConfig(cfg)
	})
	return l.ssmClient, l.ssmErr
}

func natEgressParameterName() string {
	if name := strings.TrimSpace(os.Getenv(natEgressParameterNameEnv)); name != "" {
		return name
	}
	return defaultNATEgressParameter
}

func splitAddresses(value string) []string {
	parts := strings.Split(value, ",")
	addresses := make([]string, 0, len(parts))
	for _, part := range parts {
		address := strings.TrimSpace(part)
		if address != "" {
			addresses = append(addresses, address)
		}
	}
	return addresses
}
