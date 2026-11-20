from datetime import datetime, timezone
from sqlalchemy.orm import Session
from .models import Lesson, Quiz, User


def seed_database(db: Session):
    # Check if lessons already exist
    if db.query(Lesson).first():
        return

    now = datetime.now(timezone.utc)

    # 1. Seed Lessons
    lesson_1 = Lesson(
        id="lesson_python_basics",
        title="Python Fundamentals",
        description="Learn variables, data types, control flow, and basic functions in Python 3.",
        content="""# Python Fundamentals

Welcome to Python programming! Python is a readable, versatile language.

## 1. Variables and Types
In Python, variables are dynamically typed:
```python
x = 10          # Integer
name = "Ada"    # String
pi = 3.14159    # Float
is_active = True # Boolean
```

## 2. Lists and Dictionaries
- **Lists** are ordered, mutable sequences: `fruits = ["apple", "banana", "cherry"]`
- **Dictionaries** store key-value pairs: `student = {"id": 1, "name": "Ada"}`

## 3. Conditionals and Loops
```python
if x > 5:
    print("Greater than 5")

for fruit in fruits:
    print(fruit)
```

## 4. Functions
Functions are declared using `def`:
```python
def greet(name: str) -> str:
    return f"Hello, {name}!"
```
""",
        version=1,
        created_at=now,
    )

    lesson_2 = Lesson(
        id="lesson_networking_basics",
        title="Computer Networking Basics",
        description="Understand how computers communicate across local networks and the Internet.",
        content="""# Computer Networking Basics

How do devices share data across the globe?

## 1. IP Addresses and Ports
- **IP Address**: Numerical label assigned to each device on a network (e.g., `192.168.1.1` or IPv6).
- **Port**: Number identifying specific process or service (e.g., port 80 for HTTP, port 443 for HTTPS).

## 2. TCP vs UDP
- **TCP (Transmission Control Protocol)**: Connection-oriented, guarantees packet delivery, order, and error-checking (used in web browsing, file downloads).
- **UDP (User Datagram Protocol)**: Connectionless, fast, no delivery guarantees (used in video streaming, gaming).

## 3. DNS (Domain Name System)
Translates human-readable domain names like `example.com` into machine-routable IP addresses.

## 4. HTTP and REST
Hypertext Transfer Protocol defines how web clients and servers request and send resources via standard verbs (`GET`, `POST`, `PUT`, `DELETE`).
""",
        version=1,
        created_at=now,
    )

    db.add(lesson_1)
    db.add(lesson_2)

    # 2. Seed Quizzes (5 MCQs each, with correct_option stored server-side)
    quiz_1 = Quiz(
        id="quiz_python_basics",
        title="Python Fundamentals Quiz",
        lesson_id="lesson_python_basics",
        version=1,
        created_at=now,
        questions=[
            {
                "id": "q1",
                "text": "Which keyword is used to define a function in Python?",
                "options": ["func", "def", "function", "lambda"],
                "correct_option": 1,
                "explanation": "'def' is used to define named functions in Python."
            },
            {
                "id": "q2",
                "text": "What data type is the result of `type([1, 2, 3])`?",
                "options": ["tuple", "set", "list", "dict"],
                "correct_option": 2,
                "explanation": "Square brackets [ ] define a mutable list in Python."
            },
            {
                "id": "q3",
                "text": "How do you insert an element at the end of a list `my_list`?",
                "options": ["my_list.add(x)", "my_list.push(x)", "my_list.append(x)", "my_list.insert_end(x)"],
                "correct_option": 2,
                "explanation": "The `.append()` method adds an item to the end of a list."
            },
            {
                "id": "q4",
                "text": "Which operator is used for floor (integer) division in Python?",
                "options": ["/", "//", "%", "^"],
                "correct_option": 1,
                "explanation": "'//' performs integer floor division, discarding the remainder."
            },
            {
                "id": "q5",
                "text": "What is the output of `bool(0)` and `bool('')` in Python?",
                "options": ["True, True", "True, False", "False, True", "False, False"],
                "correct_option": 3,
                "explanation": "0 and empty strings are falsy in Python, so both evaluate to False."
            }
        ]
    )

    quiz_2 = Quiz(
        id="quiz_networking_basics",
        title="Networking Basics Quiz",
        lesson_id="lesson_networking_basics",
        version=1,
        created_at=now,
        questions=[
            {
                "id": "q1",
                "text": "Which protocol provides reliable, ordered byte-stream delivery between applications?",
                "options": ["UDP", "IP", "TCP", "ICMP"],
                "correct_option": 2,
                "explanation": "TCP establishes a connection and guarantees packet ordering and delivery."
            },
            {
                "id": "q2",
                "text": "What is the primary role of DNS on a network?",
                "options": [
                    "Encrypt network packets",
                    "Translate domain names into IP addresses",
                    "Assign MAC addresses to network cards",
                    "Filter malicious firewall traffic"
                ],
                "correct_option": 1,
                "explanation": "DNS translates domain names like google.com into IP addresses."
            },
            {
                "id": "q3",
                "text": "Which default port is standard for secure web traffic (HTTPS)?",
                "options": ["80", "443", "8080", "22"],
                "correct_option": 1,
                "explanation": "Port 443 is the standard port reserved for HTTPS."
            },
            {
                "id": "q4",
                "text": "What type of IP address is `192.168.1.1` typically reserved for?",
                "options": ["Public internet routing", "Private local network", "Broadcast address", "Multicast group"],
                "correct_option": 1,
                "explanation": "`192.168.0.0/16` is a private RFC 1918 address range for local networks."
            },
            {
                "id": "q5",
                "text": "Which HTTP method is considered idempotent and safe for fetching resources?",
                "options": ["POST", "GET", "PATCH", "DELETE"],
                "correct_option": 1,
                "explanation": "GET requests are safe and idempotent, intended only to retrieve data without side effects."
            }
        ]
    )

    db.add(quiz_1)
    db.add(quiz_2)

    # 3. Seed Users (2 students, 1 teacher)
    user_student1 = User(
        id="student_1",
        name="Alice Chen",
        role="student",
        session_key="session_key_student_1_offline_token"
    )
    user_student2 = User(
        id="student_2",
        name="Bob Smith",
        role="student",
        session_key="session_key_student_2_offline_token"
    )
    user_teacher = User(
        id="teacher_1",
        name="Prof. Davis",
        role="teacher",
        session_key="teacher_admin_key"
    )

    db.add(user_student1)
    db.add(user_student2)
    db.add(user_teacher)

    db.commit()
