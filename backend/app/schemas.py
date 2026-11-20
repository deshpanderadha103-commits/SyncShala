from datetime import datetime
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, ConfigDict


class QuestionOut(BaseModel):
    id: str
    text: str
    options: List[str]
    # Sensitive correct_option and explanation are stripped for clients!


class LessonOut(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    content: str
    version: int
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class QuizOut(BaseModel):
    id: str
    title: str
    lesson_id: str
    questions: List[QuestionOut]
    version: int
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AnswerItem(BaseModel):
    selected_option: int
    client_answered_at: Optional[str] = None


class SubmissionCreate(BaseModel):
    submission_id: str
    student_id: str
    quiz_id: str
    answers: Dict[str, Any]
    client_started_at: Optional[str] = None
    client_submitted_at: Optional[str] = None
    status: Optional[str] = "SUBMITTED"
    version: int = 1
    signature: Optional[str] = None


class SubmissionPatch(BaseModel):
    answers: Dict[str, Any]
    status: Optional[str] = None
    client_submitted_at: Optional[str] = None


class SubmissionOut(BaseModel):
    submission_id: str
    student_id: str
    quiz_id: str
    answers: Dict[str, Any]
    client_started_at: Optional[str] = None
    client_submitted_at: Optional[str] = None
    received_at: Optional[datetime] = None
    status: str
    version: int
    score: Optional[float] = None
    total_questions: int
    correct_count: int
    sync_count: int
    is_verified: int

    model_config = ConfigDict(from_attributes=True)


class SubmissionsTeacherSummary(BaseModel):
    submissions: List[SubmissionOut]
    total_submissions: int
    unique_attempts: int
    duplicates_absorbed: int
    duplicates_detected: int
