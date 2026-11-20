export interface Question {
  id: string;
  text: string;
  options: string[];
}

export interface Lesson {
  id: string;
  title: string;
  description?: string;
  content: string;
  version: number;
  created_at?: string;
  isDownloaded?: boolean;
}

export interface Quiz {
  id: string;
  title: string;
  lesson_id: string;
  questions: Question[];
  version: number;
  created_at?: string;
  isDownloaded?: boolean;
}

export interface AnswerData {
  selected_option: number;
  client_answered_at: string;
}

export interface QuizAttempt {
  submission_id: string; // UUID primary key
  student_id: string;
  quiz_id: string;
  quiz_title: string;
  version: number; // Version of the quiz taken
  answers: Record<string, AnswerData>; // question_id -> AnswerData
  current_question_index: number;
  client_started_at: string;
  client_submitted_at?: string;
  status: 'IN_PROGRESS' | 'SUBMITTED';
  score?: number;
  total_questions: number;
  correct_count?: number;
  signature?: string;
  sync_status: 'NOT_SUBMITTED' | 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
  last_sync_error?: string;
}

export interface SyncQueueItem {
  submission_id: string; // Primary key
  student_id: string;
  quiz_id: string;
  payload: any;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
  retry_count: number;
  max_retries: number;
  next_retry_at: number;
  created_at: string;
  last_attempt_at?: string;
  last_error?: string;
  is_replay?: boolean;
}

export interface SyncLogEntry {
  id?: number;
  submission_id: string;
  timestamp: string;
  attempt_number: number;
  status: 'PENDING' | 'SYNCING' | 'SUCCESS' | 'REPLAY_SUCCESS' | 'FAILED' | 'DROPPED';
  http_code?: number;
  message: string;
  details?: string;
}

export interface TeacherSubmissionView {
  submission_id: string;
  student_id: string;
  quiz_id: string;
  answers: Record<string, any>;
  score?: number;
  total_questions: number;
  correct_count: number;
  received_at: string;
  status: string;
  version: number;
  sync_count: number;
  is_verified: number;
}

export interface TeacherSummaryResponse {
  submissions: TeacherSubmissionView[];
  total_submissions: number;
  unique_attempts: number;
  duplicates_absorbed: number;
  duplicates_detected: number;
}
