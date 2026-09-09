package routes

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/huacheng/agy-online/internal/config"
)

func TestSubagentsHandler(t *testing.T) {
	// Setup temporary fake brain directory structure
	tmpHome, err := os.MkdirTemp("", "fake-brain-subagents-*")
	if err != nil {
		t.Fatalf("failed to create temp home: %v", err)
	}
	defer os.RemoveAll(tmpHome)

	fakeBrain := filepath.Join(tmpHome, ".gemini", "antigravity-cli", "brain")
	parentDir := filepath.Join(fakeBrain, "parent-conv-1", ".system_generated", "logs")
	subagentDir := filepath.Join(fakeBrain, "test-subagent-123", ".system_generated", "logs")

	if err := os.MkdirAll(parentDir, 0755); err != nil {
		t.Fatalf("failed to create parent dir: %v", err)
	}
	if err := os.MkdirAll(subagentDir, 0755); err != nil {
		t.Fatalf("failed to create subagent dir: %v", err)
	}

	// 1. Parent transcript with invoke_subagent and tool result
	parentTranscript := `{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","created_at":"2026-09-09T20:00:00Z","content":"<USER_REQUEST>Implement Plan 041</USER_REQUEST>"}
{"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-09-09T20:00:05Z","tool_calls":[{"name":"invoke_subagent","args":{"Subagents":[{"Model":"inherit","Prompt":"You are the executor for test plan.","Role":"Test Executor","TypeName":"self"}]}}]}
{"step_index":2,"source":"MODEL","type":"GENERIC","status":"DONE","created_at":"2026-09-09T20:00:10Z","content":"Created the following subagents:\n{\n  \"conversationId\": \"test-subagent-123\",\n  \"logAbsoluteUri\": \"file:///data/test/transcript.jsonl\",\n  \"workspaceUris\": [\"/data/test/worktree\"]\n}"}
`
	if err := os.WriteFile(filepath.Join(parentDir, "transcript.jsonl"), []byte(parentTranscript), 0644); err != nil {
		t.Fatalf("failed to write parent transcript: %v", err)
	}

	// 2. Child transcript with initial prompt, 3 tool calls, and final complete message
	childTranscript := `{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","created_at":"2026-09-09T20:00:12Z","content":"<USER_REQUEST>You are the executor for test plan. Follow step by step.</USER_REQUEST>\n<subagent_reminder>You are running as a subagent, invoked by a caller agent (name: \"parent\", id: \"parent-conv-1\").</subagent_reminder>"}
{"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-09-09T20:00:15Z","tool_calls":[{"name":"view_file","args":{"AbsolutePath":"/test/file1"}}]}
{"step_index":2,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-09-09T20:00:20Z","tool_calls":[{"name":"run_command","args":{"CommandLine":"go test ./..."}}]}
{"step_index":3,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-09-09T20:00:25Z","tool_calls":[{"name":"send_message","args":{"Message":"STATUS: COMPLETE\nSTEPS: all done\nFILES CHANGED: none\nNOTES: ok","Recipient":"parent-conv-1"}}]}
`
	if err := os.WriteFile(filepath.Join(subagentDir, "transcript.jsonl"), []byte(childTranscript), 0644); err != nil {
		t.Fatalf("failed to write child transcript: %v", err)
	}

	cfg := &config.Config{AuthToken: "test-secret-token"}
	auth := NewAuthHelper(cfg)
	handler := NewSubagentsHandlerWithDir(auth, fakeBrain)

	// Test 1: Unauthorized access returns 401
	{
		req := httptest.NewRequest("GET", "/api/agy/subagents", nil)
		w := httptest.NewRecorder()
		handler.ListSubagents(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 Unauthorized, got %d", w.Code)
		}
	}

	// Test 2: ListSubagents returns discovered subagent accurately
	{
		req := httptest.NewRequest("GET", "/api/agy/subagents", nil)
		req.Header.Set("Authorization", "Bearer test-secret-token")
		w := httptest.NewRecorder()
		handler.ListSubagents(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var res SubagentsResponse
		if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if !res.Ok {
			t.Fatalf("expected res.Ok to be true")
		}
		if res.Count != 1 || len(res.Subagents) != 1 {
			t.Fatalf("expected 1 subagent, got %d (len %d)", res.Count, len(res.Subagents))
		}

		sub := res.Subagents[0]
		if sub.ID != "test-subagent-123" {
			t.Errorf("expected ID 'test-subagent-123', got '%s'", sub.ID)
		}
		if sub.ParentID != "parent-conv-1" {
			t.Errorf("expected ParentID 'parent-conv-1', got '%s'", sub.ParentID)
		}
		if sub.Role != "Test Executor" {
			t.Errorf("expected Role 'Test Executor', got '%s'", sub.Role)
		}
		if sub.TypeName != "self" {
			t.Errorf("expected TypeName 'self', got '%s'", sub.TypeName)
		}
		if sub.ToolCount != 3 {
			t.Errorf("expected ToolCount 3, got %d", sub.ToolCount)
		}
		if sub.Status != "done" {
			t.Errorf("expected Status 'done', got '%s'", sub.Status)
		}
		if sub.Report == "" {
			t.Errorf("expected Report to contain completion text, got empty")
		}
	}

	// Test 3: Query filtering by q=Executor and status=done
	{
		req := httptest.NewRequest("GET", "/api/agy/subagents?q=Executor&status=done", nil)
		req.Header.Set("Authorization", "Bearer test-secret-token")
		w := httptest.NewRecorder()
		handler.ListSubagents(w, req)

		var res SubagentsResponse
		if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if res.Count != 1 {
			t.Errorf("expected 1 match for q=Executor&status=done, got %d", res.Count)
		}

		// Non-matching query
		req2 := httptest.NewRequest("GET", "/api/agy/subagents?q=nonexistent", nil)
		req2.Header.Set("Authorization", "Bearer test-secret-token")
		w2 := httptest.NewRecorder()
		handler.ListSubagents(w2, req2)

		var res2 SubagentsResponse
		_ = json.NewDecoder(w2.Body).Decode(&res2)
		if res2.Count != 0 {
			t.Errorf("expected 0 matches for q=nonexistent, got %d", res2.Count)
		}
	}

	// Test 4: GetSubagent returns 200 with details for valid ID, 404 for unknown
	{
		req := httptest.NewRequest("GET", "/api/agy/subagents/test-subagent-123", nil)
		req.SetPathValue("id", "test-subagent-123")
		req.Header.Set("Authorization", "Bearer test-secret-token")
		w := httptest.NewRecorder()
		handler.GetSubagent(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 for GetSubagent, got %d: %s", w.Code, w.Body.String())
		}

		var detail SubagentDetailResponse
		if err := json.NewDecoder(w.Body).Decode(&detail); err != nil {
			t.Fatalf("failed to decode detail response: %v", err)
		}
		if !detail.Ok || detail.Subagent.ID != "test-subagent-123" {
			t.Errorf("expected valid detail response, got %+v", detail)
		}
		if len(detail.Messages) == 0 {
			t.Errorf("expected messages in detail response, got 0")
		}

		// 404 for unknown ID
		req404 := httptest.NewRequest("GET", "/api/agy/subagents/unknown-id", nil)
		req404.SetPathValue("id", "unknown-id")
		req404.Header.Set("Authorization", "Bearer test-secret-token")
		w404 := httptest.NewRecorder()
		handler.GetSubagent(w404, req404)

		if w404.Code != http.StatusNotFound {
			t.Errorf("expected 404 for unknown ID, got %d", w404.Code)
		}
	}

	// Test 5: Filter by parent
	{
		req := httptest.NewRequest("GET", "/api/agy/subagents?parent=parent-conv-1", nil)
		req.Header.Set("Authorization", "Bearer test-secret-token")
		w := httptest.NewRecorder()
		handler.ListSubagents(w, req)

		var res SubagentsResponse
		_ = json.NewDecoder(w.Body).Decode(&res)
		if res.Count != 1 {
			t.Errorf("expected 1 match for parent=parent-conv-1, got %d", res.Count)
		}

		reqOther := httptest.NewRequest("GET", "/api/agy/subagents?parent=other-parent", nil)
		reqOther.Header.Set("Authorization", "Bearer test-secret-token")
		wOther := httptest.NewRecorder()
		handler.ListSubagents(wOther, reqOther)

		var resOther SubagentsResponse
		_ = json.NewDecoder(wOther.Body).Decode(&resOther)
		if resOther.Count != 0 {
			t.Errorf("expected 0 matches for parent=other-parent, got %d", resOther.Count)
		}
	}

}
