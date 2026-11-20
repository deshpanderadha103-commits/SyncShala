import React, { useState, useEffect } from 'react';
import { fetchTeacherSubmissionsApi, resetDemoApi } from '../services/api';
import type { TeacherSummaryResponse, TeacherSubmissionView } from '../types';

export const TeacherPage: React.FC = () => {
  const [summary, setSummary] = useState<TeacherSummaryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedSub, setSelectedSub] = useState<TeacherSubmissionView | null>(null);
  const [refreshCountdown, setRefreshCountdown] = useState<number>(5);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchTeacherSubmissionsApi();
      setSummary(data);
      setLastRefreshed(new Date());
      setRefreshCountdown(5);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch teacher dashboard');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData(true);
    }, 5000);

    const countdownTimer = setInterval(() => {
      setRefreshCountdown(prev => (prev <= 1 ? 5 : prev - 1));
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(countdownTimer);
    };
  }, []);

  const handleResetData = async () => {
    if (!window.confirm('Reset all server submissions to test the duplicate prevention flow from a clean state?')) {
      return;
    }
    try {
      await resetDemoApi();
      await loadData();
    } catch (e: any) {
      alert(`Reset failed: ${e.message}`);
    }
  };

  const filteredSubmissions = summary?.submissions.filter(s => {
    const term = searchTerm.toLowerCase();
    return s.student_id.toLowerCase().includes(term) || s.quiz_id.toLowerCase().includes(term);
  }) || [];

  return (
    <div className="container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="badge badge-primary">Educator Portal</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Auto-refresh in {refreshCountdown}s
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: 4, letterSpacing: '-0.4px' }}>
            Submissions & Integrity Dashboard
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>
            Live deduplicated assessments submitted across intermittent offline connections.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => loadData()} className="btn btn-secondary btn-sm" disabled={loading}>
            🔄 Refresh Now
          </button>
          <button onClick={handleResetData} className="btn btn-outline btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger-border)' }}>
            🗑️ Reset Database
          </button>
        </div>
      </div>

      {/* KPI Stats Banner */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', marginBottom: 24 }}>
        <div className="stat-box">
          <div className="stat-value" style={{ color: 'var(--primary-dark)' }}>
            {summary?.total_submissions ?? 0}
          </div>
          <div className="stat-label">Unique Submissions</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginTop: 4 }}>
            Recorded in SQLite database
          </div>
        </div>

        {/* Big Zero-Duplicate KPI Shield Card */}
        <div className="stat-box" style={{
          background: 'linear-gradient(180deg, #ecfdf5 0%, #ffffff 100%)',
          borderColor: 'var(--success-border)',
          boxShadow: '0 4px 14px rgba(16, 185, 129, 0.12)'
        }}>
          <div className="stat-value" style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span>🛡️</span>
            <span>{summary?.duplicates_detected ?? 0}</span>
          </div>
          <div className="stat-label" style={{ color: '#065f46', fontWeight: 800 }}>
            Duplicates Detected
          </div>
          <div style={{ fontSize: '0.74rem', color: '#047857', marginTop: 4, fontWeight: 600 }}>
            Guaranteed 0 Duplicates (Idempotent)
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-value" style={{ color: 'var(--signal-yellow)' }}>
            {summary?.duplicates_absorbed ?? 0}
          </div>
          <div className="stat-label">Replays Absorbed</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginTop: 4 }}>
            Interrupted retries safely merged
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-value" style={{ color: 'var(--text)' }}>
            {summary?.submissions ? (
              summary.submissions.length > 0
                ? `${Math.round(summary.submissions.reduce((acc, s) => acc + (s.score ?? 0), 0) / summary.submissions.length)}%`
                : '—'
            ) : '—'}
          </div>
          <div className="stat-label">Class Average Score</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginTop: 4 }}>
            Across all submitted quizzes
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Received Submissions</h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
              Last synchronized: {lastRefreshed.toLocaleTimeString()}
            </div>
          </div>

          <div style={{ minWidth: 220 }}>
            <input
              type="text"
              placeholder="Search student or quiz..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: '0.86rem',
                outline: 'none'
              }}
            />
          </div>
        </div>

        {loading && !summary ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            Loading submissions...
          </div>
        ) : error ? (
          <div style={{ padding: 16, background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: 8 }}>
            Error loading submissions: {error}
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <span style={{ fontSize: '3rem' }}>📭</span>
            <h3 style={{ fontSize: '1.2rem', marginTop: 12, marginBottom: 6 }}>No submissions found</h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto', fontSize: '0.9rem' }}>
              Complete a quiz as a student to see the entry appear here automatically in real-time.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Assessment</th>
                  <th>Score</th>
                  <th>Answers</th>
                  <th>Sync Telemetry</th>
                  <th>Received</th>
                  <th>Integrity</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubmissions.map(sub => {
                  const answerCount = Object.keys(sub.answers || {}).length;
                  const isPerfect = sub.score !== null && sub.score !== undefined && sub.score >= 80;
                  return (
                    <tr key={sub.submission_id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'var(--primary-surface)',
                            color: 'var(--primary-dark)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.82rem',
                            fontWeight: 800
                          }}>
                            {sub.student_id.slice(-1).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700 }}>{sub.student_id}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', fontFamily: 'monospace' }}>
                              {sub.submission_id.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ textTransform: 'none' }}>
                          {sub.quiz_id}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{
                            fontWeight: 800,
                            fontSize: '1.1rem',
                            color: isPerfect ? 'var(--success)' : 'var(--text)'
                          }}>
                            {sub.score !== null && sub.score !== undefined ? `${sub.score}%` : 'Pending'}
                          </span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            ({sub.correct_count}/{sub.total_questions})
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-info">
                          {answerCount}/{sub.total_questions} Answers
                        </span>
                      </td>
                      <td>
                        {sub.sync_count > 1 ? (
                          <span className="badge badge-warning" title={`${sub.sync_count} total incoming requests with identical submission_id absorbed into 1 database row`}>
                            ⚡ {sub.sync_count}x Replay Absorbed
                          </span>
                        ) : (
                          <span className="badge badge-neutral">1x (First try)</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {new Date(sub.received_at).toLocaleTimeString()}
                      </td>
                      <td>
                        {sub.is_verified === 1 ? (
                          <span className="badge badge-success" title="HMAC-SHA256 signature verified by server">
                            ✓ HMAC Verified
                          </span>
                        ) : (
                          <span className="badge badge-danger">Unverified</span>
                        )}
                      </td>
                      <td>
                        <button
                          onClick={() => setSelectedSub(sub)}
                          className="btn btn-outline btn-sm"
                          style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                        >
                          🔍 Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Submission Detail Modal */}
      {selectedSub && (
        <div className="modal-overlay" onClick={() => setSelectedSub(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <span className="badge badge-primary" style={{ marginBottom: 4 }}>Submission Audit</span>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800 }}>{selectedSub.student_id} — {selectedSub.quiz_id}</h3>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', fontFamily: 'monospace' }}>
                  UUID: {selectedSub.submission_id}
                </div>
              </div>
              <button
                onClick={() => setSelectedSub(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
              <div style={{ background: '#f8fafb', padding: 12, borderRadius: 8 }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Score Achieved</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>
                  {selectedSub.score ?? '—'}% ({selectedSub.correct_count} / {selectedSub.total_questions})
                </div>
              </div>
              <div style={{ background: '#f8fafb', padding: 12, borderRadius: 8 }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Idempotent Replay Count</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: selectedSub.sync_count > 1 ? 'var(--warning)' : 'var(--text)' }}>
                  {selectedSub.sync_count}x requests absorbed
                </div>
              </div>
            </div>

            <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Submitted Answers Breakdown</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '280px', overflowY: 'auto', marginBottom: 18 }}>
              {Object.entries(selectedSub.answers || {}).map(([qId, ans]: [string, any], idx) => (
                <div key={qId} style={{ padding: 10, background: '#f8fafb', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 700 }}>
                    <span>Question {idx + 1} ({qId})</span>
                    <span style={{ color: 'var(--text-subtle)', fontSize: '0.75rem' }}>
                      Answered at: {ans.client_answered_at ? new Date(ans.client_answered_at).toLocaleTimeString() : 'N/A'}
                    </span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: '0.88rem' }}>
                    Selected Option Index: <strong>Option {ans.selected_option !== undefined ? ans.selected_option + 1 : 'None'}</strong>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setSelectedSub(null)} className="btn btn-secondary btn-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
