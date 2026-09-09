package ws

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/huacheng/agy-online/internal/config"
	"github.com/huacheng/agy-online/internal/files"
	"github.com/huacheng/agy-online/internal/idle"
	"github.com/huacheng/agy-online/internal/terminal"
)

const (
	BinTypeOutput            = 0x01
	BinTypeInput             = 0x02
	BinTypeScrollback        = 0x03
	BinTypeScrollbackContent = 0x04
	BinTypeFileChunk         = 0x05
)

type Hub struct {
	mu          sync.RWMutex
	connections map[string]*websocket.Conn
	cfg         *config.Config
}

var (
	defaultHub *Hub
	hubOnce    sync.Once
)

func InitHub(cfg *config.Config) *Hub {
	hubOnce.Do(func() {
		defaultHub = &Hub{
			connections: make(map[string]*websocket.Conn),
			cfg:         cfg,
		}
	})
	return defaultHub
}

func GetHub() *Hub {
	return defaultHub
}

func (h *Hub) HasActiveConnection(sessionName string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.connections[sessionName]
	return ok
}

func (h *Hub) ActiveSessionNames() map[string]bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	res := make(map[string]bool, len(h.connections))
	for k := range h.connections {
		res[k] = true
	}
	return res
}

func (h *Hub) CountForTokenPrefix(prefix string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	count := 0
	for k := range h.connections {
		if strings.HasPrefix(k, prefix) {
			count++
		}
	}
	return count
}

func (h *Hub) notifyConnectionCount() {
	if mgr := idle.GetManager(); mgr != nil {
		mgr.OnConnectionCountChange(len(h.connections))
	}
}

func (h *Hub) setConn(sessionName string, conn *websocket.Conn) *websocket.Conn {
	h.mu.Lock()
	defer h.mu.Unlock()
	old := h.connections[sessionName]
	h.connections[sessionName] = conn
	h.notifyConnectionCount()
	return old
}

func (h *Hub) removeConn(sessionName string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.connections[sessionName] == conn {
		delete(h.connections, sessionName)
		h.notifyConnectionCount()
	}
}

func (h *Hub) CloseSession(sessionName string) {
	h.mu.Lock()
	conn, ok := h.connections[sessionName]
	if ok {
		delete(h.connections, sessionName)
		h.notifyConnectionCount()
	}
	h.mu.Unlock()

	if ok && conn != nil {
		_ = conn.Close(websocket.StatusCode(4004), "Session terminated")
	}
}

type clientMessage struct {
	Type  string `json:"type"`
	Token string `json:"token,omitempty"`
	Data  string `json:"data,omitempty"`
	Cols  int    `json:"cols,omitempty"`
	Rows  int    `json:"rows,omitempty"`
	Path  string `json:"path,omitempty"`
}

type serverMessage struct {
	Type      string  `json:"type"`
	Resumed   bool    `json:"resumed,omitempty"`
	Error     string  `json:"error,omitempty"`
	Timestamp int64   `json:"timestamp,omitempty"`
	Size      int64   `json:"size,omitempty"`
	Mtime     float64 `json:"mtime,omitempty"`
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	opts := &websocket.AcceptOptions{
		InsecureSkipVerify: true, // Allow connections behind proxies / varying Host headers
	}
	conn, err := websocket.Accept(w, r, opts)
	if err != nil {
		log.Printf("[ws] Upgrade error: %v", err)
		return
	}
	defer conn.CloseNow()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	sessionId := r.URL.Query().Get("sessionId")
	if sessionId == "" {
		sessionId = "default"
	}
	if !terminal.IsValidSessionId(sessionId) {
		_ = conn.Close(websocket.StatusCode(4000), "Invalid sessionId")
		return
	}

	cols := 80
	rows := 24
	if c := r.URL.Query().Get("cols"); c != "" {
		if v, err := json.Number(c).Int64(); err == nil && v > 0 {
			cols = int(v)
		}
	}
	if rowsStr := r.URL.Query().Get("rows"); rowsStr != "" {
		if v, err := json.Number(rowsStr).Int64(); err == nil && v > 0 {
			rows = int(v)
		}
	}
	clientCwd := r.URL.Query().Get("cwd")

	authenticated := (h.cfg.AuthToken == "")
	var sessionName string
	var termSession terminal.Session
	var ptyMu sync.Mutex
	var writeMu sync.Mutex

	// Helper to send JSON message
	sendJSON := func(msg serverMessage) {
		b, err := json.Marshal(msg)
		if err != nil {
			return
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		_ = conn.Write(ctx, websocket.MessageText, b)
	}

	// Helper to send binary message
	sendBinary := func(typePrefix byte, payload []byte) error {
		buf := make([]byte, 1+len(payload))
		buf[0] = typePrefix
		copy(buf[1:], payload)
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.Write(ctx, websocket.MessageBinary, buf)
	}

	initSession := func(token string) error {
		sessionName = terminal.BuildSessionName(token, sessionId)
		tokenPrefix := terminal.TokenToSessionName(token) + "-"
		if h.CountForTokenPrefix(tokenPrefix) >= h.cfg.MaxConnections {
			_ = conn.Close(websocket.StatusCode(4005), "Too many connections")
			return errors.New("connection limit reached")
		}

		// Kick previous connection if exists
		if old := h.setConn(sessionName, conn); old != nil {
			log.Printf("[ws] Kicking existing connection for session: %s", sessionName)
			_ = old.Close(websocket.StatusCode(4002), "Replaced by new connection")
		}

		cwd := clientCwd
		if cwd == "" {
			cwd = h.cfg.DefaultWorkingDir
		}

		sess, resumed, err := terminal.Open(sessionName, cwd, cols, rows, h.cfg.StartCommand)
		if err != nil {
			log.Printf("[ws] Failed to open terminal session %s: %v", sessionName, err)
			sendJSON(serverMessage{Type: "error", Error: "Failed to attach terminal"})
			_ = conn.Close(websocket.StatusCode(4003), "PTY attach failed")
			return err
		}

		sendJSON(serverMessage{Type: "connected", Resumed: resumed})

		if scrollback := sess.Scrollback(); scrollback != "" {
			_ = sendBinary(BinTypeScrollback, []byte(scrollback))
		}
		if sess.Mode() == "direct" && !resumed {
			_ = sendBinary(BinTypeOutput, []byte("\r\n[AGY Online] Running in direct PTY mode (tmux not installed)\r\n\r\n"))
		}

		ptyMu.Lock()
		termSession = sess
		ptyMu.Unlock()

		// Read PTY output -> write to WS binary 0x01
		go func() {
			buf := make([]byte, 16384)
			for {
				n, rErr := sess.Read(buf)
				if n > 0 {
					if wErr := sendBinary(BinTypeOutput, buf[:n]); wErr != nil {
						break
					}
				}
				if rErr != nil {
					break
				}
			}
			cancel()
		}()

		return nil
	}

	defer func() {
		if sessionName != "" {
			h.removeConn(sessionName, conn)
		}
		ptyMu.Lock()
		if termSession != nil {
			_ = termSession.Close()
		}
		ptyMu.Unlock()
	}()

	// If no auth required, init right away
	if authenticated {
		if err := initSession("default"); err != nil {
			return
		}
	} else {
		// Wait for first auth message with 5-second timeout
		go func() {
			time.Sleep(5 * time.Second)
			if !authenticated {
				log.Println("[ws] Auth timeout — no auth message received")
				_ = conn.Close(websocket.StatusCode(4001), "Auth timeout")
				cancel()
			}
		}()
	}

	var cancelStream context.CancelFunc

	for {
		msgType, rdr, err := conn.Reader(ctx)
		if err != nil {
			break
		}
		idle.GetManager().RecordActivity()

		if msgType == websocket.MessageBinary {
			if !authenticated {
				_ = conn.Close(websocket.StatusCode(4001), "Auth required")
				break
			}
			prefixBuf := make([]byte, 1)
			if _, err := io.ReadFull(rdr, prefixBuf); err != nil {
				continue
			}
			if prefixBuf[0] == BinTypeInput {
				ptyMu.Lock()
				ts := termSession
				ptyMu.Unlock()
				if ts != nil {
					_, _ = io.Copy(ts, rdr)
				}
			}
			continue
		}

		// Text/JSON control message
		var msg clientMessage
		if err := json.NewDecoder(rdr).Decode(&msg); err != nil {
			continue
		}

		if msg.Type == "auth" {
			if authenticated {
				continue
			}
			if msg.Token == "" || subtle.ConstantTimeCompare([]byte(msg.Token), []byte(h.cfg.AuthToken)) != 1 {
				log.Printf("[ws] Unauthorized token attempt")
				_ = conn.Close(websocket.StatusCode(4001), "Unauthorized")
				break
			}
			authenticated = true
			if err := initSession(msg.Token); err != nil {
				break
			}
			continue
		}

		if !authenticated {
			_ = conn.Close(websocket.StatusCode(4001), "Auth required")
			break
		}

		switch msg.Type {
		case "input":
			ptyMu.Lock()
			ts := termSession
			ptyMu.Unlock()
			if ts != nil {
				_, _ = ts.Write([]byte(msg.Data))
			}
		case "resize":
			colsVal := msg.Cols
			rowsVal := msg.Rows
			if colsVal < 1 {
				colsVal = 80
			}
			if rowsVal < 1 {
				rowsVal = 24
			}
			ptyMu.Lock()
			ts := termSession
			ptyMu.Unlock()
			if ts != nil {
				_ = ts.Resize(colsVal, rowsVal)
			}
		case "ping":
			sendJSON(serverMessage{Type: "pong", Timestamp: time.Now().UnixMilli()})
		case "capture-scrollback":
			ptyMu.Lock()
			ts := termSession
			ptyMu.Unlock()
			scroll := ""
			if ts != nil {
				scroll = ts.Scrollback()
			}
			normalized := strings.ReplaceAll(scroll, "\n", "\r\n")
			_ = sendBinary(BinTypeScrollbackContent, []byte(normalized))
		case "stream-file":
			if cancelStream != nil {
				cancelStream()
				cancelStream = nil
			}
			streamCtx, cancelFn := context.WithCancel(ctx)
			cancelStream = cancelFn

			go func(filePath string) {
				defer cancelFn()
				cwd := terminal.GetCwd(sessionName, h.cfg.DefaultWorkingDir)
				resolved, err := files.ValidatePathNoSymlink(filePath, cwd)
				if err != nil {
					sendJSON(serverMessage{Type: "file-stream-error", Error: "Invalid path"})
					return
				}
				fi, err := os.Stat(resolved)
				if err != nil || fi.IsDir() {
					sendJSON(serverMessage{Type: "file-stream-error", Error: "Not a file"})
					return
				}
				if fi.Size() > 50*1024*1024 {
					sendJSON(serverMessage{Type: "file-stream-error", Error: "File too large (> 50MB)"})
					return
				}

				sendJSON(serverMessage{
					Type:  "file-stream-start",
					Size:  fi.Size(),
					Mtime: float64(fi.ModTime().UnixMilli()),
				})

				f, err := os.Open(resolved)
				if err != nil {
					sendJSON(serverMessage{Type: "file-stream-error", Error: err.Error()})
					return
				}
				defer f.Close()

				buf := make([]byte, 64*1024)
				for {
					select {
					case <-streamCtx.Done():
						return
					default:
					}
					n, err := f.Read(buf)
					if n > 0 {
						if wErr := sendBinary(BinTypeFileChunk, buf[:n]); wErr != nil {
							return
						}
					}
					if err == io.EOF {
						break
					}
					if err != nil {
						sendJSON(serverMessage{Type: "file-stream-error", Error: err.Error()})
						return
					}
				}
				sendJSON(serverMessage{Type: "file-stream-end"})
			}(msg.Path)

		case "cancel-stream":
			if cancelStream != nil {
				cancelStream()
				cancelStream = nil
			}
		}
	}
}
