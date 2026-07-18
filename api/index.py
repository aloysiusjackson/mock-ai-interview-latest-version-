import sys
import os
import json
import sqlite3
import traceback
import re  # FIX 1: Added missing import for regex
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

try:
    from ai_engine import analyze_answer, generate_questions, analyze_resume_text, ask_resume_question
except ImportError as e:
    print(f"Warning: Could not import ai_engine: {e}")
    print("Falling back to local-only analysis (no AI grading)")
    
    # Define fallback functions - ORDER MATTERS: analyze_locally_fallback must be defined first
    def analyze_locally_fallback(question_text, category, optimal_keywords, expected_concepts, transcript):
        """Fallback for local analysis when ai_engine is not available."""
        words = transcript.lower().split()
        word_count = len(words)
        filler_words = ["um", "uh", "like", "actually", "basically", "so", "you know", "sort of", "stuff"]
        transcript_lower = transcript.lower()
        filler_count = 0
        for f in filler_words:
            filler_count += len(re.findall(rf"\b{re.escape(f)}\b", transcript_lower))
        keyword_list = [k.strip().lower() for k in optimal_keywords.split(",")] if optimal_keywords else []
        matches_found = []
        for kw in keyword_list:
            if re.search(rf"\b{re.escape(kw)}\b", transcript_lower):
                matches_found.append(kw)
        keyword_match_ratio = len(matches_found) / len(keyword_list) if keyword_list else 1.0
        relevance = int(40 + (keyword_match_ratio * 60))
        if word_count < 15:
            relevance = max(10, relevance - 30)
        filler_ratio = filler_count / max(1, word_count)
        filler_penalty = min(40, int(filler_ratio * 150))
        clarity = max(20, min(100, (95 - filler_penalty) if word_count >= 25 else (50 - filler_penalty)))
        grammar = max(30, min(100, 95 - filler_penalty - (5 if word_count < 15 else 0)))
        if category == "Technical":
            score = int((relevance * 0.5) + (clarity * 0.3) + (grammar * 0.2))
        else:
            score = int((relevance * 0.3) + (clarity * 0.4) + (grammar * 0.3))
        score = max(0, min(100, score))
        return {
            "score": score, "clarity": clarity, "grammar": grammar, "relevance": relevance, 
            "filler_count": filler_count, "strengths": ["Provided response"], 
            "weaknesses": ["Consider elaborating more"], "tips": ["Use specific examples in your answers"]
        }

    def generate_questions(role, count=3):
        """Fallback question generation - returns empty list."""
        return []
    
    def analyze_answer(question_text, category, optimal_keywords, expected_concepts, transcript):
        """Analyze answer using local fallback."""
        return analyze_locally_fallback(question_text, category, optimal_keywords, expected_concepts, transcript)

    def analyze_resume_text(resume_text, question_count=3):
        """Fallback resume analysis using rule-based extraction."""
        import random
        text_lower = resume_text.lower()
        
        skills_found = []
        skill_keywords = ['python', 'java', 'javascript', 'react', 'angular', 'vue', 'node', 'sql', 
                          'nosql', 'mongodb', 'postgresql', 'aws', 'azure', 'docker', 'kubernetes',
                          'machine learning', 'ai', 'data science', 'pandas', 'tensorflow', 'pytorch']
        for kw in skill_keywords:
            if kw in text_lower:
                skills_found.append(kw)
        
        detected_role = 'Professional'
        if 'python' in skills_found or 'java' in skills_found:
            detected_role = 'Software Engineer'
        elif any(kw in skills_found for kw in ['seo', 'marketing', 'campaign']):
            detected_role = 'Marketing Manager'
        elif any(kw in skills_found for kw in ['machine learning', 'data science', 'tensorflow']):
            detected_role = 'Data Analyst'
        
        questions = [
            {
                "id": -1001,
                "role": detected_role,
                "question_text": f"Can you describe a project where you used {skills_found[0] if skills_found else 'your skills'}?",
                "category": "Behavioral",
                "optimal_keywords": "project, experience, skills",
                "expected_concepts": "Project experience and skill application",
                "difficulty": "Medium"
            },
            {
                "id": -1002,
                "role": detected_role,
                "question_text": "What challenges have you overcome in your professional experience?",
                "category": "Behavioral",
                "optimal_keywords": "challenge, solution, experience",
                "expected_concepts": "Problem-solving and resilience",
                "difficulty": "Medium"
            }
        ]
        
        summary = f"Candidate shows experience with {', '.join(skills_found[:5]) if skills_found else 'various technologies'}."
        return {
            "summary": summary,
            "detected_role": detected_role,
            "questions": questions[:question_count]
        }

    def ask_resume_question(question, resume_text):
        """Fallback for answering questions about resume."""
        return {"answer": "Based on your resume, focus on highlighting your achievements with specific metrics and examples."}

# Note: On Vercel, the frontend static files are served by Vercel's static file serving 
# (configured in vercel.json). The Flask app only handles API routes.
app = Flask(__name__, static_folder=os.path.join(os.path.dirname(__file__), '..', 'frontend'))
CORS(app)

# FIX 4: Added root route for local testing fallback
@app.route('/')
def serve_index():
    try:
        return send_from_directory(app.static_folder, 'index.html')
    except Exception:
        return jsonify({"message": "API is running. Frontend should be served via Vercel or local static server."})

# Database path for Vercel (use /tmp for writable storage)
DB_DIR = os.path.join('/tmp', 'data')
DB_PATH = os.path.join(DB_DIR, 'interview.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database and seed data if not exists"""
    os.makedirs(DB_DIR, exist_ok=True)
    
    if os.path.exists(DB_PATH):
        return  # Already initialized
    
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        target_role TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        category TEXT CHECK(category IN ('Behavioral', 'Technical', 'Situational')) NOT NULL,
        question_text TEXT NOT NULL,
        optimal_keywords TEXT,
        expected_concepts TEXT,
        difficulty TEXT CHECK(difficulty IN ('Easy', 'Medium', 'Hard')) NOT NULL
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS interviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        role TEXT NOT NULL,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        overall_score REAL,
        summary TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        interview_id INTEGER,
        question_id INTEGER,
        transcript TEXT,
        feedback_json TEXT,
        score REAL,
        FOREIGN KEY (interview_id) REFERENCES interviews (id),
        FOREIGN KEY (question_id) REFERENCES questions (id)
    )
    ''')

    conn.commit()
    seed_questions(cursor)
    seed_users_and_history(cursor)
    conn.commit()
    conn.close()

def seed_questions(cursor):
    questions_data = [
        ("Software Engineer", "Behavioral", "Tell me about a time you had a technical disagreement with a team member. How did you resolve it?", "compromise, discussion, collaboration, perspective, consensus", "Resolving conflict, communication, constructive debate, technical compromise", "Medium"),
        ("Software Engineer", "Technical", "Can you explain the difference between a Relational Database (SQL) and a Non-Relational Database (NoSQL)? When would you choose one over the other?", "schema, ACID, scale, horizontal, vertical, structured, key-value, document", "Database design, trade-offs, scaling properties, relational vs document storage, ACID compliance", "Medium"),
        ("Software Engineer", "Behavioral", "Describe a challenging programming bug you encountered. How did you diagnose and fix it?", "debugging, root cause, log, monitoring, isolation, fix, prevention", "Problem-solving, step-by-step troubleshooting, testing, writing reproducible test cases", "Hard"),
        ("Software Engineer", "Technical", "Explain the concept of REST APIs and how they differ from GraphQL. What are the key advantages of each?", "stateless, endpoint, query, over-fetching, under-fetching, resource, HTTP methods", "API architecture, payloads, REST verbs, flexible querying, protocol differences", "Medium"),
        ("Software Engineer", "Technical", "What is Big O notation, and why is it important in algorithm design? Explain with examples of O(1), O(n), and O(log n).", "time complexity, space complexity, scale, input size, search, binary search, array lookup", "Algorithmic efficiency, execution speed, scalability, time/space limits, sorting/search performance", "Easy"),
        ("Product Manager", "Behavioral", "Tell me about a time when a product launch didn't go as planned. What did you learn and how did you adapt?", "post-mortem, customer feedback, metric, root cause, adaptation, launch", "Resilience, post-launch feedback loop, metrics tracking, pivot capability", "Hard"),
        ("Product Manager", "Technical", "How do you decide what features to prioritize when building a product roadmap? What frameworks do you use?", "RICE, MoSCoW, value, effort, metrics, stakeholders, trade-offs, ROI", "Roadmapping, value/effort scoring, customer needs analysis, product strategy", "Medium"),
        ("Product Manager", "Behavioral", "How do you manage conflicting requirements from different stakeholders, such as engineering, sales, and marketing?", "alignment, compromise, user value, vision, conflict resolution, communication", "Stakeholder communication, user-centered prioritization, data-driven negotiation", "Medium"),
        ("Data Analyst", "Technical", "What is the difference between inner join, left join, and outer join in SQL? Give a practical example of when to use each.", "join, merge, null, matching rows, left table, right table, keys", "Data cleaning, table relationships, aggregation, relational mapping", "Easy"),
        ("Data Analyst", "Technical", "Explain the difference between correlation and causation. Can you give an example of how confusing these could hurt a business decision?", "correlation, causation, variable, confounding factor, metrics, hypothesis testing", "Data literacy, analytical bias, scientific method, statistics", "Medium"),
        ("Sales Executive", "Behavioral", "Describe a time you exceeded your quarterly sales target. What specific strategies did you use?", "prospecting, pipeline, closing, negotiation, relationship, upsell, cross-sell", "Sales methodology, target achievement, strategic planning, customer relationship management", "Medium"),
        ("Sales Executive", "Situational", "How would you handle a situation where a long-time client is considering switching to a competitor?", "retention, value proposition, feedback, solution, loyalty, competitor analysis", "Customer retention, consultative selling, competitive differentiation, problem-solving", "Hard"),
        ("Marketing Manager", "Technical", "What marketing KPIs do you track to measure campaign effectiveness? How do you optimize underperforming campaigns?", "ROI, CAC, LTV, conversion rate, CTR, impressions, engagement, A/B testing", "Marketing analytics, campaign optimization, KPI tracking, data-driven decisions", "Medium"),
        ("HR Manager", "Behavioral", "Tell me about a time you handled a sensitive employee relations issue. How did you maintain confidentiality and fairness?", "confidentiality, fairness, investigation, policy, communication, resolution", "Employee relations, conflict resolution, compliance, HR best practices, empathy", "Hard"),
        ("Financial Analyst", "Technical", "What are the key financial statements every analyst should understand? How do they interconnect?", "income statement, balance sheet, cash flow, revenue, expenses, assets, liabilities", "Financial accounting, statement analysis, inter-statement relationships, GAAP principles", "Medium"),
        ("Operations Manager", "Behavioral", "Tell me about a time you improved an inefficient process in your organization. What was the impact?", "process improvement, efficiency, cost reduction, automation, workflow, optimization", "Process optimization, operational efficiency, change management, measurable impact", "Medium"),
        ("Customer Support Lead", "Behavioral", "Describe a time you handled an extremely angry customer. How did you de-escalate the situation and resolve their issue?", "empathy, active listening, de-escalation, solution, follow-up, patience", "Customer service excellence, conflict de-escalation, emotional intelligence, problem resolution", "Medium"),
        ("Healthcare Administrator", "Behavioral", "Describe a time you had to manage a crisis in a healthcare setting, such as a staffing shortage or equipment failure.", "crisis management, patient safety, staffing, resource allocation, communication, protocol", "Healthcare operations, crisis leadership, patient-centered decision making, team coordination", "Hard"),
        ("Project Manager", "Behavioral", "Tell me about a project that was falling behind schedule. How did you get it back on track?", "schedule, risk mitigation, resources, communication, prioritization, timeline", "Project recovery, stakeholder management, risk management, adaptive planning", "Medium"),
        ("Business Analyst", "Technical", "How do you gather and document requirements from stakeholders? What techniques do you use?", "interviews, surveys, workshops, documentation, BRD, user stories, acceptance criteria", "Requirements gathering, stakeholder elicitation, documentation standards, validation", "Medium"),
        ("Teacher/Educator", "Behavioral", "Describe a time you had to adapt your teaching style to accommodate a student with different learning needs.", "adaptation, differentiation, inclusive, engagement, assessment, support", "Differentiated instruction, inclusive education, student-centered learning, adaptability", "Medium"),
        ("Retail Manager", "Situational", "Your store is consistently missing its monthly sales targets. Walk me through your plan to turn performance around.", "sales strategy, training, inventory, promotions, staffing, analysis, targets", "Retail turnaround, performance management, strategic planning, team motivation", "Hard"),
        ("Legal Associate", "Behavioral", "Describe a time you had to manage multiple high-priority cases with conflicting deadlines. How did you prioritize?", "prioritization, deadlines, organization, case management, communication, efficiency", "Legal workflow management, time management, attention to detail, professional judgment", "Medium"),
        ("Graphic Designer", "Behavioral", "Tell me about a time a client rejected your design concept. How did you handle the feedback and what was the outcome?", "feedback, revision, communication, client management, compromise, creativity", "Design process, client communication, constructive feedback handling, creative problem-solving", "Medium"),
        ("Content Writer", "Technical", "How do you approach SEO keyword research while maintaining high-quality, reader-friendly content?", "SEO, keywords, readability, search intent, headers, meta, quality, engagement", "SEO writing, content optimization, reader experience balance, search engine best practices", "Medium"),
    ]

    cursor.executemany('''
    INSERT INTO questions (role, category, question_text, optimal_keywords, expected_concepts, difficulty)
    VALUES (?, ?, ?, ?, ?, ?)
    ''', questions_data)

def seed_users_and_history(cursor):
    cursor.execute('''
    INSERT INTO users (name, email, target_role)
    VALUES ('Demo User', 'demo@example.com', 'Software Engineer')
    ''')
    user_id = cursor.lastrowid

    date_1 = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    cursor.execute('''
    INSERT INTO interviews (user_id, role, date, overall_score, summary)
    VALUES (?, 'Software Engineer', ?, 72.5, 
    'The candidate demonstrated solid database knowledge but struggled slightly with the behavioral conflict resolution question.')
    ''', (user_id, date_1))
    interview_1_id = cursor.lastrowid

    fb_q1 = {
        "score": 65, "clarity": 70, "grammar": 80, "relevance": 60, "filler_count": 8,
        "strengths": ["Clear timeline explanation of the conflict details", "Identified the technical root cause clearly"],
        "weaknesses": ["Struggled to show structural compromise", "High usage of filler words"],
        "tips": ["Use the STAR method: Situation, Task, Action, Result", "Focus on what you learned from the resolution process"]
    }
    cursor.execute('''
    INSERT INTO answers (interview_id, question_id, transcript, feedback_json, score)
    VALUES (?, 1, 'We had this issue where my coworker wanted to use Mongo and I wanted Postgres. We argued about it for two days. Eventually the tech lead decided we should use Postgres because we needed strong relational integrity.', ?, 65.0)
    ''', (interview_1_id, json.dumps(fb_q1)))

    fb_q2 = {
        "score": 80, "clarity": 85, "grammar": 90, "relevance": 82, "filler_count": 3,
        "strengths": ["Accurate definition of ACID properties", "Excellent contrast of vertical and horizontal scaling"],
        "weaknesses": ["Missed discussing document-based versus table-based formatting differences"],
        "tips": ["Mention specific database options like MongoDB or Redis to ground NoSQL descriptions"]
    }
    cursor.execute('''
    INSERT INTO answers (interview_id, question_id, transcript, feedback_json, score)
    VALUES (?, 2, 'Relational databases use structured tables with fixed schemas and support ACID compliance. Non-relational databases are schema-less, support key-value or document formats, and scale horizontally well.', ?, 80.0)
    ''', (interview_1_id, json.dumps(fb_q2)))


# ============ API Routes ============

_db_initialized = False

def ensure_db():
    global _db_initialized
    if not _db_initialized:
        init_db()
        _db_initialized = True

@app.route('/api/roles', methods=['GET'])
def get_roles():
    try:
        ensure_db()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT role FROM questions")
        roles = [row['role'] for row in cursor.fetchall()]
        conn.close()
        return jsonify({"roles": roles})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/questions', methods=['GET'])
def get_questions():
    role = request.args.get('role', 'Software Engineer')
    limit = request.args.get('limit', 3, type=int)
    
    try:
        ensure_db()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, role, category, question_text, optimal_keywords, expected_concepts, difficulty "
            "FROM questions WHERE role = ? ORDER BY RANDOM() LIMIT ?", 
            (role, limit)
        )
        rows = cursor.fetchall()
        conn.close()
        
        if len(rows) >= limit:
            questions = [{"id": r["id"], "role": r["role"], "category": r["category"], "question_text": r["question_text"], "difficulty": r["difficulty"]} for r in rows]
            return jsonify({"questions": questions})
        
        try:
            ai_questions = generate_questions(role, limit)
            return jsonify({"questions": ai_questions, "ai_generated": True})
        except Exception:
            questions = [{"id": r["id"], "role": r["role"], "category": r["category"], "question_text": r["question_text"], "difficulty": r["difficulty"]} for r in rows]
            return jsonify({"questions": questions})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/submit-interview', methods=['POST'])
def submit_interview():
    data = request.json
    if not data:
        return jsonify({"error": "Missing payload"}), 400
    
    role = data.get('role')
    user_answers = data.get('answers')
    user_id = data.get('user_id', 1)

    if not role or not user_answers:
        return jsonify({"error": "Missing role or answers"}), 400

    try:
        ensure_db()
        conn = get_db_connection()
        cursor = conn.cursor()
        graded_answers = []
        total_score = 0.0

        for answer in user_answers:
            question_id = answer.get('question_id')
            transcript = answer.get('transcript', '')
            question_text = answer.get('question_text', '')
            category = answer.get('category', 'Behavioral')
            optimal_keywords = answer.get('optimal_keywords', '')
            expected_concepts = answer.get('expected_concepts', '')

            if question_id:
                cursor.execute("SELECT question_text, category, optimal_keywords, expected_concepts FROM questions WHERE id = ?", (question_id,))
                q = cursor.fetchone()
                if q:
                    question_text = q["question_text"]
                    category = q["category"]
                    optimal_keywords = q["optimal_keywords"]
                    expected_concepts = q["expected_concepts"]

            feedback = analyze_answer(
                question_text=question_text, category=category,
                optimal_keywords=optimal_keywords, expected_concepts=expected_concepts,
                transcript=transcript
            )
            
            # FIX 2: Use .get() to prevent KeyError if AI returns unexpected keys
            score = float(feedback.get("score", 0))
            total_score += score
            graded_answers.append({
                "question_id": question_id, "question_text": question_text,
                "category": category, "transcript": transcript,
                "score": score, "feedback": feedback
            })

        overall_score = round(total_score / len(graded_answers), 1) if graded_answers else 0.0

        if overall_score >= 85:
            summary = f"Excellent performance! You exhibited deep clarity and domain mastery in the {role} role."
        elif overall_score >= 70:
            summary = f"Strong performance for {role}. Your core concepts are solid."
        else:
            summary = f"Decent starting point, but significant improvement is needed for {role} interviews."

        date_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute(
            "INSERT INTO interviews (user_id, role, date, overall_score, summary) VALUES (?, ?, ?, ?, ?)",
            (user_id, role, date_str, overall_score, summary)
        )
        interview_id = cursor.lastrowid

        for ga in graded_answers:
            cursor.execute(
                "INSERT INTO answers (interview_id, question_id, transcript, feedback_json, score) VALUES (?, ?, ?, ?, ?)",
                (interview_id, ga["question_id"], ga["transcript"], json.dumps(ga["feedback"]), ga["score"])
            )

        conn.commit()
        conn.close()
        return jsonify({
            "interview_id": interview_id, "overall_score": overall_score,
            "summary": summary, "date": date_str, "answers": graded_answers
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/auto-grade', methods=['POST'])
def auto_grade():
    data = request.json
    if not data:
        return jsonify({"error": "Missing payload"}), 400

    transcript = data.get('transcript', '')
    question_text = data.get('question_text', '')
    
    if not transcript or not question_text:
        return jsonify({"error": "Missing transcript or question_text"}), 400

    try:
        feedback = analyze_answer(
            question_text, data.get('category', 'Behavioral'), 
            data.get('optimal_keywords', ''), data.get('expected_concepts', ''), transcript
        )
        
        # FIX 2: Use .get() to prevent KeyError
        return jsonify({
            "score": feedback.get("score", 0), 
            "clarity": feedback.get("clarity", 0),
            "grammar": feedback.get("grammar", 0), 
            "relevance": feedback.get("relevance", 0),
            "filler_count": feedback.get("filler_count", 0), 
            "strengths": feedback.get("strengths", []),
            "weaknesses": feedback.get("weaknesses", []), 
            "tips": feedback.get("tips", [])
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    user_id = request.args.get('user_id', 1, type=int)
    try:
        ensure_db()
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT name, target_role FROM users WHERE id = ?", (user_id,))
        user_row = cursor.fetchone()
        if not user_row:
            conn.close()
            return jsonify({"error": "User not found"}), 404
        
        user_info = {"name": user_row["name"], "target_role": user_row["target_role"]}

        cursor.execute("SELECT COUNT(*), AVG(overall_score) FROM interviews WHERE user_id = ?", (user_id,))
        stats = cursor.fetchone()
        total_interviews = stats[0] or 0
        avg_score = round(stats[1], 1) if stats[1] else 0.0

        cursor.execute("SELECT id, role, date, overall_score FROM interviews WHERE user_id = ? ORDER BY date ASC", (user_id,))
        history_rows = cursor.fetchall()
        
        progression = []
        history_list = []
        for r in history_rows:
            raw_date = datetime.strptime(r["date"], '%Y-%m-%d %H:%M:%S')
            formatted_date = raw_date.strftime('%b %d, %Y')
            progression.append({"interview_id": r["id"], "date": formatted_date, "score": r["overall_score"]})
            history_list.append({"id": r["id"], "role": r["role"], "date": formatted_date, "overall_score": r["overall_score"]})
        history_list.reverse()

        cursor.execute(
            "SELECT q.category, AVG(a.score) as avg_score FROM answers a "
            "JOIN questions q ON a.question_id = q.id JOIN interviews i ON a.interview_id = i.id "
            "WHERE i.user_id = ? GROUP BY q.category", (user_id,)
        )
        cat_rows = cursor.fetchall()
        categories = {row["category"]: round(row["avg_score"], 1) for row in cat_rows}
        for c in ["Behavioral", "Technical", "Situational"]:
            if c not in categories:
                categories[c] = 0.0

        cursor.execute("SELECT a.feedback_json FROM answers a JOIN interviews i ON a.interview_id = i.id WHERE i.user_id = ?", (user_id,))
        ans_rows = cursor.fetchall()
        total_fillers = total_clarity = total_grammar = total_relevance = 0.0
        feedback_count = len(ans_rows)

        for row in ans_rows:
            try:
                # FIX 3: Safely parse JSON in case of corrupted data
                fb = json.loads(row["feedback_json"])
                total_fillers += fb.get("filler_count", 0)
                total_clarity += fb.get("clarity", 0)
                total_grammar += fb.get("grammar", 0)
                total_relevance += fb.get("relevance", 0)
            except json.JSONDecodeError:
                continue

        subscores = {
            "clarity": round(total_clarity / feedback_count, 1) if feedback_count else 0.0,
            "grammar": round(total_grammar / feedback_count, 1) if feedback_count else 0.0,
            "relevance": round(total_relevance / feedback_count, 1) if feedback_count else 0.0,
            "avg_fillers_per_answer": round(total_fillers / feedback_count, 1) if feedback_count else 0.0
        }

        conn.close()
        return jsonify({
            "user": user_info,
            "metrics": {"total_interviews": total_interviews, "average_score": avg_score, "subscores": subscores, "categories": categories},
            "progression": progression,
            "history": history_list[:5]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/interview/<int:interview_id>', methods=['GET'])
def get_interview_detail(interview_id):
    try:
        ensure_db()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, role, date, overall_score, summary FROM interviews WHERE id = ?", (interview_id,))
        i_row = cursor.fetchone()
        if not i_row:
            conn.close()
            return jsonify({"error": "Interview not found"}), 404

        raw_date = datetime.strptime(i_row["date"], '%Y-%m-%d %H:%M:%S')
        formatted_date = raw_date.strftime('%B %d, %Y at %I:%M %p')

        interview_data = {
            "id": i_row["id"], "role": i_row["role"], "date": formatted_date,
            "overall_score": i_row["overall_score"], "summary": i_row["summary"], "answers": []
        }

        cursor.execute(
            "SELECT a.id, a.transcript, a.score, a.feedback_json, q.question_text, q.category "
            "FROM answers a JOIN questions q ON a.question_id = q.id WHERE a.interview_id = ?",
            (interview_id,)
        )
        for r in cursor.fetchall():
            try:
                # FIX 3: Safely parse JSON in case of corrupted data
                feedback_json = json.loads(r["feedback_json"])
            except json.JSONDecodeError:
                feedback_json = {}
                
            interview_data["answers"].append({
                "id": r["id"], "question_text": r["question_text"], "category": r["category"],
                "transcript": r["transcript"], "score": r["score"],
                "feedback": feedback_json
            })

        conn.close()
        return jsonify(interview_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/analyze-resume', methods=['POST'])
def analyze_resume():
    if 'resume' not in request.files:
        return jsonify({"error": "No resume file uploaded"}), 400
    
    file = request.files['resume']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    question_count = request.form.get('question_count', 3, type=int)
    resume_text = ''
    
    try:
        if file.filename.endswith('.pdf'):
            try:
                import PyPDF2
                import io
                pdf_reader = PyPDF2.PdfReader(io.BytesIO(file.read()))
                for page in pdf_reader.pages:
                    resume_text += page.extract_text() or ''
            except ImportError:
                file.seek(0)
                resume_text = file.read().decode('utf-8', errors='ignore')
        elif file.filename.endswith('.docx'):
            try:
                from docx import Document
                import io
                doc = Document(io.BytesIO(file.read()))
                resume_text = '\n'.join([para.text for para in doc.paragraphs])
            except ImportError:
                file.seek(0)
                resume_text = file.read().decode('utf-8', errors='ignore')
        else:
            file.seek(0)
            resume_text = file.read().decode('utf-8', errors='ignore')
    except Exception as e:
        return jsonify({"error": f"Failed to read file: {str(e)}"}), 500
    
    if not resume_text.strip():
        return jsonify({"error": "Could not extract text from resume"}), 400
    
    try:
        result = analyze_resume_text(resume_text, question_count)
        result['full_text'] = resume_text
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/ask-resume-question', methods=['POST'])
def ask_resume_question_endpoint():
    data = request.json
    if not data:
        return jsonify({"error": "Missing payload"}), 400
    
    question = data.get('question', '')
    resume_text = data.get('resume_text', '')
    
    if not question or not resume_text:
        return jsonify({"error": "Missing question or resume_text"}), 400
    
    try:
        result = ask_resume_question(question, resume_text)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Vercel handler
handler = app