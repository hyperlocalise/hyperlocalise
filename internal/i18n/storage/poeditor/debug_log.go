package poeditor

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	envPOEditorDebugPath = "HYPERLOCALISE_POEDITOR_DEBUG_FILE"
	envGenericDebug      = "DEBUG"
	defaultDebugLogPath  = ".hyperlocalise/logs/poeditor.log"
)

type debugLogger struct {
	mu sync.Mutex
}

type debugEvent struct {
	Timestamp string         `json:"timestamp"`
	Component string         `json:"component"`
	Event     string         `json:"event"`
	Fields    map[string]any `json:"fields,omitempty"`
}

var poeditorDebugLogger debugLogger

func debug(component, event string, fields map[string]any) {
	poeditorDebugLogger.write(debugEvent{
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Component: component,
		Event:     event,
		Fields:    fields,
	})
}

func (l *debugLogger) write(event debugEvent) {
	enabled, path := resolveDebugConfig()
	if !enabled {
		return
	}

	data, err := json.Marshal(event)
	if err != nil {
		return
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return
	}

	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer func() {
		_ = f.Close()
	}()

	_, _ = f.Write(append(data, '\n'))
}

func resolveDebugConfig() (bool, string) {
	enabled := parseDebugBool(os.Getenv(envGenericDebug))
	path := strings.TrimSpace(os.Getenv(envPOEditorDebugPath))
	if path == "" {
		path = defaultDebugLogPath
	}
	return enabled, path
}

func parseDebugBool(raw string) bool {
	if strings.TrimSpace(raw) == "" {
		return false
	}
	parsed, err := strconv.ParseBool(strings.TrimSpace(raw))
	if err == nil {
		return parsed
	}
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "on", "yes", "y":
		return true
	default:
		return false
	}
}
