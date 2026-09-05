package routes

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/huacheng/ai-cli-online/internal/idle"
	"github.com/huacheng/ai-cli-online/internal/pid"
	"github.com/huacheng/ai-cli-online/internal/terminal"
)

var startTime = time.Now()

type MemoryMetrics struct {
	RssMb       float64 `json:"rssMb"`
	HeapUsedMb  float64 `json:"heapUsedMb"`
	HeapTotalMb float64 `json:"heapTotalMb"`
}

type ServerStatus struct {
	Pid               int           `json:"pid"`
	Uptime            int64         `json:"uptime"`
	Memory            MemoryMetrics `json:"memory"`
	Idle              bool          `json:"idle"`
	ActiveConnections int           `json:"activeConnections"`
}

type TmuxStatus struct {
	Available     bool `json:"available"`
	Pid           int  `json:"pid,omitempty"`
	SessionsCount int  `json:"sessionsCount"`
}

type AgyStatus struct {
	Available bool `json:"available"`
}

type PlatformStatus struct {
	IsTermux    bool   `json:"isTermux"`
	OS          string `json:"os"`
	Arch        string `json:"arch"`
	NodeVersion string `json:"nodeVersion"`
}

type SystemStatusResponse struct {
	Server   ServerStatus   `json:"server"`
	Tmux     TmuxStatus     `json:"tmux"`
	Agy      AgyStatus      `json:"agy"`
	Platform PlatformStatus `json:"platform"`
}

func getRssMb() float64 {
	data, err := os.ReadFile("/proc/self/statm")
	if err == nil {
		fields := strings.Fields(string(data))
		if len(fields) >= 2 {
			if pages, err := strconv.ParseInt(fields[1], 10, 64); err == nil {
				pageSize := int64(os.Getpagesize())
				mb := float64(pages*pageSize) / (1024 * 1024)
				return math.Round(mb*10) / 10
			}
		}
	}
	// Fallback to Go Sys memory
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	return math.Round((float64(ms.Sys)/(1024*1024))*10) / 10
}

func HandleSystemStatus(w http.ResponseWriter, r *http.Request) {
	idleMgr := idle.GetManager()
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)

	rssMb := getRssMb()
	heapUsedMb := math.Round((float64(ms.HeapAlloc)/(1024*1024))*10) / 10
	heapTotalMb := math.Round((float64(ms.HeapSys)/(1024*1024))*10) / 10

	sessions, _ := terminal.List("", nil, "")
	sessionsCount := len(sessions)

	resp := SystemStatusResponse{
		Server: ServerStatus{
			Pid:    os.Getpid(),
			Uptime: int64(time.Since(startTime).Seconds()),
			Memory: MemoryMetrics{
				RssMb:       rssMb,
				HeapUsedMb:  heapUsedMb,
				HeapTotalMb: heapTotalMb,
			},
			Idle:              idleMgr.IsIdle(),
			ActiveConnections: idleMgr.ActiveConnections(),
		},
		Tmux: TmuxStatus{
			Available:     terminal.IsTmuxAvailable(),
			Pid:           pid.GetTmuxPid(terminal.SocketPath),
			SessionsCount: sessionsCount,
		},
		Agy: AgyStatus{
			Available: terminal.IsAgyAvailable(),
		},
		Platform: PlatformStatus{
			IsTermux:    pid.IsTermux(),
			OS:          runtime.GOOS,
			Arch:        runtime.GOARCH,
			NodeVersion: fmt.Sprintf("%s (Go runtime)", runtime.Version()),
		},
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func HandleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"status": "ok"})
}
