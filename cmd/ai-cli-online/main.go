package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	aicli "github.com/huacheng/ai-cli-online"
	"github.com/huacheng/ai-cli-online/internal/config"
	"github.com/huacheng/ai-cli-online/internal/db"
	"github.com/huacheng/ai-cli-online/internal/idle"
	"github.com/huacheng/ai-cli-online/internal/pid"
	"github.com/huacheng/ai-cli-online/internal/server"
	"github.com/huacheng/ai-cli-online/internal/tmux"
)

const AppVersion = "3.1.0-go"

func main() {
	if len(os.Args) < 2 {
		runServer(false, 0)
		return
	}

	subcommand := os.Args[1]
	switch subcommand {
	case "start":
		fs := flag.NewFlagSet("start", flag.ExitOnError)
		daemon := fs.Bool("d", false, "Run in background daemon mode")
		fs.BoolVar(daemon, "daemon", false, "Run in background daemon mode")
		port := fs.Int("p", 0, "Server port")
		fs.IntVar(port, "port", 0, "Server port")
		_ = fs.Parse(os.Args[2:])
		runStart(*daemon, *port)

	case "stop":
		runStop()

	case "restart":
		fs := flag.NewFlagSet("restart", flag.ExitOnError)
		port := fs.Int("p", 0, "Server port")
		fs.IntVar(port, "port", 0, "Server port")
		_ = fs.Parse(os.Args[2:])
		runStop()
		time.Sleep(1 * time.Second)
		runStart(true, *port)

	case "status":
		runStatus()

	case "install-boot":
		runInstallBoot()

	case "-v", "--version", "version":
		fmt.Printf("ai-cli-online v%s (Go native)\n", AppVersion)

	case "-h", "--help", "help":
		printUsage()

	default:
		// Unknown subcommand, fallback to normal start
		runServer(false, 0)
	}
}

func printUsage() {
	fmt.Printf(`AGY Online (v%s) — Terminal & Autonomous Task Development Workspace

Usage:
  ai-cli-online [command] [options]

Commands:
  start [-d] [-p port]   Start AGY Online server (-d for background daemon)
  status                 Show running status, PID, memory, and services
  stop                   Stop running server daemon
  restart [-p port]      Restart running server daemon
  install-boot           Configure auto-start on Android device boot (Termux:Boot)
  version                Print version

Options:
  -d, --daemon           Run in background daemon mode
  -p, --port <number>    Set server port (default: 3001)
  -h, --help             Show help
`, AppVersion)
}

func runStart(daemon bool, portOverride int) {
	if daemon {
		// Check if already running
		if existing, err := pid.ReadPid("server"); err == nil && existing != nil {
			fmt.Printf("AGY Online server is already running (PID: %d, Port: %d)\n", existing.Pid, existing.Port)
			os.Exit(0)
		}

		self, err := os.Executable()
		if err != nil {
			log.Fatalf("Failed to find executable path: %v", err)
		}

		home, _ := os.UserHomeDir()
		logDir := filepath.Join(home, ".ai-cli-online", "logs")
		_ = os.MkdirAll(logDir, 0700)
		logFile := filepath.Join(logDir, "ai-cli-online.log")

		outFile, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			log.Fatalf("Failed to open log file %s: %v", logFile, err)
		}

		args := []string{"start"}
		if portOverride > 0 {
			args = append(args, "-p", strconv.Itoa(portOverride))
		}

		cmd := exec.Command(self, args...)
		cmd.Stdout = outFile
		cmd.Stderr = outFile
		cmd.Stdin = nil
		setDaemonProcAttrs(cmd)

		if err := cmd.Start(); err != nil {
			log.Fatalf("Failed to start daemon: %v", err)
		}

		fmt.Printf("AGY Online server started in daemon mode (PID: %d)\n", cmd.Process.Pid)
		fmt.Printf("Logs: %s\n", logFile)
		fmt.Println("Check status: ai-cli-online status")
		return
	}

	runServer(true, portOverride)
}

func runServer(registerPid bool, portOverride int) {
	cfg := config.LoadConfig()
	if portOverride > 0 {
		cfg.Port = portOverride
	}

	database, err := db.Open(cfg.DataDir)
	if err != nil {
		log.Fatalf("[db] Failed to open database: %v", err)
	}
	defer database.Close()

	idleMgr := idle.Init(func() {
		database.Checkpoint()
	})
	defer idleMgr.Stop()

	if registerPid {
		pid.CleanupStalePids()
		if _, err := pid.RegisterPid("server", cfg.Port); err != nil {
			log.Printf("[pid] Warning: failed to register pid: %v", err)
		}
		if tPid := pid.GetTmuxPid(tmux.SocketPath); tPid > 0 {
			_, _ = pid.RegisterSpecificPid("tmux", tPid, 0)
		}
		defer func() {
			_ = pid.RemovePid("server")
			_ = pid.RemovePid("tmux")
		}()
	}

	staticFS, err := aicli.GetWebDistFS()
	if err != nil {
		log.Printf("[server] Warning: embedded web assets not available: %v", err)
	}

	srv := server.NewServer(cfg, database, staticFS)

	// Graceful shutdown listener
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Println("[server] Shutting down gracefully...")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
		_ = pid.RemovePid("server")
		os.Exit(0)
	}()

	if err := srv.Start(); err != nil && err != context.Canceled {
		log.Fatalf("[server] Fatal error: %v", err)
	}
}

func runStop() {
	info, err := pid.ReadPid("server")
	if err != nil || info == nil {
		fmt.Println("AGY Online server is not currently running.")
		return
	}

	fmt.Printf("Stopping AGY Online server (PID: %d)...\n", info.Pid)
	proc, err := os.FindProcess(info.Pid)
	if err != nil {
		_ = pid.RemovePid("server")
		fmt.Println("Process not found. Removed stale PID.")
		return
	}

	// Try graceful SIGTERM first
	_ = proc.Signal(syscall.SIGTERM)

	stopped := false
	for i := 0; i < 20; i++ {
		time.Sleep(200 * time.Millisecond)
		if !pid.IsPidRunning(info.Pid) {
			stopped = true
			break
		}
	}

	// Force kill if still alive
	if !stopped {
		_ = proc.Kill()
	}
	_ = pid.RemovePid("server")
	fmt.Println("AGY Online server stopped.")
}

func runStatus() {
	info, err := pid.ReadPid("server")
	isRunning := (err == nil && info != nil)

	fmt.Println("========================================")
	fmt.Printf("  AGY Online Service Status (v%s)\n", AppVersion)
	fmt.Println("========================================")

	plat := "Linux"
	if pid.IsTermux() {
		plat = "Android (Termux)"
	}
	fmt.Printf("  Platform:    %s\n", plat)

	tmuxAvail := "Not Found"
	if tmux.IsTmuxAvailable() {
		tmuxAvail = "Available"
	}
	fmt.Printf("  tmux:        %s\n", tmuxAvail)

	agyAvail := "Not Found"
	if tmux.IsAgyAvailable() {
		agyAvail = "Available"
	}
	fmt.Printf("  Antigravity: %s\n", agyAvail)

	if isRunning {
		uptime := (time.Now().UnixMilli() - info.StartedAt) / 1000
		fmt.Printf("  Web Server:  RUNNING (PID: %d)\n", info.Pid)
		if info.Port > 0 {
			fmt.Printf("  Port:        %d\n", info.Port)
		}
		fmt.Printf("  Uptime:      %ds\n", uptime)
		fmt.Printf("  PID File:    %s\n", pid.GetPidPath("server"))
	} else {
		fmt.Println("  Web Server:  STOPPED")
	}

	tmuxPid := pid.GetTmuxPid(tmux.SocketPath)
	if tmuxPid > 0 {
		fmt.Printf("  tmux Server: RUNNING (PID: %d)\n", tmuxPid)
		fmt.Printf("  tmux Socket: %s\n", tmux.SocketPath)
	} else if tmux.IsTmuxAvailable() {
		fmt.Println("  tmux Server: IDLE (will auto-spawn on terminal connect)")
	}
	fmt.Println("========================================")
}

func runInstallBoot() {
	if !pid.IsTermux() {
		fmt.Println("install-boot is currently tailored for Termux on Android.")
		fmt.Println("For Linux VPS systemd service, see install-service.sh.")
		return
	}

	home, _ := os.UserHomeDir()
	bootDir := filepath.Join(home, ".termux", "boot")
	_ = os.MkdirAll(bootDir, 0755)
	bootScript := filepath.Join(bootDir, "start-ai-cli-online.sh")

	self, _ := os.Executable()
	content := fmt.Sprintf(`#!/data/data/com.termux/files/usr/bin/bash
if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock
fi

export PREFIX="/data/data/com.termux/files/usr"
export HOME="/data/data/com.termux/files/home"
export PATH="${HOME}/.gemini/antigravity-cli/bin:${PREFIX}/bin:${PATH}"

BOOT_LOG="${HOME}/.ai-cli-online/logs/boot.log"
mkdir -p "${HOME}/.ai-cli-online/logs"
echo "[$(date '+%%Y-%%m-%%d %%H:%%M:%%S')] Device booted. Starting AGY Online..." >> "$BOOT_LOG"

sleep 3
%s start -d >> "$BOOT_LOG" 2>&1
echo "[$(date '+%%Y-%%m-%%d %%H:%%M:%%S')] AGY Online boot script finished." >> "$BOOT_LOG"
`, self)

	if err := os.WriteFile(bootScript, []byte(content), 0755); err != nil {
		fmt.Printf("Failed to write boot script: %v\n", err)
		return
	}

	fmt.Println("✔ Termux:Boot script successfully installed to:", bootScript)
	fmt.Println("Requires 'Termux:Boot' APK installed and opened once.")
}
