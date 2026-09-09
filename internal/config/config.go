package config

import (
	"bufio"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	Port              int
	Host              string
	AuthToken         string
	DefaultWorkingDir string
	StartCommand      string
	MaxConnections    int
	DataDir           string
	Version           string
}

func LoadConfig() *Config {
	home, _ := os.UserHomeDir()
	if home == "" {
		home = "/root"
	}

	// Try reading global ~/.agy-online/.env, legacy ~/.ai-cli-online/.env, or .env if exists
	loadDotEnv(filepath.Join(home, ".agy-online", ".env"))
	loadDotEnv(filepath.Join(home, ".ai-cli-online", ".env"))
	loadDotEnv(".env")

	port := 3001
	if p := os.Getenv("PORT"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			port = v
		}
	}

	host := os.Getenv("HOST")
	if host == "" {
		host = "0.0.0.0"
	}

	authToken := os.Getenv("AUTH_TOKEN")

	defaultCwd := os.Getenv("DEFAULT_WORKING_DIR")
	if defaultCwd == "" {
		defaultCwd = home
	}

	maxConn := 10
	if m := os.Getenv("MAX_CONNECTIONS"); m != "" {
		if v, err := strconv.Atoi(m); err == nil && v > 0 {
			maxConn = v
		}
	}

	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		// Prefer ~/.agy-online/data if accessible (or migrate from ~/.ai-cli-online/data)
		userDir := filepath.Join(home, ".agy-online", "data")
		legacyDir := filepath.Join(home, ".ai-cli-online", "data")
		if err := os.MkdirAll(userDir, 0700); err == nil {
			dataDir = userDir
		} else if _, errLegacy := os.Stat(legacyDir); errLegacy == nil {
			dataDir = legacyDir
		} else {
			dataDir = filepath.Join(".", "data")
			_ = os.MkdirAll(dataDir, 0700)
		}
	}

	return &Config{
		Port:              port,
		Host:              host,
		AuthToken:         authToken,
		DefaultWorkingDir: defaultCwd,
		StartCommand:      os.Getenv("START_COMMAND"),
		MaxConnections:    maxConn,
		DataDir:           dataDir,
		Version:           "3.1.0-go",
	}
}

func loadDotEnv(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			k := strings.TrimSpace(parts[0])
			v := strings.TrimSpace(parts[1])
			// Strip quotes if present
			v = strings.Trim(v, `"'`)
			if os.Getenv(k) == "" {
				os.Setenv(k, v)
			}
		}
	}
}
