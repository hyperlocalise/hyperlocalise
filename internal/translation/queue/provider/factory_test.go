package provider

import (
	"context"
	"testing"
)

func TestNewPublisherStub(t *testing.T) {
	t.Parallel()

	publisher, err := NewPublisher(context.Background(), Config{Driver: "stub"})
	if err != nil {
		t.Fatalf("NewPublisher() error = %v", err)
	}

	if publisher == nil {
		t.Fatal("NewPublisher() returned nil publisher")
	}
}

func TestNewPublisherRejectsUnknownDriver(t *testing.T) {
	t.Parallel()

	publisher, err := NewPublisher(context.Background(), Config{Driver: "nope"})
	if err == nil {
		t.Fatal("NewPublisher() error = nil, want error")
	}

	if publisher != nil {
		t.Fatal("NewPublisher() returned publisher with invalid driver")
	}
}

func TestNewPublisherRejectsReservedAWSDriver(t *testing.T) {
	t.Parallel()

	publisher, err := NewPublisher(context.Background(), Config{Driver: "aws-sqs"})
	if err == nil {
		t.Fatal("NewPublisher() error = nil, want error")
	}

	if publisher != nil {
		t.Fatal("NewPublisher() returned publisher for reserved aws driver")
	}
}
