package terminal

import (
	"io"
)

// Session represents an interactive terminal execution stream behind the architectural seam.
// Callers interact with this interface without knowing whether the underlying session is
// managed by tmux or a direct PTY fallback.
type Session interface {
	io.ReadWriteCloser
	Resize(cols, rows int) error
	Scrollback() string
	IsAlive() bool
	SessionName() string
	Mode() string // "tmux" | "direct"
}

// SessionInfo provides public metadata about an active or persistent terminal session.
type SessionInfo struct {
	SessionName string `json:"sessionName"`
	SessionId   string `json:"sessionId"`
	CreatedAt   int64  `json:"createdAt"`
	Connected   bool   `json:"connected"`
	Cwd         string `json:"cwd,omitempty"`
	Command     string `json:"command,omitempty"`
}
