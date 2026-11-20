import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const [currentStudent, setCurrentStudent] = useState<string>(() => {
    return localStorage.getItem('current_student_id') || 'student_1';
  });

  const handleStudentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'teacher') {
      navigate('/teacher');
      return;
    }
    setCurrentStudent(val);
    localStorage.setItem('current_student_id', val);
    window.dispatchEvent(new Event('student_changed'));
  };

  useEffect(() => {
    const syncStudent = () => {
      setCurrentStudent(localStorage.getItem('current_student_id') || 'student_1');
    };
    window.addEventListener('student_changed', syncStudent);
    return () => window.removeEventListener('student_changed', syncStudent);
  }, []);

  return (
    <header className="header">
      <div className="header-inner">
        <NavLink to="/" className="brand">
          <img
            src="/icon-192.png"
            alt="SyncShala Logo"
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              boxShadow: '0 2px 8px rgba(13, 148, 136, 0.25)',
              objectFit: 'cover'
            }}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.4px' }}>
                SyncShala
              </span>
              <span className="brand-badge">PWA</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', fontWeight: 600, letterSpacing: '0.2px' }}>
              Learn anywhere. Sync everywhere.
            </div>
          </div>
        </NavLink>

        <nav className="nav-links">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span>📖</span>
            <span>Lessons</span>
          </NavLink>
          <NavLink to="/attempts" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span>✏️</span>
            <span>My Quizzes</span>
          </NavLink>
          <NavLink to="/sync" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span>🔄</span>
            <span>Sync Queue</span>
          </NavLink>
          <NavLink to="/teacher" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span>👩‍🏫</span>
            <span>Teacher</span>
          </NavLink>
          <NavLink to="/demo" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span>⚡</span>
            <span>Fault Demo</span>
          </NavLink>
          <NavLink to="/help" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span>ℹ️</span>
            <span>Rules</span>
          </NavLink>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafb', padding: '4px 8px', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: 'var(--primary-surface)',
            color: 'var(--primary-dark)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.8rem',
            fontWeight: 700
          }}>
            {currentStudent === 'student_1' ? 'A' : 'B'}
          </div>
          <select
            value={currentStudent}
            onChange={handleStudentChange}
            style={{
              padding: '4px 6px',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--text)',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="student_1">Alice Chen (Student 1)</option>
            <option value="student_2">Bob Smith (Student 2)</option>
            <option value="teacher">Switch to Teacher Dashboard</option>
          </select>
        </div>
      </div>
    </header>
  );
};
