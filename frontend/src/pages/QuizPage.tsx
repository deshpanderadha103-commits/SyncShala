import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { syncEngine } from '../services/syncEngine';
import { fetchQuizzesApi } from '../services/api';
import { computeSubmissionHmac } from '../services/crypto';
import type { Quiz, QuizAttempt, Question } from '../types';

export const QuizPage: React.FC = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();

  const currentStudentId = localStorage.getItem('current_student_id') || 'student_1';

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [currentAttempt, setCurrentAttempt] = useState<QuizAttempt | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<boolean>(false);

  // Monitor live attempt from IndexedDB
  const liveAttempt = useLiveQuery(
    async () => {
      if (!quizId) return undefined;
      return db.attempts
        .where('quiz_id')
        .equals(quizId)
        .filter(a => a.student_id === currentStudentId)
        .reverse()
        .first();
    },
    [quizId, currentStudentId]
  );

  // Load Quiz definition: Check IndexedDB first, then API if online
  useEffect(() => {
    let isMounted = true;
    async function loadQuizData() {
      if (!quizId) return;
      setLoading(true);

      // 1. Check local Dexie IndexedDB
      let localQuiz = await db.quizzes.get(quizId);

      // 2. If not local and online, fetch from backend and cache
      if (!localQuiz && navigator.onLine) {
        try {
          const quizzes = await fetchQuizzesApi();
          const found = quizzes.find(q => q.id === quizId);
          if (found) {
            await db.quizzes.put({ ...found, isDownloaded: true });
            localQuiz = found;
          }
        } catch (e) {
          console.error('Failed to fetch quiz from server', e);
        }
      }

      if (isMounted) {
        if (localQuiz) {
          setQuiz(localQuiz);
        } else {
          setError('Quiz not found locally. Please connect online to download it first.');
        }
        setLoading(false);
      }
    }

    loadQuizData();
    return () => { isMounted = false; };
  }, [quizId]);

  // Initialize or resume attempt
  useEffect(() => {
    if (!quiz || !quizId) return;

    async function initOrResumeAttempt() {
      if (!quiz) return;
      const existing = await db.attempts
        .where('quiz_id')
        .equals(quiz.id)
        .filter(a => a.student_id === currentStudentId)
        .reverse()
        .first();

      if (existing) {
        // RESUME EXISTING ATTEMPT
        setCurrentAttempt(existing);
        setCurrentIndex(existing.current_question_index || 0);
      } else {
        // START NEW ATTEMPT: generate UUID submission_id
        const newSubmissionId = crypto.randomUUID();
        const newAttempt: QuizAttempt = {
          submission_id: newSubmissionId,
          student_id: currentStudentId,
          quiz_id: quiz.id,
          quiz_title: quiz.title,
          version: quiz.version,
          answers: {},
          current_question_index: 0,
          client_started_at: new Date().toISOString(),
          status: 'IN_PROGRESS',
          total_questions: quiz.questions.length,
          sync_status: 'NOT_SUBMITTED'
        };

        await db.attempts.put(newAttempt);
        setCurrentAttempt(newAttempt);
        setCurrentIndex(0);
      }
    }

    initOrResumeAttempt();
  }, [quiz, currentStudentId]);

  // Keep state synced with IndexedDB live changes
  useEffect(() => {
    if (liveAttempt) {
      setCurrentAttempt(liveAttempt);
      if (liveAttempt.current_question_index !== undefined) {
        setCurrentIndex(liveAttempt.current_question_index);
      }
    }
  }, [liveAttempt]);

  // Record answer to IndexedDB THE INSTANT it is clicked
  const handleSelectOption = async (questionId: string, optionIndex: number) => {
    if (!currentAttempt || currentAttempt.status === 'SUBMITTED') return;

    const updatedAnswers = {
      ...currentAttempt.answers,
      [questionId]: {
        selected_option: optionIndex,
        client_answered_at: new Date().toISOString()
      }
    };

    // Instant persistence to IndexedDB: survives tab close, reload, or device restart!
    await db.attempts.update(currentAttempt.submission_id, {
      answers: updatedAnswers,
      current_question_index: currentIndex
    });

    setCurrentAttempt(prev => prev ? { ...prev, answers: updatedAnswers } : null);

    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1200);
  };

  const handleNext = async () => {
    if (!quiz || !currentAttempt) return;
    const nextIdx = Math.min(currentIndex + 1, quiz.questions.length - 1);
    setCurrentIndex(nextIdx);
    await db.attempts.update(currentAttempt.submission_id, {
      current_question_index: nextIdx
    });
  };

  const handlePrev = async () => {
    if (!currentAttempt) return;
    const prevIdx = Math.max(currentIndex - 1, 0);
    setCurrentIndex(prevIdx);
    await db.attempts.update(currentAttempt.submission_id, {
      current_question_index: prevIdx
    });
  };

  // Submit attempt: Enqueue into syncQueue with status PENDING
  const handleSubmit = async () => {
    if (!currentAttempt || !quiz) return;

    const submissionTime = new Date().toISOString();
    // Phase 5: compute cryptographic HMAC signature
    const sessionKeys: Record<string, string> = {
      student_1: 'session_key_student_1_offline_token',
      student_2: 'session_key_student_2_offline_token'
    };
    const sessionKey = sessionKeys[currentStudentId] || '';
    const signature = await computeSubmissionHmac(sessionKey, currentAttempt.answers);

    const finalAttempt: QuizAttempt = {
      ...currentAttempt,
      status: 'SUBMITTED',
      client_submitted_at: submissionTime,
      signature,
      sync_status: 'PENDING'
    };

    await db.attempts.update(currentAttempt.submission_id, {
      status: 'SUBMITTED',
      client_submitted_at: submissionTime,
      signature,
      sync_status: 'PENDING'
    });

    // Enqueue in sync engine (idempotent POST /api/submissions)
    await syncEngine.enqueueSubmission(finalAttempt);
  };

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '80px 0' }}>
        <div style={{ fontSize: '2.5rem' }}>⏳</div>
        <h2 style={{ marginTop: 12, fontWeight: 700 }}>Loading SyncShala Assessment...</h2>
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="container" style={{ padding: '40px 0' }}>
        <div className="card" style={{ borderColor: 'var(--danger-border)' }}>
          <h2 style={{ color: 'var(--danger)', marginBottom: 8 }}>Unable to Load Quiz</h2>
          <p style={{ marginBottom: 16 }}>{error || 'Quiz data unavailable.'}</p>
          <button onClick={() => navigate('/')} className="btn btn-secondary">
            ← Back to Lessons Catalog
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion: Question = quiz.questions[currentIndex];
  const totalQuestions = quiz.questions.length;
  const answeredCount = Object.keys(currentAttempt?.answers || {}).length;
  const isComplete = answeredCount === totalQuestions;
  const isSubmitted = currentAttempt?.status === 'SUBMITTED';
  const optionLetters = ['A', 'B', 'C', 'D', 'E'];

  return (
    <div className="container">
      {/* Quiz Top Header */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span className="badge badge-info">
                Student: {currentStudentId}
              </span>
              <span className="badge badge-neutral">
                Quiz v{quiz.version}
              </span>
            </div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.3px' }}>
              {quiz.title}
            </h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', fontFamily: 'monospace', marginTop: 2 }}>
              ID: {currentAttempt?.submission_id}
            </p>
          </div>

          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            {isSubmitted ? (
              <span className={`badge ${
                currentAttempt?.sync_status === 'SYNCED'
                  ? 'badge-success'
                  : currentAttempt?.sync_status === 'FAILED'
                  ? 'badge-danger'
                  : 'badge-warning'
              }`} style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
                Sync: {currentAttempt?.sync_status}
              </span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {justSaved && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 700, animation: 'fadeIn 0.2s ease' }}>
                    ✓ Saved to disk
                  </span>
                )}
                <span className="badge badge-neutral" style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
                  {answeredCount}/{totalQuestions} Answered
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Smooth Gradient Progress Bar */}
        <div style={{ width: '100%', height: 8, background: '#e2ece9', borderRadius: 999, marginTop: 18, overflow: 'hidden' }}>
          <div
            style={{
              width: `${(answeredCount / totalQuestions) * 100}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--primary) 0%, var(--primary-accent) 100%)',
              transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              borderRadius: 999
            }}
          />
        </div>
      </div>

      {/* Submitted Results Card */}
      {isSubmitted ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{
            width: 76,
            height: 76,
            borderRadius: '50%',
            background: currentAttempt?.sync_status === 'SYNCED' ? 'var(--success-light)' : 'var(--warning-light)',
            color: currentAttempt?.sync_status === 'SYNCED' ? 'var(--success)' : 'var(--warning)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.4rem',
            margin: '0 auto 16px auto',
            border: `2px solid ${currentAttempt?.sync_status === 'SYNCED' ? 'var(--success-border)' : 'var(--warning-border)'}`
          }}>
            {currentAttempt?.sync_status === 'SYNCED' ? '✓' : '⏳'}
          </div>

          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 8, letterSpacing: '-0.3px' }}>
            {currentAttempt?.sync_status === 'SYNCED'
              ? 'Quiz Successfully Submitted & Graded!'
              : 'Saved Offline & Queued for Synchronization'}
          </h2>

          <p style={{ color: 'var(--text-muted)', maxWidth: 540, margin: '0 auto 24px auto', fontSize: '0.96rem', lineHeight: 1.6 }}>
            {currentAttempt?.sync_status === 'SYNCED'
              ? `Your answers were verified by the instructor backend. Score: ${currentAttempt.score ?? 100}% (${currentAttempt.correct_count ?? 5}/${currentAttempt.total_questions ?? 5} correct).`
              : 'All 5 answers are safely recorded in IndexedDB. When network access returns, SyncShala will deliver them with guaranteed zero duplicate submissions.'}
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/sync')} className="btn btn-primary">
              🔄 View Sync Queue & Audit Logs
            </button>
            <button onClick={() => navigate('/teacher')} className="btn btn-secondary">
              👩‍🏫 Check Teacher Dashboard
            </button>
            <button onClick={() => navigate('/')} className="btn btn-secondary">
              ← Return to Lessons
            </button>
          </div>
        </div>
      ) : (
        /* Active Question Form */
        <div>
          <div className="card" style={{ padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.85rem', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                QUESTION {currentIndex + 1} OF {totalQuestions}
              </span>
              <span style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                color: currentAttempt?.answers[currentQuestion?.id] ? 'var(--success)' : 'var(--text-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}>
                {currentAttempt?.answers[currentQuestion?.id] ? '✓ Answer Stored' : '⚪ Not answered yet'}
              </span>
            </div>

            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 28, lineHeight: 1.45, color: 'var(--text)' }}>
              {currentQuestion?.text}
            </h2>

            {/* Options with Large Mobile Touch Targets */}
            <div>
              {currentQuestion?.options.map((optionText, optIdx) => {
                const isSelected = currentAttempt?.answers[currentQuestion.id]?.selected_option === optIdx;
                return (
                  <button
                    key={optIdx}
                    type="button"
                    onClick={() => handleSelectOption(currentQuestion.id, optIdx)}
                    className={`quiz-option ${isSelected ? 'selected' : ''}`}
                  >
                    <span className="option-indicator">{optionLetters[optIdx]}</span>
                    <span style={{ flex: 1 }}>{optionText}</span>
                    {isSelected && (
                      <span style={{ color: 'var(--primary)', fontWeight: 800, marginLeft: 10 }}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Navigation buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, gap: 12 }}>
              <button
                type="button"
                onClick={handlePrev}
                disabled={currentIndex === 0}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                ← Previous
              </button>

              {currentIndex < totalQuestions - 1 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="btn btn-primary"
                  style={{ flex: 1.2 }}
                >
                  Next Question →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!isComplete}
                  className="btn btn-success"
                  style={{ flex: 1.4 }}
                >
                  ✓ Submit Assessment ({answeredCount}/{totalQuestions})
                </button>
              )}
            </div>
          </div>

          {/* Quick Question Jump Strip */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
            {quiz.questions.map((q, idx) => {
              const isAnswered = !!currentAttempt?.answers[q.id];
              const isCurrent = idx === currentIndex;
              return (
                <button
                  key={q.id}
                  onClick={() => {
                    setCurrentIndex(idx);
                    if (currentAttempt) {
                      db.attempts.update(currentAttempt.submission_id, { current_question_index: idx });
                    }
                  }}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    border: isCurrent ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: isCurrent ? 'var(--primary-surface)' : isAnswered ? 'var(--success-light)' : '#ffffff',
                    color: isCurrent ? 'var(--primary-dark)' : isAnswered ? 'var(--success)' : 'var(--text-muted)',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: isCurrent ? '0 2px 8px rgba(13, 148, 136, 0.25)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
