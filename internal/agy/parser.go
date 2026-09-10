package agy

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

type ParseResult struct {
	FullResponse   string
	ConversationId string
	TotalTokens    int
	DurationSec    float64
}

// ParseStream reads line-delimited JSON stream from an io.Reader, parses AGY CLI events,
// invokes onEvent for each typed event, and returns aggregated result metrics.
func ParseStream(r io.Reader, onEvent func(StreamEvent)) (ParseResult, error) {
	scanner := bufio.NewScanner(r)
	buf := make([]byte, 64*1024)
	scanner.Buffer(buf, 10*1024*1024)

	var res ParseResult

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
			_ = json.Unmarshal(cId, &res.ConversationId)
		}

		switch evtType {
		case "init":
			var initObj struct {
				ConversationId string   `json:"conversation_id"`
				Init           InitData `json:"init"`
			}
			_ = json.Unmarshal(line, &initObj)
			if initObj.ConversationId != "" {
				res.ConversationId = initObj.ConversationId
			}
			if onEvent != nil {
				onEvent(StreamEvent{
					Event:        "init",
					Conversation: res.ConversationId,
					Init:         &initObj.Init,
				})
			}

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
				res.ConversationId = su.ConversationId
			}

			if su.StepType == "tool" || su.StepType == "tool_result" || su.StepType == "tool_output" {
				toolName := strings.TrimSpace(su.ToolName)
				if toolName == "" {
					toolName = strings.TrimSpace(su.ToolInfo.Name)
				}
				if toolName == "" {
					toolName = "tool"
				}

				toolStatus := "running"
				if su.StepType == "tool_result" || su.StepType == "tool_output" {
					toolStatus = "success"
					if su.State == "ERROR" || su.State == "FAILED" {
						toolStatus = "error"
					}
				} else {
					if su.State == "DONE" || su.State == "COMPLETED" || su.State == "SUCCESS" {
						toolStatus = "success"
					} else if su.State == "ERROR" || su.State == "FAILED" {
						toolStatus = "error"
					}
				}

				args := su.ToolInfo.Parameters
				if args == nil {
					args = make(map[string]any)
				}

				if onEvent != nil {
					onEvent(StreamEvent{
						Event:        "tool",
						StepIndex:    su.StepIndex,
						Conversation: res.ConversationId,
						ToolCall: &ToolCallData{
							Id:       fmt.Sprintf("tool_%d", su.StepIndex),
							Name:     toolName,
							Args:     args,
							Output:   su.ToolInfo.Output,
							Status:   toolStatus,
							Duration: su.DurationSeconds,
						},
					})
				}
			} else if su.StepType == "agent_response" {
				if su.TextDelta != "" {
					res.FullResponse += su.TextDelta
					if onEvent != nil {
						onEvent(StreamEvent{
							Event:        "chunk",
							StepIndex:    su.StepIndex,
							Delta:        su.TextDelta,
							Conversation: res.ConversationId,
						})
					}
				}
			}

			if su.Usage.TotalTokens > 0 {
				res.TotalTokens = su.Usage.TotalTokens
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
				res.FullResponse = resObj.Result.Response
			}
			if resObj.Result.DurationSeconds > 0 {
				res.DurationSec = resObj.Result.DurationSeconds
			}
			if resObj.Result.Usage.TotalTokens > 0 {
				res.TotalTokens = resObj.Result.Usage.TotalTokens
			}

			if onEvent != nil {
				onEvent(StreamEvent{
					Event:        "done",
					Status:       resObj.Result.Status,
					FullResponse: res.FullResponse,
					Conversation: res.ConversationId,
					DurationSec:  res.DurationSec,
					TokensTotal:  res.TotalTokens,
				})
			}
		}
	}

	return res, scanner.Err()
}
