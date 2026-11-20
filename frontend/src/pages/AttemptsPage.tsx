import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

export const AttemptsPage: React.FC = () => {
  const navigate = useNavigate();
  const currentStudentId = localStorage.getItem('current_student_id') || 'student_1';

  const attempts = useLiveQuery(
    () => db.attempts.where('student_id').equals(currentStudentId).reverse().sortBy('client_started_at'),
    [currentStudentId]
  ) || [];

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>My Quiz Attempts</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Student: <strong>{currentStudentId}</strong> • Local attempts stored in IndexedDB.
        </p>
      </div>

      {attempts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <span style={{ fontSize: '2.5rem' }}>📝</span>
          <h2 style={{ fontSize: '1.2rem', marginTop: 12, marginBottom: 8 }}>No Attempts Yet</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
            Start a quiz offline or online. All questions you answer are saved to disk automatically.
          </p>
          <button onClick={() => navigate('/')} className="btn btn-primary">
            Browse Quizzes & Lessons
          </button>
        </div>
      ) : (
        <div className="grid">
          {attempts.map(attempt => {
            const answeredCount = Object.keys(attempt.answers || {}).length;
            const isSubmitted = attempt.status === 'SUBMITTED';

            return (
              <div key={attempt.submission_id} className="card">
                <div className="card-header">
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{attempt.quiz_title}</h3>
                  <span className={`badge ${
                    attempt.sync_status === 'SYNCED'
                      ? 'badge-success'
                      : attempt.sync_status === 'FAILED'
                      ? 'badge-danger'
                      : attempt.sync_status === 'SYNCING'
                      ? 'badge-info'
                      : isSubmitted
                      ? 'badge-warning'
                      : 'badge-neutral'
                  }`}>
                    {attempt.sync_status}
                  </span>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                  <div>UUID: <code style={{ color: 'var(--primary)' }}>{attempt.submission_id.slice(0, 16)}...</code></div>
                  <div>Started: {new Date(attempt.client_started_at).toLocaleTimeString()}</div>
                  <div>Progress: {answeredCount}/{attempt.total_questions || 5} answered</div>
                  {attempt.score !== undefined && (
                    <div style={{ fontWeight: 700, color: 'var(--success)', marginTop: 4 }}>
                      Score: {attempt.score}% ({attempt.correct_count}/{attempt.total_questions})
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  {!isSubmitted ? (
                    <button
                      onClick={() => navigate(`/quiz/${attempt.quiz_id}`)}
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1 }}
                    >
                      ▶️ Resume Quiz
                    </button>
                  ) : (
                    <button
                      onClick={() => navigate('/sync')}
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1 }}
                    >
                      🔍 View Sync Log
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
