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

	CREATE INDEX IF NOT EXISTS idx_drafts_updated_at ON drafts(updated_at);
	CREATE INDEX IF NOT EXISTS idx_annotations_updated_at ON annotations(updated_at);
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
