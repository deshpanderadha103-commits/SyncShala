import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { syncEngine } from '../services/syncEngine';
import { isOfflineSimulated, setSimulatedOffline } from '../services/api';

export const NetworkBanner: React.FC = () => {
  const [isSimulated, setIsSimulated] = useState<boolean>(isOfflineSimulated());
  const [realOnline, setRealOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [simulateDropActive, setSimulateDropActive] = useState<boolean>(syncEngine.getSimulateDropNext());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const effectiveOnline = realOnline && !isSimulated;

  // Monitor pending submissions in syncQueue
  const pendingCount = useLiveQuery(
    () => db.syncQueue.where('status').equals('PENDING').or('status').equals('FAILED').count(),
    [],
    0
  );

  useEffect(() => {
    const handleOnline = () => {
      setRealOnline(navigator.onLine);
      setIsSimulated(isOfflineSimulated());
    };
    const handleOffline = () => {
      setRealOnline(navigator.onLine);
      setIsSimulated(isOfflineSimulated());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = syncEngine.subscribe(() => {
      setSimulateDropActive(syncEngine.getSimulateDropNext());
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  const handleToggleAirplane = () => {
    const nextState = !isSimulated;
    setIsSimulated(nextState);
    setSimulatedOffline(nextState);
    if (!nextState && realOnline) {
      // Switched back to online: kick off sync
      setTimeout(() => {
        syncEngine.syncNow();
      }, 100);
    }
  };

  const handleSyncNow = async () => {
    if (!effectiveOnline) return;
    setIsSyncing(true);
    try {
      await syncEngine.syncNow();
    } finally {
      setTimeout(() => setIsSyncing(false), 600);
    }
  };

  return (
    <div className={`network-banner ${effectiveOnline ? 'banner-online' : 'banner-offline'}`}>
      <div className="banner-content">
        <span className={`status-dot ${effectiveOnline ? 'dot-online' : 'dot-offline'}`} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <strong>{effectiveOnline ? 'ONLINE' : isSimulated ? '✈️ AIRPLANE MODE (OFFLINE)' : 'OFFLINE'}</strong>
          <span style={{ opacity: 0.9, fontWeight: 500, fontSize: '0.82rem' }}>
            {effectiveOnline
              ? '• Cloud sync connected'
              : '• Zero connectivity. All progress persists to IndexedDB.'}
          </span>
        </span>

        {pendingCount > 0 && (
          <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>
            ⏳ {pendingCount} Pending Sync
          </span>
        )}

        {simulateDropActive && (
          <span className="badge badge-danger" title="Fault injection active: next submission will drop connection">
            ⚡ Drop Next Upload
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* Quick Offline Simulator Switch for Demo / Testing */}
        <button
          onClick={handleToggleAirplane}
          className="btn btn-sm"
          style={{
            background: isSimulated ? '#ef4444' : '#ffffff',
            color: isSimulated ? '#ffffff' : 'var(--text)',
            padding: '4px 10px',
            fontSize: '0.78rem',
            borderRadius: 6,
            fontWeight: 700,
            border: '1px solid rgba(0,0,0,0.1)'
          }}
          title={isSimulated ? 'Turn Airplane Mode OFF (Reconnect)' : 'Turn Airplane Mode ON (Simulate 100% offline)'}
        >
          {isSimulated ? '📡 Connect Online' : '✈️ Go Offline'}
        </button>

        {effectiveOnline && (
          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="btn btn-secondary btn-sm"
            style={{
              background: '#ffffff',
              padding: '4px 12px',
              minHeight: '30px',
              fontSize: '0.78rem',
              borderRadius: 6,
              fontWeight: 700
            }}
          >
            {isSyncing ? '🔄 Syncing...' : '🔄 Sync Now'}
          </button>
        )}
      </div>
    </div>
  );
};
