import { db } from '../db/db';
import { postSubmissionApi, fetchQuizzesApi, fetchLessonsApi, ApiError } from './api';
import type { QuizAttempt, SyncQueueItem, SyncLogEntry } from '../types';

class SyncEngine {
  private isProcessing = false;
  private retryTimers: Map<string, number> = new Map();
  private simulateDropNext = false;
  private onStatusChangeCallbacks: Set<() => void> = new Set();

  constructor() {
    // Listen for online events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[SyncEngine] Network reconnected. Triggering sync...');
        this.syncNow();
        this.checkForContentUpdates();
      });

      // Load simulate drop state from localStorage if preserved
      this.simulateDropNext = localStorage.getItem('demo_simulate_drop') === 'true';
    }
  }

  public subscribe(callback: () => void) {
    this.onStatusChangeCallbacks.add(callback);
    return () => {
      this.onStatusChangeCallbacks.delete(callback);
    };
  }

  private notify() {
    this.onStatusChangeCallbacks.forEach(cb => {
      try { cb(); } catch {}
    });
  }

  public setSimulateDropNext(enabled: boolean) {
    this.simulateDropNext = enabled;
    localStorage.setItem('demo_simulate_drop', enabled ? 'true' : 'false');
    this.notify();
  }

  public getSimulateDropNext(): boolean {
    return this.simulateDropNext;
  }

  public async enqueueSubmission(attempt: QuizAttempt) {
    const payload = {
      submission_id: attempt.submission_id,
      student_id: attempt.student_id,
      quiz_id: attempt.quiz_id,
      answers: attempt.answers,
      client_started_at: attempt.client_started_at,
      client_submitted_at: attempt.client_submitted_at || new Date().toISOString(),
      status: 'SUBMITTED',
      version: attempt.version,
      signature: attempt.signature
    };

    const queueItem: SyncQueueItem = {
      submission_id: attempt.submission_id,
      student_id: attempt.student_id,
      quiz_id: attempt.quiz_id,
      payload,
      status: 'PENDING',
      retry_count: 0,
      max_retries: 5,
      next_retry_at: Date.now(),
      created_at: new Date().toISOString()
    };

    await db.syncQueue.put(queueItem);

    // Update attempt record in IndexedDB
    await db.attempts.update(attempt.submission_id, {
      sync_status: 'PENDING',
      status: 'SUBMITTED',
      client_submitted_at: payload.client_submitted_at
    });

    // Add log
    await this.logEvent({
      submission_id: attempt.submission_id,
      attempt_number: 0,
      status: 'PENDING',
      message: 'Attempt queued for background sync with idempotency key.'
    });

    this.notify();
    this.processQueue();
  }

  public async retrySubmission(submissionId: string) {
    const item = await db.syncQueue.get(submissionId);
    if (!item) return;

    // Reset status to PENDING and clear backoff timer
    await db.syncQueue.update(submissionId, {
      status: 'PENDING',
      next_retry_at: Date.now()
    });

    await db.attempts.update(submissionId, {
      sync_status: 'PENDING',
      last_sync_error: undefined
    });

    await this.logEvent({
      submission_id: submissionId,
      attempt_number: item.retry_count + 1,
      status: 'PENDING',
      message: 'Manual retry initiated by user.'
    });

    this.notify();
    this.processQueue();
  }

  public async syncNow() {
    // Reset all failed or pending items to ready
    const items = await db.syncQueue.toArray();
    for (const item of items) {
      if (item.status === 'FAILED' || item.status === 'PENDING') {
        await db.syncQueue.update(item.submission_id, {
          status: 'PENDING',
          next_retry_at: Date.now()
        });
      }
    }
    this.notify();
    await this.processQueue();
  }

  public async processQueue() {
    if (this.isProcessing) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('[SyncEngine] Offline. Sync deferred until reconnection.');
      return;
    }

    this.isProcessing = true;

    try {
      const now = Date.now();
      const eligibleItems = await db.syncQueue
        .where('status')
        .equals('PENDING')
        .or('status')
        .equals('FAILED')
        .filter(item => item.next_retry_at <= now)
        .toArray();

      for (const item of eligibleItems) {
        await this.syncItem(item);
      }
    } finally {
      this.isProcessing = false;
      this.notify();
    }
  }

  private async syncItem(item: SyncQueueItem) {
    const submissionId = item.submission_id;

    // Set to SYNCING
    await db.syncQueue.update(submissionId, { status: 'SYNCING' });
    await db.attempts.update(submissionId, { sync_status: 'SYNCING' });

    // Check demo drop connection toggle
    const shouldDrop = this.simulateDropNext;
    if (shouldDrop) {
      // Consume toggle immediately: applies ONLY to the next upload!
      this.setSimulateDropNext(false);
    }

    const currentAttempt = item.retry_count + 1;

    await this.logEvent({
      submission_id: submissionId,
      attempt_number: currentAttempt,
      status: 'SYNCING',
      message: shouldDrop
        ? `Attempt #${currentAttempt}: Transmitting POST /api/submissions (FAULT INJECTION: X-Simulate-Drop: true)`
        : `Attempt #${currentAttempt}: Transmitting POST /api/submissions (idempotency key: ${submissionId})`
    });

    try {
      const result = await postSubmissionApi(item.payload, shouldDrop);

      // Handle SUCCESS
      if (result.isIdempotentReplay) {
        await this.logEvent({
          submission_id: submissionId,
          attempt_number: currentAttempt,
          status: 'REPLAY_SUCCESS',
          http_code: 200,
          message: '200 OK with X-Idempotent-Replay: true. Server recognized previous commit and returned existing row without duplicate!'
        });
      } else {
        await this.logEvent({
          submission_id: submissionId,
          attempt_number: currentAttempt,
          status: 'SUCCESS',
          http_code: 200,
          message: `200 OK. Submission recorded and scored: ${result.data.score}% (${result.data.correct_count}/${result.data.total_questions})`
        });
      }

      await db.syncQueue.update(submissionId, {
        status: 'SYNCED',
        is_replay: result.isIdempotentReplay,
        last_attempt_at: new Date().toISOString()
      });

      await db.attempts.update(submissionId, {
        sync_status: 'SYNCED',
        score: result.data.score,
        correct_count: result.data.correct_count,
        total_questions: result.data.total_questions
      });

    } catch (err: any) {
      const isSimulated = shouldDrop || (err instanceof ApiError && err.status === 504);
      const errorMessage = err.message || 'Network / connection dropped';

      await this.logEvent({
        submission_id: submissionId,
        attempt_number: currentAttempt,
        status: isSimulated ? 'DROPPED' : 'FAILED',
        http_code: err.status || 0,
        message: isSimulated
          ? 'CONNECTION DROPPED: Server committed record to database, but connection severed before response received!'
          : `Transmission failed: ${errorMessage}`,
        details: err.stack
      });

      const newRetryCount = item.retry_count + 1;
      // Exponential backoff: 2s, 4s, 8s, 16s, 30s
      const backoffMs = Math.min(2000 * Math.pow(2, item.retry_count), 30000);
      const nextRetryAt = Date.now() + backoffMs;

      await db.syncQueue.update(submissionId, {
        status: 'FAILED',
        retry_count: newRetryCount,
        next_retry_at: nextRetryAt,
        last_error: errorMessage,
        last_attempt_at: new Date().toISOString()
      });

      await db.attempts.update(submissionId, {
        sync_status: 'FAILED',
        last_sync_error: errorMessage
      });

      // Schedule automated retry if under max retries
      if (newRetryCount < item.max_retries) {
        if (this.retryTimers.has(submissionId)) {
          clearTimeout(this.retryTimers.get(submissionId));
        }
        const timer = window.setTimeout(() => {
          this.retryTimers.delete(submissionId);
          this.processQueue();
        }, backoffMs);
        this.retryTimers.set(submissionId, timer);
      }
    }
  }

  // Conflict Rule #3: Server content version wins. Replace cached copy and check in-progress attempts.
  public async checkForContentUpdates() {
    try {
      const serverQuizzes = await fetchQuizzesApi();
      for (const serverQuiz of serverQuizzes) {
        const localQuiz = await db.quizzes.get(serverQuiz.id);
        if (localQuiz && serverQuiz.version > localQuiz.version) {
          console.warn(`[ConflictRule] Server quiz ${serverQuiz.id} version (${serverQuiz.version}) is newer than cached (${localQuiz.version}). Updating local copy.`);
          await db.quizzes.put({
            ...serverQuiz,
            isDownloaded: true
          });
        }
      }

      const serverLessons = await fetchLessonsApi();
      for (const serverLesson of serverLessons) {
        const localLesson = await db.lessons.get(serverLesson.id);
        if (localLesson && serverLesson.version > localLesson.version) {
          console.warn(`[ConflictRule] Server lesson ${serverLesson.id} version (${serverLesson.version}) is newer than cached (${localLesson.version}). Updating local copy.`);
          await db.lessons.put({
            ...serverLesson,
            isDownloaded: true
          });
        }
      }
    } catch {
      // Offline or network error during background check is expected
    }
  }

  private async logEvent(entry: Omit<SyncLogEntry, 'timestamp'>) {
    const fullEntry: SyncLogEntry = {
      ...entry,
      timestamp: new Date().toISOString()
    };
    await db.syncLog.add(fullEntry);
  }
}

export const syncEngine = new SyncEngine();
