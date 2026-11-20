import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { syncEngine } from '../services/syncEngine';

export const SyncPage: React.FC = () => {
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Live queries from Dexie IndexedDB
  const queueItems = useLiveQuery(() => db.syncQueue.toArray(), []) || [];
  const syncLogs = useLiveQuery(
    () => {
      if (selectedSubmissionId) {
        return db.syncLog.where('submission_id').equals(selectedSubmissionId).reverse().sortBy('id');
      }
      return db.syncLog.reverse().sortBy('id');
    },
    [selectedSubmissionId]
  ) || [];

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await syncEngine.syncNow();
    } finally {
      setTimeout(() => setIsSyncing(false), 600);
    }
  };

  const handleRetryItem = async (submissionId: string) => {
    await syncEngine.retrySubmission(submissionId);
  };

  const handleClearLogs = async () => {
    await db.syncLog.clear();
  };

  return (
    <div className="container">
      {/* Header and Manual Sync Trigger */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <span className="badge badge-info" style={{ marginBottom: 4 }}>SyncShala Transmission Engine</span>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.4px' }}>
            Sync Queue & Telemetry Logs
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>
            Background synchronization state machine with exponential backoff and replay audit trail.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="btn btn-primary"
          >
            {isSyncing ? '🔄 Syncing Queue...' : '🔄 Sync Now'}
          </button>
          <button
            onClick={handleClearLogs}
            className="btn btn-secondary btn-sm"
          >
            Clear Log History
          </button>
        </div>
      </div>

      {/* State Machine Status Strip */}
      <div className="card" style={{ padding: '16px 20px', background: '#f8fafb', marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>
            LIFECYCLE STATE MACHINE:
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 700 }}>
            <span className="badge badge-warning">PENDING</span>
            <span>→</span>
            <span className="badge badge-info">SYNCING</span>
            <span>→</span>
            <span className="badge badge-success">SYNCED</span>
            <span style={{ color: 'var(--text-subtle)', margin: '0 4px' }}>or</span>
            <span className="badge badge-danger">FAILED (Retry)</span>
          </div>
        </div>
      </div>

      {/* Sync Queue Table */}
      <div className="card" style={{ marginBottom: 24, padding: '24px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 16 }}>
          📋 Submission Queue ({queueItems.length})
        </h2>

        {queueItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 0' }}>
            <span style={{ fontSize: '2.5rem' }}>📭</span>
            <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
              Queue is empty. Take a quiz offline or online to see queue state transitions here.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Submission ID (Idempotency Key)</th>
                  <th>Student</th>
                  <th>Status</th>
                  <th>Retries</th>
                  <th>Next Attempt</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {queueItems.map(item => {
                  const isSelected = selectedSubmissionId === item.submission_id;
                  return (
                    <tr
                      key={item.submission_id}
                      style={{ background: isSelected ? 'var(--primary-light)' : undefined }}
                    >
                      <td>
                        <button
                          onClick={() => setSelectedSubmissionId(isSelected ? null : item.submission_id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            fontFamily: 'monospace',
                            color: 'var(--primary)',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textAlign: 'left'
                          }}
                        >
                          {item.submission_id.slice(0, 18)}...
                        </button>
                      </td>
                      <td style={{ fontWeight: 600 }}>{item.student_id}</td>
                      <td>
                        <span className={`badge ${item.status === 'SYNCED'
                            ? 'badge-success'
                            : item.status === 'FAILED'
                              ? 'badge-danger'
                              : item.status === 'SYNCING'
                                ? 'badge-info'
                                : 'badge-warning'
                          }`}>
                          {item.status}
                        </span>
                        {item.is_replay && (
                          <span className="badge badge-info" style={{ marginLeft: 6 }}>
                            Idempotent Replay
                          </span>
                        )}
                      </td>
                      <td>{item.retry_count} / {item.max_retries}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {item.status === 'SYNCED'
                          ? 'Completed'
                          : item.next_retry_at <= Date.now()
                            ? 'Ready now'
                            : `in ${Math.max(0, Math.round((item.next_retry_at - Date.now()) / 1000))}s`}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {item.status === 'FAILED' && (
                            <button
                              onClick={() => handleRetryItem(item.submission_id)}
                              className="btn btn-warning btn-sm"
                            >
                              ⚡ Retry Now
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedSubmissionId(isSelected ? null : item.submission_id)}
                            className="btn btn-secondary btn-sm"
                          >
                            {isSelected ? 'View All' : 'Logs'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sync Log History (The Proof for Judges) */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
              📜 Audit Event Log {selectedSubmissionId && `(Filtered: ${selectedSubmissionId.slice(0, 8)}...)`}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              Inspects every HTTP POST attempt, dropped network event, and idempotent 200 replay.
            </p>
          </div>
          {selectedSubmissionId && (
            <button onClick={() => setSelectedSubmissionId(null)} className="btn btn-secondary btn-sm">
              Show All Submissions
            </button>
          )}
        </div>

        {syncLogs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '36px 0' }}>
            No logs recorded yet. Complete a quiz to inspect transmission telemetry.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {syncLogs.map(log => {
              const badgeClass =
                log.status === 'SUCCESS' || log.status === 'REPLAY_SUCCESS'
                  ? 'badge-success'
                  : log.status === 'DROPPED'
                    ? 'badge-danger'
                    : log.status === 'FAILED'
                      ? 'badge-warning'
                      : 'badge-info';

              return (
                <div
                  key={log.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '14px 18px',
                    background: log.status === 'REPLAY_SUCCESS' ? '#f0fdf4' : log.status === 'DROPPED' ? '#fff1f2' : '#ffffff',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className={`badge ${badgeClass}`}>{log.status}</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                        Attempt #{log.attempt_number}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-subtle)', fontFamily: 'monospace' }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <p style={{ fontSize: '0.94rem', fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
                    {log.message}
                  </p>

                  <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', fontFamily: 'monospace' }}>
                    Idempotency Key: {log.submission_id}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
