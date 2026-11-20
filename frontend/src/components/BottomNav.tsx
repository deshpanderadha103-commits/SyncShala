import React from 'react';
import { NavLink } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

export const BottomNav: React.FC = () => {
  const pendingCount = useLiveQuery(
    () => db.syncQueue.where('status').equals('PENDING').or('status').equals('FAILED').count(),
    [],
    0
  );

  return (
    <nav className="mobile-bottom-nav">
      <NavLink to="/" end className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
        <span className="bottom-nav-icon">📖</span>
        <span className="bottom-nav-label">Lessons</span>
      </NavLink>

      <NavLink to="/attempts" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
        <span className="bottom-nav-icon">✏️</span>
        <span className="bottom-nav-label">Quizzes</span>
      </NavLink>

      <NavLink to="/sync" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
        <span className="bottom-nav-icon" style={{ position: 'relative' }}>
          🔄
          {pendingCount > 0 && (
            <span className="bottom-nav-badge">{pendingCount}</span>
          )}
        </span>
        <span className="bottom-nav-label">Sync</span>
      </NavLink>

      <NavLink to="/teacher" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
        <span className="bottom-nav-icon">👩‍🏫</span>
        <span className="bottom-nav-label">Teacher</span>
      </NavLink>

      <NavLink to="/demo" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
        <span className="bottom-nav-icon">⚡</span>
        <span className="bottom-nav-label">Demo</span>
      </NavLink>
    </nav>
  );
};
