import type { Lesson, Quiz, TeacherSummaryResponse } from '../types';

const API_BASE = '/api';

let simulatedOffline = typeof window !== 'undefined' && localStorage.getItem('demo_simulated_offline') === 'true';

export function isOfflineSimulated(): boolean {
  return simulatedOffline;
}

export function setSimulatedOffline(enabled: boolean) {
  simulatedOffline = enabled;
  if (typeof window !== 'undefined') {
    localStorage.setItem('demo_simulated_offline', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event(enabled ? 'offline' : 'online'));
  }
}

function checkNetwork() {
  if (simulatedOffline) {
    throw new TypeError('Failed to fetch: Airplane / Offline mode simulated');
  }
}

export class ApiError extends Error {
  status: number;
  data?: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function fetchLessonsApi(): Promise<Lesson[]> {
  checkNetwork();
  const res = await fetch(`${API_BASE}/lessons`);
  if (!res.ok) {
    throw new ApiError(`Failed to fetch lessons: ${res.statusText}`, res.status);
  }
  return res.json();
}

export async function fetchQuizzesApi(): Promise<Quiz[]> {
  checkNetwork();
  const res = await fetch(`${API_BASE}/quizzes`);
  if (!res.ok) {
    throw new ApiError(`Failed to fetch quizzes: ${res.statusText}`, res.status);
  }
  return res.json();
}

export interface PostSubmissionResult {
  data: any;
  isIdempotentReplay: boolean;
  status: number;
}

export async function postSubmissionApi(
  payload: any,
  simulateDrop: boolean = false
): Promise<PostSubmissionResult> {
  checkNetwork();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (simulateDrop) {
    headers['X-Simulate-Drop'] = 'true';
  }

  const res = await fetch(`${API_BASE}/submissions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const isIdempotentReplay = res.headers.get('X-Idempotent-Replay') === 'true';

  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errJson = await res.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch {}
    throw new ApiError(errorDetail || `HTTP ${res.status}`, res.status);
  }

  const data = await res.json();
  return {
    data,
    isIdempotentReplay,
    status: res.status
  };
}

export async function patchAnswersApi(submissionId: string, answers: any, status?: string) {
  checkNetwork();
  const res = await fetch(`${API_BASE}/submissions/${submissionId}/answers`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers, status })
  });
  if (!res.ok) {
    throw new ApiError(`Failed to patch answers: ${res.statusText}`, res.status);
  }
  return res.json();
}

export async function fetchTeacherSubmissionsApi(): Promise<TeacherSummaryResponse> {
  checkNetwork();
  const res = await fetch(`${API_BASE}/submissions`);
  if (!res.ok) {
    throw new ApiError(`Failed to fetch teacher submissions: ${res.statusText}`, res.status);
  }
  return res.json();
}

export async function resetDemoApi(): Promise<any> {
  checkNetwork();
  const res = await fetch(`${API_BASE}/reset-demo`, { method: 'POST' });
  if (!res.ok) {
    throw new ApiError(`Failed to reset demo: ${res.statusText}`, res.status);
  }
  return res.json();
}
