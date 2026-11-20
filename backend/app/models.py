from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, DateTime, Text, JSON
from .database import Base


class Lesson(Base):
    __tablename__ = "lessons"

    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    content = Column(Text, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    lesson_id = Column(String, nullable=False, index=True)
    # questions is JSON: list of { id, text, options: [string], correct_option: int, explanation: string }
    # NOTE: correct_option and explanation are kept server-side only and stripped in GET /api/quizzes
    questions = Column(JSON, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Submission(Base):
    __tablename__ = "submissions"

    # submission_id is primary key and unique
    submission_id = Column(String, primary_key=True, index=True, unique=True)
    student_id = Column(String, nullable=False, index=True)
    quiz_id = Column(String, nullable=False, index=True)
    # answers is JSON mapping question_id -> { "selected_option": int, "client_answered_at": str }
    answers = Column(JSON, nullable=False, default=dict)
    client_started_at = Column(String, nullable=True)
    client_submitted_at = Column(String, nullable=True)
    received_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    status = Column(String, default="PENDING", nullable=False)  # "IN_PROGRESS", "SUBMITTED"
    version = Column(Integer, default=1, nullable=False)  # quiz version taken by student
    score = Column(Float, nullable=True)  # computed score e.g. 100.0 or 80.0
    total_questions = Column(Integer, default=5, nullable=False)
    correct_count = Column(Integer, default=0, nullable=False)
    sync_count = Column(Integer, default=1, nullable=False)  # How many sync requests hit this ID
    signature = Column(String, nullable=True)  # Optional HMAC signature
    is_verified = Column(Integer, default=1, nullable=False)  # 1 = verified, 0 = unverified


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)  # "student" or "teacher"
    session_key = Column(String, nullable=True)  # Secret key for HMAC signing
