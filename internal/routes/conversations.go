package routes

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

type ConversationsHandler struct {
	auth *AuthHelper
}

func NewConversationsHandler(auth *AuthHelper) *ConversationsHandler {
	return &ConversationsHandler{auth: auth}
}

type ConversationSummary struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Preview   string `json:"preview"`
	UpdatedAt int64  `json:"updatedAt"` // Unix millis
	CreatedAt int64  `json:"createdAt"` // Unix millis
	TurnCount int    `json:"turnCount"`
}

type TranscriptRawItem struct {
	StepIndex int                  `json:"step_index"`
	Source    string               `json:"source"`
	Type      string               `json:"type"`
	Status    string               `json:"status"`
	CreatedAt string               `json:"created_at"`
	Content   string               `json:"content"`
	Thinking  string               `json:"thinking"`
	ToolCalls []TranscriptToolItem `json:"tool_calls"`
}

type TranscriptToolItem struct {
	Id     string         `json:"id"`
	Name   string         `json:"name"`
	Args   map[string]any `json:"args"`
	Output string         `json:"output"`
	Status string         `json:"status"`
}

type ChatMessageItem struct {
	ID         string               `json:"id"`
	Role       string               `json:"role"` // "user" | "assistant" | "system"
	Content    string               `json:"content"`
	Timestamp  int64                `json:"timestamp"`
	Thinking   string               `json:"thinking,omitempty"`
	ToolCalls  []TranscriptToolItem `json:"toolCalls,omitempty"`
	Status     string               `json:"status"`     // "done"
	TurnStatus string               `json:"turnStatus"` // "completed"
}

var (
	userReqRegex   = regexp.MustCompile(`(?s)<USER_REQUEST>\s*(.*?)\s*</USER_REQUEST>`)
	metaBlockRegex = regexp.MustCompile(`(?s)<(ADDITIONAL_METADATA|SKILL|SYSTEM_MESSAGE|system|context)[^>]*>.*?</(ADDITIONAL_METADATA|SKILL|SYSTEM_MESSAGE|system|context)>`)
	xmlTagRegex    = regexp.MustCompile(`<[^>]+>`)
	validConvIdReg = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
)

func getBrainDir() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return ""
	}
	return filepath.Join(home, ".gemini", "antigravity-cli", "brain")
}

func extractUserPrompt(raw string) string {
	raw = strings.TrimSpace(raw)
	if match := userReqRegex.FindStringSubmatch(raw); len(match) > 1 {
		raw = strings.TrimSpace(match[1])
	}
	// Strip metadata blocks that might be embedded
	raw = metaBlockRegex.ReplaceAllString(raw, "")

	lines := strings.Split(raw, "\n")
	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		if trimmed == "" {
			continue
		}
		clean := xmlTagRegex.ReplaceAllString(trimmed, "")
		clean = strings.TrimSpace(clean)
		if clean != "" {
			if len(clean) > 200 {
				clean = clean[:200] + "..."
			}
			return clean
		}
	}
	return raw
}

func (h *ConversationsHandler) ListConversations(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	brainDir := getBrainDir()
	if brainDir == "" {
		http.Error(w, `{"error":"Brain directory not available"}`, http.StatusInternalServerError)
		return
	}

	limit := 30
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			if l > 100 {
				limit = 100
			} else {
				limit = l
			}
		}
	}
	offset := 0
	if oStr := r.URL.Query().Get("offset"); oStr != "" {
		if o, err := strconv.Atoi(oStr); err == nil && o >= 0 {
			offset = o
		}
	}

	entries, err := os.ReadDir(brainDir)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "conversations": []any{}})
		return
	}

	type convCandidate struct {
		cid     string
		logFile string
		modTime time.Time
		size    int64
	}

	var candidates []convCandidate
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		cid := entry.Name()
		if !validConvIdReg.MatchString(cid) {
			continue
		}

		logFile := filepath.Join(brainDir, cid, ".system_generated", "logs", "transcript.jsonl")
		fi, err := os.Stat(logFile)
		if err != nil {
			continue
		}

		candidates = append(candidates, convCandidate{
			cid:     cid,
			logFile: logFile,
			modTime: fi.ModTime(),
			size:    fi.Size(),
		})
	}

	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].modTime.After(candidates[j].modTime)
	})

	if offset >= len(candidates) {
		candidates = nil
	} else {
		candidates = candidates[offset:]
		if limit < len(candidates) {
			candidates = candidates[:limit]
		}
	}

	results := make([]ConversationSummary, 0, len(candidates))

	for _, cand := range candidates {
		updatedAt := cand.modTime.UnixMilli()
		createdAt := updatedAt
		firstPrompt := ""
		lastResponse := ""
		turnCount := 0

		file, err := os.Open(cand.logFile)
		if err == nil {
			if cand.size <= 32*1024 {
				scanner := bufio.NewScanner(file)
				buf := make([]byte, 64*1024)
				scanner.Buffer(buf, 1024*1024)

				isFirstLine := true
				for scanner.Scan() {
					line := strings.TrimSpace(scanner.Text())
					if line == "" {
						continue
					}

					var raw TranscriptRawItem
					if err := json.Unmarshal([]byte(line), &raw); err != nil {
						continue
					}

					if isFirstLine && raw.CreatedAt != "" {
						if t, err := time.Parse(time.RFC3339, raw.CreatedAt); err == nil {
							createdAt = t.UnixMilli()
						}
						isFirstLine = false
					}

					if raw.Type == "USER_INPUT" {
						turnCount++
						if firstPrompt == "" {
							firstPrompt = extractUserPrompt(raw.Content)
						}
					} else if raw.Type == "PLANNER_RESPONSE" {
						if raw.Content != "" {
							preview := strings.TrimSpace(raw.Content)
							if len(preview) > 160 {
								preview = preview[:160] + "..."
							}
							lastResponse = preview
						}
					}
				}
			} else {
				// Large log file: bounded head read (up to 50 lines)
				scanner := bufio.NewScanner(file)
				buf := make([]byte, 64*1024)
				scanner.Buffer(buf, 1024*1024)

				isFirstLine := true
				lineCount := 0
				for scanner.Scan() && lineCount < 50 {
					lineCount++
					line := strings.TrimSpace(scanner.Text())
					if line == "" {
						continue
					}

					var raw TranscriptRawItem
					if err := json.Unmarshal([]byte(line), &raw); err != nil {
						continue
					}

					if isFirstLine && raw.CreatedAt != "" {
						if t, err := time.Parse(time.RFC3339, raw.CreatedAt); err == nil {
							createdAt = t.UnixMilli()
						}
						isFirstLine = false
					}

					if raw.Type == "USER_INPUT" {
						turnCount++
						if firstPrompt == "" {
							firstPrompt = extractUserPrompt(raw.Content)
						}
					}
				}

				// Read tail block (last 8KB) to extract lastResponse preview without reading middle turns
				tailOffset := cand.size - 8192
				if tailOffset < 0 {
					tailOffset = 0
				}
				tailBuf := make([]byte, 8192)
				n, err := file.ReadAt(tailBuf, tailOffset)
				if err == nil || err == io.EOF {
					tailLines := strings.Split(string(tailBuf[:n]), "\n")
					for i := len(tailLines) - 1; i >= 0; i-- {
						tLine := strings.TrimSpace(tailLines[i])
						if tLine == "" {
							continue
						}
						var raw TranscriptRawItem
						if err := json.Unmarshal([]byte(tLine), &raw); err == nil {
							if raw.Type == "PLANNER_RESPONSE" && raw.Content != "" {
								preview := strings.TrimSpace(raw.Content)
								if len(preview) > 160 {
									preview = preview[:160] + "..."
								}
								lastResponse = preview
								break
							}
						}
					}
				}
			}
			_ = file.Close()
		}

		if firstPrompt == "" {
			firstPrompt = "Conversation " + cand.cid[:min(8, len(cand.cid))]
		}

		results = append(results, ConversationSummary{
			ID:        cand.cid,
			Title:     firstPrompt,
			Preview:   lastResponse,
			UpdatedAt: updatedAt,
			CreatedAt: createdAt,
			TurnCount: turnCount,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":            true,
		"conversations": results,
	})
}

func (h *ConversationsHandler) GetConversationMessages(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	cid := r.PathValue("id")
	if cid == "" || !validConvIdReg.MatchString(cid) {
		http.Error(w, `{"error":"Invalid conversation id"}`, http.StatusBadRequest)
		return
	}

	brainDir := getBrainDir()
	logFile := filepath.Join(brainDir, cid, ".system_generated", "logs", "transcript.jsonl")

	file, err := os.Open(logFile)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Conversation not found: %v"}`, err), http.StatusNotFound)
		return
	}
	defer file.Close()

	var (
		messages         []ChatMessageItem
		currentAssistant *ChatMessageItem
	)

	scanner := bufio.NewScanner(file)
	buf := make([]byte, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var raw TranscriptRawItem
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			continue
		}

		var timestamp int64 = time.Now().UnixMilli()
		if raw.CreatedAt != "" {
			if t, err := time.Parse(time.RFC3339, raw.CreatedAt); err == nil {
				timestamp = t.UnixMilli()
			}
		}

		if raw.Type == "USER_INPUT" {
			if currentAssistant != nil {
				messages = append(messages, *currentAssistant)
				currentAssistant = nil
			}

			userContent := extractUserPrompt(raw.Content)
			messages = append(messages, ChatMessageItem{
				ID:         fmt.Sprintf("user-%d", raw.StepIndex),
				Role:       "user",
				Content:    userContent,
				Timestamp:  timestamp,
				Status:     "done",
				TurnStatus: "completed",
			})
		} else if raw.Type == "PLANNER_RESPONSE" {
			if currentAssistant == nil {
				currentAssistant = &ChatMessageItem{
					ID:         fmt.Sprintf("assistant-%d", raw.StepIndex),
					Role:       "assistant",
					Content:    "",
					Thinking:   "",
					ToolCalls:  []TranscriptToolItem{},
					Status:     "done",
					TurnStatus: "completed",
					Timestamp:  timestamp,
				}
			}

			if raw.Content != "" {
				currentAssistant.Content = raw.Content
			}
			if raw.Thinking != "" {
				currentAssistant.Thinking = raw.Thinking
			}
			if len(raw.ToolCalls) > 0 {
				for _, tc := range raw.ToolCalls {
					toolName := tc.Name
					if toolName == "" {
						toolName = "tool"
					}
					status := tc.Status
					if status == "" {
						status = "success"
					}
					currentAssistant.ToolCalls = append(currentAssistant.ToolCalls, TranscriptToolItem{
						Id:     tc.Id,
						Name:   toolName,
						Args:   tc.Args,
						Output: tc.Output,
						Status: status,
					})
				}
			}
			currentAssistant.Timestamp = timestamp
		}
	}

	if currentAssistant != nil {
		messages = append(messages, *currentAssistant)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":             true,
		"conversationId": cid,
		"messages":       messages,
	})
}

func (h *ConversationsHandler) DeleteConversation(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	cid := r.PathValue("id")
	if cid == "" || !validConvIdReg.MatchString(cid) {
		http.Error(w, `{"error":"Invalid conversation id"}`, http.StatusBadRequest)
		return
	}

	brainDir := getBrainDir()
	convDir := filepath.Join(brainDir, cid)

	if fi, err := os.Stat(convDir); err != nil || !fi.IsDir() {
		http.Error(w, `{"error":"Conversation not found"}`, http.StatusNotFound)
		return
	}

	if err := os.RemoveAll(convDir); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Failed to delete conversation: %v"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "deleted": cid})
}
