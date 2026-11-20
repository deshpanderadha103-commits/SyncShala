import React from 'react';

export const HelpPage: React.FC = () => {
  return (
    <div className="container">
      <div style={{ marginBottom: 24 }}>
        <span className="badge badge-info" style={{ marginBottom: 6 }}>Architecture & Specification</span>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Conflict Resolution Rules</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          How the offline learning platform guarantees data consistency, idempotency, and tamper-resistance.
        </p>
      </div>

      {/* Rule 1 */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: '1.4rem' }}>🔒</span>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Rule 1: Submitted Attempts are IMMUTABLE</h2>
        </div>
        <p style={{ color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
          Once a student presses "Submit Quiz" and the attempt transitions to <code>SUBMITTED</code>,
          that attempt is frozen forever. Any subsequent offline edits or tampering to that same <code>submission_id</code>
          will be strictly rejected by both the client sync engine and the backend server.
        </p>
        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.85rem' }}>
          <strong>Implementation:</strong> In <code>POST /api/submissions</code> and <code>PATCH /api/submissions/{'{submission_id}'}/answers</code>,
          if the stored record status is already <code>SUBMITTED</code>, incoming updates to answers are discarded and the original record is returned unchanged.
        </div>
      </div>

      {/* Rule 2 */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: '1.4rem' }}>⏱️</span>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Rule 2: Latest Client Timestamp Wins Per Question (In-Progress)</h2>
        </div>
        <p style={{ color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
          When incremental answer synchronization (<code>PATCH /api/submissions/{'{id}'}/answers</code>) is active for an in-progress quiz,
          answers are resolved <em>individually per question</em>:
        </p>
        <ul style={{ paddingLeft: 20, marginBottom: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <li>Every answer records an ISO 8601 timestamp (<code>client_answered_at</code>) when clicked.</li>
          <li>If an answer was changed multiple times across intermittent connections, the record with the <strong>latest timestamp</strong> wins for each specific question.</li>
          <li>If timestamps are identical or absent, the server arrival order acts as the deterministic tiebreaker.</li>
        </ul>
        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.85rem' }}>
          <strong>Implementation:</strong> Tested in <code>test_conflict_rule_behavior()</code>: verified that older timestamps cannot overwrite newer recorded selections.
        </div>
      </div>

      {/* Rule 3 */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: '1.4rem' }}>🌐</span>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Rule 3: Server Content Version Wins (Supremacy)</h2>
        </div>
        <p style={{ color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
          Educational content evolves over time. To ensure fairness and up-to-date curricula:
        </p>
        <ul style={{ paddingLeft: 20, marginBottom: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <li>Every lesson and quiz carries an integer <code>version</code> number.</li>
          <li>On reconnect, the client queries <code>GET /api/quizzes</code> and <code>GET /api/lessons</code>.</li>
          <li>If the server version is higher than the cached IndexedDB version, the local cache is updated immediately with the latest server questions and text.</li>
          <li>If an in-progress attempt started on an older version of the quiz, the student is warned upon reconnect.</li>
        </ul>
      </div>

      {/* Idempotent Sync Architecture */}
      <div className="card" style={{ background: 'var(--primary-light)', borderColor: '#bfdbfe' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: '1.4rem' }}>🛡️</span>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)' }}>
            Idempotent Sync Architecture (Zero Duplicate Guarantee)
          </h2>
        </div>
        <p style={{ fontSize: '0.92rem', color: '#1e3a8a', lineHeight: 1.6, marginBottom: 10 }}>
          Every quiz attempt generates a client-side UUID as its <code>submission_id</code> on initial start.
          This UUID serves as the distributed idempotency key. No matter how many times an upload is retried,
          interrupted, or duplicated over flaky network connections, SQLite's <code>PRIMARY KEY (submission_id)</code>
          and our atomic transaction handler guarantee that exactly <strong>ONE</strong> row is ever inserted into the database.
        </p>
        <p style={{ fontSize: '0.92rem', color: '#1e3a8a', lineHeight: 1.6 }}>
          Subsequent uploads return <code>200 OK</code> with header <code>X-Idempotent-Replay: true</code>,
          allowing the client to verify completion without altering server state.
        </p>
      </div>
    </div>
  );
};
