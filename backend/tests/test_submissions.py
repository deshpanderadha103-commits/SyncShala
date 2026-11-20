import gzip
import json
import hmac
import hashlib
import pytest
from app.models import Submission


def test_quiz_payload_never_leaks_correct_answers(client):
    """Verify that GET /api/quizzes does not expose correct_option or explanation."""
    response = client.get("/api/quizzes")
    assert response.status_code == 200
    quizzes = response.json()
    assert len(quizzes) >= 2
    for q in quizzes:
        assert "version" in q
        for question in q["questions"]:
            assert "correct_option" not in question, "Security violation: correct_option exposed!"
            assert "explanation" not in question, "Security violation: explanation exposed!"


def test_idempotent_post_twice_results_in_one_row(client, test_db_session):
    """(a) Posting the exact same submission_id twice results in EXACTLY 1 row and X-Idempotent-Replay."""
    sub_id = "test_sub_uuid_1001"
    payload = {
        "submission_id": sub_id,
        "student_id": "student_1",
        "quiz_id": "quiz_python_basics",
        "answers": {
            "q1": {"selected_option": 1, "client_answered_at": "2026-11-20T10:00:00Z"},
            "q2": {"selected_option": 2, "client_answered_at": "2026-11-20T10:01:00Z"},
            "q3": {"selected_option": 2, "client_answered_at": "2026-11-20T10:02:00Z"},
            "q4": {"selected_option": 1, "client_answered_at": "2026-11-20T10:03:00Z"},
            "q5": {"selected_option": 3, "client_answered_at": "2026-11-20T10:04:00Z"}
        },
        "client_started_at": "2026-11-20T10:00:00Z",
        "client_submitted_at": "2026-11-20T10:05:00Z",
        "status": "SUBMITTED",
        "version": 1
    }

    # First POST
    res1 = client.post("/api/submissions", json=payload)
    assert res1.status_code == 200
    assert "X-Idempotent-Replay" not in res1.headers
    data1 = res1.json()
    assert data1["submission_id"] == sub_id
    assert data1["score"] == 100.0  # All 5 correct answers!

    # Second POST (exact duplicate / retry)
    res2 = client.post("/api/submissions", json=payload)
    assert res2.status_code == 200
    assert res2.headers.get("X-Idempotent-Replay") == "true"
    data2 = res2.json()
    assert data2["submission_id"] == sub_id

    # Verify directly in SQLite: exactly 1 row exists
    with test_db_session() as db:
        rows = db.query(Submission).filter(Submission.submission_id == sub_id).all()
        assert len(rows) == 1, f"Expected 1 row, found {len(rows)}"
        assert rows[0].sync_count == 2
        assert rows[0].score == 100.0


def test_simulated_drop_followed_by_retry(client, test_db_session):
    """
    (b) Fault injection: X-Simulate-Drop commits to database, but connection drops.
    Retry succeeds, returns existing row with X-Idempotent-Replay, and exactly 1 row exists with all answers.
    """
    sub_id = "test_sub_drop_retry_2002"
    payload = {
        "submission_id": sub_id,
        "student_id": "student_2",
        "quiz_id": "quiz_networking_basics",
        "answers": {
            "q1": {"selected_option": 2, "client_answered_at": "2026-11-20T11:00:00Z"},
            "q2": {"selected_option": 1, "client_answered_at": "2026-11-20T11:01:00Z"},
            "q3": {"selected_option": 1, "client_answered_at": "2026-11-20T11:02:00Z"},
            "q4": {"selected_option": 1, "client_answered_at": "2026-11-20T11:03:00Z"},
            "q5": {"selected_option": 1, "client_answered_at": "2026-11-20T11:04:00Z"}
        },
        "client_started_at": "2026-11-20T11:00:00Z",
        "client_submitted_at": "2026-11-20T11:05:00Z",
        "status": "SUBMITTED",
        "version": 1
    }

    # 1. Post with X-Simulate-Drop: true
    res_dropped = client.post(
        "/api/submissions",
        json=payload,
        headers={"X-Simulate-Drop": "true"}
    )
    # The client receives a connection failure / 504 dropped connection
    assert res_dropped.status_code == 504

    # The server DID commit the row to the database before dropping connection!
    with test_db_session() as db:
        saved = db.query(Submission).filter(Submission.submission_id == sub_id).first()
        assert saved is not None
        assert len(saved.answers) == 5

    # 2. Client retries (standard sync retry loop, without drop header)
    res_retry = client.post("/api/submissions", json=payload)
    assert res_retry.status_code == 200
    assert res_retry.headers.get("X-Idempotent-Replay") == "true"
    data = res_retry.json()
    assert data["submission_id"] == sub_id
    assert len(data["answers"]) == 5
    assert data["score"] == 100.0

    # 3. Exactly 1 row in the database
    with test_db_session() as db:
        rows = db.query(Submission).filter(Submission.submission_id == sub_id).all()
        assert len(rows) == 1
        assert rows[0].sync_count == 2


def test_conflict_rule_behavior(client):
    """
    (c) Conflict rule:
    1. A submitted attempt is IMMUTABLE: offline edits cannot overwrite it.
    2. In-progress answers: latest client timestamp wins per question.
    """
    sub_id = "test_sub_conflict_3003"

    # Part 1: In-progress answer sync with timestamps
    initial_patch = {
        "answers": {
            "q1": {"selected_option": 0, "client_answered_at": "2026-11-20T12:00:00Z"},
            "q2": {"selected_option": 0, "client_answered_at": "2026-11-20T12:00:00Z"}
        },
        "status": "IN_PROGRESS"
    }

    # Create submission in progress
    create_payload = {
        "submission_id": sub_id,
        "student_id": "student_1",
        "quiz_id": "quiz_python_basics",
        "answers": initial_patch["answers"],
        "client_started_at": "2026-11-20T12:00:00Z",
        "status": "IN_PROGRESS",
        "version": 1
    }
    res_init = client.post("/api/submissions", json=create_payload)
    assert res_init.status_code == 200

    # Newer timestamp wins: update q1 with newer timestamp
    patch_newer = {
        "answers": {
            "q1": {"selected_option": 1, "client_answered_at": "2026-11-20T12:10:00Z"}
        }
    }
    res_p1 = client.patch(f"/api/submissions/{sub_id}/answers", json=patch_newer)
    assert res_p1.status_code == 200
    assert res_p1.json()["answers"]["q1"]["selected_option"] == 1

    # Older timestamp loses: attempt to update q1 with older timestamp
    patch_older = {
        "answers": {
            "q1": {"selected_option": 3, "client_answered_at": "2026-11-20T11:59:00Z"}
        }
    }
    res_p2 = client.patch(f"/api/submissions/{sub_id}/answers", json=patch_older)
    assert res_p2.status_code == 200
    assert res_p2.json()["answers"]["q1"]["selected_option"] == 1  # Kept 1!

    # Now finalize attempt to SUBMITTED
    patch_finalize = {
        "answers": {
            "q1": {"selected_option": 1, "client_answered_at": "2026-11-20T12:10:00Z"},
            "q2": {"selected_option": 2, "client_answered_at": "2026-11-20T12:11:00Z"}
        },
        "status": "SUBMITTED"
    }
    res_fin = client.patch(f"/api/submissions/{sub_id}/answers", json=patch_finalize)
    assert res_fin.status_code == 200
    assert res_fin.json()["status"] == "SUBMITTED"

    # Part 2: Immutability after SUBMITTED
    # Any subsequent attempt to edit answers on a SUBMITTED attempt is rejected/ignored
    patch_tamper = {
        "answers": {
            "q1": {"selected_option": 0, "client_answered_at": "2026-11-20T13:00:00Z"}
        }
    }
    res_tamper = client.patch(f"/api/submissions/{sub_id}/answers", json=patch_tamper)
    assert res_tamper.status_code == 200
    # Answers must NOT have changed:
    assert res_tamper.json()["answers"]["q1"]["selected_option"] == 1


def test_teacher_view_duplicate_detection(client):
    """Verify teacher dashboard summary counts duplicates_detected as 0."""
    res = client.get("/api/submissions")
    assert res.status_code == 200
    summary = res.json()
    assert summary["duplicates_detected"] == 0


def test_phase5_gzip_compressed_submission(client):
    """Phase 5: Gzip compressed body for low-bandwidth cellular environments."""
    sub_id = "test_sub_gzip_5005"
    payload = {
        "submission_id": sub_id,
        "student_id": "student_1",
        "quiz_id": "quiz_python_basics",
        "answers": {
            "q1": {"selected_option": 1, "client_answered_at": "2026-11-20T14:00:00Z"}
        },
        "status": "SUBMITTED",
        "version": 1
    }
    raw_json = json.dumps(payload).encode("utf-8")
    compressed = gzip.compress(raw_json)

    res = client.post(
        "/api/submissions",
        content=compressed,
        headers={"Content-Encoding": "gzip", "Content-Type": "application/json"}
    )
    assert res.status_code == 200, f"Error body: {res.text}"
    data = res.json()
    assert data["submission_id"] == sub_id


def test_phase5_hmac_integrity_signature(client):
    """Phase 5: HMAC-SHA256 integrity verification using student session key."""
    sub_id = "test_sub_hmac_6006"
    answers = {
        "q1": {"selected_option": 1, "client_answered_at": "2026-11-20T15:00:00Z"}
    }
    session_key = "session_key_student_1_offline_token"
    canonical_json = json.dumps(answers, sort_keys=True)
    signature = hmac.new(session_key.encode(), canonical_json.encode(), hashlib.sha256).hexdigest()

    payload = {
        "submission_id": sub_id,
        "student_id": "student_1",
        "quiz_id": "quiz_python_basics",
        "answers": answers,
        "status": "SUBMITTED",
        "version": 1,
        "signature": signature
    }

    res = client.post("/api/submissions", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["is_verified"] == 1  # Verified!
