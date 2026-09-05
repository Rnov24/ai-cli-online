package agy

import (
	"strings"
	"testing"
)

func TestParseStreamWithFixtures(t *testing.T) {
	jsonlInput := `{"event":"init","conversation_id":"conv-abc-123","init":{"cwd":"/repo","tools":["read_file","run_command"]}}
{"event":"step_update","conversation_id":"conv-abc-123","step_update":{"step_index":1,"step_type":"tool","tool_name":"read_file","state":"DONE","duration_seconds":0.05,"tool_info":{"name":"read_file","parameters":{"path":"main.go"},"output":"package main"},"usage":{"total_tokens":120}}}
{"event":"step_update","conversation_id":"conv-abc-123","step_update":{"step_index":2,"step_type":"agent_response","text_delta":"Hello ","usage":{"total_tokens":150}}}
{"event":"step_update","conversation_id":"conv-abc-123","step_update":{"step_index":3,"step_type":"agent_response","text_delta":"world!","usage":{"total_tokens":180}}}
{"event":"result","conversation_id":"conv-abc-123","result":{"status":"success","response":"Hello world!","duration_seconds":1.25,"usage":{"total_tokens":180}}}
`

	var events []StreamEvent
	res, err := ParseStream(strings.NewReader(jsonlInput), func(evt StreamEvent) {
		events = append(events, evt)
	})

	if err != nil {
		t.Fatalf("ParseStream failed: %v", err)
	}

	if res.ConversationId != "conv-abc-123" {
		t.Errorf("expected conv-abc-123, got: %s", res.ConversationId)
	}
	if res.FullResponse != "Hello world!" {
		t.Errorf("expected 'Hello world!', got: %s", res.FullResponse)
	}
	if res.TotalTokens != 180 {
		t.Errorf("expected 180 tokens, got: %d", res.TotalTokens)
	}
	if res.DurationSec != 1.25 {
		t.Errorf("expected 1.25s duration, got: %f", res.DurationSec)
	}

	// Verify events received
	if len(events) != 5 {
		t.Fatalf("expected 5 events, got: %d", len(events))
	}
	if events[0].Event != "init" {
		t.Errorf("expected event[0] to be init, got: %s", events[0].Event)
	}
	if events[1].Event != "tool" || events[1].ToolCall.Name != "read_file" {
		t.Errorf("expected event[1] to be tool read_file, got: %+v", events[1])
	}
	if events[2].Event != "chunk" || events[2].Delta != "Hello " {
		t.Errorf("expected event[2] to be chunk 'Hello ', got: %+v", events[2])
	}
	if events[3].Event != "chunk" || events[3].Delta != "world!" {
		t.Errorf("expected event[3] to be chunk 'world!', got: %+v", events[3])
	}
	if events[4].Event != "done" || events[4].Status != "success" {
		t.Errorf("expected event[4] to be done success, got: %+v", events[4])
	}
}
