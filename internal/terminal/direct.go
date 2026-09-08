package terminal

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/creack/pty"
)

var sensitiveKeys = []string{"AUTH_TOKEN", "SECRET", "PASSWORD", "API_KEY", "PRIVATE_KEY", "ACCESS_TOKEN"}

func sanitizedEnv() []string {
	var env []string
	pathFound := false
	home, _ := os.UserHomeDir()
	prefix := os.Getenv("PREFIX")

	for _, e := range os.Environ() {
		parts := strings.SplitN(e, "=", 2)
		if len(parts) == 0 {
			continue
		}
		upper := strings.ToUpper(parts[0])
		sensitive := false
		for _, s := range sensitiveKeys {
			if strings.Contains(upper, s) {
				sensitive = true
				break
			}
		}
		if sensitive {
			continue
		}

		if upper == "PATH" && len(parts) == 2 {
			pathFound = true
			currPath := parts[1]
			var extraPaths []string
			if home != "" {
				agyBin := filepath.Join(home, ".gemini", "antigravity-cli", "bin")
				if !strings.Contains(currPath, agyBin) {
					extraPaths = append(extraPaths, agyBin)
				}
			}
			if prefix != "" {
				pBin := filepath.Join(prefix, "bin")
				if !strings.Contains(currPath, pBin) {
					extraPaths = append(extraPaths, pBin)
				}
			}
			if len(extraPaths) > 0 {
				newPath := strings.Join(extraPaths, string(os.PathListSeparator)) + string(os.PathListSeparator) + currPath
				env = append(env, "PATH="+newPath)
				continue
			}
		}
		env = append(env, e)
	}

	if !pathFound {
		var paths []string
		if home != "" {
			paths = append(paths, filepath.Join(home, ".gemini", "antigravity-cli", "bin"))
		}
		if prefix != "" {
			paths = append(paths, filepath.Join(prefix, "bin"))
		}
		paths = append(paths, "/usr/local/bin", "/usr/bin", "/bin")
		env = append(env, "PATH="+strings.Join(paths, string(os.PathListSeparator)))
	}

	env = append(env, "TERM=xterm-256color")
	return env
}

func resolveDefaultShell() string {
	if shell := os.Getenv("SHELL"); shell != "" {
		if _, err := exec.LookPath(shell); err == nil {
			return shell
		}
	}
	for _, candidate := range []string{"/system/bin/sh", "/bin/bash", "/bin/sh", "sh"} {
		if p, err := exec.LookPath(candidate); err == nil {
			return p
		}
	}
	return "sh"
}

type directRegistry struct {
	mu       sync.RWMutex
	sessions map[string]*directSession
}

var registry = &directRegistry{
	sessions: make(map[string]*directSession),
}

func (r *directRegistry) register(s *directSession) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sessions[s.sessionName] = s
}

func (r *directRegistry) unregister(sessionName string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.sessions, sessionName)
}

func (r *directRegistry) get(sessionName string) *directSession {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.sessions[sessionName]
}

type directSession struct {
	mu          sync.Mutex
	sessionName string
	cwd         string
	createdAt   int64
	ptmx        *os.File
	cmd         *exec.Cmd
	closed      bool
	closeOnce   sync.Once
	scrollback  bytes.Buffer
}

const maxScrollbackBytes = 64 * 1024

func startDirect(sessionName, cwd string, cols, rows int, customCmd string) (*directSession, error) {
	cols, rows = SanitizeWinsize(cols, rows)
	shell := resolveDefaultShell()
	var c *exec.Cmd
	if customCmd != "" {
		c = exec.Command(shell, "-c", customCmd)
	} else {
		c = exec.Command(shell)
	}
	if cwd != "" {
		c.Dir = cwd
	}
	c.Env = sanitizedEnv()

	ptmx, err := pty.StartWithSize(c, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to start direct pty: %w", err)
	}

	ds := &directSession{
		sessionName: sessionName,
		cwd:         cwd,
		createdAt:   time.Now().Unix(),
		ptmx:        ptmx,
		cmd:         c,
	}
	registry.register(ds)

	// Asynchronously reap child process upon termination to prevent zombie accumulation
	// and automatically unregister dead sessions on natural exit
	go func() {
		_ = c.Wait()
		_ = ds.Close()
	}()

	return ds, nil
}

func (s *directSession) SessionName() string {
	return s.sessionName
}

func (s *directSession) Mode() string {
	return "direct"
}

func (s *directSession) Read(p []byte) (int, error) {
	n, err := s.ptmx.Read(p)
	if n > 0 {
		s.mu.Lock()
		s.scrollback.Write(p[:n])
		if s.scrollback.Len() > maxScrollbackBytes {
			data := s.scrollback.Bytes()
			excess := len(data) - maxScrollbackBytes
			tail := make([]byte, maxScrollbackBytes)
			copy(tail, data[excess:])
			s.scrollback.Reset()
			s.scrollback.Write(tail)
		}
		s.mu.Unlock()
	}
	return n, err
}

func (s *directSession) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return 0, os.ErrClosed
	}
	return s.ptmx.Write(p)
}

func (s *directSession) Resize(cols, rows int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return os.ErrClosed
	}
	cols, rows = SanitizeWinsize(cols, rows)
	return pty.Setsize(s.ptmx, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
}

func (s *directSession) Scrollback() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.scrollback.String()
}

func (s *directSession) Close() error {
	s.closeOnce.Do(func() {
		s.mu.Lock()
		s.closed = true
		s.mu.Unlock()

		registry.unregister(s.sessionName)
		_ = s.ptmx.Close()
		if s.cmd != nil && s.cmd.Process != nil {
			_ = s.cmd.Process.Kill()
		}
	})
	return nil
}

func (s *directSession) IsAlive() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return !s.closed
}
