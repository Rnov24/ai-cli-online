package pid

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type ProcessInfo struct {
	Pid       int    `json:"pid"`
	Name      string `json:"name"`
	Port      int    `json:"port,omitempty"`
	StartedAt int64  `json:"started_at"`
	Platform  string `json:"platform"`
}

func IsTermux() bool {
	prefix := os.Getenv("PREFIX")
	return strings.Contains(prefix, "com.termux") || strings.Contains(os.Getenv("PATH"), "com.termux")
}

func GetRunDir() string {
	home, _ := os.UserHomeDir()
	if home != "" {
		dir := filepath.Join(home, ".ai-cli-online", "run")
		if err := os.MkdirAll(dir, 0700); err == nil {
			return dir
		}
	}
	dir := filepath.Join(".", "data", "run")
	_ = os.MkdirAll(dir, 0700)
	return dir
}

func GetPidPath(component string) string {
	return filepath.Join(GetRunDir(), fmt.Sprintf("%s.pid", component))
}

func RegisterPid(component string, port int) (*ProcessInfo, error) {
	info := &ProcessInfo{
		Pid:       os.Getpid(),
		Name:      component,
		Port:      port,
		StartedAt: time.Now().UnixMilli(),
		Platform:  "linux",
	}
	if IsTermux() {
		info.Platform = "termux"
	}

	data, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		return nil, err
	}

	path := GetPidPath(component)
	if err := os.WriteFile(path, data, 0600); err != nil {
		return nil, err
	}
	return info, nil
}

func ReadPid(component string) (*ProcessInfo, error) {
	path := GetPidPath(component)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var info ProcessInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return nil, err
	}

	if !IsPidRunning(info.Pid) {
		_ = RemovePid(component)
		return nil, os.ErrNotExist
	}

	return &info, nil
}

func RemovePid(component string) error {
	path := GetPidPath(component)
	return os.Remove(path)
}

func CleanupStalePids() {
	runDir := GetRunDir()
	entries, err := os.ReadDir(runDir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".pid") {
			continue
		}
		comp := strings.TrimSuffix(entry.Name(), ".pid")
		info, err := ReadPid(comp)
		if err != nil || info == nil {
			_ = os.Remove(filepath.Join(runDir, entry.Name()))
		}
	}
}

func RegisterSpecificPid(component string, processPid int, port int) (*ProcessInfo, error) {
	info := &ProcessInfo{
		Pid:       processPid,
		Name:      component,
		Port:      port,
		StartedAt: time.Now().UnixMilli(),
		Platform:  "linux",
	}
	if IsTermux() {
		info.Platform = "termux"
	}

	data, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		return nil, err
	}

	path := GetPidPath(component)
	if err := os.WriteFile(path, data, 0600); err != nil {
		return nil, err
	}
	return info, nil
}

func GetTmuxPid(socketPath string) int {
	cmd := exec.Command("tmux", "-S", socketPath, "display-message", "-p", "#{pid}")
	out, err := cmd.Output()
	if err != nil {
		return 0
	}
	pStr := strings.TrimSpace(string(out))
	pVal, err := strconv.Atoi(pStr)
	if err != nil || !IsPidRunning(pVal) {
		return 0
	}
	return pVal
}
