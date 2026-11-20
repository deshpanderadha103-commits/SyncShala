import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { fetchLessonsApi, fetchQuizzesApi } from '../services/api';
import type { Lesson, Quiz } from '../types';

export const DownloadsPage: React.FC = () => {
  const navigate = useNavigate();
  const [serverLessons, setServerLessons] = useState<Lesson[]>([]);
  const [serverQuizzes, setServerQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [activeLessonModal, setActiveLessonModal] = useState<Lesson | null>(null);
  const [filter, setFilter] = useState<'all' | 'lessons' | 'quizzes' | 'saved'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Read local offline data from Dexie IndexedDB
  const localLessons = useLiveQuery(() => db.lessons.toArray(), []) || [];
  const localQuizzes = useLiveQuery(() => db.quizzes.toArray(), []) || [];

  const localLessonIds = new Set(localLessons.map(l => l.id));
  const localQuizIds = new Set(localQuizzes.map(q => q.id));

  // Fetch online catalog if connected, or fall back to local IndexedDB
  useEffect(() => {
    let isMounted = true;
    async function loadCatalog() {
      setLoading(true);
      if (navigator.onLine) {
        try {
          const [lessonsData, quizzesData] = await Promise.all([
            fetchLessonsApi(),
            fetchQuizzesApi()
          ]);
          if (isMounted) {
            setServerLessons(lessonsData);
            setServerQuizzes(quizzesData);
          }
        } catch (e) {
          console.warn('Network fetch failed, using offline cache', e);
        }
      }
      setLoading(false);
    }
    loadCatalog();
    return () => { isMounted = false; };
  }, []);

  const displayLessons = serverLessons.length > 0 ? serverLessons : localLessons;
  const displayQuizzes = serverQuizzes.length > 0 ? serverQuizzes : localQuizzes;

  const handleDownloadLesson = async (lesson: Lesson) => {
    setDownloadingId(lesson.id);
    try {
      await db.lessons.put({ ...lesson, isDownloaded: true });
    } finally {
      setTimeout(() => setDownloadingId(null), 300);
    }
  };

  const handleDownloadQuiz = async (quiz: Quiz) => {
    setDownloadingId(quiz.id);
    try {
      await db.quizzes.put({ ...quiz, isDownloaded: true });
    } finally {
      setTimeout(() => setDownloadingId(null), 300);
    }
  };

  const handleDownloadAll = async () => {
    setDownloadingId('all');
    try {
      for (const l of displayLessons) {
        await db.lessons.put({ ...l, isDownloaded: true });
      }
      for (const q of displayQuizzes) {
        await db.quizzes.put({ ...q, isDownloaded: true });
      }
    } finally {
      setTimeout(() => setDownloadingId(null), 400);
    }
  };

  const filteredLessons = displayLessons.filter(l => {
    const matchesSearch = l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (l.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (filter === 'quizzes') return false;
    if (filter === 'saved') return localLessonIds.has(l.id);
    return true;
  });

  const filteredQuizzes = displayQuizzes.filter(q => {
    const matchesSearch = q.title.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (filter === 'lessons') return false;
    if (filter === 'saved') return localQuizIds.has(q.id);
    return true;
  });

  return (
    <div className="container">
      {/* Hero Welcome Card */}
      <div className="hero-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ maxWidth: 560 }}>
            <span style={{
              background: 'rgba(255, 255, 255, 0.2)',
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.5px'
            }}>
              OFFLINE-FIRST EDUCATION
            </span>
            <h1 style={{ fontSize: '1.9rem', fontWeight: 800, marginTop: 10, marginBottom: 8, letterSpacing: '-0.5px' }}>
              Learn anywhere. Sync everywhere.
            </h1>
            <p style={{ opacity: 0.92, fontSize: '0.98rem', lineHeight: 1.55 }}>
              Download lessons and assessments with one click. Work completely disconnected from the Internet, and progress will sync automatically when connectivity returns.
            </p>
          </div>

          <div>
            <button
              onClick={handleDownloadAll}
              disabled={downloadingId !== null}
              className="btn btn-sm"
              style={{
                background: '#ffffff',
                color: 'var(--primary-dark)',
                fontWeight: 700,
                boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
                minHeight: '44px'
              }}
            >
              {downloadingId === 'all' ? '⬇️ Caching Bundle...' : '⬇️ Download All for Offline'}
            </button>
          </div>
        </div>

        {/* Feature Badges in Hero */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <span style={{ background: 'rgba(255, 255, 255, 0.15)', padding: '5px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600 }}>
            ⚡ 100% Offline Capable
          </span>
          <span style={{ background: 'rgba(255, 255, 255, 0.15)', padding: '5px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600 }}>
            💾 Instant IndexedDB Auto-Save
          </span>
          <span style={{ background: 'rgba(255, 255, 255, 0.15)', padding: '5px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600 }}>
            🛡️ Zero-Duplicate Idempotent Sync
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['all', 'lessons', 'quizzes', 'saved'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className="btn btn-sm"
              style={{
                background: filter === tab ? 'var(--primary)' : '#ffffff',
                color: filter === tab ? '#ffffff' : 'var(--text-muted)',
                border: '1px solid ' + (filter === tab ? 'var(--primary)' : 'var(--border)'),
                minHeight: '36px',
                textTransform: 'capitalize',
                fontWeight: 600
              }}
            >
              {tab === 'saved' ? '✓ Downloaded Only' : tab}
            </button>
          ))}
        </div>

        <div style={{ minWidth: 220 }}>
          <input
            type="text"
            placeholder="Search topics or quizzes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: '#ffffff',
              fontSize: '0.88rem',
              outline: 'none'
            }}
          />
        </div>
      </div>

      {/* Lessons Section */}
      {filteredLessons.length > 0 && (
        <div style={{ marginBottom: 34 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📖 Study Lessons</span>
              <span className="badge badge-info">{filteredLessons.length}</span>
            </h2>
          </div>

          <div className="grid">
            {filteredLessons.map(lesson => {
              const isSaved = localLessonIds.has(lesson.id);
              return (
                <div key={lesson.id} className="card">
                  <div className="card-header">
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase' }}>
                      Core Curriculum • v{lesson.version}
                    </span>
                    {isSaved ? (
                      <span className="badge badge-success">✓ Saved Offline</span>
                    ) : (
                      <span className="badge badge-neutral">Online Only</span>
                    )}
                  </div>

                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
                    {lesson.title}
                  </h3>

                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 20, minHeight: 40, lineHeight: 1.5 }}>
                    {lesson.description || 'Comprehensive module covering core theoretical and practical skills.'}
                  </p>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => setActiveLessonModal(lesson)}
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1.1 }}
                    >
                      📖 Read Lesson
                    </button>
                    <button
                      onClick={() => handleDownloadLesson(lesson)}
                      disabled={downloadingId === lesson.id || isSaved}
                      className={`btn btn-sm ${isSaved ? 'btn-secondary' : 'btn-primary'}`}
                      style={{ flex: 0.9 }}
                    >
                      {isSaved ? '✓ Saved' : downloadingId === lesson.id ? 'Saving...' : '⬇️ Download'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quizzes Section */}
      {filteredQuizzes.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📝 Offline Quizzes & Assessments</span>
              <span className="badge badge-info">{filteredQuizzes.length}</span>
            </h2>
          </div>

          <div className="grid">
            {filteredQuizzes.map(quiz => {
              const isSaved = localQuizIds.has(quiz.id);
              return (
                <div key={quiz.id} className="card">
                  <div className="card-header">
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>
                      5 Multiple Choice Questions
                    </span>
                    {isSaved ? (
                      <span className="badge badge-success">✓ Ready Offline</span>
                    ) : (
                      <span className="badge badge-warning">Download Needed</span>
                    )}
                  </div>

                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 8 }}>
                    {quiz.title}
                  </h3>

                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 16 }}>
                    Answers persist instantly to IndexedDB and survive reboots. Syncs automatically with guaranteed zero duplicate submissions.
                  </p>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => navigate(`/quiz/${quiz.id}`)}
                      className="btn btn-primary"
                      style={{ flex: 1.3 }}
                    >
                      ✏️ Take Quiz
                    </button>
                    {!isSaved && (
                      <button
                        onClick={() => handleDownloadQuiz(quiz)}
                        disabled={downloadingId === quiz.id}
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 0.8 }}
                      >
                        {downloadingId === quiz.id ? 'Saving...' : '⬇️ Save'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredLessons.length === 0 && filteredQuizzes.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <span style={{ fontSize: '3rem' }}>🔍</span>
          <h3 style={{ fontSize: '1.2rem', marginTop: 12, marginBottom: 6 }}>No matching items found</h3>
          <p style={{ color: 'var(--text-muted)' }}>Try adjusting your search filter or clear your search query.</p>
        </div>
      )}

      {/* Lesson Reader Modal */}
      {activeLessonModal && (
        <div className="modal-overlay" onClick={() => setActiveLessonModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <div>
                <span className="badge badge-info" style={{ marginBottom: 4 }}>SyncShala Reader</span>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>{activeLessonModal.title}</h2>
              </div>
              <button
                onClick={() => setActiveLessonModal(null)}
                className="btn btn-secondary btn-sm"
              >
                ✕ Close
              </button>
            </div>
            <div className="markdown-body" style={{ whiteSpace: 'pre-line' }}>
              {activeLessonModal.content}
            </div>
            <div style={{ marginTop: 24, textAlign: 'right', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <button
                onClick={() => setActiveLessonModal(null)}
                className="btn btn-primary"
              >
                Done Reading
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
