//go:build !windows

package cmd

import (
	"context"
	"syscall"
	"testing"
	"time"
)

// These tests signal the test process itself, so they must not run in parallel.

func TestInterruptContextCancelsOnSignalAndStops(t *testing.T) {
	ctx, stop := interruptContext(context.Background())
	defer stop()

	if err := syscall.Kill(syscall.Getpid(), syscall.SIGTERM); err != nil {
		t.Fatalf("send SIGTERM: %v", err)
	}
	select {
	case <-ctx.Done():
	case <-time.After(5 * time.Second):
		t.Fatal("context was not cancelled by SIGTERM")
	}
	stop()
	stop()
}

func TestInterruptContextForcesExitAfterGracePeriod(t *testing.T) {
	previousGrace, previousExit := interruptGracePeriod, exitProcess
	t.Cleanup(func() { interruptGracePeriod, exitProcess = previousGrace, previousExit })
	interruptGracePeriod = 10 * time.Millisecond
	exited := make(chan int, 1)
	exitProcess = func(code int) { exited <- code }

	_, stop := interruptContext(context.Background())
	defer stop()
	if err := syscall.Kill(syscall.Getpid(), syscall.SIGTERM); err != nil {
		t.Fatalf("send SIGTERM: %v", err)
	}
	select {
	case code := <-exited:
		if code != InterruptExitCode {
			t.Fatalf("exit code = %d, want %d", code, InterruptExitCode)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("process did not exit after the grace period")
	}
}
