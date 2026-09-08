package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

type DB struct {
	db *sql.DB
}

type AnnotationResult struct {
	Content   string `json:"content"`
	UpdatedAt int64  `json:"updatedAt"`
}

type Workspace struct {
	Id        string `json:"id"`
	Name      string `json:"name"`
	Path      string `json:"path"`
	IsHome    bool   `json:"isHome"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

type TurnJournalEntry struct {
	Id              string  `json:"id"`
	SessionName     string  `json:"sessionName"`
	ConversationId  string  `json:"conversationId"`
	Prompt          string  `json:"prompt"`
	Status          string  `json:"status"` // "submitted" | "running" | "completed" | "interrupted" | "error"
	FullResponse    string  `json:"fullResponse"`
	ToolCalls       string  `json:"toolCalls"`
	ErrorMessage    string  `json:"errorMessage"`
	DurationSeconds float64 `json:"durationSeconds"`
	TotalTokens     int     `json:"totalTokens"`
	CreatedAt       int64   `json:"createdAt"`
	UpdatedAt       int64   `json:"updatedAt"`
}

func Open(dataDir string) (*DB, error) {
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create data dir: %w", err)
	}

	dbPath := filepath.Join(dataDir, "ai-cli-online.db")
	sqlDb, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database at %s: %w", dbPath, err)
	}

	// Performance and low-memory tuning pragmas
	pragmas := []string{
		"PRAGMA journal_mode = WAL;",
		"PRAGMA synchronous = NORMAL;",
		"PRAGMA cache_size = -2000;", // 2MB cache
		"PRAGMA busy_timeout = 5000;",
	}
	for _, p := range pragmas {
		if _, err := sqlDb.Exec(p); err != nil {
			log.Printf("[db] Warning: pragma %s failed: %v", p, err)
		}
	}

	// Create tables and indexes
	schema := `
	CREATE TABLE IF NOT EXISTS drafts (
		session_name TEXT PRIMARY KEY,
		content TEXT NOT NULL DEFAULT '',
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS settings (
		token_hash TEXT NOT NULL,
		key TEXT NOT NULL,
		value TEXT NOT NULL,
		updated_at INTEGER NOT NULL,
		PRIMARY KEY (token_hash, key)
	);

	CREATE TABLE IF NOT EXISTS annotations (
		session_name TEXT NOT NULL,
		file_path TEXT NOT NULL,
		content TEXT NOT NULL DEFAULT '{}',
		updated_at INTEGER NOT NULL,
		PRIMARY KEY (session_name, file_path)
	);

	CREATE TABLE IF NOT EXISTS workspaces (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		path TEXT NOT NULL UNIQUE,
		is_home INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS turn_journal (
		id TEXT PRIMARY KEY,
		session_name TEXT NOT NULL,
		conversation_id TEXT NOT NULL DEFAULT '',
		prompt TEXT NOT NULL,
		status TEXT NOT NULL,
		full_response TEXT NOT NULL DEFAULT '',
		tool_calls TEXT NOT NULL DEFAULT '[]',
		error_message TEXT NOT NULL DEFAULT '',
		duration_seconds REAL NOT NULL DEFAULT 0,
		total_tokens INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_drafts_updated_at ON drafts(updated_at);
	CREATE INDEX IF NOT EXISTS idx_annotations_updated_at ON annotations(updated_at);
	CREATE INDEX IF NOT EXISTS idx_workspaces_updated_at ON workspaces(updated_at);
	CREATE INDEX IF NOT EXISTS idx_workspaces_is_home ON workspaces(is_home);
	CREATE INDEX IF NOT EXISTS idx_turn_journal_session ON turn_journal(session_name, created_at);
	CREATE INDEX IF NOT EXISTS idx_turn_journal_status ON turn_journal(session_name, status);

	CREATE TABLE IF NOT EXISTS custom_personas (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		role TEXT NOT NULL,
		icon TEXT NOT NULL DEFAULT 'robot',
		color TEXT NOT NULL DEFAULT 'var(--accent-blue)',
		description TEXT NOT NULL DEFAULT '',
		directive TEXT NOT NULL,
		tags TEXT NOT NULL DEFAULT '[]',
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS task_auto (
		session_name TEXT PRIMARY KEY,
		task_dir TEXT NOT NULL UNIQUE,
		status TEXT DEFAULT 'running',
		max_iterations INTEGER DEFAULT 20,
		timeout_minutes INTEGER DEFAULT 30,
		iteration_count INTEGER DEFAULT 0,
		recovery_count_step INTEGER DEFAULT 0,
		recovery_count_total INTEGER DEFAULT 0,
		last_capture_hash TEXT DEFAULT '',
		stall_count INTEGER DEFAULT 0,
		quota_wait_since TEXT DEFAULT '',
		started_at TEXT,
		last_signal_at TEXT
	);
	CREATE INDEX IF NOT EXISTS idx_task_auto_task_dir ON task_auto(task_dir);
	`
	if _, err := sqlDb.Exec(schema); err != nil {
		sqlDb.Close()
		return nil, fmt.Errorf("failed to initialize db schema: %w", err)
	}

	return &DB{db: sqlDb}, nil
}

func (d *DB) Checkpoint() {
	if _, err := d.db.Exec("PRAGMA wal_checkpoint(PASSIVE);"); err != nil {
		log.Printf("[db] wal_checkpoint error: %v", err)
	}
}

func (d *DB) Close() error {
	return d.db.Close()
}

// --- Draft Methods ---

func (d *DB) GetDraft(sessionName string) (string, error) {
	var content string
	err := d.db.QueryRow("SELECT content FROM drafts WHERE session_name = ?", sessionName).Scan(&content)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return content, err
}

func (d *DB) SaveDraft(sessionName, content string) error {
	if content == "" {
		_, err := d.db.Exec("DELETE FROM drafts WHERE session_name = ?", sessionName)
		return err
	}
	now := time.Now().UnixMilli()
	query := `
	INSERT INTO drafts (session_name, content, updated_at) VALUES (?, ?, ?)
	ON CONFLICT(session_name) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
	`
	_, err := d.db.Exec(query, sessionName, content, now)
	return err
}

func (d *DB) DeleteDraft(sessionName string) error {
	_, err := d.db.Exec("DELETE FROM drafts WHERE session_name = ?", sessionName)
	return err
}

// --- Setting Methods ---

func (d *DB) GetSetting(tokenHash, key string) (string, bool, error) {
	var value string
	err := d.db.QueryRow("SELECT value FROM settings WHERE token_hash = ? AND key = ?", tokenHash, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return value, true, nil
}

func (d *DB) SaveSetting(tokenHash, key, value string) error {
	now := time.Now().UnixMilli()
	query := `
	INSERT INTO settings (token_hash, key, value, updated_at) VALUES (?, ?, ?, ?)
	ON CONFLICT(token_hash, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
	`
	_, err := d.db.Exec(query, tokenHash, key, value, now)
	return err
}

// --- Annotation Methods ---

func (d *DB) GetAnnotation(sessionName, filePath string) (*AnnotationResult, error) {
	var content string
	var updatedAt int64
	err := d.db.QueryRow("SELECT content, updated_at FROM annotations WHERE session_name = ? AND file_path = ?",
		sessionName, filePath).Scan(&content, &updatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &AnnotationResult{Content: content, UpdatedAt: updatedAt}, nil
}

func (d *DB) SaveAnnotation(sessionName, filePath, content string, updatedAt int64) error {
	if content == "" || content == "{}" || content == `{"additions":[],"deletions":[]}` {
		_, err := d.db.Exec("DELETE FROM annotations WHERE session_name = ? AND file_path = ?", sessionName, filePath)
		return err
	}
	if updatedAt <= 0 {
		updatedAt = time.Now().UnixMilli()
	}
	query := `
	INSERT INTO annotations (session_name, file_path, content, updated_at) VALUES (?, ?, ?, ?)
	ON CONFLICT(session_name, file_path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
	`
	_, err := d.db.Exec(query, sessionName, filePath, content, updatedAt)
	return err
}

// --- Workspace Methods ---

func (d *DB) ListWorkspaces() ([]Workspace, error) {
	rows, err := d.db.Query("SELECT id, name, path, is_home, created_at, updated_at FROM workspaces ORDER BY is_home DESC, updated_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Workspace
	for rows.Next() {
		var w Workspace
		var isHomeInt int
		if err := rows.Scan(&w.Id, &w.Name, &w.Path, &isHomeInt, &w.CreatedAt, &w.UpdatedAt); err != nil {
			return nil, err
		}
		w.IsHome = isHomeInt == 1
		list = append(list, w)
	}
	if list == nil {
		list = []Workspace{}
	}
	return list, nil
}

func (d *DB) AddWorkspace(id, name, path string, isHome bool) (*Workspace, error) {
	now := time.Now().UnixMilli()
	isHomeInt := 0
	if isHome {
		isHomeInt = 1
	}
	query := `
	INSERT INTO workspaces (id, name, path, is_home, created_at, updated_at)
	VALUES (?, ?, ?, ?, ?, ?)
	ON CONFLICT(path) DO UPDATE SET
		name = excluded.name,
		updated_at = excluded.updated_at
	`
	_, err := d.db.Exec(query, id, name, path, isHomeInt, now, now)
	if err != nil {
		return nil, err
	}
	return &Workspace{
		Id:        id,
		Name:      name,
		Path:      path,
		IsHome:    isHome,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (d *DB) DeleteWorkspace(id string) error {
	_, err := d.db.Exec("DELETE FROM workspaces WHERE id = ? AND is_home = 0", id)
	return err
}

func (d *DB) GetWorkspaceByPath(path string) (*Workspace, error) {
	var w Workspace
	var isHomeInt int
	err := d.db.QueryRow("SELECT id, name, path, is_home, created_at, updated_at FROM workspaces WHERE path = ?", path).
		Scan(&w.Id, &w.Name, &w.Path, &isHomeInt, &w.CreatedAt, &w.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	w.IsHome = isHomeInt == 1
	return &w, nil
}

func (d *DB) GetWorkspaceById(id string) (*Workspace, error) {
	var w Workspace
	var isHomeInt int
	err := d.db.QueryRow("SELECT id, name, path, is_home, created_at, updated_at FROM workspaces WHERE id = ?", id).
		Scan(&w.Id, &w.Name, &w.Path, &isHomeInt, &w.CreatedAt, &w.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	w.IsHome = isHomeInt == 1
	return &w, nil
}

// --- Turn Journal Methods ---

func (d *DB) CreateTurnJournal(entry TurnJournalEntry) error {
	now := time.Now().UnixMilli()
	if entry.CreatedAt <= 0 {
		entry.CreatedAt = now
	}
	if entry.UpdatedAt <= 0 {
		entry.UpdatedAt = now
	}
	if entry.ToolCalls == "" {
		entry.ToolCalls = "[]"
	}
	query := `
	INSERT INTO turn_journal (
		id, session_name, conversation_id, prompt, status, full_response,
		tool_calls, error_message, duration_seconds, total_tokens, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	_, err := d.db.Exec(query,
		entry.Id, entry.SessionName, entry.ConversationId, entry.Prompt, entry.Status,
		entry.FullResponse, entry.ToolCalls, entry.ErrorMessage, entry.DurationSeconds,
		entry.TotalTokens, entry.CreatedAt, entry.UpdatedAt,
	)
	return err
}

func (d *DB) UpdateTurnJournal(id string, status string, response string, toolCalls string, errorMsg string, duration float64, tokens int) error {
	now := time.Now().UnixMilli()
	query := `
	UPDATE turn_journal SET
		status = ?,
		full_response = CASE WHEN ? != '' THEN ? ELSE full_response END,
		tool_calls = CASE WHEN ? != '' THEN ? ELSE tool_calls END,
		error_message = CASE WHEN ? != '' THEN ? ELSE error_message END,
		duration_seconds = CASE WHEN ? > 0 THEN ? ELSE duration_seconds END,
		total_tokens = CASE WHEN ? > 0 THEN ? ELSE total_tokens END,
		updated_at = ?
	WHERE id = ?
	`
	_, err := d.db.Exec(query, status, response, response, toolCalls, toolCalls, errorMsg, errorMsg, duration, duration, tokens, tokens, now, id)
	return err
}

func (d *DB) GetSessionJournal(sessionName string) ([]TurnJournalEntry, error) {
	query := `
	SELECT id, session_name, conversation_id, prompt, status, full_response,
	       tool_calls, error_message, duration_seconds, total_tokens, created_at, updated_at
	FROM turn_journal
	WHERE session_name = ?
	ORDER BY created_at ASC
	`
	rows, err := d.db.Query(query, sessionName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []TurnJournalEntry
	for rows.Next() {
		var e TurnJournalEntry
		if err := rows.Scan(
			&e.Id, &e.SessionName, &e.ConversationId, &e.Prompt, &e.Status,
			&e.FullResponse, &e.ToolCalls, &e.ErrorMessage, &e.DurationSeconds,
			&e.TotalTokens, &e.CreatedAt, &e.UpdatedAt,
		); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

func (d *DB) GetActiveTurn(sessionName string) (*TurnJournalEntry, error) {
	query := `
	SELECT id, session_name, conversation_id, prompt, status, full_response,
	       tool_calls, error_message, duration_seconds, total_tokens, created_at, updated_at
	FROM turn_journal
	WHERE session_name = ? AND status IN ('submitted', 'running')
	ORDER BY created_at DESC
	LIMIT 1
	`
	var e TurnJournalEntry
	err := d.db.QueryRow(query, sessionName).Scan(
		&e.Id, &e.SessionName, &e.ConversationId, &e.Prompt, &e.Status,
		&e.FullResponse, &e.ToolCalls, &e.ErrorMessage, &e.DurationSeconds,
		&e.TotalTokens, &e.CreatedAt, &e.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (d *DB) MarkInterruptedTurns(sessionName string) (int64, error) {
	now := time.Now().UnixMilli()
	query := `
	UPDATE turn_journal
	SET status = 'interrupted', updated_at = ?
	WHERE session_name = ? AND status IN ('submitted', 'running')
	`
	res, err := d.db.Exec(query, now, sessionName)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (d *DB) MarkAllActiveTurnsInterrupted() (int64, error) {
	now := time.Now().UnixMilli()
	query := `
	UPDATE turn_journal
	SET status = 'interrupted', updated_at = ?
	WHERE status IN ('submitted', 'running')
	`
	res, err := d.db.Exec(query, now)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// --- Custom Persona Methods ---

type CustomPersonaRow struct {
	Id          string `json:"id"`
	Name        string `json:"name"`
	Role        string `json:"role"`
	Icon        string `json:"icon"`
	Color       string `json:"color"`
	Description string `json:"description"`
	Directive   string `json:"directive"`
	Tags        string `json:"tags"`
	CreatedAt   int64  `json:"createdAt"`
	UpdatedAt   int64  `json:"updatedAt"`
}

func (d *DB) ListCustomPersonas() ([]CustomPersonaRow, error) {
	if d == nil || d.db == nil {
		return nil, nil
	}
	rows, err := d.db.Query("SELECT id, name, role, icon, color, description, directive, tags, created_at, updated_at FROM custom_personas ORDER BY created_at ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []CustomPersonaRow
	for rows.Next() {
		var p CustomPersonaRow
		if err := rows.Scan(&p.Id, &p.Name, &p.Role, &p.Icon, &p.Color, &p.Description, &p.Directive, &p.Tags, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, nil
}

func (d *DB) SaveCustomPersona(p CustomPersonaRow) error {
	if d == nil || d.db == nil {
		return nil
	}
	now := time.Now().UnixMilli()
	if p.CreatedAt == 0 {
		p.CreatedAt = now
	}
	p.UpdatedAt = now

	query := `
	INSERT INTO custom_personas (id, name, role, icon, color, description, directive, tags, created_at, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(id) DO UPDATE SET
		name = excluded.name,
		role = excluded.role,
		icon = excluded.icon,
		color = excluded.color,
		description = excluded.description,
		directive = excluded.directive,
		tags = excluded.tags,
		updated_at = excluded.updated_at
	`
	_, err := d.db.Exec(query, p.Id, p.Name, p.Role, p.Icon, p.Color, p.Description, p.Directive, p.Tags, p.CreatedAt, p.UpdatedAt)
	return err
}

func (d *DB) GetCustomPersona(id string) (*CustomPersonaRow, error) {
	if d == nil || d.db == nil {
		return nil, nil
	}
	var p CustomPersonaRow
	err := d.db.QueryRow("SELECT id, name, role, icon, color, description, directive, tags, created_at, updated_at FROM custom_personas WHERE id = ?", id).
		Scan(&p.Id, &p.Name, &p.Role, &p.Icon, &p.Color, &p.Description, &p.Directive, &p.Tags, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

