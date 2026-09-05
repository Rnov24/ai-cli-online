package routes

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/huacheng/ai-cli-online/internal/agy"
	"github.com/huacheng/ai-cli-online/internal/db"
	"github.com/huacheng/ai-cli-online/internal/terminal"
)

type ChatHandler struct {
	auth *AuthHelper
	db   *db.DB
}

func NewChatHandler(auth *AuthHelper, database *db.DB) *ChatHandler {
	return &ChatHandler{auth: auth, db: database}
}

func generateTurnId() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return fmt.Sprintf("turn_%d_%s", time.Now().UnixMilli(), hex.EncodeToString(b))
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

	turnId := generateTurnId()
	now := time.Now().UnixMilli()
	if c.db != nil {
		_ = c.db.CreateTurnJournal(db.TurnJournalEntry{
			Id:             turnId,
			SessionName:    sessionName,
			ConversationId: req.ConversationId,
			Prompt:         req.Prompt,
			Status:         "submitted",
			ToolCalls:      "[]",
			CreatedAt:      now,
			UpdatedAt:      now,
		})
	}

	cwd := terminal.GetCwd(sessionName, c.auth.cfg.DefaultWorkingDir)

	reply, convId, err := agy.RunPromptStream(
		r.Context(),
		sessionName,
		cwd,
		req.ConversationId,
		req.Prompt,
		func(event agy.StreamEvent) {},
	)

	if err != nil {
		if c.db != nil {
			_ = c.db.UpdateTurnJournal(turnId, "error", reply, "[]", err.Error(), 0, 0)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": err.Error(),
		})
		return
	}

	if c.db != nil {
		_ = c.db.UpdateTurnJournal(turnId, "completed", reply, "[]", "", 0, 0)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":             true,
		"reply":          reply,
		"conversationId": convId,
		"turnId":         turnId,
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

	turnId := generateTurnId()
	now := time.Now().UnixMilli()

	if c.db != nil {
		_ = c.db.CreateTurnJournal(db.TurnJournalEntry{
			Id:             turnId,
			SessionName:    sessionName,
			ConversationId: req.ConversationId,
			Prompt:         req.Prompt,
			Status:         "submitted",
			ToolCalls:      "[]",
			CreatedAt:      now,
			UpdatedAt:      now,
		})
	}

	initEvt := agy.StreamEvent{
		Event:        "turn_init",
		TurnId:       turnId,
		Conversation: req.ConversationId,
		Status:       "submitted",
	}
	if b, err := json.Marshal(initEvt); err == nil {
		_, _ = fmt.Fprintf(w, "data: %s\n\n", b)
		flusher.Flush()
	}

	cwd := terminal.GetCwd(sessionName, c.auth.cfg.DefaultWorkingDir)

	var (
		fullResponse    string
		toolCallsMap    = make(map[string]agy.ToolCallData)
		toolCallsOrder  []string
		finalConvId     = req.ConversationId
		totalTokens     int
		durationSeconds float64
		turnCompleted   bool
		turnStatus      = "submitted"
	)

	defer func() {
		if !turnCompleted && c.db != nil {
			var toolCallsList []agy.ToolCallData
			for _, id := range toolCallsOrder {
				if tc, exists := toolCallsMap[id]; exists {
					toolCallsList = append(toolCallsList, tc)
				}
			}
			tcBytes, _ := json.Marshal(toolCallsList)
			_ = c.db.UpdateTurnJournal(turnId, "interrupted", fullResponse, string(tcBytes), "Turn stream disconnected or interrupted", durationSeconds, totalTokens)
		}
	}()

	_, _, err := agy.RunPromptStream(
		r.Context(),
		sessionName,
		cwd,
		req.ConversationId,
		req.Prompt,
		func(event agy.StreamEvent) {
			event.TurnId = turnId

			if event.Conversation != "" {
				finalConvId = event.Conversation
			}
			if event.TokensTotal > 0 {
				totalTokens = event.TokensTotal
			}
			if event.DurationSec > 0 {
				durationSeconds = event.DurationSec
			}

			if turnStatus == "submitted" && (event.Event == "chunk" || event.Event == "tool" || event.Event == "thinking") {
				turnStatus = "running"
				if c.db != nil {
					_ = c.db.UpdateTurnJournal(turnId, "running", "", "", "", 0, 0)
				}
			}

			if event.Event == "chunk" && event.Delta != "" {
				fullResponse += event.Delta
			} else if event.Event == "tool" && event.ToolCall != nil {
				tc := *event.ToolCall
				if _, exists := toolCallsMap[tc.Id]; !exists {
					toolCallsOrder = append(toolCallsOrder, tc.Id)
				}
				toolCallsMap[tc.Id] = tc
			} else if event.Event == "done" {
				turnCompleted = true
				turnStatus = "completed"
				if event.FullResponse != "" {
					fullResponse = event.FullResponse
				}
				if c.db != nil {
					var toolCallsList []agy.ToolCallData
					for _, id := range toolCallsOrder {
						if tc, exists := toolCallsMap[id]; exists {
							toolCallsList = append(toolCallsList, tc)
						}
					}
					tcBytes, _ := json.Marshal(toolCallsList)
					_ = c.db.UpdateTurnJournal(turnId, "completed", fullResponse, string(tcBytes), "", durationSeconds, totalTokens)
				}
			} else if event.Event == "error" {
				turnCompleted = true
				turnStatus = "error"
				if c.db != nil {
					var toolCallsList []agy.ToolCallData
					for _, id := range toolCallsOrder {
						if tc, exists := toolCallsMap[id]; exists {
							toolCallsList = append(toolCallsList, tc)
						}
					}
					tcBytes, _ := json.Marshal(toolCallsList)
					_ = c.db.UpdateTurnJournal(turnId, "error", fullResponse, string(tcBytes), event.Error, durationSeconds, totalTokens)
				}
			}

			b, err := json.Marshal(event)
			if err == nil {
				_, _ = fmt.Fprintf(w, "data: %s\n\n", b)
				flusher.Flush()
			}
		},
	)

	if err != nil && !turnCompleted {
		turnCompleted = true
		errEvt := agy.StreamEvent{
			Event:        "error",
			TurnId:       turnId,
			Status:       "error",
			Error:        err.Error(),
			FullResponse: fmt.Sprintf("AGY execution error: %v", err),
			Conversation: finalConvId,
		}
		if c.db != nil {
			var toolCallsList []agy.ToolCallData
			for _, id := range toolCallsOrder {
				if tc, exists := toolCallsMap[id]; exists {
					toolCallsList = append(toolCallsList, tc)
				}
			}
			tcBytes, _ := json.Marshal(toolCallsList)
			_ = c.db.UpdateTurnJournal(turnId, "error", fullResponse, string(tcBytes), err.Error(), durationSeconds, totalTokens)
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
	if c.db != nil {
		_, _ = c.db.MarkInterruptedTurns(sessionName)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func (c *ChatHandler) GetSessionJournal(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := c.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	if c.db == nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "turns": []any{}})
		return
	}

	turns, err := c.db.GetSessionJournal(sessionName)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to get journal: %v"}`, err), http.StatusInternalServerError)
		return
	}
	if turns == nil {
		turns = []db.TurnJournalEntry{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":    true,
		"turns": turns,
	})
}

func (c *ChatHandler) RecoverSessionJournal(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := c.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	var count int64
	if c.db != nil {
		var err error
		count, err = c.db.MarkInterruptedTurns(sessionName)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"failed to recover turns: %v"}`, err), http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":        true,
		"recovered": count,
	})
}

