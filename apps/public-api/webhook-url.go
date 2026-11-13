package main

import (
	"net/url"
	"strconv"
	"strings"
)

// validateWebhookEndpointURL accepts HTTPS on a public host only. DNS is checked again on send.
func validateWebhookEndpointURL(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", errWebhookURLInvalid
	}
	if parsed.Scheme != "https" || parsed.User != nil || isBlockedWebhookHost(parsed.Hostname()) {
		return "", errWebhookURLInvalid
	}
	return parsed.String(), nil
}

func isBlockedWebhookHost(hostname string) bool {
	normalized := normalizeWebhookHostname(hostname)
	if normalized == "" || normalized == "localhost" || strings.HasSuffix(normalized, ".localhost") {
		return true
	}
	if octets := parseIPv4Octets(normalized); octets != nil {
		return isBlockedIPv4(octets)
	}
	if strings.Contains(normalized, ":") {
		return isBlockedIPv6(normalized)
	}
	return false
}

func normalizeWebhookHostname(hostname string) string {
	lower := strings.ToLower(hostname)
	if strings.HasPrefix(lower, "[") && strings.HasSuffix(lower, "]") {
		lower = lower[1 : len(lower)-1]
	}
	return strings.TrimSuffix(lower, ".")
}

func parseIPv4Octets(hostname string) []int {
	parts := strings.Split(hostname, ".")
	if len(parts) != 4 {
		return nil
	}
	octets := make([]int, 4)
	for i, part := range parts {
		if part == "" {
			return nil
		}
		value, err := strconv.Atoi(part)
		if err != nil || value < 0 || value > 255 {
			return nil
		}
		octets[i] = value
	}
	return octets
}

func isBlockedIPv4(octets []int) bool {
	first, second, third := octets[0], octets[1], octets[2]
	return first == 0 || first == 10 || first == 127 || first >= 224 ||
		(first == 100 && second >= 64 && second <= 127) ||
		(first == 169 && second == 254) ||
		(first == 172 && second >= 16 && second <= 31) ||
		(first == 192 && second == 0) ||
		(first == 192 && second == 168) ||
		(first == 198 && (second == 18 || second == 19 || (second == 51 && third == 100))) ||
		(first == 203 && second == 0 && third == 113)
}

func isBlockedIPv6(hostname string) bool {
	if hostname == "::" || hostname == "::1" ||
		strings.HasPrefix(hostname, "::ffff:") ||
		strings.HasPrefix(hostname, "64:ff9b:") ||
		strings.HasPrefix(hostname, "100:") ||
		strings.HasPrefix(hostname, "2001:2:") ||
		strings.HasPrefix(hostname, "2001:db8:") ||
		strings.HasPrefix(hostname, "fc") ||
		strings.HasPrefix(hostname, "fd") ||
		strings.HasPrefix(hostname, "fe80:") ||
		strings.HasPrefix(hostname, "fe8") ||
		strings.HasPrefix(hostname, "fe9") ||
		strings.HasPrefix(hostname, "fea") ||
		strings.HasPrefix(hostname, "feb") {
		return true
	}
	if mapped := ipv4FromIPv4MappedIPv6(hostname); mapped != nil {
		return isBlockedIPv4(mapped)
	}
	return false
}

func ipv4FromIPv4MappedIPv6(hostname string) []int {
	if !strings.HasPrefix(strings.ToLower(hostname), "::ffff:") {
		return nil
	}
	rest := hostname[7:]
	if strings.Contains(rest, ".") {
		return parseIPv4Octets(rest)
	}
	parts := strings.Split(rest, ":")
	if len(parts) != 2 {
		return nil
	}
	high, errHigh := strconv.ParseInt(parts[0], 16, 32)
	low, errLow := strconv.ParseInt(parts[1], 16, 32)
	if errHigh != nil || errLow != nil {
		return nil
	}
	return []int{int(high>>8) & 0xff, int(high) & 0xff, int(low>>8) & 0xff, int(low) & 0xff}
}
