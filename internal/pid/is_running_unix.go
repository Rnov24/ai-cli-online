//go:build !windows

package pid

import (
	"os"
	"syscall"
)

func IsPidRunning(pid int) bool {
	if pid <= 0 {
		return false
	}
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// On Unix, sending signal 0 checks if the process is alive without actually killing it
	err = process.Signal(syscall.Signal(0))
	return err == nil
}
