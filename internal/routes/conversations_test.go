package routes

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/huacheng/agy-online/internal/config"
)

func TestConversationsHandler(t *testing.T) {
	// Create temporary fake brain directory structure
	tmpHome, err := os.MkdirTemp("", "fake-home-*")
	if err != nil {
		t.Fatalf("failed to create temp home: %v", err)
	}
	defer os.RemoveAll(tmpHome)

	// Set HOME and USERPROFILE for test
	oldHome := os.Getenv("HOME")
	oldUserProfile := os.Getenv("USERPROFILE")
	defer func() {
		os.Setenv("HOME", oldHome)
		os.Setenv("USERPROFILE", oldUserProfile)
	}()
	os.Setenv("HOME", tmpHome)
	os.Setenv("USERPROFILE", tmpHome)

	fakeBrain := filepath.Join(tmpHome, ".gemini", "antigravity-cli", "brain")
	conv1Dir := filepath.Join(fakeBrain, "conv-test-1", ".system_generated", "logs")
	if err := os.MkdirAll(conv1Dir, 0755); err != nil {
		t.Fatalf("failed to create fake conv dir: %v", err)
	}

	// Write fake transcript
	transcriptContent := `{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","created_at":"2026-09-05T20:00:00Z","content":"<USER_REQUEST>\nHello World Test\n</USER_REQUEST>"}
{"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-09-05T20:00:05Z","content":"Hello from assistant test"}`
	if err := os.WriteFile(filepath.Join(conv1Dir, "transcript.jsonl"), []byte(transcriptContent), 0644); err != nil {
		t.Fatalf("failed to write fake transcript: %v", err)
	}

	cfg := &config.Config{
		AuthToken: "test-token",
	}
	auth := NewAuthHelper(cfg)
	handler := NewConversationsHandler(auth)

	// Test ListConversations
	req := httptest.NewRequest("GET", "/api/agy/conversations", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	w := httptest.NewRecorder()
	handler.ListConversations(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var listRes struct {
		Ok            bool                  `json:"ok"`
		Conversations []ConversationSummary `json:"conversations"`
	}
	if err := json.NewDecoder(w.Body).Decode(&listRes); err != nil {
		t.Fatalf("failed to decode list response: %v", err)
	}
	if len(listRes.Conversations) != 1 {
		t.Fatalf("expected 1 conversation, got %d", len(listRes.Conversations))
	}
	if listRes.Conversations[0].Title != "Hello World Test" {
		t.Errorf("expected title 'Hello World Test', got '%s'", listRes.Conversations[0].Title)
	}
	if listRes.Conversations[0].TurnCount != 1 {
		t.Errorf("expected turn count 1, got %d", listRes.Conversations[0].TurnCount)
	}

	// Test GetConversationMessages
	req2 := httptest.NewRequest("GET", "/api/agy/conversations/conv-test-1/messages", nil)
	req2.SetPathValue("id", "conv-test-1")
	req2.Header.Set("Authorization", "Bearer test-token")
	w2 := httptest.NewRecorder()
	handler.GetConversationMessages(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w2.Code, w2.Body.String())
	}

	var msgRes struct {
		Ok             bool              `json:"ok"`
		ConversationId string            `json:"conversationId"`
		Messages       []ChatMessageItem `json:"messages"`
	}
	if err := json.NewDecoder(w2.Body).Decode(&msgRes); err != nil {
		t.Fatalf("failed to decode messages response: %v", err)
	}
	if len(msgRes.Messages) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgRes.Messages))
	}
	if msgRes.Messages[0].Role != "user" || msgRes.Messages[0].Content != "Hello World Test" {
		t.Errorf("unexpected user message: %+v", msgRes.Messages[0])
	}
	if msgRes.Messages[1].Role != "assistant" || msgRes.Messages[1].Content != "Hello from assistant test" {
		t.Errorf("unexpected assistant message: %+v", msgRes.Messages[1])
	}

	// Test DeleteConversation
	req3 := httptest.NewRequest("DELETE", "/api/agy/conversations/conv-test-1", nil)
	req3.SetPathValue("id", "conv-test-1")
	req3.Header.Set("Authorization", "Bearer test-token")
	w3 := httptest.NewRecorder()
	handler.DeleteConversation(w3, req3)

	if w3.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w3.Code, w3.Body.String())
	}

	// Verify deleted
	if _, err := os.Stat(filepath.Join(fakeBrain, "conv-test-1")); !os.IsNotExist(err) {
		t.Errorf("expected folder to be deleted")
	}
}

func TestConversationsHandler_Pagination(t *testing.T) {
	tmpHome, err := os.MkdirTemp("", "fake-home-pagination-*")
	if err != nil {
		t.Fatalf("failed to create temp home: %v", err)
	}
	defer os.RemoveAll(tmpHome)

	oldHome := os.Getenv("HOME")
	oldUserProfile := os.Getenv("USERPROFILE")
	defer func() {
		os.Setenv("HOME", oldHome)
		os.Setenv("USERPROFILE", oldUserProfile)
	}()
	os.Setenv("HOME", tmpHome)
	os.Setenv("USERPROFILE", tmpHome)

	fakeBrain := filepath.Join(tmpHome, ".gemini", "antigravity-cli", "brain")

	// Create 7 conversations with distinct mod times
	for i := 1; i <= 7; i++ {
		cid := fmt.Sprintf("conv-page-%02d", i)
		convDir := filepath.Join(fakeBrain, cid, ".system_generated", "logs")
		if err := os.MkdirAll(convDir, 0755); err != nil {
			t.Fatalf("failed to create dir: %v", err)
		}
		transcript := fmt.Sprintf(`{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","created_at":"2026-09-0%dT10:00:00Z","content":"Prompt %d"}
{"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-09-0%dT10:01:00Z","content":"Answer %d"}`, i, i, i, i)
		logPath := filepath.Join(convDir, "transcript.jsonl")
		if err := os.WriteFile(logPath, []byte(transcript), 0644); err != nil {
			t.Fatalf("failed to write transcript: %v", err)
		}
		// Set distinct modification time
		mtime := time.Date(2026, 9, i, 10, 0, 0, 0, time.UTC)
		if err := os.Chtimes(logPath, mtime, mtime); err != nil {
			t.Fatalf("failed to set chtimes: %v", err)
		}
	}

	cfg := &config.Config{AuthToken: "test-token"}
	handler := NewConversationsHandler(NewAuthHelper(cfg))

	// 1. Test ?limit=3
	req := httptest.NewRequest("GET", "/api/agy/conversations?limit=3", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	w := httptest.NewRecorder()
	handler.ListConversations(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resPage1 struct {
		Ok            bool                  `json:"ok"`
		Conversations []ConversationSummary `json:"conversations"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resPage1); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(resPage1.Conversations) != 3 {
		t.Fatalf("expected 3 items for limit=3, got %d", len(resPage1.Conversations))
	}
	// Verify descending order: conv-page-07 should be first
	if resPage1.Conversations[0].ID != "conv-page-07" {
		t.Errorf("expected first item to be conv-page-07, got %s", resPage1.Conversations[0].ID)
	}

	// 2. Test ?limit=3&offset=3
	req2 := httptest.NewRequest("GET", "/api/agy/conversations?limit=3&offset=3", nil)
	req2.Header.Set("Authorization", "Bearer test-token")
	w2 := httptest.NewRecorder()
	handler.ListConversations(w2, req2)

	var resPage2 struct {
		Ok            bool                  `json:"ok"`
		Conversations []ConversationSummary `json:"conversations"`
	}
	if err := json.NewDecoder(w2.Body).Decode(&resPage2); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(resPage2.Conversations) != 3 {
		t.Fatalf("expected 3 items for page 2, got %d", len(resPage2.Conversations))
	}
	if resPage2.Conversations[0].ID != "conv-page-04" {
		t.Errorf("expected first item of page 2 to be conv-page-04, got %s", resPage2.Conversations[0].ID)
	}

	// 3. Test ?offset=6 (should have 1 item left)
	req3 := httptest.NewRequest("GET", "/api/agy/conversations?offset=6", nil)
	req3.Header.Set("Authorization", "Bearer test-token")
	w3 := httptest.NewRecorder()
	handler.ListConversations(w3, req3)

	var resPage3 struct {
		Ok            bool                  `json:"ok"`
		Conversations []ConversationSummary `json:"conversations"`
	}
	if err := json.NewDecoder(w3.Body).Decode(&resPage3); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(resPage3.Conversations) != 1 {
		t.Fatalf("expected 1 item for offset=6, got %d", len(resPage3.Conversations))
	}
	if resPage3.Conversations[0].ID != "conv-page-01" {
		t.Errorf("expected last item to be conv-page-01, got %s", resPage3.Conversations[0].ID)
	}

	// 4. Test out-of-bounds offset
	req4 := httptest.NewRequest("GET", "/api/agy/conversations?offset=100", nil)
	req4.Header.Set("Authorization", "Bearer test-token")
	w4 := httptest.NewRecorder()
	handler.ListConversations(w4, req4)

	var resEmpty struct {
		Ok            bool                  `json:"ok"`
		Conversations []ConversationSummary `json:"conversations"`
	}
	if err := json.NewDecoder(w4.Body).Decode(&resEmpty); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(resEmpty.Conversations) != 0 {
		t.Fatalf("expected 0 items for offset=100, got %d", len(resEmpty.Conversations))
	}
}

func TestExtractUserPrompt(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{
			input:    "<USER_REQUEST>\nFix the login button\n</USER_REQUEST>",
			expected: "Fix the login button",
		},
		{
			input:    "<USER_REQUEST>\n<SKILL>some skill info</SKILL>\n<ADDITIONAL_METADATA>meta</ADDITIONAL_METADATA>\nRefactor auth handler\n</USER_REQUEST>",
			expected: "Refactor auth handler",
		},
		{
			input:    "Plain text question without tags",
			expected: "Plain text question without tags",
		},
	}

	for _, c := range cases {
		got := extractUserPrompt(c.input)
		if got != c.expected {
			t.Errorf("extractUserPrompt(%q) = %q; want %q", c.input, got, c.expected)
		}
	}
}

func TestConversationsHandler_SubagentOutputCorrelation(t *testing.T) {
	tmpHome, err := os.MkdirTemp("", "fake-home-subagent-*")
	if err != nil {
		t.Fatalf("failed to create temp home: %v", err)
	}
	defer os.RemoveAll(tmpHome)

	oldHome := os.Getenv("HOME")
	oldUserProfile := os.Getenv("USERPROFILE")
	defer func() {
		os.Setenv("HOME", oldHome)
		os.Setenv("USERPROFILE", oldUserProfile)
	}()
	os.Setenv("HOME", tmpHome)
	os.Setenv("USERPROFILE", tmpHome)

	fakeBrain := filepath.Join(tmpHome, ".gemini", "antigravity-cli", "brain")
	convDir := filepath.Join(fakeBrain, "conv-subagent-1", ".system_generated", "logs")
	if err := os.MkdirAll(convDir, 0755); err != nil {
		t.Fatalf("failed to create fake conv dir: %v", err)
	}

	transcriptContent := `{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","created_at":"2026-09-05T20:00:00Z","content":"<USER_REQUEST>\nRun task\n</USER_REQUEST>"}
{"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-09-05T20:00:05Z","tool_calls":[{"name":"invoke_subagent","args":{"Subagents":"[{\"Model\":\"inherit\",\"Prompt\":\"test\"}]"}}]}
{"step_index":2,"source":"MODEL","type":"GENERIC","status":"DONE","created_at":"2026-09-05T20:00:08Z","content":"Created the following subagents:\n{\n  \"conversationId\": \"sub-conv-456\",\n  \"workspaceUris\": [\"/test/ws\"]\n}"}
{"step_index":3,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-09-05T20:00:10Z","content":"I have dispatched the subagent."}
`
	if err := os.WriteFile(filepath.Join(convDir, "transcript.jsonl"), []byte(transcriptContent), 0644); err != nil {
		t.Fatalf("failed to write fake transcript: %v", err)
	}

	cfg := &config.Config{
		AuthToken: "test-token",
	}
	auth := NewAuthHelper(cfg)
	handler := NewConversationsHandler(auth)

	req := httptest.NewRequest("GET", "/api/agy/conversations/conv-subagent-1/messages", nil)
	req.SetPathValue("id", "conv-subagent-1")
	req.Header.Set("Authorization", "Bearer test-token")
	w := httptest.NewRecorder()
	handler.GetConversationMessages(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var msgRes struct {
		Ok             bool              `json:"ok"`
		ConversationId string            `json:"conversationId"`
		Messages       []ChatMessageItem `json:"messages"`
	}
	if err := json.NewDecoder(w.Body).Decode(&msgRes); err != nil {
		t.Fatalf("failed to decode messages response: %v", err)
	}

	if len(msgRes.Messages) < 2 {
		t.Fatalf("expected at least 2 messages, got %d", len(msgRes.Messages))
	}

	assistantMsg := msgRes.Messages[1]
	if assistantMsg.Role != "assistant" {
		t.Fatalf("expected assistant message, got %s", assistantMsg.Role)
	}
	if len(assistantMsg.ToolCalls) != 1 {
		t.Fatalf("expected 1 tool call, got %d", len(assistantMsg.ToolCalls))
	}

	tc := assistantMsg.ToolCalls[0]
	if tc.Name != "invoke_subagent" {
		t.Errorf("expected tool name 'invoke_subagent', got '%s'", tc.Name)
	}
	if !strings.Contains(tc.Output, "sub-conv-456") {
		t.Errorf("expected output to contain 'sub-conv-456', got '%s'", tc.Output)
	}
	if tc.Status != "success" {
		t.Errorf("expected status 'success', got '%s'", tc.Status)
	}
	if tc.Id == "" {
		t.Errorf("expected tool ID to be non-empty")
	}
}
