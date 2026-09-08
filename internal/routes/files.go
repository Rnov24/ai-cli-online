package routes

import (
	"archive/tar"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/huacheng/ai-cli-online/internal/files"
	"github.com/huacheng/ai-cli-online/internal/terminal"
)

type FileHandler struct {
	auth *AuthHelper
}

func NewFileHandler(auth *AuthHelper) *FileHandler {
	return &FileHandler{auth: auth}
}

func (f *FileHandler) ListFiles(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := f.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	cwd := terminal.GetCwd(sessionName, f.auth.cfg.DefaultWorkingDir)
	subPath := r.URL.Query().Get("path")

	targetDir := cwd
	if subPath != "" {
		resolved, err := files.ValidatePath(subPath, cwd)
		if err != nil {
			home, _ := os.UserHomeDir()
			resolved, err = files.ValidatePath(subPath, home)
		}
		if err != nil {
			http.Error(w, `{"error":"Invalid path"}`, http.StatusBadRequest)
			return
		}
		targetDir = resolved
	}

	res, err := files.ListFiles(targetDir)
	if err != nil {
		http.Error(w, `{"error":"Failed to list files"}`, http.StatusInternalServerError)
		return
	}

	home, _ := os.UserHomeDir()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"cwd":       targetDir,
		"home":      home,
		"files":     res.Files,
		"truncated": res.Truncated,
	})
}

func (f *FileHandler) Upload(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := f.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	cwd := terminal.GetCwd(sessionName, f.auth.cfg.DefaultWorkingDir)

	if err := r.ParseMultipartForm(files.MaxUploadSize); err != nil {
		http.Error(w, `{"error":"Upload payload too large"}`, http.StatusRequestEntityTooLarge)
		return
	}

	if r.MultipartForm == nil || len(r.MultipartForm.File["files"]) == 0 {
		http.Error(w, `{"error":"No files provided"}`, http.StatusBadRequest)
		return
	}

	var uploaded []map[string]any
	for _, fileHeader := range r.MultipartForm.File["files"] {
		safeName := filepath.Base(fileHeader.Filename)
		if safeName == "" || safeName == "." || safeName == ".." {
			continue
		}
		destPath := filepath.Join(cwd, safeName)

		src, err := fileHeader.Open()
		if err != nil {
			continue
		}

		dst, err := os.Create(destPath)
		if err != nil {
			src.Close()
			continue
		}

		size, err := io.Copy(dst, src)
		src.Close()
		dst.Close()
		if err == nil {
			uploaded = append(uploaded, map[string]any{
				"name": safeName,
				"size": size,
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"uploaded": uploaded})
}

func (f *FileHandler) Download(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := f.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	filePath := r.URL.Query().Get("path")
	if filePath == "" {
		http.Error(w, `{"error":"path query parameter required"}`, http.StatusBadRequest)
		return
	}

	cwd := terminal.GetCwd(sessionName, f.auth.cfg.DefaultWorkingDir)
	resolved, err := files.ValidatePathNoSymlink(filePath, cwd)
	if err != nil {
		http.Error(w, `{"error":"Invalid path"}`, http.StatusBadRequest)
		return
	}

	fi, err := os.Stat(resolved)
	if err != nil || fi.IsDir() {
		http.Error(w, `{"error":"Not a file"}`, http.StatusBadRequest)
		return
	}
	if fi.Size() > files.MaxDownloadSize {
		http.Error(w, `{"error":"File too large (max 100MB)"}`, http.StatusRequestEntityTooLarge)
		return
	}

	fileName := filepath.Base(resolved)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", url.QueryEscape(fileName)))
	w.Header().Set("Content-Length", strconv.FormatInt(fi.Size(), 10))
	http.ServeFile(w, r, resolved)
}

func (f *FileHandler) DownloadCwd(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := f.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	cwd := terminal.GetCwd(sessionName, f.auth.cfg.DefaultWorkingDir)
	dirName := filepath.Base(cwd)

	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s.tar.gz\"", url.QueryEscape(dirName)))

	gw := gzip.NewWriter(w)
	defer gw.Close()
	tw := tar.NewWriter(gw)
	defer tw.Close()

	_ = filepath.Walk(cwd, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		rel, err := filepath.Rel(cwd, path)
		if err != nil || rel == "." {
			return nil
		}

		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return nil
		}
		header.Name = rel

		// Handle symlinks
		if info.Mode()&os.ModeSymlink != 0 {
			linkTarget, err := os.Readlink(path)
			if err != nil {
				return nil
			}
			header.Linkname = linkTarget
			header.Size = 0
			return tw.WriteHeader(header)
		}

		if err := tw.WriteHeader(header); err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}

		file, err := os.Open(path)
		if err != nil {
			return nil
		}
		_, _ = io.Copy(tw, file)
		_ = file.Close()
		return nil
	})
}

func (f *FileHandler) Touch(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := f.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" || strings.Contains(req.Name, "..") {
		http.Error(w, `{"error":"Invalid filename"}`, http.StatusBadRequest)
		return
	}

	cwd := terminal.GetCwd(sessionName, f.auth.cfg.DefaultWorkingDir)
	resolved, err := files.ValidateNewPath(req.Name, cwd)
	if err != nil {
		http.Error(w, `{"error":"Invalid path"}`, http.StatusBadRequest)
		return
	}

	_ = os.MkdirAll(filepath.Dir(resolved), 0755)
	file, err := os.OpenFile(resolved, os.O_RDWR|os.O_CREATE|os.O_EXCL, 0644)
	if os.IsExist(err) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "existed": true, "path": resolved})
		return
	}
	if err != nil {
		http.Error(w, `{"error":"Failed to create file"}`, http.StatusInternalServerError)
		return
	}
	_ = file.Close()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": resolved})
}

func (f *FileHandler) Mkdir(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := f.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Path == "" || strings.Contains(req.Path, "..") {
		http.Error(w, `{"error":"Invalid path"}`, http.StatusBadRequest)
		return
	}

	cwd := terminal.GetCwd(sessionName, f.auth.cfg.DefaultWorkingDir)
	resolved, err := files.ValidateNewPath(req.Path, cwd)
	if err != nil {
		http.Error(w, `{"error":"Invalid path"}`, http.StatusBadRequest)
		return
	}

	if err := os.MkdirAll(resolved, 0755); err != nil {
		http.Error(w, `{"error":"Failed to create directory"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": resolved})
}

func (f *FileHandler) Rm(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := f.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid path"}`, http.StatusBadRequest)
		return
	}
	cleanReq := filepath.Clean(strings.TrimSpace(req.Path))
	if cleanReq == "" || cleanReq == "." || cleanReq == "/" || cleanReq == "\\" || strings.Contains(req.Path, "..") {
		http.Error(w, `{"error":"Invalid path"}`, http.StatusBadRequest)
		return
	}

	cwd := terminal.GetCwd(sessionName, f.auth.cfg.DefaultWorkingDir)
	resolved, err := files.ValidatePath(req.Path, cwd)
	if err != nil {
		http.Error(w, `{"error":"Invalid path"}`, http.StatusBadRequest)
		return
	}

	home, _ := os.UserHomeDir()
	if resolved == cwd || resolved == filepath.Clean(cwd) || (home != "" && resolved == filepath.Clean(home)) {
		http.Error(w, `{"error":"Cannot delete workspace or home directory root"}`, http.StatusBadRequest)
		return
	}

	if err := os.RemoveAll(resolved); err != nil {
		http.Error(w, `{"error":"Failed to delete"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func (f *FileHandler) GetFileContent(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := f.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	filePath := r.URL.Query().Get("path")
	if filePath == "" {
		http.Error(w, `{"error":"path query parameter required"}`, http.StatusBadRequest)
		return
	}

	cwd := terminal.GetCwd(sessionName, f.auth.cfg.DefaultWorkingDir)
	resolved, err := files.ValidatePathNoSymlink(filePath, cwd)
	if err != nil {
		home, _ := os.UserHomeDir()
		resolved, err = files.ValidatePathNoSymlink(filePath, home)
	}
	if err != nil {
		http.Error(w, `{"error":"Invalid path"}`, http.StatusBadRequest)
		return
	}

	fi, err := os.Stat(resolved)
	if err != nil || fi.IsDir() {
		http.Error(w, `{"error":"Not a file"}`, http.StatusBadRequest)
		return
	}
	if fi.Size() > 10*1024*1024 {
		http.Error(w, `{"error":"File too large (max 10MB)"}`, http.StatusRequestEntityTooLarge)
		return
	}

	mtimeMs := float64(fi.ModTime().UnixMilli())
	if sinceStr := r.URL.Query().Get("since"); sinceStr != "" {
		if since, err := strconv.ParseFloat(sinceStr, 64); err == nil && since > 0 {
			if mtimeMs <= since {
				w.WriteHeader(http.StatusNotModified)
				return
			}
		}
	}

	data, err := os.ReadFile(resolved)
	if err != nil {
		http.Error(w, `{"error":"Failed to read file"}`, http.StatusInternalServerError)
		return
	}

	ext := strings.ToLower(filepath.Ext(resolved))
	isBinary := (ext == ".pdf" || ext == ".png" || ext == ".jpg" || ext == ".jpeg" ||
		ext == ".gif" || ext == ".webp" || ext == ".ico" || ext == ".bmp")

	content := string(data)
	encoding := "utf-8"
	if isBinary {
		content = base64.StdEncoding.EncodeToString(data)
		encoding = "base64"
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"content":  content,
		"mtime":    mtimeMs,
		"size":     fi.Size(),
		"encoding": encoding,
	})
}
