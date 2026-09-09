package tunnel

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
)

var (
	tryCloudflareRegex = regexp.MustCompile(`https://[a-zA-Z0-9-]+\.trycloudflare\.com`)
)

type TunnelStatus struct {
	Installed bool     `json:"installed"`
	Running   bool     `json:"running"`
	Mode      string   `json:"mode"` // "quick", "token", "none"
	Url       string   `json:"url,omitempty"`
	Pid       int      `json:"pid,omitempty"`
	BinPath   string   `json:"binPath,omitempty"`
	Version   string   `json:"version,omitempty"`
	Error     string   `json:"error,omitempty"`
	Logs      []string `json:"logs"`
	StartedAt int64    `json:"startedAt,omitempty"`
	Port      int      `json:"port,omitempty"`
}

type Manager struct {
	mu           sync.RWMutex
	cmd          *exec.Cmd
	status       TunnelStatus
	cancel       context.CancelFunc
	maxLogs      int
	customBinDir string
}

func NewManager(customBinDir ...string) *Manager {
	binDir := ""
	if len(customBinDir) > 0 && customBinDir[0] != "" {
		binDir = customBinDir[0]
	} else {
		home, _ := os.UserHomeDir()
		if home != "" {
			binDir = filepath.Join(home, ".agy-online", "bin")
		}
	}

	m := &Manager{
		maxLogs:      100,
		customBinDir: binDir,
		status: TunnelStatus{
			Installed: false,
			Running:   false,
			Mode:      "none",
			Logs:      make([]string, 0),
		},
	}
	m.RefreshInstalled()
	return m
}

// FindBinary searches for cloudflared executable in custom bin directory and PATH.
func (m *Manager) FindBinary() (string, bool) {
	if m.customBinDir != "" {
		candidate := filepath.Join(m.customBinDir, "cloudflared")
		if runtime.GOOS == "windows" {
			candidate += ".exe"
		}
		if fi, err := os.Stat(candidate); err == nil && !fi.IsDir() {
			return candidate, true
		}
	}

	// Check PATH
	if p, err := exec.LookPath("cloudflared"); err == nil {
		return p, true
	}

	// Common Termux path
	termuxPath := "/data/data/com.termux/files/usr/bin/cloudflared"
	if fi, err := os.Stat(termuxPath); err == nil && !fi.IsDir() {
		return termuxPath, true
	}

	return "", false
}

// RefreshInstalled checks whether cloudflared is installed and updates version.
func (m *Manager) RefreshInstalled() bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	p, found := m.FindBinary()
	m.status.Installed = found
	m.status.BinPath = p

	if found {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, p, "--version")
		out, err := cmd.Output()
		if err == nil {
			m.status.Version = strings.TrimSpace(string(out))
		}
	} else {
		m.status.Version = ""
	}

	return found
}

// Status returns a copy of current tunnel status.
func (m *Manager) Status() TunnelStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Check if process is still alive
	if m.status.Running && m.cmd != nil && m.cmd.Process != nil {
		// Verify process is alive
		if err := m.cmd.Process.Signal(os.Signal(syscall.Signal(0))); err != nil {
			// Process died
			s := m.status
			s.Running = false
			return s
		}
	}

	// Copy logs
	logsCopy := make([]string, len(m.status.Logs))
	copy(logsCopy, m.status.Logs)
	res := m.status
	res.Logs = logsCopy
	return res
}

func (m *Manager) appendLog(line string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	clean := strings.TrimRight(line, "\r\n")
	if clean == "" {
		return
	}

	m.status.Logs = append(m.status.Logs, clean)
	if len(m.status.Logs) > m.maxLogs {
		m.status.Logs = m.status.Logs[len(m.status.Logs)-m.maxLogs:]
	}

	// Look for trycloudflare URL if running quick tunnel
	if m.status.Mode == "quick" && m.status.Url == "" {
		if match := tryCloudflareRegex.FindString(clean); match != "" {
			m.status.Url = match
			m.status.Running = true
			m.status.Error = ""
		}
	}
}

// DownloadUrl returns the official GitHub release URL for the current OS/Arch.
func GetDownloadUrl() (string, error) {
	goos := runtime.GOOS
	goarch := runtime.GOARCH

	base := "https://github.com/cloudflare/cloudflared/releases/latest/download"

	switch goos {
	case "linux", "android":
		switch goarch {
		case "amd64":
			return fmt.Sprintf("%s/cloudflared-linux-amd64", base), nil
		case "arm64":
			return fmt.Sprintf("%s/cloudflared-linux-arm64", base), nil
		case "arm":
			return fmt.Sprintf("%s/cloudflared-linux-arm", base), nil
		case "386":
			return fmt.Sprintf("%s/cloudflared-linux-386", base), nil
		default:
			return "", fmt.Errorf("unsupported linux architecture: %s", goarch)
		}
	case "darwin":
		switch goarch {
		case "amd64":
			return fmt.Sprintf("%s/cloudflared-darwin-amd64.tgz", base), nil
		case "arm64":
			return fmt.Sprintf("%s/cloudflared-darwin-arm64.tgz", base), nil
		default:
			return "", fmt.Errorf("unsupported darwin architecture: %s", goarch)
		}
	case "windows":
		switch goarch {
		case "amd64":
			return fmt.Sprintf("%s/cloudflared-windows-amd64.exe", base), nil
		case "386":
			return fmt.Sprintf("%s/cloudflared-windows-386.exe", base), nil
		default:
			return "", fmt.Errorf("unsupported windows architecture: %s", goarch)
		}
	default:
		return "", fmt.Errorf("unsupported operating system: %s", goos)
	}
}

// Install downloads and installs cloudflared binary to customBinDir.
func (m *Manager) Install(ctx context.Context) error {
	m.mu.Lock()
	if m.customBinDir == "" {
		m.mu.Unlock()
		return errors.New("no installation directory specified")
	}
	targetDir := m.customBinDir
	m.mu.Unlock()

	downloadUrl, err := GetDownloadUrl()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return fmt.Errorf("failed to create bin dir: %w", err)
	}

	targetName := "cloudflared"
	if runtime.GOOS == "windows" {
		targetName += ".exe"
	}
	targetPath := filepath.Join(targetDir, targetName)
	tempPath := targetPath + ".tmp"

	req, err := http.NewRequestWithContext(ctx, "GET", downloadUrl, nil)
	if err != nil {
		return fmt.Errorf("failed to create download request: %w", err)
	}
	req.Header.Set("User-Agent", "agy-online-cloudflared-installer")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download server returned HTTP %d", resp.StatusCode)
	}

	out, err := os.OpenFile(tempPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return fmt.Errorf("failed to create temporary file: %w", err)
	}

	_, err = io.Copy(out, resp.Body)
	_ = out.Close()
	if err != nil {
		_ = os.Remove(tempPath)
		return fmt.Errorf("failed to save binary: %w", err)
	}

	// Set executable permissions
	_ = os.Chmod(tempPath, 0755)

	if err := os.Rename(tempPath, targetPath); err != nil {
		_ = os.Remove(tempPath)
		return fmt.Errorf("failed to finalize installation: %w", err)
	}

	m.RefreshInstalled()
	return nil
}

// Start launches a cloudflared tunnel in background.
// mode can be "quick" (trycloudflare.com) or "token" (Cloudflare Zero Trust).
func (m *Manager) Start(ctx context.Context, mode string, token string, port int) (*TunnelStatus, error) {
	m.mu.Lock()
	if m.status.Running && m.cmd != nil && m.cmd.Process != nil {
		m.mu.Unlock()
		return nil, errors.New("tunnel is already running")
	}

	binPath, found := m.FindBinary()
	if !found {
		m.mu.Unlock()
		return nil, errors.New("cloudflared is not installed; please install it first")
	}

	if port <= 0 {
		port = 3001
	}

	var args []string
	switch mode {
	case "token":
		if strings.TrimSpace(token) == "" {
			m.mu.Unlock()
			return nil, errors.New("token is required for token tunnel mode")
		}
		args = []string{"tunnel", "run", "--token", strings.TrimSpace(token)}
	case "quick", "":
		mode = "quick"
		args = []string{"tunnel", "--url", fmt.Sprintf("http://127.0.0.1:%d", port), "--no-autoupdate"}
	default:
		m.mu.Unlock()
		return nil, fmt.Errorf("unsupported tunnel mode: %s", mode)
	}

	runCtx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(runCtx, binPath, args...)

	// Combine stdout & stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		m.mu.Unlock()
		return nil, fmt.Errorf("failed to pipe stdout: %w", err)
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		cancel()
		m.mu.Unlock()
		return nil, fmt.Errorf("failed to start cloudflared process: %w", err)
	}

	m.cmd = cmd
	m.cancel = cancel
	m.status.Running = true
	m.status.Mode = mode
	m.status.Port = port
	m.status.Pid = cmd.Process.Pid
	m.status.StartedAt = time.Now().UnixMilli()
	m.status.Error = ""
	m.status.Url = ""
	m.status.Logs = make([]string, 0)
	m.mu.Unlock()

	// Stream logs in background goroutine
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			m.appendLog(line)
		}

		// Process finished
		_ = cmd.Wait()
		m.mu.Lock()
		m.status.Running = false
		m.status.Pid = 0
		if m.status.Error == "" && runCtx.Err() == nil {
			m.status.Error = "cloudflared process exited"
		}
		m.mu.Unlock()
	}()

	// If quick tunnel, wait up to 10 seconds for URL to appear
	if mode == "quick" {
		deadline := time.Now().Add(10 * time.Second)
		for time.Now().Before(deadline) {
			m.mu.RLock()
			urlFound := m.status.Url != ""
			running := m.status.Running
			m.mu.RUnlock()

			if urlFound || !running {
				break
			}
			time.Sleep(200 * time.Millisecond)
		}
	}

	st := m.Status()
	return &st, nil
}

// Stop terminates the running cloudflared process.
func (m *Manager) Stop() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.status.Running || m.cmd == nil || m.cmd.Process == nil {
		m.status.Running = false
		m.status.Url = ""
		m.status.Mode = "none"
		return nil
	}

	if m.cancel != nil {
		m.cancel()
	}

	// Send kill to guarantee termination
	_ = m.cmd.Process.Kill()
	m.status.Running = false
	m.status.Pid = 0
	m.status.Url = ""
	m.status.Mode = "none"
	m.status.Error = ""
	m.cmd = nil
	m.cancel = nil
	return nil
}
