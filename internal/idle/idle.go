package idle

import (
	"log"
	"runtime"
	"runtime/debug"
	"sync"
	"time"
)

type CheckpointFn func()

type IdleManager struct {
	mu                sync.RWMutex
	activeConnections int
	lastActivity      time.Time
	isIdle            bool
	checkpointFn      CheckpointFn
	stopChan          chan struct{}
}

var (
	defaultManager *IdleManager
	once           sync.Once
)

func Init(checkpoint CheckpointFn) *IdleManager {
	once.Do(func() {
		defaultManager = &IdleManager{
			lastActivity: time.Now(),
			checkpointFn: checkpoint,
			stopChan:     make(chan struct{}),
		}
		go defaultManager.loop()
	})
	return defaultManager
}

func GetManager() *IdleManager {
	return defaultManager
}

func (m *IdleManager) RecordActivity() {
	m.mu.Lock()
	m.lastActivity = time.Now()
	if m.isIdle {
		m.isIdle = false
		log.Println("[idle] Resuming from idle mode due to activity")
	}
	m.mu.Unlock()
}

func (m *IdleManager) OnConnectionCountChange(count int) {
	m.mu.Lock()
	m.activeConnections = count
	m.lastActivity = time.Now()
	if count > 0 && m.isIdle {
		m.isIdle = false
		log.Printf("[idle] Resuming from idle mode (%d client connected)", count)
	}
	m.mu.Unlock()
}

func (m *IdleManager) IsIdle() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.isIdle
}

func (m *IdleManager) ActiveConnections() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.activeConnections
}

func (m *IdleManager) loop() {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopChan:
			return
		case <-ticker.C:
			m.mu.Lock()
			now := time.Now()
			shouldIdle := m.activeConnections == 0 && now.Sub(m.lastActivity) >= 60*time.Second

			if shouldIdle && !m.isIdle {
				m.isIdle = true
				log.Println("[idle] Entering low-power idle mode (0 clients for 60s)")

				// Checkpoint SQLite WAL
				if m.checkpointFn != nil {
					m.checkpointFn()
				}

				// Force immediate Go GC and return heap pages to OS
				runtime.GC()
				debug.FreeOSMemory()

				var ms runtime.MemStats
				runtime.ReadMemStats(&ms)
				log.Printf("[idle] Memory trimmed — Alloc: %.2fMB, Sys: %.2fMB",
					float64(ms.Alloc)/(1024*1024), float64(ms.Sys)/(1024*1024))
			}
			m.mu.Unlock()
		}
	}
}

func (m *IdleManager) Stop() {
	close(m.stopChan)
}
