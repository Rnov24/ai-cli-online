package agy

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
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
	Stdin       io.WriteCloser
	AuthURL     string
	DoneChan    chan error
	CreatedAt   time.Time
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
	path, err := exec.LookPath("agy")
	if err != nil {
		return "", errors.New("agy command not found in PATH")
	}
	return path, nil
}

// StartAuthFlow initiates an agy login session in an isolated temporary HOME directory,
// capturing the Google OAuth authorization URL from stdout.
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
	cmd.Env = append(os.Environ(), fmt.Sprintf("HOME=%s", tempHome))

	stdin, err := cmd.StdinPipe()
	if err != nil {
		_ = os.RemoveAll(tempHome)
		return nil, fmt.Errorf("failed to open stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		_ = os.RemoveAll(tempHome)
		return nil, fmt.Errorf("failed to open stdout pipe: %w", err)
	}
	cmd.Stderr = cmd.Stdout // merge stderr into stdout pipe if needed

	if err := cmd.Start(); err != nil {
		_ = stdin.Close()
		_ = os.RemoveAll(tempHome)
		return nil, fmt.Errorf("failed to start agy: %w", err)
	}

	flowID := generateFlowID()
	flow := &AuthFlow{
		ID:          flowID,
		ProfileName: profileName,
		TempHome:    tempHome,
		Cmd:         cmd,
		Stdin:       stdin,
		DoneChan:    make(chan error, 1),
		CreatedAt:   time.Now(),
	}

	// Read lines to find OAuth URL with timeout
	urlChan := make(chan string, 1)
	errChan := make(chan error, 1)

	go func() {
		reader := bufio.NewReader(stdout)
		for {
			line, rErr := reader.ReadString('\n')
			if match := oauthURLRe.FindString(line); match != "" {
				urlChan <- match
				break
			}
			if rErr != nil {
				if rErr != io.EOF {
					errChan <- rErr
				} else {
					errChan <- errors.New("EOF reached without finding Google OAuth URL")
				}
				return
			}
		}
	}()

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

	case <-time.After(8 * time.Second):
		_ = cmd.Process.Kill()
		_ = os.RemoveAll(tempHome)
		return &AuthFlowResponse{
			FlowID:                "",
			ProfileName:           profileName,
			ManualTerminalCommand: manualCmd,
			Message:               "OAuth URL detection timed out. Please use terminal login or direct token paste.",
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
		if flow.TempHome != "" {
			_ = os.RemoveAll(flow.TempHome)
		}
	}()

	// Send code + newline to stdin
	if _, err := fmt.Fprintf(flow.Stdin, "%s\n", code); err != nil {
		_ = flow.Cmd.Process.Kill()
		return fmt.Errorf("failed to submit authorization code to process: %w", err)
	}

	// Wait up to 15 seconds for process to finish
	waitDone := make(chan error, 1)
	go func() {
		waitDone <- flow.Cmd.Wait()
	}()

	select {
	case <-waitDone:
		// process completed
	case <-time.After(15 * time.Second):
		_ = flow.Cmd.Process.Kill()
		return errors.New("timed out waiting for Google authentication to complete")
	}

	// Check if token was written in isolated home
	tempTokenPath := filepath.Join(flow.TempHome, ".gemini", "antigravity-cli", "antigravity-oauth-token")
	tokenBytes, err := os.ReadFile(tempTokenPath)
	if err != nil {
		return fmt.Errorf("Google authentication failed or token file was not generated: %w", err)
	}

	// Save to real profiles directory and activate
	pName := profileName
	if pName == "" {
		pName = flow.ProfileName
	}
	return ImportProfile(pName, string(tokenBytes))
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
		if flow.Cmd != nil && flow.Cmd.Process != nil {
			_ = flow.Cmd.Process.Kill()
		}
		if flow.TempHome != "" {
			_ = os.RemoveAll(flow.TempHome)
		}
	}
}
