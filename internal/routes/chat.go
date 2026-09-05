package routes

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/huacheng/ai-cli-online/internal/agy"
	"github.com/huacheng/ai-cli-online/internal/tmux"
)

type ChatHandler struct {
	auth *AuthHelper
}

func NewChatHandler(auth *AuthHelper) *ChatHandler {
	return &ChatHandler{auth: auth}
}

func (c *ChatHandler) HandleChat(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := c.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	var req struct {
		Prompt         string `json:"prompt"`
		ConversationId string `json:"conversationId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Prompt == "" {
		http.Error(w, `{"error":"Prompt required"}`, http.StatusBadRequest)
		return
	}

	cwd := tmux.GetCwd(sessionName, c.auth.cfg.DefaultWorkingDir)

	reply, convId, err := agy.RunPromptStream(
		r.Context(),
		sessionName,
		cwd,
		req.ConversationId,
		req.Prompt,
		func(event agy.StreamEvent) {},
	)

	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":             true,
		"reply":          reply,
		"conversationId": convId,
	})
}

func (c *ChatHandler) HandleChatStream(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := c.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	var req struct {
		Prompt         string `json:"prompt"`
		ConversationId string `json:"conversationId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Prompt == "" {
		http.Error(w, `{"error":"Prompt required"}`, http.StatusBadRequest)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, `{"error":"Streaming unsupported"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher.Flush()

	cwd := tmux.GetCwd(sessionName, c.auth.cfg.DefaultWorkingDir)

	_, _, err := agy.RunPromptStream(
		r.Context(),
		sessionName,
		cwd,
		req.ConversationId,
		req.Prompt,
		func(event agy.StreamEvent) {
			b, err := json.Marshal(event)
			if err == nil {
				_, _ = fmt.Fprintf(w, "data: %s\n\n", b)
				flusher.Flush()
			}
		},
	)
	if err != nil {
		errEvt := agy.StreamEvent{
			Event:        "error",
			Status:       "error",
			Error:        err.Error(),
			FullResponse: fmt.Sprintf("AGY execution error: %v", err),
		}
		if b, mErr := json.Marshal(errEvt); mErr == nil {
			_, _ = fmt.Fprintf(w, "data: %s\n\n", b)
			flusher.Flush()
		}
	}
}

func (c *ChatHandler) HandleStop(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := c.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	agy.StopSession(sessionName)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}
