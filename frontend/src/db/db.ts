import Dexie, { type EntityTable } from 'dexie';
import type { Lesson, Quiz, QuizAttempt, SyncQueueItem, SyncLogEntry } from '../types';

export class OfflineLearningDB extends Dexie {
  lessons!: EntityTable<Lesson, 'id'>;
  quizzes!: EntityTable<Quiz, 'id'>;
  attempts!: EntityTable<QuizAttempt, 'submission_id'>;
  syncQueue!: EntityTable<SyncQueueItem, 'submission_id'>;
  syncLog!: EntityTable<SyncLogEntry, 'id'>;

  constructor() {
    super('OfflineLearningPlatformDB');
    this.version(1).stores({
      lessons: 'id, version',
      quizzes: 'id, lesson_id, version',
      attempts: 'submission_id, quiz_id, student_id, status',
      syncQueue: 'submission_id, status, next_retry_at',
      syncLog: '++id, submission_id, timestamp, status'
    });
  }
}

export const db = new OfflineLearningDB();
