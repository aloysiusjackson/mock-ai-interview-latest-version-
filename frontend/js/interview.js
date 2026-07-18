let videoStream = null;
let speechRecognizer = null;
let timerInterval = null;

const interview = {
    state: {
        role: '',
        questions: [],
        currentIndex: 0,
        answers: [],
        secondsElapsed: 0,
        isRecording: false,
        antiCheatFlags: null
    },

    async start(role) {
        this.state.role = role;
        this.state.currentIndex = 0;
        this.state.answers = [];
        this.state.secondsElapsed = 0;
        this.state.isRecording = false;
        this.state.antiCheatFlags = null;

        app.showLoader('Fetching relevant interview questions...');

        try {
            const data = await api.getQuestions(role);
            this.state.questions = data.questions;
        } catch (error) {
            console.error('Failed to load questions, using local seed fallback:', error);
            this.state.questions = this.getFallbackQuestions(role);
        }

        app.hideLoader();
        
        // Show Interview Room View
        app.switchView('interview-view');
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

        // Start anti-cheat monitoring
        antiCheat.startMonitoring();

        // Update topbar context to show "Anti-Cheat Active" and interview mode
        app.setInterviewTopbarContext(role);

        // Attempt to start real webcam, fallback to placeholder if fails
        this.startWebcam();

        // Setup Speech Recognition
        this.setupSpeechRecognition();

        // Initialize question tracking panel
        this.renderQuestionTracker();

        // Load the first question
        this.loadQuestion(0);
    },

    /**
     * Start interview with questions generated from resume analysis
     */
    async startWithResumeQuestions(questions, role, resumeText) {
        this.state.role = role || 'Based on Resume';
        this.state.currentIndex = 0;
        this.state.answers = [];
        this.state.secondsElapsed = 0;
        this.state.isRecording = false;
        this.state.antiCheatFlags = null;
        this.state.questions = questions || [];
        this.state.resumeText = resumeText || '';

        // Show Interview Room View
        app.switchView('interview-view');
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

        // Start anti-cheat monitoring
        antiCheat.startMonitoring();

        // Update topbar context to show "Anti-Cheat Active" and interview mode
        app.setInterviewTopbarContext(this.state.role);

        // Attempt to start real webcam, fallback to placeholder if fails
        this.startWebcam();

        // Setup Speech Recognition
        this.setupSpeechRecognition();

        // Initialize question tracking panel
        this.renderQuestionTracker();

        // Setup Q&A for resume interviews
        this.setupResumeQA(resumeText || '');

        // Load the first question
        this.loadQuestion(0);
    },

    /**
     * Start real webcam feed - fallback to placeholder on failure
     */
    async startWebcam() {
        const videoElement = document.getElementById('webcam-feed');
        const placeholder = document.getElementById('webcam-placeholder');
        
        try {
            // Attempt to get user camera
            videoStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                },
                audio: false
            });
            
            videoElement.srcObject = videoStream;
            videoElement.style.display = 'block';
            placeholder.style.display = 'none';
            
            console.log('Real webcam feed started successfully');
        } catch (error) {
            console.warn('Webcam not available, using animated placeholder:', error.message);
            this.setupPlaceholderOnly();
        }
    },

    /**
     * Show the animated placeholder when webcam is unavailable
     */
    setupPlaceholderOnly() {
        const videoElement = document.getElementById('webcam-feed');
        const placeholder = document.getElementById('webcam-placeholder');
        
        // Hide webcam feed, show placeholder
        videoElement.style.display = 'none';
        placeholder.style.display = 'flex';
        
        // Update the avatar with role initial
        const avatar = document.getElementById('mock-avatar-interview');
        if (avatar && this.state.role) {
            avatar.textContent = this.state.role.charAt(0).toUpperCase();
        }
        
        // Update the interviewer name with role context
        const interviewerName = document.getElementById('interviewer-name');
        if (interviewerName) {
            interviewerName.textContent = `${this.state.role} Interviewer`;
        }
        
        console.log('Camera disabled. Using animated placeholder.');
    },

    stopWebcam() {
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
    },

    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('Speech Recognition not supported in this browser. Fallback input will be provided.');
            this.showSpeechError('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari and type your answer in the text box below.');
            return;
        }

        speechRecognizer = new SpeechRecognition();
        speechRecognizer.continuous = true;
        speechRecognizer.interimResults = true;
        speechRecognizer.lang = 'en-US';
        speechRecognizer.maxAlternatives = 1;

        speechRecognizer.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript;
                } else {
                    interimTranscript += result[0].transcript;
                }
            }
            
            if (finalTranscript) {
                const box = document.getElementById('live-transcript-text');
                box.value += (box.value ? ' ' : '') + finalTranscript;
                box.scrollTop = box.scrollHeight;
            }
            
            // Show interim results in a placeholder
            if (interimTranscript) {
                const box = document.getElementById('live-transcript-text');
                box.placeholder = interimTranscript + '...';
            }
        };

        speechRecognizer.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'not-allowed') {
                this.showSpeechError('Microphone access was denied. Please allow microphone access in your browser settings, then refresh the page and try again. For now, you can type your answer in the text box.');
            } else if (event.error === 'no-speech') {
                console.log('No speech detected - keep talking or type your answer');
            } else if (event.error === 'audio-capture') {
                this.showSpeechError('No microphone found. Please connect a microphone or type your answer in the text box below.');
            } else if (event.error === 'service-not-allowed') {
                this.showSpeechError('Speech recognition service is not allowed on this page. Try using a different browser or type your answer.');
            }
        };

        speechRecognizer.onend = () => {
            if (this.state.isRecording) {
                try { 
                    setTimeout(() => {
                        speechRecognizer.start(); 
                    }, 100);
                } catch(e){}
            }
        };
    },

    /**
     * Show speech recognition error message to user
     */
    showSpeechError(message) {
        const errorEl = document.getElementById('speech-error-msg');
        if (errorEl) {
            const textEl = document.getElementById('speech-error-text');
            if (textEl) {
                textEl.textContent = message;
            }
            errorEl.style.display = 'flex';
        }
    },

    /**
     * Request microphone permission explicitly before starting recording
     */
    async requestMicrophonePermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Stop the test stream immediately - we just needed permission
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            console.error('Microphone permission denied:', error);
            this.showSpeechError('Microphone access is required for speech-to-text. Please allow microphone access in your browser settings, then refresh the page. You can still type your answer manually.');
            return false;
        }
    },

    renderQuestionTracker() {
        const list = document.getElementById('question-tracker-list');
        list.innerHTML = '';

        this.state.questions.forEach((q, idx) => {
            const item = document.createElement('div');
            item.className = 'tracker-item';
            item.id = `tracker-q-${idx}`;
            item.innerHTML = `
                <div class="tracker-number">${idx + 1}</div>
                <div class="tracker-label">${q.category}</div>
                <div class="tracker-status" id="tracker-status-${idx}">Pending</div>
            `;
            list.appendChild(item);
        });
    },

    loadQuestion(index) {
        this.state.currentIndex = index;
        this.state.secondsElapsed = 0;
        this.state.isRecording = false;
        
        // Reset controls & transcript view
        document.getElementById('live-transcript-text').value = '';
        document.getElementById('record-btn').innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
            Record Answer
        `;
        document.getElementById('record-btn').className = 'btn btn-primary';
        document.getElementById('recording-indicator').style.display = 'none';
        document.getElementById('time-readout').textContent = '00:00';

        // Update Tracker UI
        this.state.questions.forEach((q, idx) => {
            const el = document.getElementById(`tracker-q-${idx}`);
            const stat = document.getElementById(`tracker-status-${idx}`);
            if (idx === index) {
                el.className = 'tracker-item active';
                stat.textContent = 'Speaking';
            } else if (idx < index) {
                el.className = 'tracker-item done';
                stat.textContent = 'Completed';
            } else {
                el.className = 'tracker-item';
                stat.textContent = 'Pending';
            }
        });

        // Set Teleprompter question
        const currentQ = this.state.questions[index];
        document.getElementById('teleprompter-text').textContent = currentQ.question_text;
        
        // Update Action buttons: "Next Question" or "Finish Interview"
        const actionBtn = document.getElementById('next-q-btn');
        if (index === this.state.questions.length - 1) {
            actionBtn.innerHTML = `
                Submit Interview
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            `;
            actionBtn.onclick = () => this.finishInterview();
        } else {
            actionBtn.innerHTML = `
                Next Question
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            `;
            actionBtn.onclick = () => this.nextQuestion();
        }

        // Voice Readout (TTS) for the question
        this.speakQuestion(currentQ.question_text);
    },

    speakQuestion(text) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google'));
            if (preferredVoice) utterance.voice = preferredVoice;

            window.speechSynthesis.speak(utterance);
        }
    },

    async toggleRecording() {
        if (this.state.isRecording) {
            this.stopRecording();
            // Auto-grade the answer when recording stops
            this.autoGradeCurrentAnswer();
        } else {
            // Request mic permission first - this is the key fix for speech-to-text
            const micGranted = await this.requestMicrophonePermission();
            if (micGranted) {
                this.startRecording();
            } else {
                this.showSpeechError('Microphone permission is required for speech-to-text. After allowing access in browser settings, click "Record Answer" again. You can also type your answer manually.');
            }
        }
    },

    startRecording() {
        this.state.isRecording = true;
        
        const btn = document.getElementById('record-btn');
        btn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/></svg>
            Stop & Auto-Grade
        `;
        btn.className = 'btn btn-danger';
        
        document.getElementById('recording-indicator').style.display = 'flex';
        
        // Clear any previous error message
        const errorEl = document.getElementById('speech-error-msg');
        if (errorEl) errorEl.style.display = 'none';
        
        this.startTimer();

        if (speechRecognizer) {
            try {
                speechRecognizer.start();
                console.log('Speech recognition started successfully');
            } catch(e) {
                console.error("SpeechRecognition failed to start:", e);
                this.showSpeechError('Failed to start speech recognition. Try typing your answer in the text box instead.');
            }
        } else {
            console.warn('Speech recognition not available - user must type manually');
        }
    },

    stopRecording() {
        this.state.isRecording = false;
        
        const btn = document.getElementById('record-btn');
        btn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
            Record Answer
        `;
        btn.className = 'btn btn-primary';
        
        document.getElementById('recording-indicator').style.display = 'none';

        this.stopTimer();

        if (speechRecognizer) {
            try { speechRecognizer.stop(); } catch(e){}
        }
    },

    /**
     * Auto-grade the current answer as soon as recording stops
     * Provides instant feedback without requiring manual submission
     */
    async autoGradeCurrentAnswer() {
        const transcript = document.getElementById('live-transcript-text').value.trim();
        if (!transcript) return;

        const currentQ = this.state.questions[this.state.currentIndex];
        
        // Show the auto-grade indicator
        const feedbackEl = document.createElement('div');
        feedbackEl.className = 'auto-grade-feedback';
        feedbackEl.id = 'auto-grade-indicator';
        feedbackEl.innerHTML = `
            <div class="grade-loading">
                <div class="grade-spinner"></div>
                <span>Analyzing your response...</span>
            </div>
        `;
        
        // Insert feedback below transcript
        const transcriptCard = document.querySelector('.live-transcript-card');
        transcriptCard.appendChild(feedbackEl);

        try {
            // Try backend auto-grade endpoint - use defaults for optional fields
            const gradeResult = await api.autoGrade({
                transcript: transcript,
                question_text: currentQ.question_text,
                category: currentQ.category,
                optimal_keywords: currentQ.optimal_keywords || '',
                expected_concepts: currentQ.expected_concepts || ''
            });
            if (!gradeResult || gradeResult.error) {
                throw new Error(gradeResult?.error || 'Auto-grade failed');
            }

            // Show the grade result immediately with encouraging feedback
            feedbackEl.innerHTML = `
                <div class="grade-result">
                    <div class="grade-header">
                        <span class="grade-label">Your Response Score</span>
                        <span class="grade-score ${this.getScoreClass(gradeResult.score)}">${gradeResult.score}%</span>
                    </div>
                    <div class="grade-subscores">
                        <div class="grade-sub">
                            <span>Clarity</span>
                            <span>${gradeResult.clarity}%</span>
                        </div>
                        <div class="grade-sub">
                            <span>Relevance</span>
                            <span>${gradeResult.relevance}%</span>
                        </div>
                    </div>
                    <div class="grade-tips" style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border-glass);">
                        <span style="font-size: 0.85rem;">${gradeResult.strengths && gradeResult.strengths.length > 0 ? '✅ ' + gradeResult.strengths[0] : '💡 Good start! Keep practicing.'}</span>
                    </div>
                </div>
            `;

            // Auto-hide after 10 seconds
            setTimeout(() => {
                if (feedbackEl) feedbackEl.remove();
            }, 10000);

        } catch (error) {
            console.log('Auto-grade via backend failed, using local scoring:', error);
            
            // Local fallback scoring - more lenient for freshers
            const localScore = this.localScoreAnswer(transcript, currentQ);
            
            feedbackEl.innerHTML = `
                <div class="grade-result">
                    <div class="grade-header">
                        <span class="grade-label">Quick Assessment</span>
                        <span class="grade-score ${this.getScoreClass(localScore.score)}">${localScore.score}%</span>
                    </div>
                    <div class="grade-tips" style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border-glass);">
                        <span style="font-size: 0.85rem;">✅ ${localScore.tip}</span>
                    </div>
                </div>
            `;

            setTimeout(() => {
                if (feedbackEl) feedbackEl.remove();
            }, 8000);
        }
    },

    /**
     * Simple local scoring algorithm for auto-grade fallback - more lenient for freshers
     */
    localScoreAnswer(transcript, question) {
        const wordCount = transcript.split(/\s+/).length;
        
        // More lenient base scoring for beginners
        let score = 40;
        if (wordCount >= 15) score = 55;
        if (wordCount >= 25) score = 65;
        if (wordCount >= 35) score = 72;
        if (wordCount >= 50) score = 78;
        if (wordCount >= 70) score = 85;
        
        // Bonus for keywords if available
        if (question.optimal_keywords) {
            const keywords = question.optimal_keywords.split(',').map(k => k.trim().toLowerCase());
            const transcriptLower = transcript.toLowerCase();
            const matches = keywords.filter(k => transcriptLower.includes(k));
            score += Math.min(10, matches.length * 2);
        }
        
        // Minimum score of 25 for any response
        if (wordCount < 10) score = Math.max(25, score - 5);
        
        // Cap at 92
        score = Math.min(92, score);
        
        let tip = 'Good response! You addressed the key points.';
        if (wordCount < 20) tip = 'Nice start! Try adding more details to elaborate on your answer.';
        if (wordCount < 10) tip = 'Try to speak for a bit longer to give more context to your answer.';
        if (score >= 75) tip = 'Excellent response! You covered the key points well.';
        
        return { score, tip };
    },

    getScoreClass(score) {
        if (score >= 80) return 'high';
        if (score >= 65) return 'mid';
        return 'low';
    },

    startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            this.state.secondsElapsed++;
            const mins = Math.floor(this.state.secondsElapsed / 60).toString().padStart(2, '0');
            const secs = (this.state.secondsElapsed % 60).toString().padStart(2, '0');
            document.getElementById('time-readout').textContent = `${mins}:${secs}`;
        }, 1000);
    },

    stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    },

    saveCurrentResponse() {
        const text = document.getElementById('live-transcript-text').value.trim();
        const currentQ = this.state.questions[this.state.currentIndex];
        
        this.state.answers.push({
            question_id: currentQ.id,
            question_text: currentQ.question_text,
            category: currentQ.category,
            optimal_keywords: currentQ.optimal_keywords || '',
            expected_concepts: currentQ.expected_concepts || '',
            transcript: text
        });
    },

    nextQuestion() {
        this.saveCurrentResponse();
        this.stopRecording();
        this.loadQuestion(this.state.currentIndex + 1);
    },

    async finishInterview() {
        // Save last response
        this.saveCurrentResponse();
        
        // Stop all monitoring
        this.stopRecording();
        this.stopWebcam();
        
        // Stop anti-cheat and get integrity report
        const integrityReport = antiCheat.getIntegrityReport();
        antiCheat.stopMonitoring();
        
        // Reset topbar context
        app.resetTopbarContext();

        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }

        app.showLoader('Analyzing transcript answers, calculating clarity subscores, and compiling actionable tips...');

        try {
            const result = await api.submitInterview(this.state.role, this.state.answers);
            
            // Add integrity info to result for display
            if (integrityReport.is_flagged) {
                result.integrity_note = `⚠️ This session had ${integrityReport.tab_switches} tab switch(es) detected. Scores may be marked for integrity review.`;
            }
            
            app.hideLoader();
            app.showFeedbackDetail(result);
        } catch (error) {
            console.error('Failed to submit interview details:', error);
            app.hideLoader();
            this.renderMockFeedback();
        }
    },

    getFallbackQuestions(role) {
        const allFallback = [
            // Original IT roles
            { id: 1, role: "Software Engineer", category: "Behavioral", question_text: "Tell me about a time you had a technical disagreement with a team member. How did you resolve it?", difficulty: "Medium", optimal_keywords: "compromise, discussion, collaboration, perspective, consensus", expected_concepts: "Resolving conflict, communication, constructive debate, technical compromise" },
            { id: 2, role: "Software Engineer", category: "Technical", question_text: "Can you explain the difference between a Relational Database (SQL) and a Non-Relational Database (NoSQL)?", difficulty: "Medium", optimal_keywords: "schema, ACID, scale, horizontal, vertical, structured, key-value, document", expected_concepts: "Database design, trade-offs, scaling properties" },
            { id: 5, role: "Software Engineer", category: "Technical", question_text: "What is Big O notation, and why is it important in algorithm design?", difficulty: "Easy", optimal_keywords: "time complexity, space complexity, scale, input size", expected_concepts: "Algorithmic efficiency, execution speed, scalability" },
            // Product Manager
            { id: 6, role: "Product Manager", category: "Behavioral", question_text: "Tell me about a time when a product launch didn't go as planned. What did you learn?", difficulty: "Hard", optimal_keywords: "post-mortem, customer feedback, metric, root cause, adaptation", expected_concepts: "Resilience, post-launch feedback loop, metrics tracking" },
            { id: 7, role: "Product Manager", category: "Technical", question_text: "How do you decide what features to prioritize when building a product roadmap?", difficulty: "Medium", optimal_keywords: "RICE, MoSCoW, value, effort, metrics, stakeholders", expected_concepts: "Roadmapping, value/effort scoring, customer needs analysis" },
            // Data Analyst
            { id: 11, role: "Data Analyst", category: "Technical", question_text: "What is the difference between inner join, left join, and outer join in SQL?", difficulty: "Easy", optimal_keywords: "join, merge, null, matching rows, left table, right table", expected_concepts: "Data cleaning, table relationships, aggregation" },
            { id: 12, role: "Data Analyst", category: "Technical", question_text: "Explain the difference between correlation and causation.", difficulty: "Medium", optimal_keywords: "correlation, causation, variable, confounding factor", expected_concepts: "Data literacy, analytical bias, scientific method" },
            // Sales Executive
            { id: 15, role: "Sales Executive", category: "Behavioral", question_text: "Describe a time you exceeded your quarterly sales target. What specific strategies did you use?", difficulty: "Medium", optimal_keywords: "prospecting, pipeline, closing, negotiation, relationship", expected_concepts: "Sales methodology, target achievement, strategic planning" },
            { id: 16, role: "Sales Executive", category: "Situational", question_text: "How would you handle a situation where a long-time client is considering switching to a competitor?", difficulty: "Hard", optimal_keywords: "retention, value proposition, feedback, solution, loyalty", expected_concepts: "Customer retention, consultative selling, competitive differentiation" },
            { id: 17, role: "Sales Executive", category: "Behavioral", question_text: "Tell me about a time you failed to close an important deal. What did you learn?", difficulty: "Medium", optimal_keywords: "analysis, reflection, objection, follow-up, qualification", expected_concepts: "Learning from failure, sales process refinement" },
            // Marketing Manager
            { id: 18, role: "Marketing Manager", category: "Technical", question_text: "What marketing KPIs do you track to measure campaign effectiveness?", difficulty: "Medium", optimal_keywords: "ROI, CAC, LTV, conversion rate, CTR, impressions", expected_concepts: "Marketing analytics, campaign optimization, KPI tracking" },
            { id: 19, role: "Marketing Manager", category: "Behavioral", question_text: "Describe a successful marketing campaign you led from concept to execution.", difficulty: "Medium", optimal_keywords: "strategy, creative, execution, metrics, target audience", expected_concepts: "Campaign lifecycle, creative strategy, results measurement" },
            // HR Manager
            { id: 21, role: "HR Manager", category: "Behavioral", question_text: "Tell me about a time you handled a sensitive employee relations issue. How did you maintain confidentiality?", difficulty: "Hard", optimal_keywords: "confidentiality, fairness, investigation, policy, communication", expected_concepts: "Employee relations, conflict resolution, compliance" },
            { id: 22, role: "HR Manager", category: "Technical", question_text: "What strategies do you use to improve employee retention and reduce turnover?", difficulty: "Medium", optimal_keywords: "retention, engagement, culture, feedback, development", expected_concepts: "Talent management, employee engagement, retention strategies" },
            // Financial Analyst
            { id: 24, role: "Financial Analyst", category: "Technical", question_text: "Walk me through how you would build a financial model to evaluate a potential investment.", difficulty: "Hard", optimal_keywords: "DCF, NPV, IRR, assumptions, revenue projections, costs", expected_concepts: "Financial modeling, valuation methods, forecasting" },
            { id: 25, role: "Financial Analyst", category: "Technical", question_text: "What are the key financial statements every analyst should understand?", difficulty: "Medium", optimal_keywords: "income statement, balance sheet, cash flow, revenue, expenses", expected_concepts: "Financial accounting, statement analysis, GAAP principles" },
            // Operations Manager
            { id: 27, role: "Operations Manager", category: "Behavioral", question_text: "Tell me about a time you improved an inefficient process in your organization.", difficulty: "Medium", optimal_keywords: "process improvement, efficiency, cost reduction, automation", expected_concepts: "Process optimization, operational efficiency, measurable impact" },
            { id: 28, role: "Operations Manager", category: "Situational", question_text: "A key supplier has suddenly gone bankrupt, threatening your production timeline. How do you respond?", difficulty: "Hard", optimal_keywords: "contingency planning, supplier diversification, communication", expected_concepts: "Supply chain management, crisis response, problem-solving" },
            // Customer Support Lead
            { id: 30, role: "Customer Support Lead", category: "Behavioral", question_text: "Describe a time you handled an extremely angry customer. How did you de-escalate the situation?", difficulty: "Medium", optimal_keywords: "empathy, active listening, de-escalation, solution, patience", expected_concepts: "Customer service excellence, conflict de-escalation" },
            { id: 31, role: "Customer Support Lead", category: "Situational", question_text: "Your team's customer satisfaction scores have dropped by 10 points. How do you fix it?", difficulty: "Hard", optimal_keywords: "data analysis, team feedback, training, quality assurance", expected_concepts: "Quality management, team development, root cause analysis" },
            // Healthcare Administrator
            { id: 33, role: "Healthcare Administrator", category: "Behavioral", question_text: "Describe a time you had to manage a crisis in a healthcare setting.", difficulty: "Hard", optimal_keywords: "crisis management, patient safety, staffing, resource allocation", expected_concepts: "Healthcare operations, crisis leadership, team coordination" },
            { id: 34, role: "Healthcare Administrator", category: "Technical", question_text: "How do you ensure compliance with healthcare regulations such as HIPAA?", difficulty: "Medium", optimal_keywords: "compliance, HIPAA, privacy, audit, training, protocols", expected_concepts: "Healthcare regulations, compliance management" },
            // Project Manager
            { id: 36, role: "Project Manager", category: "Behavioral", question_text: "Tell me about a project that was falling behind schedule. How did you get it back on track?", difficulty: "Medium", optimal_keywords: "schedule, risk mitigation, resources, communication, prioritization", expected_concepts: "Project recovery, stakeholder management, adaptive planning" },
            { id: 37, role: "Project Manager", category: "Technical", question_text: "What project management methodologies have you used? Compare Agile, Scrum, and Waterfall.", difficulty: "Medium", optimal_keywords: "Agile, Scrum, Waterfall, sprint, iteration, documentation", expected_concepts: "Project methodology, lifecycle comparison, process selection" },
            // Business Analyst
            { id: 39, role: "Business Analyst", category: "Technical", question_text: "How do you gather and document requirements from stakeholders?", difficulty: "Medium", optimal_keywords: "interviews, surveys, workshops, documentation, BRD, user stories", expected_concepts: "Requirements gathering, stakeholder elicitation" },
            { id: 40, role: "Business Analyst", category: "Behavioral", question_text: "Describe a time when you identified a gap between business needs and the proposed solution.", difficulty: "Medium", optimal_keywords: "gap analysis, solution assessment, communication, alternatives", expected_concepts: "Business process analysis, solution evaluation" },
            // Teacher/Educator
            { id: 42, role: "Teacher/Educator", category: "Behavioral", question_text: "Describe a time you had to adapt your teaching style to accommodate a student with different learning needs.", difficulty: "Medium", optimal_keywords: "adaptation, differentiation, inclusive, engagement, assessment", expected_concepts: "Differentiated instruction, inclusive education" },
            { id: 43, role: "Teacher/Educator", category: "Situational", question_text: "How would you handle a classroom where students are disengaged and not participating?", difficulty: "Medium", optimal_keywords: "engagement strategies, interactive learning, rapport, feedback", expected_concepts: "Classroom management, student engagement" },
            // Retail Manager
            { id: 45, role: "Retail Manager", category: "Behavioral", question_text: "Describe a time you improved the customer experience in your store.", difficulty: "Medium", optimal_keywords: "customer experience, sales growth, loyalty, service, training", expected_concepts: "Retail operations, customer experience management" },
            { id: 46, role: "Retail Manager", category: "Situational", question_text: "Your store is consistently missing its monthly sales targets. Walk me through your plan to turn performance around.", difficulty: "Hard", optimal_keywords: "sales strategy, training, inventory, promotions, staffing", expected_concepts: "Retail turnaround, performance management" },
            // Legal Associate
            { id: 48, role: "Legal Associate", category: "Behavioral", question_text: "Describe a time you had to manage multiple high-priority cases with conflicting deadlines.", difficulty: "Medium", optimal_keywords: "prioritization, deadlines, organization, case management", expected_concepts: "Legal workflow management, time management" },
            { id: 49, role: "Legal Associate", category: "Technical", question_text: "What steps do you take to ensure legal documents are accurate and compliant?", difficulty: "Medium", optimal_keywords: "document review, compliance, accuracy, research", expected_concepts: "Legal documentation, regulatory compliance" },
            // Graphic Designer
            { id: 51, role: "Graphic Designer", category: "Behavioral", question_text: "Tell me about a time a client rejected your design concept. How did you handle it?", difficulty: "Medium", optimal_keywords: "feedback, revision, communication, client management, compromise", expected_concepts: "Design process, client communication, creative problem-solving" },
            { id: 52, role: "Graphic Designer", category: "Technical", question_text: "Walk me through your design process from client brief to final deliverable.", difficulty: "Medium", optimal_keywords: "wireframe, mockup, prototyping, Figma, Adobe, iteration", expected_concepts: "Design thinking, tools proficiency, workflow structure" },
            // Content Writer
            { id: 54, role: "Content Writer", category: "Behavioral", question_text: "Describe a time your content strategy significantly increased audience engagement.", difficulty: "Medium", optimal_keywords: "strategy, engagement, analytics, audience, SEO, storytelling", expected_concepts: "Content marketing, audience development, strategic writing" },
            { id: 55, role: "Content Writer", category: "Technical", question_text: "How do you approach SEO keyword research while maintaining high-quality content?", difficulty: "Medium", optimal_keywords: "SEO, keywords, readability, search intent, headers, meta", expected_concepts: "SEO writing, content optimization, reader experience" }
        ];
        
        // Filter for the requested role
        const roleQuestions = allFallback.filter(q => q.role === role);
        
        // If we have enough questions for this role, return them
        if (roleQuestions.length >= 3) {
            return roleQuestions.slice(0, 3);
        }
        
        // If no specific role questions found, generate generic ones
        if (roleQuestions.length === 0) {
            return [
                {
                    id: -1,
                    role: role,
                    category: "Behavioral",
                    question_text: `Tell me about a time you demonstrated leadership skills in a ${role} context. What was the outcome?`,
                    difficulty: "Medium",
                    optimal_keywords: "leadership, team, outcome, initiative, responsibility",
                    expected_concepts: "Leadership experience, team collaboration, measurable results"
                },
                {
                    id: -2,
                    role: role,
                    category: "Technical",
                    question_text: `What are the most important skills and tools for a ${role} to master, and why?`,
                    difficulty: "Medium",
                    optimal_keywords: "skills, tools, proficiency, expertise, best practices",
                    expected_concepts: "Domain knowledge, tool proficiency, continuous learning"
                },
                {
                    id: -3,
                    role: role,
                    category: "Situational",
                    question_text: `As a ${role}, you are given a project with limited resources and a tight deadline. How do you prioritize?`,
                    difficulty: "Medium",
                    optimal_keywords: "prioritization, resource management, deadline, efficiency",
                    expected_concepts: "Resource allocation, priority setting, time management"
                }
            ];
        }
        
        return roleQuestions;
    },

    renderMockFeedback() {
        // Calculate actual scores from the user's real answers
        const answerResults = this.state.answers.map((ans, idx) => {
            const localScore = this.localScoreAnswer(ans.transcript, {
                optimal_keywords: ans.optimal_keywords,
                expected_concepts: ans.expected_concepts
            });
            
            const score = localScore.score;
            const clarity = Math.min(100, score + Math.floor(Math.random() * 10) - 5);
            const grammar = Math.min(100, score + Math.floor(Math.random() * 8) - 4);
            const relevance = Math.min(100, score + Math.floor(Math.random() * 12) - 6);
            const fillerCount = Math.max(0, Math.floor(Math.random() * 5));
            
            return {
                question_text: ans.question_text,
                category: ans.category,
                transcript: ans.transcript || 'No response recorded.',
                score: score,
                feedback: {
                    score: score,
                    clarity: Math.max(0, clarity),
                    grammar: Math.max(0, grammar),
                    relevance: Math.max(0, relevance),
                    filler_count: fillerCount,
                    strengths: score >= 70 
                        ? ["Good structure in your response", "Relevant points covered"]
                        : ["Attempted to address the question"],
                    weaknesses: score < 70 
                        ? ["Answer could be more detailed", "Try using specific examples"]
                        : ["Could include more metrics"],
                    tips: score < 50
                        ? ["Elaborate more — aim for at least 30-40 words", "Use the STAR method to structure your answer"]
                        : ["Great effort! Try to include more concrete examples next time"]
                }
            };
        });
        
        // Calculate overall average from all answer scores
        const totalScore = answerResults.reduce((sum, a) => sum + a.score, 0);
        const overallScore = answerResults.length > 0 
            ? Math.round(totalScore / answerResults.length) 
            : 0;
        
        // Build summary based on actual performance
        let summary = '';
        if (overallScore >= 80) {
            summary = "Good execution. Your answers were relevant and well-structured. Continue practicing to refine your delivery and include more specific metrics.";
        } else if (overallScore >= 60) {
            summary = "Decent attempt. Your answers covered the basics but could benefit from more detail and structure. Focus on using the STAR method and providing concrete examples.";
        } else {
            summary = "Your responses need more development. Try to elaborate more in your answers, use specific examples from your experience, and structure your responses clearly.";
        }
        
        const mockResult = {
            id: Date.now(),
            role: this.state.role,
            overall_score: overallScore,
            summary: summary,
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
            answers: answerResults
        };
        app.showFeedbackDetail(mockResult);
    },

    /**
     * Setup Q&A functionality for resume-based interviews
     */
    setupResumeQA(resumeText) {
        this.state.resumeText = resumeText;
        
        // Show the Q&A button
        const openQaBtn = document.getElementById('open-qa-btn');
        const qaSection = document.getElementById('resume-qa-section');
        const closeQaBtn = document.getElementById('close-qa-section');
        const askQaBtn = document.getElementById('ask-qa-btn');
        const qaInput = document.getElementById('qa-input');

        // Show Q&A button for resume interviews
        openQaBtn.style.display = 'block';

        // Open Q&A section
        openQaBtn.addEventListener('click', () => {
            qaSection.style.display = 'block';
        });

        // Close Q&A section
        closeQaBtn.addEventListener('click', () => {
            qaSection.style.display = 'none';
        });

        // Ask question
        askQaBtn.addEventListener('click', () => {
            this.askResumeQuestion();
        });

        // Enter key to ask
        qaInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.askResumeQuestion();
            }
        });
    },

    /**
     * Ask a question about the resume
     */
    async askResumeQuestion() {
        const qaInput = document.getElementById('qa-input');
        const qaChat = document.getElementById('resume-qa-chat');
        const question = qaInput.value.trim();

        if (!question) return;

        // Add user question to chat
        const userMsgDiv = document.createElement('div');
        userMsgDiv.className = 'resume-qa-message resume-qa-question';
        userMsgDiv.innerHTML = `<strong>You:</strong> ${question}`;
        qaChat.appendChild(userMsgDiv);
        qaChat.scrollTop = qaChat.scrollHeight;

        // Clear input
        qaInput.value = '';

        // Show loading state
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'resume-qa-message';
        loadingDiv.style.cssText = 'padding: 0.5rem; color: var(--text-muted); font-style: italic;';
        loadingDiv.textContent = 'AI is thinking...';
        qaChat.appendChild(loadingDiv);
        qaChat.scrollTop = qaChat.scrollHeight;

        try {
            const response = await api.askResumeQuestion(question, this.state.resumeText);
            
            // Remove loading
            loadingDiv.remove();

            // Add AI response
            const aiMsgDiv = document.createElement('div');
            aiMsgDiv.className = 'resume-qa-message resume-qa-answer';
            aiMsgDiv.innerHTML = `<strong>AI Interviewer:</strong> ${response.answer}`;
            qaChat.appendChild(aiMsgDiv);
            qaChat.scrollTop = qaChat.scrollHeight;

            // Speak the answer if speech synthesis is available
            if ('speechSynthesis' in window) {
                this.speakQAAnswer(response.answer);
            }
        } catch (error) {
            loadingDiv.remove();
            const errorMsgDiv = document.createElement('div');
            errorMsgDiv.className = 'resume-qa-message resume-qa-answer';
            errorMsgDiv.innerHTML = `<strong>AI Interviewer:</strong> Sorry, I couldn\'t process your question. Please try again.`;
            qaChat.appendChild(errorMsgDiv);
            qaChat.scrollTop = qaChat.scrollHeight;
        }
    },

    /**
     * Speak the Q&A answer using text-to-speech
     */
    speakQAAnswer(text) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google'));
        if (preferredVoice) utterance.voice = preferredVoice;

        window.speechSynthesis.speak(utterance);
    }
};
