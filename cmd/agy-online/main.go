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
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	agyonline "github.com/huacheng/agy-online"
	"github.com/huacheng/agy-online/internal/config"
	"github.com/huacheng/agy-online/internal/db"
	"github.com/huacheng/agy-online/internal/idle"
	"github.com/huacheng/agy-online/internal/pid"
	"github.com/huacheng/agy-online/internal/server"
	"github.com/huacheng/agy-online/internal/terminal"
	"github.com/huacheng/agy-online/internal/tunnel"
)

const AppVersion = "3.1.0-go"

func main() {
	if len(os.Args) < 2 {
		runServer(false, 0, false)
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
		autoTunnel := fs.Bool("t", false, "Auto-start Cloudflare Tunnel")
		fs.BoolVar(autoTunnel, "tunnel", false, "Auto-start Cloudflare Tunnel")
		_ = fs.Parse(os.Args[2:])
		runStart(*daemon, *port, *autoTunnel)

	case "tunnel":
		fs := flag.NewFlagSet("tunnel", flag.ExitOnError)
		port := fs.Int("p", 0, "Server port to tunnel")
		fs.IntVar(port, "port", 0, "Server port to tunnel")
		token := fs.String("token", "", "Cloudflare Zero Trust tunnel token")
		_ = fs.Parse(os.Args[2:])
		runTunnel(fs.Args(), *port, *token)

	case "stop":
		runStop()

	case "restart":
		fs := flag.NewFlagSet("restart", flag.ExitOnError)
		port := fs.Int("p", 0, "Server port")
		fs.IntVar(port, "port", 0, "Server port")
		autoTunnel := fs.Bool("t", false, "Auto-start Cloudflare Tunnel")
		fs.BoolVar(autoTunnel, "tunnel", false, "Auto-start Cloudflare Tunnel")
		_ = fs.Parse(os.Args[2:])
		runStop()
		time.Sleep(1 * time.Second)
		runStart(true, *port, *autoTunnel)

	case "status":
		runStatus()

	case "install-boot":
		runInstallBoot()

	case "uninstall-boot":
		runUninstallBoot()

	case "-v", "--version", "version":
		fmt.Printf("ai-cli-online v%s (Go native)\n", AppVersion)

	case "-h", "--help", "help":
		printUsage()

	default:
		// Unknown subcommand, fallback to normal start
		runServer(false, 0, false)
	}
}

func printUsage() {
	fmt.Printf(`AGY Online (v%s) — Terminal & Autonomous Task Development Workspace

Usage:
  ai-cli-online [command] [options]

Commands:
  start [-d] [-t] [-p port] Start AGY Online server (-d daemon, -t auto-tunnel)
  tunnel [status|start|stop] Manage Cloudflare Remote Tunnel
  status                    Show running status, PID, memory, and services
  stop                      Stop running server daemon
  restart [-p port]         Restart running server daemon
  install-boot              Configure auto-start on system boot (Windows Startup / Termux)
  uninstall-boot            Remove auto-start configuration
  version                   Print version

Options:
  -d, --daemon              Run in background daemon mode
  -t, --tunnel              Automatically start Cloudflare Quick Tunnel on startup
  -p, --port <number>       Set server port (default: 3001)
  -h, --help                Show help
`, AppVersion)
}

func runStart(daemon bool, portOverride int, autoTunnel bool) {
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
		if autoTunnel {
			args = append(args, "--tunnel")
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

	runServer(true, portOverride, autoTunnel)
}

func runServer(registerPid bool, portOverride int, autoTunnel bool) {
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
		if tPid := pid.GetTmuxPid(terminal.SocketPath); tPid > 0 {
			_, _ = pid.RegisterSpecificPid("tmux", tPid, 0)
		}
		defer func() {
			_ = pid.RemovePid("server")
			_ = pid.RemovePid("tmux")
		}()
	}

	staticFS, err := agyonline.GetWebDistFS()
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

	if autoTunnel {
		go func() {
			time.Sleep(1 * time.Second)
			log.Println("[tunnel] Starting Cloudflare Quick Tunnel...")
			ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
			defer cancel()
			if !srv.TunnelManager().Status().Installed {
				log.Println("[tunnel] cloudflared binary not found; auto-installing...")
				if err := srv.TunnelManager().Install(ctx); err != nil {
					log.Printf("[tunnel] Auto-installation failed: %v", err)
					return
				}
				log.Println("[tunnel] cloudflared installed successfully.")
			}
			st, err := srv.TunnelManager().Start(ctx, "quick", "", cfg.Port)
			if err != nil {
				log.Printf("[tunnel] Failed to start tunnel: %v", err)
			} else if st.Url != "" {
				log.Printf("[tunnel] Cloudflare Tunnel established: %s", st.Url)
				fmt.Printf("\n>>> Cloudflare Public Ingress URL: %s <<<\n\n", st.Url)
			}
		}()
	}

	if err := srv.Start(); err != nil && err != context.Canceled {
		log.Fatalf("[server] Fatal error: %v", err)
	}
}

func runTunnel(args []string, portOverride int, token string) {
	action := "status"
	if len(args) > 0 {
		action = args[0]
	}

	mgr := tunnel.NewManager()

	switch action {
	case "help", "--help", "-h":
		fmt.Println("Usage: agy-online tunnel [status|start|stop|install] [options]")
		fmt.Println("\nCommands:")
		fmt.Println("  status            Show current Cloudflare Tunnel state and URL")
		fmt.Println("  start             Launch Cloudflare Tunnel (Quick or Named mode)")
		fmt.Println("  stop              Terminate running Cloudflare Tunnel process")
		fmt.Println("  install           Download and install standalone cloudflared binary")
		fmt.Println("\nOptions:")
		fmt.Println("  --quick           Force ephemeral quick tunnel mode (default)")
		fmt.Println("  --token <string>  Cloudflare Zero Trust named tunnel token")
		fmt.Println("  --port <int>      Target local port to proxy (default: 3001)")
		return

	case "install":
		fmt.Println("Downloading and installing cloudflared...")
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
		if err := mgr.Install(ctx); err != nil {
			log.Fatalf("Installation failed: %v", err)
		}
		fmt.Println("✔ cloudflared installed successfully!")
		st := mgr.Status()
		fmt.Printf("Binary path: %s\n", st.BinPath)
		if st.Version != "" {
			fmt.Printf("Version:     %s\n", st.Version)
		}

	case "start":
		if !mgr.Status().Installed {
			fmt.Println("cloudflared is not installed. Auto-installing now...")
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
			defer cancel()
			if err := mgr.Install(ctx); err != nil {
				log.Fatalf("Auto-installation failed: %v", err)
			}
			fmt.Println("✔ Installed cloudflared.")
		}

		port := portOverride
		if port <= 0 {
			cfg := config.LoadConfig()
			port = cfg.Port
		}
		if port <= 0 {
			port = 3001
		}

		mode := "quick"
		if token != "" {
			mode = "token"
		}

		fmt.Printf("Starting Cloudflare Tunnel in %s mode (target: http://127.0.0.1:%d)...\n", mode, port)
		ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
		defer cancel()

		st, err := mgr.Start(ctx, mode, token, port)
		if err != nil {
			log.Fatalf("Failed to start tunnel: %v", err)
		}

		if st.Url != "" {
			fmt.Println("\n==================================================")
			fmt.Println("  Cloudflare Tunnel ACTIVE")
			fmt.Println("==================================================")
			fmt.Printf("  Public URL:  %s\n", st.Url)
			fmt.Printf("  Target Port: %d\n", port)
			fmt.Printf("  PID:         %d\n", st.Pid)
			fmt.Println("==================================================")
		} else {
			fmt.Printf("Tunnel process spawned (PID: %d). Establishing connection...\n", st.Pid)
		}

		// Keep running in foreground until interrupt
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan
		fmt.Println("\nStopping tunnel...")
		_ = mgr.Stop()
		fmt.Println("✔ Tunnel stopped cleanly.")

	case "stop":
		if err := mgr.Stop(); err != nil {
			log.Fatalf("Failed to stop tunnel: %v", err)
		}
		fmt.Println("✔ Cloudflare Tunnel stopped.")

	case "status":
		fallthrough
	default:
		st := mgr.Status()
		fmt.Println("==================================================")
		fmt.Println("  Cloudflare Tunnel Status")
		fmt.Println("==================================================")
		fmt.Printf("  Installed: %v\n", st.Installed)
		if st.Installed {
			fmt.Printf("  Binary:    %s\n", st.BinPath)
			if st.Version != "" {
				fmt.Printf("  Version:   %s\n", st.Version)
			}
		}
		fmt.Printf("  Running:   %v\n", st.Running)
		if st.Running {
			fmt.Printf("  Mode:      %s\n", st.Mode)
			if st.Url != "" {
				fmt.Printf("  URL:       %s\n", st.Url)
			}
			fmt.Printf("  PID:       %d\n", st.Pid)
		}
		fmt.Println("==================================================")
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
	if runtime.GOOS == "windows" {
		plat = "Windows"
	} else if runtime.GOOS == "darwin" {
		plat = "macOS"
	} else if pid.IsTermux() {
		plat = "Android (Termux)"
	}
	fmt.Printf("  Platform:    %s\n", plat)

	tmuxAvail := "Not Found"
	if terminal.IsTmuxAvailable() {
		tmuxAvail = "Available"
	}
	fmt.Printf("  tmux:        %s\n", tmuxAvail)

	agyAvail := "Not Found"
	if terminal.IsAgyAvailable() {
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

	tmuxPid := pid.GetTmuxPid(terminal.SocketPath)
	if tmuxPid > 0 {
		fmt.Printf("  tmux Server: RUNNING (PID: %d)\n", tmuxPid)
		fmt.Printf("  tmux Socket: %s\n", terminal.SocketPath)
	} else if terminal.IsTmuxAvailable() {
		fmt.Println("  tmux Server: IDLE (will auto-spawn on terminal connect)")
	}
	fmt.Println("========================================")
}

func runInstallBoot() {
	if runtime.GOOS == "windows" {
		runInstallWindowsStartup()
		return
	}
	if !pid.IsTermux() {
		fmt.Println("install-boot is currently tailored for Windows and Termux (Android).")
		fmt.Println("For Linux VPS systemd service, see install-service.sh.")
		return
	}

	home, _ := os.UserHomeDir()
	bootDir := filepath.Join(home, ".termux", "boot")
	_ = os.MkdirAll(bootDir, 0755)
	bootScript := filepath.Join(bootDir, "start-ai-cli-online.sh")

	self, _ := os.Executable()
	self, _ = filepath.EvalSymlinks(self)

	// Create symlink in $PREFIX/bin for convenient global access
	prefix := os.Getenv("PREFIX")
	if prefix == "" {
		prefix = "/data/data/com.termux/files/usr"
	}
	prefixBin := filepath.Join(prefix, "bin", "ai-cli-online")
	_ = os.Remove(prefixBin)
	_ = os.Symlink(self, prefixBin)

	content := fmt.Sprintf(`#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# AGY Online Auto-Start on Android Boot (Termux:Boot)
# Runs headlessly in the background without opening the Termux terminal UI
# ==============================================================================

# 1. Acquire wake-lock to prevent CPU sleep when screen is off
if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock
fi

# 2. Environment paths
export PREFIX="/data/data/com.termux/files/usr"
export HOME="/data/data/com.termux/files/home"
export PATH="${HOME}/.gemini/antigravity-cli/bin:${PREFIX}/bin:${PATH}"

BOOT_LOG="${HOME}/.ai-cli-online/logs/boot.log"
mkdir -p "${HOME}/.ai-cli-online/logs"
echo "[$(date '+%%Y-%%m-%%d %%H:%%M:%%S')] Device booted. Starting AGY Online..." >> "$BOOT_LOG"

# 3. Resolve binary path
PROJECT_DIR="${HOME}/ai-cli-online"
CLI_BIN="%s"

if [[ ! -x "$CLI_BIN" ]]; then
  if [[ -x "${PROJECT_DIR}/bin/ai-cli-online" ]]; then
    CLI_BIN="${PROJECT_DIR}/bin/ai-cli-online"
  elif command -v ai-cli-online >/dev/null 2>&1; then
    CLI_BIN="$(command -v ai-cli-online)"
  fi
fi

if [[ ! -x "$CLI_BIN" ]]; then
  echo "[$(date '+%%Y-%%m-%%d %%H:%%M:%%S')] ERROR: ai-cli-online binary not found or not executable" >> "$BOOT_LOG"
  exit 1
fi

# 4. Wait 3 seconds for network interfaces to initialize
sleep 3

# 5. Start AGY Online in background daemon mode
if [[ -d "$PROJECT_DIR" ]]; then
  cd "$PROJECT_DIR"
fi
"$CLI_BIN" start -d >> "$BOOT_LOG" 2>&1
echo "[$(date '+%%Y-%%m-%%d %%H:%%M:%%S')] AGY Online boot script finished." >> "$BOOT_LOG"
`, self)

	if err := os.WriteFile(bootScript, []byte(content), 0755); err != nil {
		fmt.Printf("Failed to write boot script: %v\n", err)
		return
	}

	fmt.Println("✔ Termux:Boot script successfully installed to:", bootScript)
	fmt.Println()
	fmt.Println("Requirements for automatic startup on Android boot:")
	fmt.Println(" 1. Install 'Termux:Boot' APK (from F-Droid or GitHub releases).")
	fmt.Println(" 2. Open the Termux:Boot app ONCE to allow it to receive boot permissions.")
	fmt.Println(" 3. Disable battery optimization for both Termux and Termux:Boot in Android settings.")
	fmt.Println()
	fmt.Println("Note: Termux:Boot runs completely headlessly in the background without launching the Termux terminal UI.")
	fmt.Println()

	// Android 12+ Phantom Process Killer Notice
	androidVer := ""
	if out, err := exec.Command("getprop", "ro.build.version.release").Output(); err == nil {
		androidVer = strings.TrimSpace(string(out))
	}
	major := 0
	if androidVer != "" {
		parts := strings.Split(androidVer, ".")
		major, _ = strconv.Atoi(parts[0])
	}
	if major >= 12 || androidVer == "" {
		fmt.Println("Android 12+ Phantom Process Killer Notice:")
		if androidVer != "" {
			fmt.Printf("  Detected Android %s.\n", androidVer)
		}
		fmt.Println("  Android 12+ limits background child processes to 32 and may terminate AGY Online / tmux.")
		fmt.Println("  To disable the Phantom Process Killer, run via ADB from your PC/Mac:")
		fmt.Println(`    adb shell "/system/bin/device_config put activity_manager max_phantom_processes 2147483647"`)
		fmt.Println("  Or:")
		fmt.Println(`    adb shell "settings put global settings_enable_monitor_phantom_procs false"`)
		fmt.Println()
	}
}

func runInstallWindowsStartup() {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		home, _ := os.UserHomeDir()
		appData = filepath.Join(home, "AppData", "Roaming")
	}
	startupDir := filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
	if err := os.MkdirAll(startupDir, 0755); err != nil {
		fmt.Printf("Failed to create Windows Startup directory: %v\n", err)
		return
	}

	self, err := os.Executable()
	if err != nil {
		fmt.Printf("Failed to resolve executable path: %v\n", err)
		return
	}
	self, _ = filepath.EvalSymlinks(self)
	self = filepath.Clean(self)

	// Create silent VBS launcher in Startup folder
	vbsPath := filepath.Join(startupDir, "start-ai-cli-online.vbs")
	vbsContent := fmt.Sprintf(`' ==============================================================================
' AGY Online Silent Background Auto-Start on Windows Logon
' Launches ai-cli-online in detached daemon mode (-d) with zero console flash
' ==============================================================================
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """" & "%s" & """ start -d", 0, False
`, strings.ReplaceAll(self, `"`, `""`))

	if err := os.WriteFile(vbsPath, []byte(vbsContent), 0644); err != nil {
		fmt.Printf("Failed to write startup launcher to %s: %v\n", vbsPath, err)
		return
	}

	fmt.Println("==================================================")
	fmt.Println("  AGY Online Windows Auto-Start Configured")
	fmt.Println("==================================================")
	fmt.Printf("  Target binary:   %s\n", self)
	fmt.Printf("  Startup script:  %s\n", vbsPath)
	fmt.Println("  Mode:            Silent background daemon (-d)")
	fmt.Println("  Behavior:        Automatically starts when you log in to Windows.")
	fmt.Println()
	fmt.Println("  Verify now:      ai-cli-online start -d")
	fmt.Println("  Check status:    ai-cli-online status")
	fmt.Println("  Open UI:         http://localhost:3001")
	fmt.Println("  To uninstall:    ai-cli-online uninstall-boot")
	fmt.Println("==================================================")
}

func runUninstallWindowsStartup() {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		home, _ := os.UserHomeDir()
		appData = filepath.Join(home, "AppData", "Roaming")
	}
	startupDir := filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
	vbsPath := filepath.Join(startupDir, "start-ai-cli-online.vbs")

	if _, err := os.Stat(vbsPath); err == nil {
		_ = os.Remove(vbsPath)
		fmt.Printf("✔ Removed Windows auto-start launcher: %s\n", vbsPath)
	} else {
		fmt.Printf("No auto-start launcher found at: %s\n", vbsPath)
	}
}

func runUninstallBoot() {
	if runtime.GOOS == "windows" {
		runUninstallWindowsStartup()
		return
	}
	if pid.IsTermux() {
		home, _ := os.UserHomeDir()
		bootScript := filepath.Join(home, ".termux", "boot", "start-ai-cli-online.sh")
		if _, err := os.Stat(bootScript); err == nil {
			_ = os.Remove(bootScript)
			fmt.Printf("✔ Removed Termux boot script: %s\n", bootScript)
		} else {
			fmt.Printf("No Termux boot script found at: %s\n", bootScript)
		}
		return
	}
	fmt.Println("uninstall-boot is tailored for Windows and Termux (Android).")
}
