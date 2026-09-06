package routes

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/huacheng/ai-cli-online/internal/config"
)

func TestConversationsHandler(t *testing.T) {
	// Create temporary fake brain directory structure
	tmpHome, err := os.MkdirTemp("", "fake-home-*")
	if err != nil {
		t.Fatalf("failed to create temp home: %v", err)
	}
	defer os.RemoveAll(tmpHome)

	// Set HOME for test
	oldHome := os.Getenv("HOME")
	defer os.Setenv("HOME", oldHome)
	os.Setenv("HOME", tmpHome)

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
