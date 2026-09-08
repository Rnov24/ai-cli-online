package terminal

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

var validIdRe = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,32}$`)

func TokenToSessionName(token string) string {
	h := sha256.Sum256([]byte(token))
	return fmt.Sprintf("ai-cli-online-%s", hex.EncodeToString(h[:])[:8])
}

func IsValidSessionId(id string) bool {
	return validIdRe.MatchString(id)
}

func BuildSessionName(token, sessionId string) string {
	base := TokenToSessionName(token)
	if sessionId != "" {
		return fmt.Sprintf("%s-%s", base, sessionId)
	}
	return base
}

// Open initializes or reattaches to a TerminalSession behind the seam.
// If tmux is available, it orchestrates tmux session creation or reattachment, returns the attached PTY session,
// and sets resumed to true if the session previously existed.
// If tmux is unavailable, it spawns a direct shell PTY session.
func Open(sessionName, cwd string, cols, rows int, startCmd string) (Session, bool, error) {
	if IsTmuxAvailable() {
		resumed := HasSession(sessionName)
		if !resumed {
			if err := CreateSession(sessionName, cols, rows, cwd, startCmd); err != nil {
				return nil, false, fmt.Errorf("failed to create tmux session: %w", err)
			}
		} else {
			ResizeSession(sessionName, cols, rows)
			ConfigureSession(sessionName)
		}

		sess, err := attachTmux(sessionName, cols, rows)
		if err != nil {
			return nil, false, fmt.Errorf("failed to attach to tmux session: %w", err)
		}
		return sess, resumed, nil
	}

	// Fallback to direct shell session
	sess, err := startDirect(sessionName, cwd, cols, rows, startCmd)
	if err != nil {
		return nil, false, fmt.Errorf("failed to start direct pty session: %w", err)
	}
	return sess, false, nil
}

// List returns a decorated list of active and persistent sessions matching the token.
func List(token string, activeNames map[string]bool, defaultCwd string) ([]SessionInfo, error) {
	if IsTmuxAvailable() {
		sessions, err := ListTmuxSessions(token)
		if err != nil {
			return nil, err
		}
		for i := range sessions {
			sessions[i].Connected = activeNames[sessions[i].SessionName]
			if sessions[i].Cwd == "" {
				sessions[i].Cwd = GetTmuxCwd(sessions[i].SessionName, defaultCwd)
			}
			if sessions[i].Command == "" {
				sessions[i].Command = GetTmuxPaneCommand(sessions[i].SessionName)
			}
		}
		return sessions, nil
	}

	// Tmux unavailable: synthesize from active names & direct registry
	prefix := ""
	if token != "" {
		prefix = TokenToSessionName(token) + "-"
	}

	sessions := make([]SessionInfo, 0, len(activeNames))
	for sName := range activeNames {
		if prefix != "" && !strings.HasPrefix(sName, prefix) {
			continue
		}
		sId := sName
		if prefix != "" {
			sId = strings.TrimPrefix(sName, prefix)
		}

		sessionCwd := defaultCwd
		var createdAt int64
		if ds := registry.get(sName); ds != nil {
			sessionCwd = ds.cwd
			createdAt = ds.createdAt
		}

		sessions = append(sessions, SessionInfo{
			SessionName: sName,
			SessionId:   sId,
			CreatedAt:   createdAt,
			Connected:   true,
			Cwd:         sessionCwd,
		})
	}

	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].SessionId < sessions[j].SessionId
	})
	return sessions, nil
}

// GetCwd retrieves the working directory of the specified session across tmux or direct backends.
func GetCwd(sessionName, defaultCwd string) string {
	if IsTmuxAvailable() && HasSession(sessionName) {
		return GetTmuxCwd(sessionName, defaultCwd)
	}
	if ds := registry.get(sessionName); ds != nil && ds.cwd != "" {
		return ds.cwd
	}
	return defaultCwd
}

// GetPaneCommand returns the running command in the session pane (e.g. "agy").
func GetPaneCommand(sessionName string) string {
	if IsTmuxAvailable() && HasSession(sessionName) {
		return GetTmuxPaneCommand(sessionName)
	}
	return ""
}

// Kill terminates the session whether it resides in tmux or as a direct PTY.
func Kill(sessionName string) error {
	var tmuxErr error
	if IsTmuxAvailable() && HasSession(sessionName) {
		tmuxErr = KillTmuxSession(sessionName)
	}
	if ds := registry.get(sessionName); ds != nil {
		_ = ds.Close()
	}
	return tmuxErr
}

// SendKeys relays key strokes to the session.
func SendKeys(sessionName string, keys ...string) error {
	if IsTmuxAvailable() && HasSession(sessionName) {
		return SendTmuxKeys(sessionName, keys...)
	}
	if ds := registry.get(sessionName); ds != nil {
		for _, k := range keys {
			if k == "Enter" {
				_, _ = ds.Write([]byte("\n"))
			} else {
				_, _ = ds.Write([]byte(k))
			}
		}
		return nil
	}
	return fmt.Errorf("session %s not found", sessionName)
}

// Exists checks whether a session is currently active in tmux or in the direct registry.
func Exists(sessionName string) bool {
	if IsTmuxAvailable() && HasSession(sessionName) {
		return true
	}
	return registry.get(sessionName) != nil
}
