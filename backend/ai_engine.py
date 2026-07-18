import os
import json
import re
from dotenv import load_dotenv

# Load env variables
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Try to import google-generativeai, but don't fail if not available
genai = None
if GEMINI_API_KEY:
    try:
        import google.generativeai as genai_module
        genai_module.configure(api_key=GEMINI_API_KEY)
        genai = genai_module
    except (ImportError, Exception) as e:
        print(f"Warning: google-generativeai not available ({e}). Falling back to local NLP analysis.")
        GEMINI_API_KEY = None

def analyze_answer(question_text, category, optimal_keywords, expected_concepts, transcript):
    """
    Main entrypoint for grading answers. Checks if Gemini is available, otherwise falls back to local NLP engine.
    """
    if not transcript or len(transcript.strip()) == 0:
        return {
            "score": 0,
            "clarity": 0,
            "grammar": 0,
            "relevance": 0,
            "filler_count": 0,
            "strengths": ["None (No response provided)"],
            "weaknesses": ["You did not provide a transcript response."],
            "tips": ["Make sure to speak clearly into your microphone to record your response."]
        }

    if GEMINI_API_KEY:
        try:
            return analyze_with_gemini(question_text, category, optimal_keywords, expected_concepts, transcript)
        except Exception as e:
            print(f"Gemini API analysis failed: {e}. Falling back to local NLP engine.")
            return analyze_locally(question_text, category, optimal_keywords, expected_concepts, transcript)
    else:
        return analyze_locally(question_text, category, optimal_keywords, expected_concepts, transcript)

def analyze_with_gemini(question_text, category, optimal_keywords, expected_concepts, transcript):
    if genai is None:
        raise ImportError("google-generativeai not available")
    model = genai.GenerativeModel('gemini-1.5-flash')
    
    prompt = f"""
    You are an expert AI Job Interviewer. Analyze the following candidate's answer to the given question.
    
    Question: {question_text}
    Category: {category}
    Expected Keywords/Concepts: {optimal_keywords} | {expected_concepts}
    Candidate's Transcript: "{transcript}"
    
    Evaluate the response and output a JSON object EXACTLY in the following format. Ensure all values are filled. Do not include any markdown wrappers or backticks in the response. Output raw JSON only.
    
    Format:
    {{
        "score": <overall score integer between 0 and 100>,
        "clarity": <clarity/structure score integer between 0 and 100>,
        "grammar": <grammar/vocabulary score integer between 0 and 100>,
        "relevance": <relevance/technical accuracy score integer between 0 and 100>,
        "filler_count": <integer representing count of filler words like 'uh', 'um', 'like', 'actually', 'so' used unnecessary as crutches>,
        "strengths": [<list of 2-3 specific strengths of this response>],
        "weaknesses": [<list of 1-2 constructive weaknesses or missed points>],
        "tips": [<list of 2-3 actionable tips for improvement (e.g. using the STAR method for behavioral, or describing trade-offs for technical)>]
    }}
    """
    
    response = model.generate_content(prompt)
    response_text = response.text.strip()
    
    # Strip markdown code blocks if the model wrapped it in ```json ... ```
    if response_text.startswith("```"):
        # Match anything inside backticks
        match = re.search(r"```(?:json)?(.*?)```", response_text, re.DOTALL)
        if match:
            response_text = match.group(1).strip()
            
    # Try parsing
    try:
        data = json.loads(response_text)
        # Validate keys
        required_keys = ["score", "clarity", "grammar", "relevance", "filler_count", "strengths", "weaknesses", "tips"]
        if all(k in data for k in required_keys):
            return data
    except Exception as parse_error:
        print(f"Error parsing Gemini response JSON: {parse_error}. Response content: {response_text}")
        
    # Fallback if parsing failed
    return analyze_locally(question_text, category, optimal_keywords, expected_concepts, transcript)

def generate_questions(role, count=3):
    """
    Generates interview questions for a given role using Gemini AI.
    Falls back to template-based questions if AI is unavailable.
    """
    if GEMINI_API_KEY:
        try:
            return generate_questions_with_gemini(role, count)
        except Exception as e:
            print(f"Gemini question generation failed: {e}. Using template fallback.")
            return generate_questions_locally(role, count)
    else:
        return generate_questions_locally(role, count)

def generate_questions_with_gemini(role, count=3):
    if genai is None:
        raise ImportError("google-generativeai not available")
    model = genai.GenerativeModel('gemini-1.5-flash')
    
    prompt = f"""
    You are an expert interview question generator. Generate {count} interview questions for a candidate applying for a "{role}" position.
    
    For each question, provide:
    1. The question text
    2. The category (one of: Behavioral, Technical, Situational)
    3. Optimal keywords that should appear in a good answer (comma-separated)
    4. Expected concepts that should be covered (comma-separated)
    5. Difficulty level (one of: Easy, Medium, Hard)
    
    Output a JSON array EXACTLY in the following format. Do not include any markdown wrappers or backticks. Output raw JSON only.
    
    Format:
    [
        {{
            "question_text": "The interview question text here",
            "category": "Behavioral",
            "optimal_keywords": "keyword1, keyword2, keyword3",
            "expected_concepts": "concept1, concept2, concept3",
            "difficulty": "Medium"
        }},
        ...
    ]
    """
    
    response = model.generate_content(prompt)
    response_text = response.text.strip()
    
    # Strip markdown code blocks if the model wrapped it
    if response_text.startswith("```"):
        match = re.search(r"```(?:json)?(.*?)```", response_text, re.DOTALL)
        if match:
            response_text = match.group(1).strip()
    
    try:
        data = json.loads(response_text)
        if isinstance(data, list):
            # Add id and role fields
            for i, q in enumerate(data):
                q["id"] = -(i + 1)  # Use negative IDs for AI-generated questions
                q["role"] = role
                if "category" not in q:
                    q["category"] = "Behavioral"
                if "difficulty" not in q:
                    q["difficulty"] = "Medium"
                if "optimal_keywords" not in q:
                    q["optimal_keywords"] = ""
                if "expected_concepts" not in q:
                    q["expected_concepts"] = ""
            return data[:count]
    except Exception as e:
        print(f"Error parsing Gemini generated questions JSON: {e}")
        
    return generate_questions_locally(role, count)

def generate_questions_locally(role, count=3):
    """
    Template-based question generation for roles not in the database.
    Creates relevant questions based on the role name.
    """
    templates = [
        {
            "category": "Behavioral",
            "question": f"Tell me about a time you demonstrated leadership skills in a {role} context. What was the outcome?",
            "keywords": "leadership, team, outcome, initiative, responsibility",
            "concepts": "Leadership experience, team collaboration, measurable results, initiative"
        },
        {
            "category": "Behavioral",
            "question": f"Describe a challenging situation you faced as a {role} and how you overcame it.",
            "keywords": "challenge, problem-solving, solution, adaptation, result",
            "concepts": "Problem-solving, resilience, critical thinking, adaptability"
        },
        {
            "category": "Technical",
            "question": f"What are the most important skills and tools for a {role} to master, and why?",
            "keywords": "skills, tools, proficiency, expertise, best practices",
            "concepts": "Domain knowledge, tool proficiency, industry best practices, continuous learning"
        },
        {
            "category": "Situational",
            "question": f"You are working as a {role} and your team misses a critical deadline. How do you handle the situation?",
            "keywords": "deadline, accountability, communication, recovery, plan",
            "concepts": "Crisis management, accountability, team communication, process improvement"
        },
        {
            "category": "Behavioral",
            "question": f"Describe a time you had to learn a new skill or tool quickly to succeed in a {role} position.",
            "keywords": "learning, adaptation, skill development, initiative, growth",
            "concepts": "Learning agility, self-development, initiative, adaptability"
        },
        {
            "category": "Technical",
            "question": f"What metrics or KPIs do you consider most important when evaluating success in a {role} position?",
            "keywords": "metrics, KPI, evaluation, success, measurement, performance",
            "concepts": "Performance measurement, analytical thinking, results orientation, domain metrics"
        },
        {
            "category": "Situational",
            "question": f"As a {role}, you are given a project with limited resources and a tight deadline. How do you prioritize?",
            "keywords": "prioritization, resource management, deadline, efficiency, trade-offs",
            "concepts": "Resource allocation, priority setting, time management, strategic thinking"
        },
        {
            "category": "Behavioral",
            "question": f"Tell me about a time you received constructive criticism in a {role} role. How did you respond and grow from it?",
            "keywords": "feedback, improvement, growth, reflection, adaptation",
            "concepts": "Receptiveness to feedback, continuous improvement, self-awareness, professional growth"
        },
    ]
    
    # Shuffle and pick requested count
    import random
    random.shuffle(templates)
    selected = templates[:count]
    
    questions = []
    for i, t in enumerate(selected):
        questions.append({
            "id": -(i + 1),
            "role": role,
            "question_text": t["question"],
            "category": t["category"],
            "optimal_keywords": t["keywords"],
            "expected_concepts": t["concepts"],
            "difficulty": "Medium"
        })
    
    return questions

def analyze_resume_text(resume_text, question_count=3):
    """
    Analyzes resume text and generates interview questions tailored to the candidate's experience.
    """
    if GEMINI_API_KEY:
        try:
            return analyze_resume_with_gemini(resume_text, question_count)
        except Exception as e:
            print(f"Gemini resume analysis failed: {e}. Using local analysis.")
            return analyze_resume_locally(resume_text, question_count)
    else:
        return analyze_resume_locally(resume_text, question_count)

def analyze_resume_with_gemini(resume_text, question_count=3):
    if genai is None:
        raise ImportError("google-generativeai not available")
    model = genai.GenerativeModel('gemini-1.5-flash')
    
    # Generate unique questions each time by including timestamp
    import time
    unique_id = int(time.time() * 1000) % 10000
    
    prompt = f"""
    You are an expert AI interview coach. Analyze the following resume UNIQUELY and generate {question_count} different, highly specific interview questions 
    that would help this candidate prepare for interviews based on their specific background and experience.
    
    This is analysis request #{unique_id}. Generate fresh, unique questions not asked before.
    
    Resume Content:
    {resume_text[:4000]}
    
    For each question, provide:
    1. The question text - make it specific to technologies/skills mentioned in THIS resume
    2. The category (one of: Behavioral, Technical, Situational)
    3. Optimal keywords that should appear in a good answer (comma-separated)
    4. Expected concepts that should be covered (comma-separated)
    5. Difficulty level (one of: Easy, Medium, Hard)
    6. Also provide a brief summary of the candidate's background (key skills, experience, role)
    
    Output a JSON object EXACTLY in the following format. Do not include any markdown wrappers or backticks. Output raw JSON only.
    
    Format:
    {{
        "summary": "Brief summary of candidate's background (1-2 sentences)",
        "detected_role": "Inferred target role",
        "questions": [
            {{
                "question_text": "The interview question text here",
                "category": "Behavioral",
                "optimal_keywords": "keyword1, keyword2, keyword3",
                "expected_concepts": "concept1, concept2, concept3",
                "difficulty": "Medium"
            }},
            ...
        ]
    }}
    """
    
    try:
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        # Strip markdown code blocks if the model wrapped it
        if response_text.startswith("```"):
            match = re.search(r"```(?:json)?(.*?)```", response_text, re.DOTALL)
            if match:
                response_text = match.group(1).strip()
        
        data = json.loads(response_text)
        # Validate and process questions
        if 'questions' in data and isinstance(data['questions'], list):
            for i, q in enumerate(data['questions']):
                q["id"] = -(i + 1000 + (unique_id % 100))  # Unique IDs incorporating request ID
                q["role"] = data.get('detected_role', 'Based on Resume')
                if 'category' not in q:
                    q['category'] = 'Behavioral'
                if 'difficulty' not in q:
                    q['difficulty'] = 'Medium'
                if 'optimal_keywords' not in q:
                    q['optimal_keywords'] = ''
                if 'expected_concepts' not in q:
                    q['expected_concepts'] = ''
            return data
    except Exception as e:
        print(f"Error parsing Gemini resume response JSON: {e}. Falling back to local.")
        return analyze_resume_locally(resume_text, question_count)

def analyze_resume_locally(resume_text, question_count=3):
    """
    Fallback resume analysis using rule-based extraction.
    Generates unique questions based on specific skills found in the resume.
    """
    import random
    text_lower = resume_text.lower()
    
    # Detect specific skills and technologies from resume
    skills_found = []
    skill_categories = {
        'frontend': ['react', 'angular', 'vue', 'javascript', 'typescript', 'html', 'css', 'svelte', 'nextjs', 'nuxt'],
        'backend': ['node', 'python', 'java', 'django', 'flask', 'spring', 'express', 'ruby', 'php', 'dotnet', '.net'],
        'database': ['sql', 'nosql', 'mongodb', 'postgresql', 'mysql', 'redis', 'firebase', 'graphql'],
        'cloud': ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'heroku', 'vercel', 'netlify'],
        'mobile': ['android', 'ios', 'flutter', 'react native', 'xamarin', 'swift', 'kotlin'],
        'devops': ['jenkins', 'ci/cd', 'git', 'github', 'gitlab', 'terraform', 'ansible'],
        'testing': ['jest', 'cypress', 'selenium', 'pytest', 'junit', 'mocha', 'chai'],
        'design': ['ui', 'ux', 'figma', 'sketch', 'adobe', 'photoshop', 'illustrator'],
        'marketing': ['seo', 'sem', 'analytics', 'campaign', 'social media', 'content', 'brand'],
        'sales': ['crm', 'lead', 'pipeline', 'quota', 'conversion', 'territory'],
        'management': ['agile', 'scrum', 'product', 'project', 'leadership', 'team lead'],
        'data': ['machine learning', 'ai', 'analytics', 'data science', 'pandas', 'numpy', 'tensorflow', 'pytorch'],
        'languages': ['python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'go', 'rust', 'kotlin', 'swift']
    }
    
    for category, keywords in skill_categories.items():
        for kw in keywords:
            if kw in text_lower:
                skills_found.append(kw)
    
    # Detect role based on skills
    detected_role = 'Professional'
    frontend_count = sum(1 for s in ['react', 'angular', 'vue', 'javascript', 'typescript', 'html', 'css'] if s in skills_found)
    backend_count = sum(1 for s in ['node', 'python', 'java', 'django', 'flask', 'spring'] if s in skills_found)
    
    if frontend_count > 0 and backend_count > 0:
        detected_role = 'Full Stack Developer'
    elif frontend_count > 0:
        detected_role = 'Frontend Developer'
    elif backend_count > 0:
        detected_role = 'Backend Developer'
    elif any(kw in skills_found for kw in ['seo', 'marketing', 'campaign']):
        detected_role = 'Marketing Manager'
    elif any(kw in skills_found for kw in ['machine learning', 'data science', 'tensorflow']):
        detected_role = 'Data Analyst'
    elif any(kw in skills_found for kw in ['sales', 'crm', 'lead']):
        detected_role = 'Sales Executive'
    
    # Generate unique questions based on detected skills
    questions = []
    
    if skills_found:
        # Create questions specifically about the skills found
        shuffled_skills = random.sample(skills_found, min(len(skills_found), question_count + 1))
        
        # Question 1: Project experience with specific skills
        if len(shuffled_skills) > 0:
            skill = shuffled_skills[0]
            questions.append({
                "id": -1001,
                "role": detected_role,
                "question_text": f"Can you describe a project where you used {skill}? What challenges did you face and how did you overcome them?",
                "category": "Behavioral",
                "optimal_keywords": f"{skill}, challenge, solution, project, implementation",
                "expected_concepts": f"Project experience with {skill}, problem-solving, technical implementation",
                "difficulty": "Medium"
            })
        
        # Question 2: Technical question about one of their skills
        if len(shuffled_skills) > 1:
            skill = shuffled_skills[1]
            questions.append({
                "id": -1002,
                "role": detected_role,
                "question_text": f"What are the key differences between various approaches when using {skill}? When would you choose one over another?",
                "category": "Technical",
                "optimal_keywords": f"{skill}, architecture, trade-offs, optimization, best practices",
                "expected_concepts": f"Technical depth in {skill}, system design, architectural decisions",
                "difficulty": "Medium"
            })
        
        # Question 3: Learning/adaptation question
        if len(shuffled_skills) > 2:
            skill = shuffled_skills[2]
            questions.append({
                "id": -1003,
                "role": detected_role,
                "question_text": f"How do you stay current with updates and best practices in {skill}? Can you give an example of learning something new in this area?",
                "category": "Behavioral",
                "optimal_keywords": f"{skill}, learning, update, best practices, continuous improvement",
                "expected_concepts": "Learning agility, staying current with technology, continuous learning",
                "difficulty": "Medium"
            })
        
        # Question 4: Full stack specific (if applicable)
        if detected_role == 'Full Stack Developer':
            questions.append({
                "id": -1004,
                "role": detected_role,
                "question_text": "How do you ensure consistency between the frontend and backend of an application you're building?",
                "category": "Technical",
                "optimal_keywords": "api, rest, consistency, integration, fullstack, communication",
                "expected_concepts": "Full stack integration, API design, frontend-backend communication",
                "difficulty": "Medium"
            })
        
        # Question 5: Advanced technical question
        if len(shuffled_skills) > 0:
            skill = shuffled_skills[-1]
            questions.append({
                "id": -1005,
                "role": detected_role,
                "question_text": f"What performance optimization techniques have you used with {skill}? Explain a specific optimization you implemented.",
                "category": "Technical",
                "optimal_keywords": f"{skill}, performance, optimization, speed, efficiency",
                "expected_concepts": f"Performance optimization in {skill}, scalability, efficiency",
                "difficulty": "Medium"
            })
    else:
        # Fallback if no specific skills detected
        questions = [
            {
                "id": -1001,
                "role": detected_role,
                "question_text": "Tell me about your professional experience and key strengths.",
                "category": "Behavioral",
                "optimal_keywords": "experience, strengths, skills, professional, background",
                "expected_concepts": "Professional background, key strengths, career highlights",
                "difficulty": "Medium"
            },
            {
                "id": -1002,
                "role": detected_role,
                "question_text": "Describe a challenging project you worked on and how you approached it.",
                "category": "Behavioral",
                "optimal_keywords": "challenge, project, approach, solution, teamwork",
                "expected_concepts": "Problem-solving, project management, collaboration",
                "difficulty": "Medium"
            },
            {
                "id": -1003,
                "role": detected_role,
                "question_text": "How do you approach learning new technologies or skills in your field?",
                "category": "Behavioral",
                "optimal_keywords": "learning, technology, skills, approach, adaptation",
                "expected_concepts": "Learning agility, continuous development, skill acquisition",
                "difficulty": "Medium"
            }
        ]
    
    # Extract some experience highlights
    experience_highlights = []
    for line in resume_text.split('\n')[:10]:
        if any(word in line.lower() for word in ['experience', 'work', 'project', 'developed', 'created', 'built', 'designed']):
            experience_highlights.append(line.strip()[:100])
    
    summary = f"Candidate shows experience with {', '.join(skills_found[:5]) if skills_found else 'various technologies'} and is suited for a {detected_role} role."
    
    return {
        "summary": summary,
        "detected_role": detected_role,
        "questions": questions[:question_count]
    }


def ask_resume_question(question, resume_text):
    """
    Answers questions about a resume using AI or rule-based fallback.
    """
    if GEMINI_API_KEY:
        try:
            return ask_resume_question_with_gemini(question, resume_text)
        except Exception as e:
            print(f"Gemini Q&A failed: {e}. Using local fallback.")
            return ask_resume_question_locally(question, resume_text)
    else:
        return ask_resume_question_locally(question, resume_text)


def ask_resume_question_with_gemini(question, resume_text):
    if genai is None:
        raise ImportError("google-generativeai not available")
    model = genai.GenerativeModel('gemini-1.5-flash')
    
    prompt = f"""
    You are an expert AI interview coach. A candidate has asked a question about their resume.
    Answer the question based on the resume content provided.
    
    Resume Content:
    {resume_text[:2000]}
    
    Candidate's Question: {question}
    
    Provide a helpful, concise, and professional answer. If the question cannot be answered from the resume,
    indicate what additional information would be helpful. Keep your response under 150 words.
    Output raw text only, no markdown formatting.
    """
    
    response = model.generate_content(prompt)
    return { "answer": response.text.strip() }


def ask_resume_question_locally(question, resume_text):
    """
    Fallback for answering questions about resume - provides helpful context.
    """
    # Extract key information from the resume
    text_lower = resume_text.lower()
    
    # Simple keyword matching for common questions
    question_lower = question.lower()
    
    if 'skill' in question_lower or 'experience' in question_lower:
        skills = []
        skill_keywords = ['python', 'java', 'javascript', 'react', 'angular', 'vue', 'node', 'sql', 
                          'nosql', 'mongodb', 'design', 'marketing', 'sales', 'project', 'data',
                          'analysis', 'machine learning', 'ai', 'leadership', 'management']
        for kw in skill_keywords:
            if kw in text_lower:
                skills.append(kw)
        if skills:
            return {
                "answer": f"Based on your resume, your key skills include: {', '.join(skills[:5])}. These align well with roles requiring technical expertise and problem-solving abilities."
            }
        return { "answer": "I don't see specific technical skills mentioned in your resume. Consider adding more details about your competencies." }
    
    elif 'project' in question_lower or 'work' in question_lower:
        # Look for project-related keywords
        if 'project' in text_lower:
            return { "answer": "Your resume mentions project experience. Be prepared to discuss specific projects in detail, including your role, challenges faced, and outcomes achieved using the STAR method." }
        return { "answer": "Consider adding specific project details to your resume to better prepare for behavioral interview questions." }
    
    elif 'education' in question_lower or 'degree' in question_lower:
        # Look for education keywords
        edu_keywords = ['university', 'college', 'degree', 'bachelor', 'master', 'phd', 'education']
        if any(kw in text_lower for kw in edu_keywords):
            return { "answer": "Your educational background is mentioned in your resume. Be ready to discuss how your education prepared you for this role." }
        return { "answer": "I don't see education details in your resume. Consider including relevant educational background." }
    
    elif 'years' in question_lower:
        # Try to extract years of experience
        years_match = re.search(r'(\d+)\s*(?:years?|yrs?)', resume_text, re.IGNORECASE)
        if years_match:
            return { "answer": f"Your resume indicates {years_match.group(1)} years of experience. Make sure to highlight your most recent and relevant experience during the interview." }
        return { "answer": "Consider adding specific years of experience to better quantify your background." }
    
    else:
        # Generic helpful response
        return {
            "answer": "Based on your resume, focus on highlighting your achievements with specific metrics and examples. Be ready to discuss how your background prepares you for this role and what unique value you bring."
        }


def analyze_locally(question_text, category, optimal_keywords, expected_concepts, transcript):
    """
    Rule-based local NLP grading logic. Evaluates filler words, length, keyword matching, and readability.
    """
    words = transcript.lower().split()
    word_count = len(words)
    
    # 1. Count filler words
    filler_words = ["um", "uh", "like", "actually", "basically", "so", "you know", "sort of", "stuff"]
    filler_count = 0
    # Simple check for phrases and standalone words
    transcript_lower = transcript.lower()
    for filler in filler_words:
        # Match word boundaries
        matches = re.findall(rf"\b{re.escape(filler)}\b", transcript_lower)
        filler_count += len(matches)
    
    # 2. Check keywords match
    keyword_list = [k.strip().lower() for k in optimal_keywords.split(",")] if optimal_keywords else []
    matches_found = []
    for kw in keyword_list:
        if re.search(rf"\b{re.escape(kw)}\b", transcript_lower):
            matches_found.append(kw)
            
    keyword_match_ratio = len(matches_found) / len(keyword_list) if keyword_list else 1.0
    
    # 3. Calculate scores
    # Relevance Score: based on keyword matching
    relevance = int(40 + (keyword_match_ratio * 60))
    if word_count < 15:
        relevance = max(10, relevance - 30)

    # Clarity Score: based on length stability and filler word frequency relative to total words
    filler_ratio = filler_count / max(1, word_count)
    filler_penalty = min(40, int(filler_ratio * 150))
    
    if word_count < 25:
        clarity = 50 - filler_penalty
    elif word_count > 250:
        clarity = 85 - filler_penalty  # Slight penalty for rambling
    else:
        clarity = 95 - filler_penalty
    clarity = max(20, min(100, clarity))

    # Grammar & Vocabulary Score: base check for sentences, length, filler words
    grammar = max(30, min(100, 95 - filler_penalty - (5 if word_count < 15 else 0)))

    # Overall Score: weighted average
    if category == "Technical":
        score = int((relevance * 0.5) + (clarity * 0.3) + (grammar * 0.2))
    else:
        score = int((relevance * 0.3) + (clarity * 0.4) + (grammar * 0.3))

    # Cap scores
    score = max(0, min(100, score))
    relevance = max(0, min(100, relevance))
    clarity = max(0, min(100, clarity))
    grammar = max(0, min(100, grammar))

    # 4. Generate Strengths, Weaknesses, Tips dynamically
    strengths = []
    weaknesses = []
    tips = []

    # Strengths
    if word_count >= 40:
        strengths.append("Provided a detailed explanation with good response length.")
    else:
        strengths.append("Answer was concise and direct.")
        
    if len(matches_found) >= 2:
        strengths.append(f"Successfully integrated key terminology: {', '.join(matches_found[:3])}.")
    else:
        strengths.append("Presented structured layout flow.")

    if filler_count <= 2:
        strengths.append("Spoke fluently with minimal crutch words.")

    # Weaknesses
    if word_count < 30:
        weaknesses.append("Response was too brief, missing opportunities to elaborate on details.")
    elif word_count > 250:
        weaknesses.append("Rambled slightly, which reduced the impact and conciseness of the main point.")

    if len(matches_found) < len(keyword_list) / 2:
        missed = [k for k in keyword_list if k not in matches_found]
        if missed:
            weaknesses.append(f"Missed addressing core concepts like: {', '.join(missed[:2])}.")

    if filler_count > 5:
        weaknesses.append(f"Used a high volume of crutch words ({filler_count} detected), making the delivery sound hesitant.")

    # Ensure we always have at least one weakness/strength
    if not weaknesses:
        weaknesses.append("Minor lack of specific metrics or quantitative details in the response.")
        
    # Tips
    if category == "Behavioral":
        tips.append("Use the STAR method: describe the Situation, Task, Action you took, and final quantitative Result.")
        tips.append("Focus more on your individual contributions using 'I' statements rather than general 'we' statements.")
    else:
        tips.append("Whenever describing technical terms, explicitly state the engineering tradeoffs (pros/cons) of your approach.")
        tips.append("Use a real-world project example to illustrate this concept in action.")

    if filler_count > 3:
        tips.append("Practice pausing silently instead of using verbal filler words when organizing your next sentence.")

    return {
        "score": score,
        "clarity": clarity,
        "grammar": grammar,
        "relevance": relevance,
        "filler_count": filler_count,
        "strengths": strengths[:3],
        "weaknesses": weaknesses[:2],
        "tips": tips[:3]
    }