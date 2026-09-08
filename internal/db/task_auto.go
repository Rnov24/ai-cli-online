package db

import (
	"database/sql"
	"fmt"
	"time"
)

type TaskAutoRecord struct {
	SessionName        string `json:"sessionName"`
	TaskDir            string `json:"taskDir"`
	Status             string `json:"status"`
	MaxIterations      int    `json:"maxIterations"`
	TimeoutMinutes     int    `json:"timeoutMinutes"`
	IterationCount     int    `json:"iterationCount"`
	RecoveryCountStep  int    `json:"recoveryCountStep"`
	RecoveryCountTotal int    `json:"recoveryCountTotal"`
	LastCaptureHash    string `json:"lastCaptureHash"`
	StallCount         int    `json:"stallCount"`
	QuotaWaitSince     string `json:"quotaWaitSince"`
	StartedAt          string `json:"startedAt"`
	LastSignalAt       string `json:"lastSignalAt"`
}

func (d *DB) UpsertTaskAuto(r *TaskAutoRecord) error {
	if r.StartedAt == "" {
		r.StartedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if r.Status == "" {
		r.Status = "running"
	}
	if r.MaxIterations <= 0 {
		r.MaxIterations = 20
	}
	if r.TimeoutMinutes <= 0 {
		r.TimeoutMinutes = 30
	}

	query := `
	INSERT INTO task_auto (
		session_name, task_dir, status, max_iterations, timeout_minutes,
		iteration_count, recovery_count_step, recovery_count_total,
		last_capture_hash, stall_count, quota_wait_since, started_at, last_signal_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(session_name) DO UPDATE SET
		task_dir = excluded.task_dir,
		status = excluded.status,
		max_iterations = excluded.max_iterations,
		timeout_minutes = excluded.timeout_minutes,
		iteration_count = excluded.iteration_count,
		recovery_count_step = excluded.recovery_count_step,
		recovery_count_total = excluded.recovery_count_total,
		last_capture_hash = excluded.last_capture_hash,
		stall_count = excluded.stall_count,
		quota_wait_since = excluded.quota_wait_since,
		started_at = excluded.started_at,
		last_signal_at = excluded.last_signal_at;
	`
	_, err := d.db.Exec(query,
		r.SessionName, r.TaskDir, r.Status, r.MaxIterations, r.TimeoutMinutes,
		r.IterationCount, r.RecoveryCountStep, r.RecoveryCountTotal,
		r.LastCaptureHash, r.StallCount, r.QuotaWaitSince, r.StartedAt, r.LastSignalAt,
	)
	if err != nil {
		return fmt.Errorf("failed to upsert task_auto: %w", err)
	}
	return nil
}

func (d *DB) GetTaskAuto(sessionName string) (*TaskAutoRecord, error) {
	query := `
	SELECT session_name, task_dir, status, max_iterations, timeout_minutes,
	       iteration_count, recovery_count_step, recovery_count_total,
	       last_capture_hash, stall_count, quota_wait_since, started_at, last_signal_at
	FROM task_auto WHERE session_name = ?;
	`
	var r TaskAutoRecord
	err := d.db.QueryRow(query, sessionName).Scan(
		&r.SessionName, &r.TaskDir, &r.Status, &r.MaxIterations, &r.TimeoutMinutes,
		&r.IterationCount, &r.RecoveryCountStep, &r.RecoveryCountTotal,
		&r.LastCaptureHash, &r.StallCount, &r.QuotaWaitSince, &r.StartedAt, &r.LastSignalAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get task_auto: %w", err)
	}
	return &r, nil
}

func (d *DB) GetTaskAutoByDir(taskDir string) (*TaskAutoRecord, error) {
	query := `
	SELECT session_name, task_dir, status, max_iterations, timeout_minutes,
	       iteration_count, recovery_count_step, recovery_count_total,
	       last_capture_hash, stall_count, quota_wait_since, started_at, last_signal_at
	FROM task_auto WHERE task_dir = ?;
	`
	var r TaskAutoRecord
	err := d.db.QueryRow(query, taskDir).Scan(
		&r.SessionName, &r.TaskDir, &r.Status, &r.MaxIterations, &r.TimeoutMinutes,
		&r.IterationCount, &r.RecoveryCountStep, &r.RecoveryCountTotal,
		&r.LastCaptureHash, &r.StallCount, &r.QuotaWaitSince, &r.StartedAt, &r.LastSignalAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get task_auto by dir: %w", err)
	}
	return &r, nil
}

func (d *DB) UpdateTaskAutoSignal(sessionName string, iteration int, timestamp string) error {
	query := `
	UPDATE task_auto
	SET iteration_count = ?, last_signal_at = ?
	WHERE session_name = ?;
	`
	_, err := d.db.Exec(query, iteration, timestamp, sessionName)
	if err != nil {
		return fmt.Errorf("failed to update task_auto signal: %w", err)
	}
	return nil
}

func (d *DB) DeleteTaskAuto(sessionName string) error {
	query := `DELETE FROM task_auto WHERE session_name = ?;`
	_, err := d.db.Exec(query, sessionName)
	if err != nil {
		return fmt.Errorf("failed to delete task_auto: %w", err)
	}
	return nil
}

func (d *DB) DeleteTaskAutoByDir(taskDir string) error {
	query := `DELETE FROM task_auto WHERE task_dir = ?;`
	_, err := d.db.Exec(query, taskDir)
	if err != nil {
		return fmt.Errorf("failed to delete task_auto by dir: %w", err)
	}
	return nil
}

func (d *DB) ListRunningTaskAuto() ([]TaskAutoRecord, error) {
	query := `
	SELECT session_name, task_dir, status, max_iterations, timeout_minutes,
	       iteration_count, recovery_count_step, recovery_count_total,
	       last_capture_hash, stall_count, quota_wait_since, started_at, last_signal_at
	FROM task_auto WHERE status = 'running';
	`
	rows, err := d.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to list running task_auto: %w", err)
	}
	defer rows.Close()

	var list []TaskAutoRecord
	for rows.Next() {
		var r TaskAutoRecord
		if err := rows.Scan(
			&r.SessionName, &r.TaskDir, &r.Status, &r.MaxIterations, &r.TimeoutMinutes,
			&r.IterationCount, &r.RecoveryCountStep, &r.RecoveryCountTotal,
			&r.LastCaptureHash, &r.StallCount, &r.QuotaWaitSince, &r.StartedAt, &r.LastSignalAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan task_auto: %w", err)
		}
		list = append(list, r)
	}
	return list, nil
}
