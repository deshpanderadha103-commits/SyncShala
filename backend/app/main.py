import gzip
import hmac
import hashlib
import json
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, Depends, HTTPException, Header, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from .database import engine, Base, get_db
from .models import Lesson, Quiz, Submission, User
from .schemas import (
    LessonOut,
    QuizOut,
    QuestionOut,
    SubmissionCreate,
    SubmissionPatch,
    SubmissionOut,
    SubmissionsTeacherSummary,
)
from .seed import seed_database

# Create all tables on startup
Base.metadata.create_all(bind=engine)

# Seed initial lessons, quizzes, users
with Session(engine) as init_db:
    seed_database(init_db)

app = FastAPI(
    title="SyncShala API",
    description="SyncShala: Learn anywhere. Sync everywhere. Fault-tolerant offline-first learning backend",
    version="1.0.0"
)

# Request GZip Decompression Middleware (Phase 5: Low-bandwidth compressed payloads)
class GZipRequestMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.headers.get("content-encoding") == "gzip":
            try:
                body = await request.body()
                decompressed_body = gzip.decompress(body)
                request._body = decompressed_body
                
                # Update headers in ASGI scope: remove content-encoding and update content-length
                headers = []
                for name, value in request.scope.get("headers", []):
                    if name.lower() == b"content-encoding":
                        continue
                    if name.lower() == b"content-length":
                        headers.append((b"content-length", str(len(decompressed_body)).encode()))
                    else:
                        headers.append((name, value))
                request.scope["headers"] = headers

                async def receive():
                    return {"type": "http.request", "body": decompressed_body}
                request._receive = receive
            except Exception as e:
                return Response(
                    content=f"Invalid gzip body: {e}",
                    status_code=400,
                    media_type="text/plain"
                )
        return await call_next(request)

app.add_middleware(GZipRequestMiddleware)

# CORS configuration for PWA frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Idempotent-Replay", "X-Simulate-Drop", "Content-Encoding"],
)


# Helper: Strip sensitive answers for client quiz payload
def sanitize_quiz(quiz: Quiz) -> dict:
    sanitized_questions = []
    for q in quiz.questions:
        sanitized_questions.append({
            "id": q["id"],
            "text": q["text"],
            "options": q["options"]
        })
    return {
        "id": quiz.id,
        "title": quiz.title,
        "lesson_id": quiz.lesson_id,
        "questions": sanitized_questions,
        "version": quiz.version,
        "created_at": quiz.created_at
    }


# Helper: Calculate submission score server-side
def compute_submission_score(quiz: Quiz, answers: Dict[str, Any]):
    total = len(quiz.questions)
    if total == 0:
        return 0.0, 0, 0

    correct_count = 0
    correct_lookup = {q["id"]: q.get("correct_option") for q in quiz.questions}

    for qid, ans in answers.items():
        if isinstance(ans, dict):
            selected = ans.get("selected_option")
        elif isinstance(ans, int):
            selected = ans
        else:
            selected = None

        if selected is not None and correct_lookup.get(qid) == selected:
            correct_count += 1

    score = round((correct_count / total) * 100.0, 1)
    return score, correct_count, total


# Helper: HMAC verification (Phase 5)
def verify_payload_hmac(student_id: str, answers: Dict[str, Any], signature: Optional[str], db: Session) -> int:
    if not signature:
        return 1  # Standard submission without strict signing
    user = db.query(User).filter(User.id == student_id).first()
    if not user or not user.session_key:
        return 0
    # Canonical string from sorted answers
    canonical_payload = json.dumps(answers, sort_keys=True)
    expected = hmac.new(user.session_key.encode(), canonical_payload.encode(), hashlib.sha256).hexdigest()
    return 1 if hmac.compare_digest(expected, signature) else 0


@app.get("/api/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/lessons", response_model=List[LessonOut])
def get_lessons(db: Session = Depends(get_db)):
    """Fetch all lessons with their version."""
    return db.query(Lesson).all()


@app.get("/api/quizzes", response_model=List[QuizOut])
def get_quizzes(db: Session = Depends(get_db)):
    """
    Fetch all quizzes. Correct answers and explanations are NEVER returned
    to clients, preventing answer extraction while offline.
    """
    quizzes = db.query(Quiz).all()
    return [sanitize_quiz(q) for q in quizzes]


@app.get("/api/quizzes/{quiz_id}", response_model=QuizOut)
def get_quiz_by_id(quiz_id: str, db: Session = Depends(get_db)):
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return sanitize_quiz(quiz)


@app.post("/api/submissions", response_model=SubmissionOut)
async def create_or_replay_submission(
    submission_in: SubmissionCreate,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    x_simulate_drop: Optional[str] = Header(None, alias="X-Simulate-Drop")
):
    """
    IDEMPOTENT SUBMISSION ENDPOINT:
    - If submission_id already exists, returns 200 with EXISTING record and header X-Idempotent-Replay: true.
    - Uses database UNIQUE constraint on submission_id and handles race condition (catches IntegrityError).
    - NEVER creates a duplicate row.
    - DEMO FAULT INJECTION: If X-Simulate-Drop: true is present, the server COMMITS the record to SQLite
      and then drops/aborts the connection without sending a normal HTTP 200 response.
    """
    # 1. Check if submission already exists (idempotent replay check)
    existing = db.query(Submission).filter(Submission.submission_id == submission_in.submission_id).first()
    if existing:
        existing.sync_count += 1
        db.commit()
        db.refresh(existing)
        response.headers["X-Idempotent-Replay"] = "true"
        return existing

    # 2. Fetch quiz to calculate score
    quiz = db.query(Quiz).filter(Quiz.id == submission_in.quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail=f"Quiz '{submission_in.quiz_id}' not found")

    score, correct_count, total = compute_submission_score(quiz, submission_in.answers)

    # 3. Verify HMAC signature if provided (Phase 5)
    is_verified = verify_payload_hmac(submission_in.student_id, submission_in.answers, submission_in.signature, db)

    # 4. Prepare new record
    new_submission = Submission(
        submission_id=submission_in.submission_id,
        student_id=submission_in.student_id,
        quiz_id=submission_in.quiz_id,
        answers=submission_in.answers,
        client_started_at=submission_in.client_started_at,
        client_submitted_at=submission_in.client_submitted_at or datetime.now(timezone.utc).isoformat(),
        received_at=datetime.now(timezone.utc),
        status=submission_in.status or "SUBMITTED",
        version=submission_in.version,
        score=score,
        total_questions=total,
        correct_count=correct_count,
        sync_count=1,
        signature=submission_in.signature,
        is_verified=is_verified
    )

    try:
        db.add(new_submission)
        db.commit()
        db.refresh(new_submission)
    except IntegrityError:
        # Catch concurrent race condition where two requests with same submission_id arrived simultaneously
        db.rollback()
        existing = db.query(Submission).filter(Submission.submission_id == submission_in.submission_id).first()
        if existing:
            existing.sync_count += 1
            db.commit()
            db.refresh(existing)
            response.headers["X-Idempotent-Replay"] = "true"
            return existing
        raise HTTPException(status_code=500, detail="Database integrity error during submission")

    # 5. DEMO FAULT INJECTION
    # If client requested simulated drop, commit is ALREADY COMPLETE in DB.
    # We now drop the connection without returning a successful response!
    if x_simulate_drop and x_simulate_drop.lower() == "true":
        # Abort the raw transport if running under Uvicorn / ASGI server
        transport = request.scope.get("transport")
        if transport and hasattr(transport, "abort"):
            transport.abort()
        # For test suites or clients that catch HTTP errors:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="FAULT INJECTION: Server committed submission to DB, then connection dropped before sending response."
        )

    return new_submission


@app.patch("/api/submissions/{submission_id}/answers", response_model=SubmissionOut)
def patch_submission_answers(
    submission_id: str,
    patch_in: SubmissionPatch,
    db: Session = Depends(get_db)
):
    """
    Resumable, incremental answer sync endpoint:
    CONFLICT RULE:
    1. A submitted attempt is IMMUTABLE: later offline edits to the same submission_id never overwrite it.
    2. For in-progress answers: latest client timestamp wins PER QUESTION, with server received order as tiebreaker.
    """
    submission = db.query(Submission).filter(Submission.submission_id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Conflict rule 1: If already SUBMITTED, it is immutable!
    if submission.status == "SUBMITTED":
        return submission

    # Conflict rule 2: Per-question merge by timestamp
    current_answers = dict(submission.answers or {})

    for qid, new_ans in patch_in.answers.items():
        if qid not in current_answers:
            current_answers[qid] = new_ans
        else:
            old_ans = current_answers[qid]
            # Compare client_answered_at timestamps
            old_ts = old_ans.get("client_answered_at") if isinstance(old_ans, dict) else ""
            new_ts = new_ans.get("client_answered_at") if isinstance(new_ans, dict) else ""

            # Latest client timestamp wins
            if (new_ts or "") >= (old_ts or ""):
                current_answers[qid] = new_ans

    submission.answers = current_answers

    if patch_in.status:
        submission.status = patch_in.status
        if patch_in.status == "SUBMITTED":
            quiz = db.query(Quiz).filter(Quiz.id == submission.quiz_id).first()
            if quiz:
                score, correct, total = compute_submission_score(quiz, submission.answers)
                submission.score = score
                submission.correct_count = correct
                submission.total_questions = total
            submission.client_submitted_at = patch_in.client_submitted_at or datetime.now(timezone.utc).isoformat()

    submission.sync_count += 1
    db.commit()
    db.refresh(submission)
    return submission


@app.get("/api/submissions", response_model=SubmissionsTeacherSummary)
def get_teacher_submissions(db: Session = Depends(get_db)):
    """
    Teacher view: returns all student submissions with computed scores,
    and calculates duplicate statistics to prove idempotency.
    """
    submissions = db.query(Submission).order_by(Submission.received_at.desc()).all()

    # Calculate duplicate statistics
    total_submissions = len(submissions)
    # Check for any duplicate submission_ids in DB (enforced by PK/Unique)
    seen_ids = set()
    db_duplicates = 0
    for s in submissions:
        if s.submission_id in seen_ids:
            db_duplicates += 1
        seen_ids.add(s.submission_id)

    # Duplicates absorbed = count of replays handled smoothly without creating new DB rows
    duplicates_absorbed = sum(max(0, s.sync_count - 1) for s in submissions)

    return {
        "submissions": submissions,
        "total_submissions": total_submissions,
        "unique_attempts": len(seen_ids),
        "duplicates_absorbed": duplicates_absorbed,
        "duplicates_detected": db_duplicates,  # ALWAYS 0 due to idempotency!
    }


@app.post("/api/reset-demo")
def reset_demo_submissions(db: Session = Depends(get_db)):
    """Convenience endpoint for hackathon demo to reset submissions."""
    db.query(Submission).delete()
    db.commit()
    return {"message": "All submissions cleared for fresh demo."}


# Serve Frontend PWA on the SAME PORT (Single-Host Mode at http://localhost:8000)
import os
from starlette.staticfiles import StaticFiles
from starlette.responses import FileResponse

frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))

if os.path.exists(frontend_dist):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa_frontend(full_path: str):
        # Don't intercept API routes
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        # Serve static files directly if they exist in dist (e.g., sw.js, manifest.webmanifest, icons)
        file_path = os.path.join(frontend_dist, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        # Otherwise serve index.html for React Router SPA
        index_file = os.path.join(frontend_dist, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend build index.html not found")

