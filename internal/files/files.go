package files

import (
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	MaxUploadSize   = 100 * 1024 * 1024 // 100 MB
	MaxDownloadSize = 100 * 1024 * 1024 // 100 MB
	MaxDirEntries   = 1000
)

type FileEntry struct {
	Name       string `json:"name"`
	Type       string `json:"type"` // "file" | "directory"
	Size       int64  `json:"size"`
	ModifiedAt string `json:"modifiedAt"`
}

type ListFilesResult struct {
	Files     []FileEntry `json:"files"`
	Truncated bool        `json:"truncated"`
}

func ListFiles(dirPath string) (*ListFilesResult, error) {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, err
	}

	var results []FileEntry
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}
		t := "file"
		if entry.IsDir() {
			t = "directory"
		}
		results = append(results, FileEntry{
			Name:       entry.Name(),
			Type:       t,
			Size:       info.Size(),
			ModifiedAt: info.ModTime().UTC().Format(time.RFC3339),
		})
	}

	sort.Slice(results, func(i, j int) bool {
		if results[i].Type != results[j].Type {
			return results[i].Type == "directory"
		}
		return strings.ToLower(results[i].Name) < strings.ToLower(results[j].Name)
	})

	truncated := len(results) > MaxDirEntries
	if truncated {
		results = results[:MaxDirEntries]
	}

	return &ListFilesResult{
		Files:     results,
		Truncated: truncated,
	}, nil
}

func isContainedIn(target, base string) bool {
	targetClean := filepath.Clean(target)
	baseClean := filepath.Clean(base)
	if targetClean == baseClean {
		return true
	}
	rel, err := filepath.Rel(baseClean, targetClean)
	if err != nil {
		return false
	}
	return !strings.HasPrefix(rel, "..") && rel != "."
}

func ValidatePath(requested, baseCwd string) (string, error) {
	target := requested
	if !filepath.IsAbs(target) {
		target = filepath.Join(baseCwd, target)
	}
	target = filepath.Clean(target)

	realBase, err := filepath.EvalSymlinks(baseCwd)
	if err != nil {
		realBase = baseCwd
	}

	realTarget, err := filepath.EvalSymlinks(target)
	if err != nil {
		return "", err
	}

	if !isContainedIn(realTarget, realBase) {
		return "", errors.New("path traversal forbidden")
	}
	return realTarget, nil
}

func ValidatePathNoSymlink(requested, baseCwd string) (string, error) {
	resolved, err := ValidatePath(requested, baseCwd)
	if err != nil {
		return "", err
	}

	target := requested
	if !filepath.IsAbs(target) {
		target = filepath.Join(baseCwd, target)
	}
	target = filepath.Clean(target)

	fi, err := os.Lstat(target)
	if err != nil {
		return "", err
	}
	if fi.Mode()&os.ModeSymlink != 0 {
		return "", errors.New("symlinks not allowed")
	}
	return resolved, nil
}

func ValidateNewPath(requested, baseCwd string) (string, error) {
	target := requested
	if !filepath.IsAbs(target) {
		target = filepath.Join(baseCwd, target)
	}
	target = filepath.Clean(target)

	realBase, err := filepath.EvalSymlinks(baseCwd)
	if err != nil {
		realBase = baseCwd
	}

	if !isContainedIn(target, realBase) {
		return "", errors.New("path traversal forbidden")
	}
	return target, nil
}
