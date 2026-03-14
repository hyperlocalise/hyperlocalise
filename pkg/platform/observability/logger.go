package observability

import (
	"io"
	"log"
	"os"
)

type Logger struct {
	*log.Logger
}

func NewLogger(serviceName string) *Logger {
	return Wrap(log.New(os.Stdout, "", log.LstdFlags), serviceName)
}

func Wrap(base *log.Logger, serviceName string) *Logger {
	base.SetPrefix(serviceName + " ")

	return &Logger{Logger: base}
}

func Discard(serviceName string) *Logger {
	return Wrap(log.New(io.Discard, "", 0), serviceName)
}
