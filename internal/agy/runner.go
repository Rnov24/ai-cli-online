package agy

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"sync"
)

type StreamEvent struct {
	Event        string          `json:"event"`
	StepIndex    int             `json:"step_index,omitempty"`
	Delta        string          `json:"delta,omitempty"`
	Thinking     string          `json:"thinking,omitempty"`
	ToolCall     *ToolCallData   `json:"tool_call,omitempty"`
	Status       string          `json:"status,omitempty"`
	Conversation string          `json:"conversation_id,omitempty"`
	FullResponse string          `json:"full_response,omitempty"`
	DurationSec  float64         `json:"duration_seconds,omitempty"`
	TokensTotal  int             `json:"tokens_total,omitempty"`
	Init         *InitData       `json:"init,omitempty"`
}

type InitData struct {
	Cwd   string   `json:"cwd"`
	Tools []string `json:"tools"`
}

type ToolCallData struct {
	Id       string         `json:"id"`
	Name     string         `json:"name"`
	Args     map[string]any `json:"args,omitempty"`
	Output   string         `json:"output,omitempty"`
	Status   string         `json:"status"` // "running" | "success" | "error"
	Duration float64        `json:"duration,omitempty"`
}

type ActiveRunner struct {
	cmd    *exec.Cmd
	cancel context.CancelFunc
}

var (
	activeMu      sync.Mutex
	activeRunners = make(map[string]*ActiveRunner)
)

func StopSession(sessionId string) {
	activeMu.Lock()
	defer activeMu.Unlock()
	if runner, ok := activeRunners[sessionId]; ok {
		if runner.cancel != nil {
			runner.cancel()
		}
		if runner.cmd != nil && runner.cmd.Process != nil {
			_ = runner.cmd.Process.Kill()
		}
		delete(activeRunners, sessionId)
	}
}

func RunPromptStream(
	ctx context.Context,
	sessionId string,
	workingDir string,
	conversationId string,
	prompt string,
	onEvent func(event StreamEvent),
) (string, string, error) {
	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	args := []string{
		"-p", prompt,
		"--output-format", "stream-json",
		"--dangerously-skip-permissions",
	}

	if conversationId != "" {
		args = append(args, "--conversation", conversationId)
	} else {
		args = append(args, "-c")
	}

	cmd := exec.CommandContext(runCtx, "agy", args...)
	if workingDir != "" {
		cmd.Dir = workingDir
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", "", fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return "", "", fmt.Errorf("failed to start agy: %w", err)
	}

	activeMu.Lock()
	activeRunners[sessionId] = &ActiveRunner{cmd: cmd, cancel: cancel}
	activeMu.Unlock()

	defer func() {
		activeMu.Lock()
		delete(activeRunners, sessionId)
		activeMu.Unlock()
	}()

	scanner := bufio.NewScanner(stdout)
	buf := make([]byte, 64*1024)
	scanner.Buffer(buf, 10*1024*1024)

	var fullResponse string
	var finalConvId string
	var totalTokens int
	var durationSec float64

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var raw map[string]json.RawMessage
		if err := json.Unmarshal(line, &raw); err != nil {
			continue
		}

		var evtType string
		if e, ok := raw["event"]; ok {
			_ = json.Unmarshal(e, &evtType)
		}

		if cId, ok := raw["conversation_id"]; ok {
			_ = json.Unmarshal(cId, &finalConvId)
		}

		switch evtType {
		case "init":
			var initObj struct {
				ConversationId string   `json:"conversation_id"`
				Init           InitData `json:"init"`
			}
			_ = json.Unmarshal(line, &initObj)
			if initObj.ConversationId != "" {
				finalConvId = initObj.ConversationId
			}
			onEvent(StreamEvent{
				Event:        "init",
				Conversation: finalConvId,
				Init:         &initObj.Init,
			})

		case "step_update":
			var stepObj struct {
				StepUpdate struct {
					ConversationId  string  `json:"conversation_id"`
					StepIndex       int     `json:"step_index"`
					State           string  `json:"state"`
					StepType        string  `json:"step_type"`
					TextDelta       string  `json:"text_delta,omitempty"`
					ToolName        string  `json:"tool_name,omitempty"`
					DurationSeconds float64 `json:"duration_seconds,omitempty"`
					ToolInfo        struct {
						Name       string         `json:"name"`
						Parameters map[string]any `json:"parameters"`
						Output     string         `json:"output"`
					} `json:"tool_info"`
					Usage struct {
						TotalTokens    int `json:"total_tokens"`
						ThinkingTokens int `json:"thinking_tokens"`
					} `json:"usage"`
				} `json:"step_update"`
			}
			_ = json.Unmarshal(line, &stepObj)

			su := stepObj.StepUpdate
			if su.ConversationId != "" {
				finalConvId = su.ConversationId
			}

			if su.StepType == "tool" {
				toolStatus := "running"
				if su.State == "DONE" {
					toolStatus = "success"
				}
				onEvent(StreamEvent{
					Event:        "tool",
					StepIndex:    su.StepIndex,
					Conversation: finalConvId,
					ToolCall: &ToolCallData{
						Id:       fmt.Sprintf("tool_%d", su.StepIndex),
						Name:     su.ToolName,
						Args:     su.ToolInfo.Parameters,
						Output:   su.ToolInfo.Output,
						Status:   toolStatus,
						Duration: su.DurationSeconds,
					},
				})
			} else if su.StepType == "agent_response" {
				if su.TextDelta != "" {
					fullResponse += su.TextDelta
					onEvent(StreamEvent{
						Event:        "chunk",
						StepIndex:    su.StepIndex,
						Delta:        su.TextDelta,
						Conversation: finalConvId,
					})
				}
			}

			if su.Usage.TotalTokens > 0 {
				totalTokens = su.Usage.TotalTokens
			}

		case "result":
			var resObj struct {
				Result struct {
					Status          string  `json:"status"`
					Response        string  `json:"response"`
					DurationSeconds float64 `json:"duration_seconds"`
					Usage           struct {
						TotalTokens int `json:"total_tokens"`
					} `json:"usage"`
				} `json:"result"`
			}
			_ = json.Unmarshal(line, &resObj)
			if resObj.Result.Response != "" {
				fullResponse = resObj.Result.Response
			}
			if resObj.Result.DurationSeconds > 0 {
				durationSec = resObj.Result.DurationSeconds
			}
			if resObj.Result.Usage.TotalTokens > 0 {
				totalTokens = resObj.Result.Usage.TotalTokens
			}

			onEvent(StreamEvent{
				Event:        "done",
				Status:       resObj.Result.Status,
				FullResponse: fullResponse,
				Conversation: finalConvId,
				DurationSec:  durationSec,
				TokensTotal:  totalTokens,
			})
		}
	}

	_ = cmd.Wait()

	if fullResponse == "" {
		fullResponse = "Completed."
	}

	return fullResponse, finalConvId, nil
}
