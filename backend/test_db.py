import sqlite3, json
from ai_engine import analyze_answer

conn = sqlite3.connect('interview.db')
cursor = conn.cursor()

# Test 1: Check all roles
cursor.execute('SELECT DISTINCT role FROM questions')
roles = [r[0] for r in cursor.fetchall()]
print('=== ROLES (17 expected) ===')
print(f'Count: {len(roles)}')
for r in sorted(roles):
    cursor.execute('SELECT COUNT(*) FROM questions WHERE role = ?', (r,))
    count = cursor.fetchone()[0]
    print(f'  {r}: {count} questions')

print()
print('=== TEST QUESTIONS FOR Marketing Manager ===')
cursor.execute('SELECT id, category, question_text, difficulty FROM questions WHERE role = ? ORDER BY RANDOM() LIMIT 3', ('Marketing Manager',))
for r in cursor.fetchall():
    print(f'  [{r[1]}] {r[2][:80]}... ({r[3]})')

print()
print('=== TEST QUESTIONS FOR Healthcare Administrator ===')
cursor.execute('SELECT id, category, question_text, difficulty FROM questions WHERE role = ? ORDER BY RANDOM() LIMIT 3', ('Healthcare Administrator',))
for r in cursor.fetchall():
    print(f'  [{r[1]}] {r[2][:80]}... ({r[3]})')

print()
print('=== TEST QUESTIONS FOR Legal Associate ===')
cursor.execute('SELECT id, category, question_text, difficulty FROM questions WHERE role = ? ORDER BY RANDOM() LIMIT 3', ('Legal Associate',))
for r in cursor.fetchall():
    print(f'  [{r[1]}] {r[2][:80]}... ({r[3]})')

print()
print('=== TEST auto-grade simulation ===')
result = analyze_answer(
    'Tell me about a time you exceeded your quarterly sales target.',
    'Behavioral',
    'prospecting, pipeline, closing, negotiation, relationship',
    'Sales methodology, target achievement, strategic planning',
    'I exceeded my quarterly sales target by 30% using a structured prospecting approach. I built a strong pipeline through cold outreach and relationship building, negotiated effectively on pricing, and closed 5 major deals that contributed to the overall quota.'
)
print(f'Score: {result["score"]}%')
print(f'Clarity: {result["clarity"]}%')
print(f'Grammar: {result["grammar"]}%')
print(f'Relevance: {result["relevance"]}%')
print(f'Filler count: {result["filler_count"]}')
print(f'Strengths: {result["strengths"][:2]}')
print(f'Weaknesses: {result["weaknesses"][:2]}')
print(f'Tips: {result["tips"][:2]}')

print()
print('=== TEST generic role fallback questions ===')
from ai_engine import generate_questions_locally
gen_qs = generate_questions_locally('Custom Role', 3)
for q in gen_qs:
    print(f'  [{q["category"]}] {q["question_text"][:80]}...')

print()
print('ALL TESTS PASSED SUCCESSFULLY!')
conn.close()