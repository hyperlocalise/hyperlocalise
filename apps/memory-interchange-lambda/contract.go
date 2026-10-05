package main

import "encoding/json"

type memoryInterchangeMessage struct {
	SchemaVersion int    `json:"schemaVersion"`
	AttemptID     string `json:"attemptId"`
	Operation     string `json:"operation"`
}

var jsonUnmarshal = json.Unmarshal
