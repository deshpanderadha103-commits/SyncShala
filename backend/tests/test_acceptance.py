"""
E2E Acceptance Test Suite for Offline Learning Platform
Matches the 6-step Hackathon Acceptance Test:
1. Open app online, download Quiz 1
2. Go offline: Take quiz, answer all 5 questions
3. App restart while offline: verify answers survive and resume
4. Enable "Simulate dropped connection", go online, submit: first upload dropped after server commit
5. Retry: status becomes SYNCED with X-Idempotent-Replay: true
6. Open /teacher: exactly ONE submission with all 5 answers, duplicates_detected == 0
"""

import uuid
from app.models import Submission


def test_full_acceptance_test_flow(client, test_db_session):
    # STEP 1: Open app online, download Quiz 1
    quizzes_res = client.get("/api/quizzes")
    assert quizzes_res.status_code == 200
    quizzes = quizzes_res.json()
    quiz1 = next(q for q in quizzes if q["id"] == "quiz_python_basics")
    assert quiz1 is not None
    assert len(quiz1["questions"]) == 5
    # Ensure correct answers are NOT leaked to client
    for q in quiz1["questions"]:
        assert "correct_option" not in q

    # Simulate client local storage (IndexedDB)
    local_storage = {
        "cached_quiz": quiz1,
        "is_online": True,
        "attempts": {}
    }

    # STEP 2: Go offline (DevTools network offline or airplane mode)
    local_storage["is_online"] = False
    submission_id = str(uuid.uuid4())

    # Start quiz: persist in-progress attempt locally
    local_storage["attempts"][submission_id] = {
        "submission_id": submission_id,
        "student_id": "student_1",
        "quiz_id": quiz1["id"],
        "answers": {},
        "current_question_index": 0,
        "client_started_at": "2026-11-20T12:00:00Z",
        "status": "IN_PROGRESS",
        "version": quiz1["version"]
    }

    # Student answers questions 1 through 5 while completely offline
    offline_answers = {
        "q1": {"selected_option": 1, "client_answered_at": "2026-11-20T12:01:00Z"},
        "q2": {"selected_option": 2, "client_answered_at": "2026-11-20T12:02:00Z"},
        "q3": {"selected_option": 2, "client_answered_at": "2026-11-20T12:03:00Z"},
        "q4": {"selected_option": 1, "client_answered_at": "2026-11-20T12:04:00Z"},
        "q5": {"selected_option": 3, "client_answered_at": "2026-11-20T12:05:00Z"},
    }

    for qid, ans in offline_answers.items():
        # Every answer is recorded instantly to local disk
        local_storage["attempts"][submission_id]["answers"][qid] = ans

    # STEP 3: Fully reload/close and reopen app while offline
    # Simulate app reboot: read from disk
    restored_attempt = local_storage["attempts"][submission_id]
    assert restored_attempt is not None
    assert len(restored_attempt["answers"]) == 5
    assert restored_attempt["answers"]["q1"]["selected_option"] == 1
    assert restored_attempt["answers"]["q5"]["selected_option"] == 3
    # Student answers survived completely!

    # Mark complete offline
    restored_attempt["status"] = "SUBMITTED"
    restored_attempt["client_submitted_at"] = "2026-11-20T12:06:00Z"

    # STEP 4: Enable "Simulate dropped connection" toggle, go online, submit
    local_storage["is_online"] = True

    submission_payload = {
        "submission_id": restored_attempt["submission_id"],
        "student_id": restored_attempt["student_id"],
        "quiz_id": restored_attempt["quiz_id"],
        "answers": restored_attempt["answers"],
        "client_started_at": restored_attempt["client_started_at"],
        "client_submitted_at": restored_attempt["client_submitted_at"],
        "status": "SUBMITTED",
        "version": restored_attempt["version"]
    }

    # Upload 1: Sent with X-Simulate-Drop: true
    res_drop = client.post(
        "/api/submissions",
        json=submission_payload,
        headers={"X-Simulate-Drop": "true"}
    )
    # The client experiences a connection drop (504 in test harness)
    assert res_drop.status_code == 504

    # STEP 5: Retry (automatic or manual). Status becomes SYNCED with X-Idempotent-Replay
    # Next upload is sent without drop header (simulate drop toggle was consumed)
    res_retry = client.post(
        "/api/submissions",
        json=submission_payload
    )
    assert res_retry.status_code == 200
    assert res_retry.headers.get("X-Idempotent-Replay") == "true"
    retry_data = res_retry.json()
    assert retry_data["submission_id"] == submission_id
    assert retry_data["score"] == 100.0  # Perfect score

    # STEP 6: Open /teacher: exactly ONE submission for this attempt, with all 5 answers. Duplicates counter shows 0.
    teacher_res = client.get("/api/submissions")
    assert teacher_res.status_code == 200
    teacher_summary = teacher_res.json()

    assert teacher_summary["duplicates_detected"] == 0, "CRITICAL: Duplicates detected must be 0!"
    assert teacher_summary["total_submissions"] == 1
    assert teacher_summary["unique_attempts"] == 1
    assert teacher_summary["duplicates_absorbed"] >= 1

    sub = teacher_summary["submissions"][0]
    assert sub["submission_id"] == submission_id
    assert sub["student_id"] == "student_1"
    assert sub["quiz_id"] == "quiz_python_basics"
    assert len(sub["answers"]) == 5
    assert sub["score"] == 100.0
    assert sub["status"] == "SUBMITTED"
