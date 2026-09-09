package agy

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/creack/pty"
)

var (
	// CustomAgyBin allows overriding agy binary path for testing
	CustomAgyBin string

	authFlowsMu sync.Mutex
	authFlows   = make(map[string]*AuthFlow)
	oauthURLRe  = regexp.MustCompile(`https://accounts\.google\.com/o/oauth2/\S+`)
)

type AuthFlow struct {
	ID          string
	ProfileName string
	TempHome    string
	Cmd         *exec.Cmd
	Ptmx        *os.File
	Stdin       io.WriteCloser
	AuthURL     string
	DoneChan    chan error
	CreatedAt   time.Time

	outputMu sync.Mutex
	output   strings.Builder
}

func (f *AuthFlow) appendOutput(s string) {
	f.outputMu.Lock()
	defer f.outputMu.Unlock()
	f.output.WriteString(s)
}

func (f *AuthFlow) getOutput() string {
	f.outputMu.Lock()
	defer f.outputMu.Unlock()
	return f.output.String()
}

type AuthFlowResponse struct {
	FlowID                 string `json:"flowId"`
	ProfileName            string `json:"profileName"`
	AuthURL                string `json:"authUrl,omitempty"`
	ManualTerminalCommand  string `json:"manualTerminalCommand"`
	Message                string `json:"message,omitempty"`
}

func generateFlowID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return fmt.Sprintf("flow-%d-%s", time.Now().Unix(), hex.EncodeToString(b))
}

func getAgyBinary() (string, error) {
	if CustomAgyBin != "" {
		return CustomAgyBin, nil
	}
	bin := ResolveAgyBinary()
	if bin != "" {
		return bin, nil
	}
	path, err := exec.LookPath("agy")
	if err != nil {
		return "", errors.New("agy command not found in PATH")
	}
	return path, nil
}

// StartAuthFlow initiates an agy login session in an isolated temporary HOME directory,
// capturing the Google OAuth authorization URL from stdout or stderr.
func StartAuthFlow(profileName string) (*AuthFlowResponse, error) {
	profileMu.Lock()
	profileName = strings.TrimSpace(profileName)
	if !validNameRe.MatchString(profileName) {
		profileMu.Unlock()
		return nil, fmt.Errorf("invalid profile name: %s", profileName)
	}
	profileMu.Unlock()

	manualCmd := fmt.Sprintf("bash scripts/agy-profile.sh add %s", profileName)

	bin, err := getAgyBinary()
	if err != nil {
		return &AuthFlowResponse{
			FlowID:                "",
			ProfileName:           profileName,
			ManualTerminalCommand: manualCmd,
			Message:               "agy binary not found in PATH. Use terminal or paste token directly.",
		}, nil
	}

	tempHome, err := os.MkdirTemp("", "agy-auth-home-*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temporary home directory: %w", err)
	}

	cmd := exec.Command(bin, "--print", "login")
	cmd.Dir = tempHome
	var env []string
	for _, e := range os.Environ() {
		if !strings.HasPrefix(e, "HOME=") && !strings.HasPrefix(e, "USERPROFILE=") {
			env = append(env, e)
		}
	}
	env = append(env, fmt.Sprintf("HOME=%s", tempHome), fmt.Sprintf("USERPROFILE=%s", tempHome))
	cmd.Env = env

	flowID := generateFlowID()
	flow := &AuthFlow{
		ID:          flowID,
		ProfileName: profileName,
		TempHome:    tempHome,
		Cmd:         cmd,
		DoneChan:    make(chan error, 1),
		CreatedAt:   time.Now(),
	}

	urlChan := make(chan string, 1)
	errChan := make(chan error, 2)

	// Try starting agy with a pseudo-terminal (PTY) so agy detects an interactive TTY
	// even when running inside a background daemon without a controlling terminal.
	ptmx, ptyErr := pty.StartWithSize(cmd, &pty.Winsize{Rows: 24, Cols: 80})
	if ptyErr == nil {
		flow.Ptmx = ptmx
		log.Printf("[auth_helper] Launched %s --print login in PTY with HOME=%s", bin, tempHome)

		go func() {
			buf := make([]byte, 2048)
			urlFound := false
			for {
				n, err := ptmx.Read(buf)
				if n > 0 {
					chunk := string(buf[:n])
					flow.appendOutput(chunk)
					log.Printf("[auth_helper] pty: %s", strings.TrimSpace(chunk))
					if !urlFound {
						if match := oauthURLRe.FindString(chunk); match != "" {
							urlFound = true
							cleanURL := strings.TrimRight(match, "\r\n\t \"'")
							select {
							case urlChan <- cleanURL:
							default:
							}
						}
					}
				}
				if err != nil {
					if !urlFound {
						select {
						case errChan <- fmt.Errorf("agy exited before generating URL: %w", err):
						default:
						}
					}
					break
				}
			}
		}()
	} else {
		log.Printf("[auth_helper] pty.StartWithSize failed (%v), falling back to standard pipes", ptyErr)
		stdin, err := cmd.StdinPipe()
		if err != nil {
			_ = os.RemoveAll(tempHome)
			return nil, fmt.Errorf("failed to open stdin pipe: %w", err)
		}
		flow.Stdin = stdin

		stdoutPipe, err := cmd.StdoutPipe()
		if err != nil {
			_ = stdin.Close()
			_ = os.RemoveAll(tempHome)
			return nil, fmt.Errorf("failed to open stdout pipe: %w", err)
		}

		stderrPipe, err := cmd.StderrPipe()
		if err != nil {
			_ = stdin.Close()
			_ = stdoutPipe.Close()
			_ = os.RemoveAll(tempHome)
			return nil, fmt.Errorf("failed to open stderr pipe: %w", err)
		}

		if err := cmd.Start(); err != nil {
			_ = stdin.Close()
			_ = os.RemoveAll(tempHome)
			return nil, fmt.Errorf("failed to start agy: %w", err)
		}

		var streamsWg sync.WaitGroup
		streamsWg.Add(2)

		scanStream := func(name string, r io.Reader) {
			defer streamsWg.Done()
			scanner := bufio.NewScanner(r)
			for scanner.Scan() {
				line := scanner.Text()
				log.Printf("[auth_helper] %s: %s", name, line)
				if match := oauthURLRe.FindString(line); match != "" {
					cleanURL := strings.TrimRight(match, "\r\n\t \"'")
					select {
					case urlChan <- cleanURL:
					default:
					}
					return
				}
			}
			if err := scanner.Err(); err != nil {
				log.Printf("[auth_helper] %s scanner err: %v", name, err)
			}
		}

		go scanStream("stdout", stdoutPipe)
		go scanStream("stderr", stderrPipe)

		go func() {
			streamsWg.Wait()
			select {
			case errChan <- errors.New("agy process completed without generating URL"):
			default:
			}
		}()
	}

	select {
	case url := <-urlChan:
		flow.AuthURL = url
		authFlowsMu.Lock()
		authFlows[flowID] = flow
		authFlowsMu.Unlock()

		// Background watcher to reap process on abandonment after 5 minutes
		go func() {
			time.Sleep(5 * time.Minute)
			CancelAuthFlow(flowID)
		}()

		return &AuthFlowResponse{
			FlowID:                flowID,
			ProfileName:           profileName,
			AuthURL:               url,
			ManualTerminalCommand: manualCmd,
		}, nil

	case err := <-errChan:
		_ = cmd.Process.Kill()
		_ = os.RemoveAll(tempHome)
		return &AuthFlowResponse{
			FlowID:                "",
			ProfileName:           profileName,
			ManualTerminalCommand: manualCmd,
			Message:               fmt.Sprintf("OAuth URL not detected (%v). Please use terminal login or direct token paste.", err),
		}, nil

	case <-time.After(15 * time.Second):
		_ = cmd.Process.Kill()
		_ = os.RemoveAll(tempHome)
		return &AuthFlowResponse{
			FlowID:                "",
			ProfileName:           profileName,
			ManualTerminalCommand: manualCmd,
			Message:               "OAuth URL detection timed out after 15s. Please use terminal login or direct token paste.",
		}, nil
	}
}

// SubmitAuthCode submits the user-provided Google OAuth authorization code to agy's stdin.
func SubmitAuthCode(flowID, profileName, code string) error {
	code = strings.TrimSpace(code)
	if code == "" {
		return errors.New("authorization code cannot be empty")
	}

	authFlowsMu.Lock()
	flow, ok := authFlows[flowID]
	if !ok {
		authFlowsMu.Unlock()
		return fmt.Errorf("auth flow %q not found or has expired", flowID)
	}
	delete(authFlows, flowID)
	authFlowsMu.Unlock()

	defer func() {
		if flow.Ptmx != nil {
			_ = flow.Ptmx.Close()
		}
		if flow.Stdin != nil {
			_ = flow.Stdin.Close()
		}
		if flow.TempHome != "" {
			_ = os.RemoveAll(flow.TempHome)
		}
	}()

	// Send code + newline to PTY master or stdin pipe
	var writeErr error
	if flow.Ptmx != nil {
		_, writeErr = fmt.Fprintf(flow.Ptmx, "%s\n", code)
	} else if flow.Stdin != nil {
		_, writeErr = fmt.Fprintf(flow.Stdin, "%s\n", code)
	} else {
		writeErr = errors.New("no active input stream to auth process")
	}
	if writeErr != nil {
		_ = flow.Cmd.Process.Kill()
		return fmt.Errorf("failed to submit authorization code to process: %w", writeErr)
	}

	pName := profileName
	if pName == "" {
		pName = flow.ProfileName
	}

	tempTokenPath := filepath.Join(flow.TempHome, ".gemini", "antigravity-cli", "antigravity-oauth-token")

	// Wait loop: poll for token file or process completion every 200ms
	waitDone := make(chan error, 1)
	go func() {
		waitDone <- flow.Cmd.Wait()
	}()

	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()
	timeout := time.After(20 * time.Second)

	for {
		select {
		case err := <-waitDone:
			// Process exited. Check if token file was created
			tokenBytes, readErr := os.ReadFile(tempTokenPath)
			if readErr == nil && len(tokenBytes) > 10 {
				log.Printf("[auth_helper] Token file found after process exit (%d bytes)", len(tokenBytes))
				return ImportProfile(pName, string(tokenBytes))
			}
			out := flow.getOutput()
			log.Printf("[auth_helper] agy exited (err: %v). Output: %s", err, out)
			if strings.Contains(out, "invalid_grant") || strings.Contains(out, "Malformed") {
				return errors.New("Google rejected this authorization code (it may be expired, malformed, or already used). Please generate a fresh link, click it to get a new code, and paste the new code.")
			}
			return fmt.Errorf("Google authentication failed (token not generated). Output: %s", strings.TrimSpace(out))

		case <-ticker.C:
			// Token file may appear while agy is still running
			if tokenBytes, readErr := os.ReadFile(tempTokenPath); readErr == nil && len(tokenBytes) > 10 {
				log.Printf("[auth_helper] Token file detected while process running (%d bytes), saving profile", len(tokenBytes))
				_ = flow.Cmd.Process.Kill()
				return ImportProfile(pName, string(tokenBytes))
			}

		case <-timeout:
			_ = flow.Cmd.Process.Kill()
			out := flow.getOutput()
			log.Printf("[auth_helper] SubmitAuthCode timed out after 20s. Output: %s", out)
			return errors.New("Timed out waiting for Google authentication to complete. Please ensure you copied the code from the newly generated link.")
		}
	}
}

// CancelAuthFlow terminates an in-flight auth flow and cleans up its temporary files.
func CancelAuthFlow(flowID string) {
	authFlowsMu.Lock()
	flow, ok := authFlows[flowID]
	if ok {
		delete(authFlows, flowID)
	}
	authFlowsMu.Unlock()

	if ok && flow != nil {
		if flow.Ptmx != nil {
			_ = flow.Ptmx.Close()
		}
		if flow.Stdin != nil {
			_ = flow.Stdin.Close()
		}
		if flow.Cmd != nil && flow.Cmd.Process != nil {
			_ = flow.Cmd.Process.Kill()
		}
		if flow.TempHome != "" {
			_ = os.RemoveAll(flow.TempHome)
		}
	}
}
