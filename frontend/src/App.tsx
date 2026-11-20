import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { NetworkBanner } from './components/NetworkBanner';
import { DownloadsPage } from './pages/DownloadsPage';
import { QuizPage } from './pages/QuizPage';
import { AttemptsPage } from './pages/AttemptsPage';
import { SyncPage } from './pages/SyncPage';
import { TeacherPage } from './pages/TeacherPage';
import { DemoPage } from './pages/DemoPage';
import { HelpPage } from './pages/HelpPage';
import { syncEngine } from './services/syncEngine';

export const App: React.FC = () => {
  useEffect(() => {
    // Kick off initial sync queue check on app launch
    syncEngine.processQueue();
    // Check for updated lesson/quiz versions if online
    if (navigator.onLine) {
      syncEngine.checkForContentUpdates();
    }
  }, []);

  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <NetworkBanner />
        <Navbar />
        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<DownloadsPage />} />
            <Route path="/quiz/:quizId" element={<QuizPage />} />
            <Route path="/attempts" element={<AttemptsPage />} />
            <Route path="/sync" element={<SyncPage />} />
            <Route path="/teacher" element={<TeacherPage />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
};

export default App;
