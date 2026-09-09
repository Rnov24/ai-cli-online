package routes

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

type SubagentItem struct {
	ID          string `json:"id"`
	ParentID    string `json:"parentId"`
	Role        string `json:"role"`
	TypeName    string `json:"typeName"`
	Model       string `json:"model"`
	Prompt      string `json:"prompt"`
	Status      string `json:"status"` // "running", "done", "error"
	CreatedAt   int64  `json:"createdAt"`
	UpdatedAt   int64  `json:"updatedAt"`
	LogUri      string `json:"logUri"`
	WorktreeUri string `json:"worktreeUri,omitempty"`
	ToolCount   int    `json:"toolCount"`
	Report      string `json:"report,omitempty"`
}

type SubagentsResponse struct {
	Ok        bool           `json:"ok"`
	Subagents []SubagentItem `json:"subagents"`
	Count     int            `json:"count"`
}

type SubagentDetailResponse struct {
	Ok          bool              `json:"ok"`
	Subagent    SubagentItem      `json:"subagent"`
	ID          string            `json:"id"`
	ParentID    string            `json:"parentId"`
	Role        string            `json:"role"`
	TypeName    string            `json:"typeName"`
	Model       string            `json:"model"`
	Prompt      string            `json:"prompt"`
	Status      string            `json:"status"`
	CreatedAt   int64             `json:"createdAt"`
	UpdatedAt   int64             `json:"updatedAt"`
	LogUri      string            `json:"logUri"`
	WorktreeUri string            `json:"worktreeUri,omitempty"`
	ToolCount   int               `json:"toolCount"`
	Report      string            `json:"report,omitempty"`
	Messages    []ChatMessageItem `json:"messages,omitempty"`
}

type SubagentsHandler struct {
	auth     *AuthHelper
	brainDir string
}

func NewSubagentsHandler(auth *AuthHelper) *SubagentsHandler {
	return &SubagentsHandler{auth: auth}
}

func NewSubagentsHandlerWithDir(auth *AuthHelper, brainDir string) *SubagentsHandler {
	return &SubagentsHandler{auth: auth, brainDir: brainDir}
}

func (h *SubagentsHandler) resolveBrainDir() string {
	if h.brainDir != "" {
		return h.brainDir
	}
	return getBrainDir()
}

var (
	subagentConvIdRegex = regexp.MustCompile(`\\?"(?:conversationId|conversation_id)\\?"\s*:\s*\\?"([a-zA-Z0-9_-]+)\\?"`)
	subagentLogUriRegex = regexp.MustCompile(`\\?"(?:logAbsoluteUri|logUri)\\?"\s*:\s*\\?"([^"\\]+)\\?"`)
	subagentWorktreeReg = regexp.MustCompile(`\\?"(?:workspaceUris|worktreeUri)\\?"\s*:\s*(?:\[\s*\\?"([^"\\]+)\\?"|\\?"([^"\\]+)\\?")`)
	parentReminderRegex = regexp.MustCompile(`\(name:\s*"parent",\s*id:\s*"([a-zA-Z0-9_-]+)"\)`)
	statusCompleteRegex = regexp.MustCompile(`(?s)(STATUS:\s*COMPLETE.*)`)
	statusStoppedRegex  = regexp.MustCompile(`(?s)(STATUS:\s*STOPPED.*)`)
)

type subagentRawSpec struct {
	Role      string `json:"Role"`
	TypeName  string `json:"TypeName"`
	Model     string `json:"Model"`
	Prompt    string `json:"Prompt"`
	Workspace string `json:"Workspace"`
}

func parseSubagentSpecs(rawSubagents any) []subagentRawSpec {
	if rawSubagents == nil {
		return nil
	}

	var specs []subagentRawSpec
	switch v := rawSubagents.(type) {
	case string:
		str := strings.TrimSpace(v)
		if strings.HasPrefix(str, "[") {
			_ = json.Unmarshal([]byte(str), &specs)
		} else if strings.HasPrefix(str, "{") {
			var single subagentRawSpec
			if err := json.Unmarshal([]byte(str), &single); err == nil {
				specs = append(specs, single)
			}
		}
	case []any:
		b, err := json.Marshal(v)
		if err == nil {
			_ = json.Unmarshal(b, &specs)
		}
	case map[string]any:
		b, err := json.Marshal(v)
		if err == nil {
			var single subagentRawSpec
			if err := json.Unmarshal(b, &single); err == nil {
				specs = append(specs, single)
			}
		}
	}
	return specs
}

func (h *SubagentsHandler) collectAllSubagents() ([]SubagentItem, error) {
	brainDir := h.resolveBrainDir()
	if brainDir == "" {
		return nil, fmt.Errorf("brain directory not available")
	}

	entries, err := os.ReadDir(brainDir)
	if err != nil {
		return []SubagentItem{}, nil
	}

	subagentMap := make(map[string]*SubagentItem)

	// Phase 1: Scan parent transcript files to find invoke_subagent calls
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		parentId := entry.Name()
		if !validConvIdReg.MatchString(parentId) {
			continue
		}

		parentLogFile := filepath.Join(brainDir, parentId, ".system_generated", "logs", "transcript.jsonl")
		file, err := os.Open(parentLogFile)
		if err != nil {
			continue
		}

		type pendingInvoke struct {
			spec      subagentRawSpec
			stepIndex int
		}
		var pending []pendingInvoke

		scanner := bufio.NewScanner(file)
		buf := make([]byte, 64*1024)
		scanner.Buffer(buf, 1024*1024)

		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}

			// If line mentions invoke_subagent, extract specs
			if strings.Contains(line, "invoke_subagent") {
				var step TranscriptRawItem
				if err := json.Unmarshal([]byte(line), &step); err == nil {
					for _, tc := range step.ToolCalls {
						if tc.Name == "invoke_subagent" {
							specs := parseSubagentSpecs(tc.Args["Subagents"])
							if len(specs) == 0 {
								// Fallback default spec if empty
								specs = append(specs, subagentRawSpec{
									Role:     "Subagent",
									TypeName: "self",
									Model:    "inherit",
								})
							}

							// Check if tool output already contains conversationId
							if tc.Output != "" {
								if m := subagentConvIdRegex.FindStringSubmatch(tc.Output); len(m) > 1 {
									subId := m[1]
									logUri := ""
									if lm := subagentLogUriRegex.FindStringSubmatch(tc.Output); len(lm) > 1 {
										logUri = lm[1]
									}
									worktreeUri := ""
									if wm := subagentWorktreeReg.FindStringSubmatch(tc.Output); len(wm) > 1 {
										if wm[1] != "" {
											worktreeUri = wm[1]
										} else if len(wm) > 2 {
											worktreeUri = wm[2]
										}
									}

									spec := specs[0]
									subagentMap[subId] = &SubagentItem{
										ID:          subId,
										ParentID:    parentId,
										Role:        spec.Role,
										TypeName:    spec.TypeName,
										Model:       spec.Model,
										Prompt:      spec.Prompt,
										Status:      "running",
										LogUri:      logUri,
										WorktreeUri: worktreeUri,
									}
									continue
								}
							}

							for _, spec := range specs {
								pending = append(pending, pendingInvoke{
									spec:      spec,
									stepIndex: step.StepIndex,
								})
							}
						}
					}
				}
			} else if len(pending) > 0 && strings.Contains(line, "conversationId") {
				// Match pending invokes with tool result output
				matches := subagentConvIdRegex.FindAllStringSubmatch(line, -1)
				logMatches := subagentLogUriRegex.FindAllStringSubmatch(line, -1)
				worktreeMatches := subagentWorktreeReg.FindAllStringSubmatch(line, -1)

				for i, m := range matches {
					if len(pending) == 0 {
						break
					}
					inv := pending[0]
					pending = pending[1:]

					subId := m[1]
					logUri := ""
					if i < len(logMatches) && len(logMatches[i]) > 1 {
						logUri = logMatches[i][1]
					}
					worktreeUri := ""
					if i < len(worktreeMatches) && len(worktreeMatches[i]) > 1 {
						if worktreeMatches[i][1] != "" {
							worktreeUri = worktreeMatches[i][1]
						} else if len(worktreeMatches[i]) > 2 {
							worktreeUri = worktreeMatches[i][2]
						}
					}

					subagentMap[subId] = &SubagentItem{
						ID:          subId,
						ParentID:    parentId,
						Role:        inv.spec.Role,
						TypeName:    inv.spec.TypeName,
						Model:       inv.spec.Model,
						Prompt:      inv.spec.Prompt,
						Status:      "running",
						LogUri:      logUri,
						WorktreeUri: worktreeUri,
					}
				}
			}
		}
		_ = file.Close()
	}

	// Phase 2: Inspect child conversation directories and enrich/discover subagents
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		cid := entry.Name()
		if !validConvIdReg.MatchString(cid) {
			continue
		}

		childLogFile := filepath.Join(brainDir, cid, ".system_generated", "logs", "transcript.jsonl")
		fi, err := os.Stat(childLogFile)
		if err != nil {
			continue
		}

		file, err := os.Open(childLogFile)
		if err != nil {
			continue
		}

		scanner := bufio.NewScanner(file)
		buf := make([]byte, 64*1024)
		scanner.Buffer(buf, 1024*1024)

		isFirstLine := true
		createdAt := fi.ModTime().UnixMilli()
		updatedAt := fi.ModTime().UnixMilli()
		toolCount := 0
		status := "running"
		report := ""
		prompt := ""
		parentId := ""

		var lastContent string
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}

			var step TranscriptRawItem
			if err := json.Unmarshal([]byte(line), &step); err != nil {
				continue
			}

			if isFirstLine {
				if step.CreatedAt != "" {
					if t, err := time.Parse(time.RFC3339, step.CreatedAt); err == nil {
						createdAt = t.UnixMilli()
					}
				}
				if step.Content != "" {
					prompt = extractUserPrompt(step.Content)
					if m := parentReminderRegex.FindStringSubmatch(step.Content); len(m) > 1 {
						parentId = m[1]
					}
				}
				isFirstLine = false
			}

			if step.CreatedAt != "" {
				if t, err := time.Parse(time.RFC3339, step.CreatedAt); err == nil {
					updatedAt = t.UnixMilli()
				}
			}

			if len(step.ToolCalls) > 0 {
				toolCount += len(step.ToolCalls)
				for _, tc := range step.ToolCalls {
					if tc.Name == "send_message" {
						msgStr, _ := tc.Args["Message"].(string)
						if msgStr != "" {
							lastContent = msgStr
						}
					}
				}
			}

			if step.Type == "PLANNER_RESPONSE" && step.Content != "" {
				lastContent = step.Content
			}

			if step.Status == "ERROR" {
				status = "error"
			}
		}
		_ = file.Close()

		if lastContent != "" {
			if m := statusCompleteRegex.FindStringSubmatch(lastContent); len(m) > 1 {
				status = "done"
				report = strings.TrimSpace(m[1])
			} else if m := statusStoppedRegex.FindStringSubmatch(lastContent); len(m) > 1 {
				status = "error"
				report = strings.TrimSpace(m[1])
			} else if strings.Contains(lastContent, "STATUS: COMPLETE") {
				status = "done"
				report = strings.TrimSpace(lastContent)
			}
		}

		item, exists := subagentMap[cid]
		if exists {
			item.CreatedAt = createdAt
			item.UpdatedAt = updatedAt
			item.ToolCount = toolCount
			if status != "running" || item.Status == "running" {
				item.Status = status
			}
			if report != "" {
				item.Report = report
			}
			if item.Prompt == "" && prompt != "" {
				item.Prompt = prompt
			}
			if item.LogUri == "" {
				item.LogUri = childLogFile
			}
		} else if parentId != "" {
			// Subagent discovered from child transcript with parent link
			subagentMap[cid] = &SubagentItem{
				ID:        cid,
				ParentID:  parentId,
				Role:      "Subagent",
				TypeName:  "self",
				Model:     "inherit",
				Prompt:    prompt,
				Status:    status,
				CreatedAt: createdAt,
				UpdatedAt: updatedAt,
				LogUri:    childLogFile,
				ToolCount: toolCount,
				Report:    report,
			}
		}
	}

	results := make([]SubagentItem, 0, len(subagentMap))
	for _, item := range subagentMap {
		if item.Role == "" {
			item.Role = "Subagent"
		}
		if item.TypeName == "" {
			item.TypeName = "self"
		}
		if item.Model == "" {
			item.Model = "inherit"
		}
		if item.Status == "" {
			item.Status = "running"
		}
		if item.LogUri == "" {
			item.LogUri = filepath.Join(brainDir, item.ID, ".system_generated", "logs", "transcript.jsonl")
		}
		results = append(results, *item)
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].UpdatedAt > results[j].UpdatedAt
	})

	return results, nil
}

func (h *SubagentsHandler) ListSubagents(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	all, err := h.collectAllSubagents()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Failed to collect subagents: %v"}`, err), http.StatusInternalServerError)
		return
	}

	parentFilter := r.URL.Query().Get("parent")
	statusFilter := r.URL.Query().Get("status")
	queryFilter := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))

	var filtered []SubagentItem
	for _, item := range all {
		if parentFilter != "" && item.ParentID != parentFilter {
			continue
		}
		if statusFilter != "" && statusFilter != "all" && !strings.EqualFold(item.Status, statusFilter) {
			continue
		}
		if queryFilter != "" {
			match := strings.Contains(strings.ToLower(item.Role), queryFilter) ||
				strings.Contains(strings.ToLower(item.Prompt), queryFilter) ||
				strings.Contains(strings.ToLower(item.ID), queryFilter) ||
				strings.Contains(strings.ToLower(item.TypeName), queryFilter)
			if !match {
				continue
			}
		}
		filtered = append(filtered, item)
	}

	if filtered == nil {
		filtered = []SubagentItem{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(SubagentsResponse{
		Ok:        true,
		Subagents: filtered,
		Count:     len(filtered),
	})
}

func (h *SubagentsHandler) GetSubagent(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id := r.PathValue("id")
	if id == "" || !validConvIdReg.MatchString(id) {
		http.Error(w, `{"error":"Invalid subagent id"}`, http.StatusBadRequest)
		return
	}

	all, err := h.collectAllSubagents()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Failed to collect subagents: %v"}`, err), http.StatusInternalServerError)
		return
	}

	var found *SubagentItem
	for i := range all {
		if all[i].ID == id {
			found = &all[i]
			break
		}
	}

	if found == nil {
		http.Error(w, `{"error":"Subagent not found"}`, http.StatusNotFound)
		return
	}

	// Read recent child transcript messages if available
	var messages []ChatMessageItem
	brainDir := h.resolveBrainDir()
	childLogFile := filepath.Join(brainDir, id, ".system_generated", "logs", "transcript.jsonl")
	if file, err := os.Open(childLogFile); err == nil {
		scanner := bufio.NewScanner(file)
		buf := make([]byte, 64*1024)
		scanner.Buffer(buf, 1024*1024)

		var currentAssistant *ChatMessageItem
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			var step TranscriptRawItem
			if err := json.Unmarshal([]byte(line), &step); err != nil {
				continue
			}

			ts := time.Now().UnixMilli()
			if step.CreatedAt != "" {
				if t, err := time.Parse(time.RFC3339, step.CreatedAt); err == nil {
					ts = t.UnixMilli()
				}
			}

			if step.Type == "USER_INPUT" {
				if currentAssistant != nil {
					messages = append(messages, *currentAssistant)
					currentAssistant = nil
				}
				promptText := extractUserPrompt(step.Content)
				messages = append(messages, ChatMessageItem{
					ID:         fmt.Sprintf("step-%d", step.StepIndex),
					Role:       "user",
					Content:    promptText,
					Timestamp:  ts,
					Status:     "done",
					TurnStatus: "completed",
				})
			} else if step.Type == "PLANNER_RESPONSE" {
				if currentAssistant == nil {
					currentAssistant = &ChatMessageItem{
						ID:         fmt.Sprintf("step-%d", step.StepIndex),
						Role:       "assistant",
						Content:    step.Content,
						Thinking:   step.Thinking,
						ToolCalls:  step.ToolCalls,
						Timestamp:  ts,
						Status:     "done",
						TurnStatus: "completed",
					}
				} else {
					if step.Content != "" {
						currentAssistant.Content = step.Content
					}
					if step.Thinking != "" {
						currentAssistant.Thinking = step.Thinking
					}
					if len(step.ToolCalls) > 0 {
						currentAssistant.ToolCalls = append(currentAssistant.ToolCalls, step.ToolCalls...)
					}
				}
			}
		}
		if currentAssistant != nil {
			messages = append(messages, *currentAssistant)
		}
		_ = file.Close()
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(SubagentDetailResponse{
		Ok:          true,
		Subagent:    *found,
		ID:          found.ID,
		ParentID:    found.ParentID,
		Role:        found.Role,
		TypeName:    found.TypeName,
		Model:       found.Model,
		Prompt:      found.Prompt,
		Status:      found.Status,
		CreatedAt:   found.CreatedAt,
		UpdatedAt:   found.UpdatedAt,
		LogUri:      found.LogUri,
		WorktreeUri: found.WorktreeUri,
		ToolCount:   found.ToolCount,
		Report:      found.Report,
		Messages:    messages,
	})
}
