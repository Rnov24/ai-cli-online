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

func TestParseStream_InvokeSubagentToolUpdate(t *testing.T) {
	jsonlInput := `{"event":"step_update","conversation_id":"conv-sub-123","step_update":{"step_index":1,"step_type":"tool","tool_name":"","state":"DONE","duration_seconds":1.2,"tool_info":{"name":"invoke_subagent","parameters":{"Subagents":"[{\"Prompt\":\"test\"}]"},"output":"Created subagents:\n{\"conversationId\":\"child-conv-999\"}"}}}
{"event":"step_update","conversation_id":"conv-sub-123","step_update":{"step_index":2,"step_type":"tool","tool_name":"","state":"ERROR","duration_seconds":0.5,"tool_info":{"name":"invoke_subagent","parameters":{},"output":"Permission denied"}}}
`

	var events []StreamEvent
	_, err := ParseStream(strings.NewReader(jsonlInput), func(evt StreamEvent) {
		events = append(events, evt)
	})

	if err != nil {
		t.Fatalf("ParseStream failed: %v", err)
	}

	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(events))
	}

	// First event: tool_name was empty, tool_info.name was invoke_subagent, state DONE
	if events[0].Event != "tool" {
		t.Errorf("expected event[0] to be tool, got: %s", events[0].Event)
	}
	if events[0].ToolCall.Name != "invoke_subagent" {
		t.Errorf("expected tool name 'invoke_subagent', got: %s", events[0].ToolCall.Name)
	}
	if events[0].ToolCall.Status != "success" {
		t.Errorf("expected tool status 'success', got: %s", events[0].ToolCall.Status)
	}
	if !strings.Contains(events[0].ToolCall.Output, "child-conv-999") {
		t.Errorf("expected output to contain child-conv-999, got: %s", events[0].ToolCall.Output)
	}

	// Second event: state ERROR
	if events[1].Event != "tool" {
		t.Errorf("expected event[1] to be tool, got: %s", events[1].Event)
	}
	if events[1].ToolCall.Name != "invoke_subagent" {
		t.Errorf("expected tool name 'invoke_subagent', got: %s", events[1].ToolCall.Name)
	}
	if events[1].ToolCall.Status != "error" {
		t.Errorf("expected tool status 'error', got: %s", events[1].ToolCall.Status)
	}
}
