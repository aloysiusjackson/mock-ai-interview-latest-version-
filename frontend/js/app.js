const app = {
    init() {
        this.setupNavigation();
        this.setupDashboardForm();
        this.setupAssessment();
        this.setupSettings();
        this.setupResourceButtons();
        this.setupResumeImport();
        
        // Load initial dashboard metrics
        dashboard.load();
    },

    setupNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const mobileNav = document.getElementById('mobile-nav');
        
        // Mobile menu toggle functionality
        if (mobileMenuBtn && mobileNav) {
            mobileMenuBtn.addEventListener('click', () => {
                mobileNav.classList.toggle('active');
                mobileMenuBtn.classList.toggle('active');
            });
        }
        
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                // Close mobile menu when link is clicked
                if (mobileNav && mobileNav.classList.contains('active')) {
                    mobileNav.classList.remove('active');
                    mobileMenuBtn.classList.remove('active');
                }
                
                e.preventDefault();
                
                // If exiting interview view unexpectedly, cleanup streams
                if (document.getElementById('interview-view').classList.contains('active')) {
                    interview.stopRecording();
                    interview.stopWebcam();
                    antiCheat.stopMonitoring();
                    this.resetTopbarContext();
                }

                const targetId = link.getAttribute('href').substring(1);
                this.switchView(targetId);

                // Update active state in sidebar
                document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
                link.parentElement.classList.add('active');

                // Update topbar context based on view
                this.updateTopbarForView(targetId);

                 // Load appropriate module data
                 if (targetId === 'dashboard-view') {
                     dashboard.load();
                 } else if (targetId === 'scoreboard-view') {
                     scoreboard.load(); // Added awaits for async functions
                 } else if (targetId === 'history-view') {
                    this.loadFullHistory();
                } else if (targetId === 'achievements-view') {
                    this.loadAchievements();
                }
            });
        });

        // "Back to Dashboard" button in feedback screen
        document.getElementById('back-to-dash-btn').addEventListener('click', () => {
            this.switchView('dashboard-view');
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            document.querySelector('.nav-link[href="#dashboard-view"]').parentElement.classList.add('active');
            this.updateTopbarForView('dashboard-view');
            dashboard.load();
        });
    },

    /**
     * Update topbar context based on current view
     */
    updateTopbarForView(viewId) {
        const titles = {
            'dashboard-view': { title: 'Mock AI Interview', desc: 'Polish your responses and master behavioral and technical roles.' },
            'interview-view': { title: 'Live Interview Session', desc: 'Active interview session — configure from Dashboard to start' },
            'feedback-view': { title: 'Interview Feedback', desc: 'Detailed AI analysis of your performance' },
            'history-view': { title: 'Practice History', desc: 'Review your past interview sessions and track your progress' },
            'scoreboard-view': { title: 'Score Board', desc: 'Track your score analytics, trends, and performance metrics' },
            'assessment-view': { title: 'Skill Assessment', desc: 'Gauge your interview readiness with a quick 3-question assessment' },
            'resources-view': { title: 'Resources & Tips', desc: 'Guides, strategies, and expert tips to ace your interviews' },
            'achievements-view': { title: 'Achievements', desc: 'Milestones and rewards for your interview practice journey' },
            'settings-view': { title: 'Settings', desc: 'Customize your interview preparation experience' }
        };

        const context = titles[viewId] || { title: 'Mock AI Interview', desc: '' };
        document.getElementById('topbar-view-title').textContent = context.title;
        document.getElementById('topbar-view-desc').textContent = context.desc;
    },

    /**
     * Update topbar context for interview mode with anti-cheat indicator
     */
    setInterviewTopbarContext(role) {
        document.getElementById('topbar-view-title').textContent = 'Live Interview Session';
        document.getElementById('topbar-view-desc').textContent = `Active interview for ${role} — Anti-Cheat monitoring is ON`;
    },

    /**
     * Reset topbar context back to default dashboard view
     */
    resetTopbarContext() {
        document.getElementById('topbar-view-title').textContent = 'Mock AI Interview';
        document.getElementById('topbar-view-desc').textContent = 'Polish your responses and master behavioral and technical roles.';
    },

    async setupDashboardForm() {
        const select = document.getElementById('interview-role-select');
        const startBtn = document.getElementById('start-interview-btn');

        // Role emoji mapping for visual enhancement
        const roleEmojis = {
            'Software Engineer': '💻',
            'Product Manager': '📋',
            'Data Analyst': '📊',
            'Sales Executive': '📈',
            'Marketing Manager': '📣',
            'HR Manager': '👥',
            'Financial Analyst': '💰',
            'Operations Manager': '⚙️',
            'Customer Support Lead': '🎧',
            'Healthcare Administrator': '🏥',
            'Project Manager': '📐',
            'Business Analyst': '🔍',
            'Teacher/Educator': '📚',
            'Retail Manager': '🏬',
            'Legal Associate': '⚖️',
            'Graphic Designer': '🎨',
            'Content Writer': '✍️'
        };

        // Load roles from backend - preserve full list if backend fails
        try {
            const data = await api.getRoles();
            if (data.roles && data.roles.length > 3) {
                // Backend returned a full list - use it
                select.innerHTML = '';
                data.roles.forEach(role => {
                    const opt = document.createElement('option');
                    opt.value = role;
                    const emoji = roleEmojis[role] || '📌';
                    opt.textContent = `${emoji} ${role}`;
                    select.appendChild(opt);
                });
            }
            // If backend returns only 3 fallback roles, keep the original HTML options
        } catch (error) {
            console.error('Failed to load roles from backend, keeping default list:', error);
        }

        // Start button trigger
        startBtn.addEventListener('click', () => {
            const selectedRole = select.value;
            if (selectedRole) {
                interview.start(selectedRole);
            }
        });
    },

    /**
     * Setup skill assessment interaction
     */
    setupAssessment() {
        const startBtn = document.getElementById('start-assessment-btn');
        const levelCards = document.querySelectorAll('.level-card');
        let selectedLevel = 'intermediate';

        // Level card selection
        levelCards.forEach(card => {
            card.addEventListener('click', () => {
                levelCards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedLevel = card.dataset.level;
            });
        });

        // Select intermediate by default
        document.querySelector('.level-card[data-level="intermediate"]').classList.add('selected');

        // Start assessment
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.runAssessment(selectedLevel);
            });
        }
    },

    /**
     * Run a quick 3-question skill assessment
     */
    runAssessment(level) {
        const startSection = document.getElementById('assessment-start');
        const questionsSection = document.getElementById('assessment-questions');
        const resultsSection = document.getElementById('assessment-results');

        startSection.style.display = 'none';
        resultsSection.style.display = 'none';
        questionsSection.style.display = 'block';

        const difficultyLabels = {
            beginner: 'Beginner-Friendly',
            intermediate: 'Intermediate',
            advanced: 'Advanced'
        };

        const questions = {
            beginner: [
                { q: 'Tell me about yourself.', hint: 'Focus on your background, skills, and what you\'re looking for.' },
                { q: 'Why do you want this job?', hint: 'Connect your skills and interests to the role requirements.' },
                { q: 'What are your strengths and weaknesses?', hint: 'Be honest about weaknesses but show how you\'re improving.' }
            ],
            intermediate: [
                { q: 'Describe a challenging project you worked on.', hint: 'Use the STAR method: Situation, Task, Action, Result.' },
                { q: 'How do you handle conflict in a team?', hint: 'Show emotional intelligence and problem-solving approach.' },
                { q: 'Where do you see yourself in 5 years?', hint: 'Align your goals with the company\'s growth path.' }
            ],
            advanced: [
                { q: 'Describe a time you led a major initiative.', hint: 'Show leadership, strategic thinking, and measurable impact.' },
                { q: 'How would you improve our current processes?', hint: 'Demonstrate analytical thinking and business acumen.' },
                { q: 'Tell me about a failure and what you learned.', hint: 'Show accountability, reflection, and growth mindset.' }
            ]
        };

        const selectedQuestions = questions[level] || questions.intermediate;
        
        let html = `
            <div style="margin-bottom: 1.5rem;">
                <h4 style="margin-bottom: 0.5rem;">Assessment: ${difficultyLabels[level]}</h4>
                <p style="color: var(--text-secondary); font-size: 0.9rem;">Answer each question mentally or out loud, then rate your own response.</p>
            </div>
        `;

        selectedQuestions.forEach((item, idx) => {
            html += `
                <div class="card" style="margin-bottom: 1rem; padding: 1.25rem;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem;">
                        <h4 style="font-size: 1rem;">Q${idx + 1}: ${item.q}</h4>
                    </div>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
                        💡 <em>${item.hint}</em>
                    </p>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <span style="font-size: 0.85rem; color: var(--text-secondary);">How confident are you with your answer?</span>
                        <div class="confidence-buttons" style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-outline confidence-btn" data-question="${idx}" data-score="1" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">😬 Weak</button>
                            <button class="btn btn-outline confidence-btn" data-question="${idx}" data-score="2" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">🙂 Okay</button>
                            <button class="btn btn-outline confidence-btn" data-question="${idx}" data-score="3" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">💪 Strong</button>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `
            <button class="btn btn-primary" id="submit-assessment-btn" style="width: 100%; margin-top: 1rem;">
                See My Results
            </button>
        `;

        questionsSection.innerHTML = html;

        // Handle confidence button clicks
        document.querySelectorAll('.confidence-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const group = btn.parentElement;
                group.querySelectorAll('.confidence-btn').forEach(b => {
                    b.classList.remove('btn-primary');
                    b.classList.add('btn-outline');
                });
                btn.classList.remove('btn-outline');
                btn.classList.add('btn-primary');
            });
        });

        // Submit assessment
        document.getElementById('submit-assessment-btn').addEventListener('click', () => {
            this.completeAssessment(level);
        });
    },

    /**
     * Complete assessment and show results
     */
    completeAssessment(level) {
        const selectedBtns = document.querySelectorAll('.confidence-btn.btn-primary');
        // Each question has its own card wrapper div
        const totalQuestions = document.querySelectorAll('#assessment-questions .card').length || 3;
        
        // Calculate score based on confidence selections
        let totalScore = 0;
        selectedBtns.forEach(btn => {
            totalScore += parseInt(btn.dataset.score);
        });

        // If no buttons were selected, default to mid-range
        const maxScore = totalQuestions * 3;
        const actualScore = selectedBtns.length > 0 ? totalScore : Math.ceil(totalQuestions * 2);
        const percentage = Math.round((actualScore / maxScore) * 100);

        const questionsSection = document.getElementById('assessment-questions');
        const resultsSection = document.getElementById('assessment-results');

        questionsSection.style.display = 'none';
        resultsSection.style.display = 'block';

        let levelLabel, levelDesc, nextSteps;
        if (percentage >= 80) {
            levelLabel = '🌟 Advanced';
            levelDesc = 'You\'re well-prepared! Focus on refining specific areas and practicing under timed conditions.';
            nextSteps = 'Try a full-length interview with 8-10 questions to simulate real conditions.';
        } else if (percentage >= 55) {
            levelLabel = '📈 Intermediate';
            levelDesc = 'Good foundation! Keep practicing to build confidence and expand your answer depth.';
            nextSteps = 'Focus on the STAR method and practice with 5-question sessions.';
        } else {
            levelLabel = '🌱 Beginner';
            levelDesc = 'Great start! Focus on building your confidence with common interview questions first.';
            nextSteps = 'Start with 3-question quick sessions and review the Resources & Tips section.';
        }

        // Update the dashboard skill level stat
        document.getElementById('stat-rating').textContent = levelLabel.split(' ')[1] || levelLabel;

        resultsSection.innerHTML = `
            <div style="text-align: center; padding: 2rem 0;">
                <div style="font-size: 4rem; margin-bottom: 1rem;">${percentage >= 80 ? '🎉' : percentage >= 55 ? '👍' : '💪'}</div>
                <h3 style="font-size: 1.8rem; margin-bottom: 0.5rem;">${levelLabel}</h3>
                <div class="radial-progress-wrapper" style="margin: 1.5rem auto;">
                    <svg class="radial-svg" style="width: 120px; height: 120px;">
                        <circle class="radial-bg" cx="60" cy="60" r="52" style="stroke-width: 6;"></circle>
                        <circle class="radial-fill" id="assessment-radial" cx="60" cy="60" r="52" style="stroke-width: 6; stroke-dasharray: 327; stroke-dashoffset: ${327 - (percentage/100) * 327};"></circle>
                    </svg>
                    <div class="radial-text">
                        <span class="radial-score" style="font-size: 1.8rem;">${percentage}%</span>
                        <span class="radial-label">Readiness</span>
                    </div>
                </div>
                <p style="color: var(--text-secondary); line-height: 1.6; max-width: 500px; margin: 0 auto 1rem;">${levelDesc}</p>
                <div class="card" style="background: rgba(99, 102, 241, 0.05); border-color: rgba(99, 102, 241, 0.15); margin-bottom: 1.5rem;">
                    <p style="font-size: 0.9rem;"><strong>Next Step:</strong> ${nextSteps}</p>
                </div>
                <button class="btn btn-primary" id="retake-assessment-btn" style="margin-right: 0.75rem;">
                    Retake Assessment
                </button>
                <button class="btn btn-secondary" id="assessment-to-dash-btn">
                    Go to Dashboard
                </button>
            </div>
        `;

        document.getElementById('retake-assessment-btn').addEventListener('click', () => {
            resultsSection.style.display = 'none';
            document.getElementById('assessment-start').style.display = 'block';
        });

        document.getElementById('assessment-to-dash-btn').addEventListener('click', () => {
            this.switchView('dashboard-view');
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            document.querySelector('.nav-link[href="#dashboard-view"]').parentElement.classList.add('active');
            this.updateTopbarForView('dashboard-view');
            dashboard.load();
        });
    },

    /**
     * Setup settings page
     */
    setupSettings() {
        const saveBtn = document.getElementById('save-settings-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const name = document.getElementById('settings-name').value || 'User';
                const role = document.getElementById('settings-role').value;
                const questions = document.getElementById('settings-questions').value;
                const autoAdvance = document.getElementById('setting-auto-advance').checked;
                const showTranscript = document.getElementById('setting-show-transcript').checked;

                // Save to localStorage
                const settings = { name, role, questions, autoAdvance, showTranscript };
                localStorage.setItem('interview-settings', JSON.stringify(settings));

                // Update user display
                document.querySelector('.username').textContent = name;
                document.querySelector('.userrole').textContent = role;
                document.getElementById('user-avatar-tag').textContent = name.charAt(0).toUpperCase();

                // Show feedback
                const originalText = saveBtn.textContent;
                saveBtn.textContent = '✓ Settings Saved!';
                setTimeout(() => {
                    saveBtn.textContent = originalText;
                }, 2000);
            });
        }

        // Load saved settings
        const saved = localStorage.getItem('interview-settings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                if (document.getElementById('settings-name')) document.getElementById('settings-name').value = settings.name || 'User';
                if (document.getElementById('settings-role')) document.getElementById('settings-role').value = settings.role || 'Software Engineer';
                if (document.getElementById('settings-questions')) document.getElementById('settings-questions').value = settings.questions || '5';
                if (document.getElementById('setting-auto-advance')) document.getElementById('setting-auto-advance').checked = settings.autoAdvance !== false;
                if (document.getElementById('setting-show-transcript')) document.getElementById('setting-show-transcript').checked = settings.showTranscript !== false;
                
                document.querySelector('.username').textContent = settings.name || 'User';
                document.querySelector('.userrole').textContent = settings.role || 'Software Engineer';
                document.getElementById('user-avatar-tag').textContent = (settings.name || 'User').charAt(0).toUpperCase();
            } catch (e) {
                console.error('Failed to load settings:', e);
            }
        }
    },

    /**
     * Setup resume import functionality
     */
    setupResumeImport() {
        const importBtn = document.getElementById('import-resume-btn');
        const modal = document.getElementById('resume-import-modal');
        const closeBtn = document.getElementById('close-resume-modal');
        const dropZone = document.getElementById('resume-drop-zone');
        const fileInput = document.getElementById('resume-file-input');
        const browseBtn = document.getElementById('browse-resume-btn');
        const startInterviewBtn = document.getElementById('start-resume-interview-btn');
        const loader = document.getElementById('resume-loader');
        const result = document.getElementById('resume-result');
        const preview = document.getElementById('resume-preview');
        const analysisText = document.getElementById('resume-analysis-text');
        const questionsList = document.getElementById('resume-questions-list');

        // Open modal
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                modal.style.display = 'flex';
                modal.style.alignItems = 'center';
                modal.style.justifyContent = 'center';
                this.resetResumeModal();
            });
        }

        // Close modal
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }

        // Close modal on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });

        // Drag and drop handlers
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) this.processResumeFile(file);
        });

        // Browse button
        browseBtn.addEventListener('click', () => {
            fileInput.click();
        });

        // File input change
        fileInput.addEventListener('change', () => {
            if (fileInput.files[0]) {
                this.processResumeFile(fileInput.files[0]);
            }
        });

        // Start interview with resume questions
        startInterviewBtn.addEventListener('click', () => {
            if (window.resumeQuestions && window.resumeQuestions.length > 0) {
                modal.style.display = 'none';
                interview.startWithResumeQuestions(window.resumeQuestions, window.resumeRole, window.resumeText || '');
            }
        });
    },

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    },

    resetResumeModal() {
        document.getElementById('resume-drop-zone').style.display = 'block';
        document.getElementById('resume-preview').style.display = 'none';
        document.getElementById('resume-loader').style.display = 'none';
        document.getElementById('resume-result').style.display = 'none';
        document.getElementById('resume-file-input').value = '';
    },

    async processResumeFile(file) {
        const loader = document.getElementById('resume-loader');
        const preview = document.getElementById('resume-preview');
        const result = document.getElementById('resume-result');
        const dropZone = document.getElementById('resume-drop-zone');
        const analysisText = document.getElementById('resume-analysis-text');
        const questionsList = document.getElementById('resume-questions-list');

        // Validate file type
        const allowedTypes = ['.pdf', '.docx', '.txt'];
        const fileExt = '.' + file.name.split('.').pop().toLowerCase();
        if (!allowedTypes.includes(fileExt)) {
            alert('Please upload a PDF, DOCX, or TXT file.');
            return;
        }

        // Show loader
        dropZone.style.display = 'none';
        preview.style.display = 'none';
        result.style.display = 'none';
        loader.style.display = 'flex';

        try {
            // Read file content for Q&A (only works for TXT files on frontend)
            let fileContent = '';
            if (fileExt === '.txt') {
                fileContent = await this.readFileAsText(file);
            } else {
                // For PDF/DOCX, we'll use a placeholder - backend handles extraction
                fileContent = `Resume content (${file.name}) - analyzed by backend.`;
            }
            
            const resumeData = await api.analyzeResume(file, 3);

            // Hide loader, show results
            loader.style.display = 'none';
            preview.style.display = 'block';
            result.style.display = 'block';

            // Store resume text for Q&A
            window.resumeText = resumeData.full_text || fileContent;

            // Display summary
            analysisText.innerHTML = `
                <div style="margin-bottom: 0.5rem;"><strong>Detected Role:</strong> ${resumeData.detected_role || 'Professional'}</div>
                <div><strong>Summary:</strong> ${resumeData.summary || 'Resume analyzed successfully'}</div>
            `;

            // Display questions
            questionsList.innerHTML = '';
            window.resumeQuestions = resumeData.questions || [];
            window.resumeRole = resumeData.detected_role || 'Based on Resume';

            window.resumeQuestions.forEach((q, idx) => {
                const div = document.createElement('div');
                div.className = 'resume-question-item';
                div.innerHTML = `
                    <div class="resume-question-category">${q.category || 'Question'}</div>
                    <div class="resume-question-text">${q.question_text}</div>
                `;
                questionsList.appendChild(div);
            });

        } catch (error) {
            console.error('Failed to analyze resume:', error);
            loader.style.display = 'none';
            dropZone.style.display = 'block';
            let errorMsg = 'Failed to analyze resume. Please try again with a different file.';
            if (error.message) {
                errorMsg = `Error: ${error.message}. ${errorMsg}`;
            }
            alert(errorMsg);
        }
    },

    /**
     * Setup resource button interactions
     */
    setupResourceButtons() {
        document.querySelectorAll('.resource-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const resource = btn.dataset.resource;
                this.showResourceModal(resource);
            });
        });
    },

    /**
     * Show resource content in a modal
     */
    showResourceModal(resource) {
        const resourceContent = {
            questions: {
                title: 'Common Interview Questions',
                content: `
                    <h4 style="margin-bottom: 1rem;">🎯 <strong>By Category</strong></h4>
                    <div style="margin-bottom: 1.5rem;">
                        <p style="font-weight: 600; color: var(--primary); margin-bottom: 0.5rem;">Behavioral Questions</p>
                        <ul style="color: var(--text-secondary); line-height: 2; padding-left: 1.5rem;">
                            <li>Tell me about yourself.</li>
                            <li>Why do you want to work here?</li>
                            <li>Describe a challenge you overcame.</li>
                            <li>Where do you see yourself in 5 years?</li>
                        </ul>
                    </div>
                    <div style="margin-bottom: 1.5rem;">
                        <p style="font-weight: 600; color: var(--primary); margin-bottom: 0.5rem;">Technical Questions</p>
                        <ul style="color: var(--text-secondary); line-height: 2; padding-left: 1.5rem;">
                            <li>Walk me through your technical experience.</li>
                            <li>How do you stay updated with industry trends?</li>
                            <li>Describe a complex technical problem you solved.</li>
                        </ul>
                    </div>
                    <hr style="border-color: var(--border-glass); margin: 1rem 0;">
                    <p style="color: var(--text-muted); font-size: 0.85rem;">Practice answering these with our AI interviewer for personalized feedback!</p>
                `
            },
            star: {
                title: 'STAR Method Guide',
                content: `
                    <h4 style="margin-bottom: 1rem;">🎯 <strong>The STAR Framework</strong></h4>
                    <div style="display: grid; gap: 1rem; margin-bottom: 1.5rem;">
                        <div class="card" style="padding: 1rem; background: rgba(99, 102, 241, 0.05);">
                            <strong style="color: var(--primary);">S</strong> - <strong>Situation</strong>
                            <p style="color: var(--text-secondary); font-size: 0.9rem;">Set the context. Describe the scenario you were in.</p>
                            <p style="color: var(--text-muted); font-size: 0.85rem;"><em>Example: "In my previous role as a team lead..."</em></p>
                        </div>
                        <div class="card" style="padding: 1rem; background: rgba(99, 102, 241, 0.05);">
                            <strong style="color: var(--primary);">T</strong> - <strong>Task</strong>
                            <p style="color: var(--text-secondary); font-size: 0.9rem;">What needed to be done? What was your responsibility?</p>
                            <p style="color: var(--text-muted); font-size: 0.85rem;"><em>Example: "I was responsible for delivering the project by Q3..."</em></p>
                        </div>
                        <div class="card" style="padding: 1rem; background: rgba(99, 102, 241, 0.05);">
                            <strong style="color: var(--primary);">A</strong> - <strong>Action</strong>
                            <p style="color: var(--text-secondary); font-size: 0.9rem;">What specific steps did you take? Focus on YOUR contribution.</p>
                            <p style="color: var(--text-muted); font-size: 0.85rem;"><em>Example: "I organized a cross-functional team and implemented a new workflow..."</em></p>
                        </div>
                        <div class="card" style="padding: 1rem; background: rgba(99, 102, 241, 0.05);">
                            <strong style="color: var(--primary);">R</strong> - <strong>Result</strong>
                            <p style="color: var(--text-secondary); font-size: 0.9rem;">What was the outcome? Use metrics when possible.</p>
                            <p style="color: var(--text-muted); font-size: 0.85rem;"><em>Example: "We delivered 2 weeks early with a 15% cost reduction..."</em></p>
                        </div>
                    </div>
                `
            },
            'body-language': {
                title: 'Body Language Tips',
                content: `
                    <h4 style="margin-bottom: 1rem;">🧠 <strong>Non-Verbal Communication</strong></h4>
                    <ul style="color: var(--text-secondary); line-height: 2.2; padding-left: 1.5rem;">
                        <li><strong>Eye Contact:</strong> Maintain 60-70% eye contact. Too much can seem intense, too little seems disinterested.</li>
                        <li><strong>Posture:</strong> Sit up straight, lean slightly forward to show engagement.</li>
                        <li><strong>Hand Gestures:</strong> Use natural hand movements to emphasize points. Avoid crossing arms.</li>
                        <li><strong>Facial Expressions:</strong> Smile genuinely, nod to show understanding.</li>
                        <li><strong>Voice Tone:</strong> Vary your pitch and pace. Monotone voice signals disinterest.</li>
                        <li><strong>Mirroring:</strong> Subtly mirror the interviewer's body language to build rapport.</li>
                    </ul>
                    <div class="card" style="margin-top: 1rem; padding: 1rem; background: rgba(245, 158, 11, 0.05);">
                        <p style="font-size: 0.85rem; color: var(--text-secondary);">💡 <strong>Pro Tip:</strong> Record yourself answering questions and review your body language. Practice in front of a mirror!</p>
                    </div>
                `
            },
            fillers: {
                title: 'Filler Words Guide',
                content: `
                    <h4 style="margin-bottom: 1rem;">💡 <strong>Eliminate Filler Words</strong></h4>
                    <p style="color: var(--text-secondary); margin-bottom: 1rem;">Filler words like <em>"um", "uh", "like", "you know", "actually", "basically"</em> make you sound less confident and prepared.</p>
                    <h5 style="margin-bottom: 0.75rem;">Strategies to Reduce Fillers:</h5>
                    <ul style="color: var(--text-secondary); line-height: 2; padding-left: 1.5rem;">
                        <li><strong>Pause instead of filler:</strong> Silence is better than "um". Take a breath to collect your thoughts.</li>
                        <li><strong>Slow down:</strong> Speaking too fast leads to filler words. Aim for a steady, measured pace.</li>
                        <li><strong>Record yourself:</strong> Listen back and count your filler words. Awareness is the first step.</li>
                        <li><strong>Practice with structure:</strong> Use the STAR method to organize thoughts before speaking.</li>
                        <li><strong>Replace fillers with pauses:</strong> Practice saying nothing for 1-2 seconds instead of "um".</li>
                    </ul>
                `
            },
            salary: {
                title: 'Salary Negotiation',
                content: `
                    <h4 style="margin-bottom: 1rem;">📊 <strong>Negotiate Like a Pro</strong></h4>
                    <div style="margin-bottom: 1rem;">
                        <h5 style="color: var(--primary); margin-bottom: 0.5rem;">Before the Interview</h5>
                        <ul style="color: var(--text-secondary); line-height: 2; padding-left: 1.5rem;">
                            <li>Research market rates for the role and location (Glassdoor, levels.fyi, LinkedIn)</li>
                            <li>Know your minimum acceptable number</li>
                            <li>Prepare talking points about your value</li>
                        </ul>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <h5 style="color: var(--primary); margin-bottom: 0.5rem;">During Negotiation</h5>
                        <ul style="color: var(--text-secondary); line-height: 2; padding-left: 1.5rem;">
                            <li>Never give the first number if possible</li>
                            <li>Provide a range (low = your minimum, high = aspirational)</li>
                            <li>Consider total compensation: base + bonus + equity + benefits</li>
                            <li>Use phrases like "Based on my research and experience..."</li>
                        </ul>
                    </div>
                    <div class="card" style="padding: 1rem; background: rgba(16, 185, 129, 0.05);">
                        <p style="font-size: 0.85rem; color: var(--text-secondary);">🎯 <strong>Script:</strong> "I'm very excited about this role. Based on my experience in [skill] and market research, I was hoping for a compensation package around [range]. Is that aligned with your budget?"</p>
                    </div>
                `
            },
            voice: {
                title: 'Voice & Pace Control',
                content: `
                    <h4 style="margin-bottom: 1rem;">🎙️ <strong>Voice Exercises</strong></h4>
                    <div style="margin-bottom: 1rem;">
                        <h5 style="color: var(--primary); margin-bottom: 0.5rem;">Pacing Exercises</h5>
                        <ul style="color: var(--text-secondary); line-height: 2; padding-left: 1.5rem;">
                            <li><strong>The Pause Practice:</strong> Read a paragraph aloud. Pause for 2 seconds after every period.</li>
                            <li><strong>Slow Down Drill:</strong> Read at half your normal speed. Gradually increase while maintaining clarity.</li>
                            <li><strong>Metronome Method:</strong> Use a metronome at 120 BPM and speak one word per beat.</li>
                        </ul>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <h5 style="color: var(--primary); margin-bottom: 0.5rem;">Tone & Clarity</h5>
                        <ul style="color: var(--text-secondary); line-height: 2; padding-left: 1.5rem;">
                            <li><strong>Breathing:</strong> Practice diaphragmatic breathing to support your voice.</li>
                            <li><strong>Tongue Twisters:</strong> "She sells seashells" and "Peter Piper" improve articulation.</li>
                            <li><strong>Record & Review:</strong> Listen for monotone patterns and work on varying pitch.</li>
                        </ul>
                    </div>
                `
            }
        };

        const data = resourceContent[resource];
        if (!data) return;

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'anti-cheat-overlay resource-modal';
        overlay.style.zIndex = '10000';
        overlay.style.cursor = 'pointer';
        overlay.innerHTML = `
            <div class="ac-overlay-content" style="max-width: 600px; max-height: 80vh; overflow-y: auto; text-align: left; cursor: default;" onclick="event.stopPropagation()">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <h2 style="margin: 0; color: var(--text-primary);">${data.title}</h2>
                    <button class="btn btn-secondary" id="close-resource-modal" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">✕ Close</button>
                </div>
                <div>${data.content}</div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Close handlers
        overlay.addEventListener('click', () => overlay.remove());
        document.getElementById('close-resource-modal').addEventListener('click', () => overlay.remove());
    },

    switchView(viewId) {
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
        });
        document.getElementById(viewId).classList.add('active');
    },

    showLoader(text = 'Processing...') {
        document.getElementById('loader-text-detail').textContent = text;
        document.getElementById('loader-view').classList.add('active');
    },

    hideLoader() {
        document.getElementById('loader-view').classList.remove('active');
    },

    // Results feedback rendering
    showFeedbackDetail(result) {
        this.switchView('feedback-view');
        this.updateTopbarForView('feedback-view');

        // Title and summary details
        document.getElementById('feedback-role').textContent = `${result.role || interview.state.role || 'Mock'} Interview Results`;
        document.getElementById('feedback-date').textContent = result.date;
        document.getElementById('feedback-summary').textContent = result.summary;

        // Animate overall score radial ring
        this.animateRadialScore(result.overall_score);

        // Render detailed feedback cards
        const container = document.getElementById('answers-review-container');
        container.innerHTML = '';

        result.answers.forEach((ans, idx) => {
            const item = document.createElement('div');
            item.className = 'question-feedback-item';
            
            const fb = ans.feedback;
            
            let scoreClass = 'low';
            if (ans.score >= 80) scoreClass = 'high';
            else if (ans.score >= 65) scoreClass = 'mid';

            item.innerHTML = `
                <div class="q-fb-header" onclick="app.toggleFeedbackAccordion(this)">
                    <span class="q-fb-title">Q${idx + 1}: ${ans.question_text}</span>
                    <span class="score-badge ${scoreClass}">${ans.score}%</span>
                </div>
                <div class="q-fb-body" style="display: none;">
                    <div class="transcript-section">
                        <div class="transcript-label">Your Transcript Response:</div>
                        <div class="transcript-quote">"${ans.transcript || 'No response recorded.'}"</div>
                    </div>
                    
                    <div class="q-fb-subscores">
                        <div class="subscore-bar-item">
                            <div class="subscore-bar-header">
                                <span>Clarity</span>
                                <span>${fb.clarity}%</span>
                            </div>
                            <div class="subscore-bar-track">
                                <div class="subscore-bar-fill" style="width: ${fb.clarity}%"></div>
                            </div>
                        </div>
                        <div class="subscore-bar-item">
                            <div class="subscore-bar-header">
                                <span>Grammar</span>
                                <span>${fb.grammar}%</span>
                            </div>
                            <div class="subscore-bar-track">
                                <div class="subscore-bar-fill" style="width: ${fb.grammar}%"></div>
                            </div>
                        </div>
                        <div class="subscore-bar-item">
                            <div class="subscore-bar-header">
                                <span>Relevance</span>
                                <span>${fb.relevance}%</span>
                            </div>
                            <div class="subscore-bar-track">
                                <div class="subscore-bar-fill" style="width: ${fb.relevance}%"></div>
                            </div>
                        </div>
                        <div class="subscore-bar-item">
                            <div class="subscore-bar-header">
                                <span>Filler Words</span>
                                <span>${fb.filler_count} used</span>
                            </div>
                            <div class="subscore-bar-track">
                                <div class="subscore-bar-fill" style="width: ${Math.max(0, 100 - (fb.filler_count * 10))}%"></div>
                            </div>
                        </div>
                    </div>

                    <div class="critique-box strengths-box">
                        <div class="critique-title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                            Strengths
                        </div>
                        <ul class="critique-list">
                            ${fb.strengths.map(s => `<li>${s}</li>`).join('')}
                        </ul>
                    </div>

                    <div class="critique-box weaknesses-box">
                        <div class="critique-title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            Improvement Areas
                        </div>
                        <ul class="critique-list">
                            ${fb.weaknesses.map(w => `<li>${w}</li>`).join('')}
                        </ul>
                    </div>

                    <div class="actionable-tips-box">
                        <div class="tips-title">💡 Actionable Tips for Next Time</div>
                        <ul class="critique-list">
                            ${fb.tips.map(t => `<li>${t}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            `;
            container.appendChild(item);
        });
    },

    animateRadialScore(score) {
        const fill = document.getElementById('radial-fill-circle');
        const text = document.getElementById('radial-score-val');
        
        // Circumference of standard SVG circle is 2 * pi * r = 2 * 3.14159 * 70 = ~440px
        const circumference = 440;
        const offset = circumference - (score / 100) * circumference;
        
        // Trigger style transition
        fill.style.strokeDashoffset = offset;
        
        // Counter animation
        let count = 0;
        const interval = setInterval(() => {
            if (count >= score) {
                text.textContent = `${score}%`;
                clearInterval(interval);
            } else {
                count += 1;
                text.textContent = `${count}%`;
            }
        }, 12);
    },

    toggleFeedbackAccordion(headerElement) {
        const body = headerElement.nextElementSibling;
        const isOpen = body.style.display !== 'none';
        
        // Slide / Toggle display
        body.style.display = isOpen ? 'none' : 'grid';
    },

    async navigateToInterviewDetail(id) {
        this.showLoader('Loading interview review detail...');
        try {
            const detail = await api.getInterviewDetail(id);
            this.hideLoader();
            this.showFeedbackDetail(detail);
        } catch (error) {
            console.error('Error fetching detail:', error);
            this.hideLoader();
        }
    },

    // Load full history inside History view list tab
    async loadFullHistory() {
        const tableBody = document.getElementById('history-table-body');
        tableBody.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--text-secondary);">Loading full practice log history...</div>';

        try {
            const data = await api.getDashboard();
            tableBody.innerHTML = '';

            if (!data.history || data.history.length === 0) {
                tableBody.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--text-muted);">No records found. Complete a mock interview to populate history!</div>';
                return;
            }

            data.history.forEach(item => {
                const div = document.createElement('div');
                div.className = 'card history-card-item';
                div.style.cursor = 'pointer';

                let scoreClass = 'low';
                if (item.overall_score >= 80) scoreClass = 'high';
                else if (item.overall_score >= 65) scoreClass = 'mid';

                div.innerHTML = `
                    <div class="role">${item.role} Practice</div>
                    <div class="date">${item.date}</div>
                    <div class="score-badge ${scoreClass}">${item.overall_score}%</div>
                    <div class="summary-text">Click to review detailed feedback and metrics</div>
                    <button class="btn btn-secondary" style="padding:0.5rem 1rem; font-size:0.85rem;">View Review</button>
                `;

                div.addEventListener('click', () => {
                    this.navigateToInterviewDetail(item.id);
                });

                tableBody.appendChild(div);
            });
        } catch (error) {
            console.error('Failed to load history metrics:', error);
            tableBody.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--danger);">Error connecting to the database. Please check your backend is running on port 5000.</div>';
        }
    },

    // Load achievements from dashboard data
    async loadAchievements() {
        const achievementCount = document.getElementById('achievement-count');
        
        try {
            const data = await api.getDashboard();
            const totalSessions = data.metrics?.total_interviews || 0;
            const avgScore = data.metrics?.average_score || 0;
            
            // Count unlocked achievements
            let unlocked = 0;
            
            // First Steps: Complete first interview
            const firstSteps = document.querySelector('[data-achievement="first-interview"]');
            if (totalSessions >= 1) {
                firstSteps.querySelector('.achievement-icon').classList.add('unlocked');
                firstSteps.querySelector('.achievement-status').textContent = '✅';
                firstSteps.querySelector('.achievement-status').classList.add('unlocked');
                unlocked++;
            }
            
            // Getting Serious: 5 sessions
            const fiveSessions = document.querySelector('[data-achievement="five-sessions"]');
            if (totalSessions >= 5) {
                fiveSessions.querySelector('.achievement-icon').classList.add('unlocked');
                fiveSessions.querySelector('.achievement-status').textContent = '✅';
                fiveSessions.querySelector('.achievement-status').classList.add('unlocked');
                unlocked++;
            }
            
            // Perfect Score: 90%+
            const perfectScore = document.querySelector('[data-achievement="perfect-score"]');
            if (avgScore >= 90) {
                perfectScore.querySelector('.achievement-icon').classList.add('unlocked');
                perfectScore.querySelector('.achievement-status').textContent = '✅';
                perfectScore.querySelector('.achievement-status').classList.add('unlocked');
                unlocked++;
            }
            
            // Veteran: 25 sessions
            const veteran = document.querySelector('[data-achievement="veteran"]');
            if (totalSessions >= 25) {
                veteran.querySelector('.achievement-icon').classList.add('unlocked');
                veteran.querySelector('.achievement-status').textContent = '✅';
                veteran.querySelector('.achievement-status').classList.add('unlocked');
                unlocked++;
            }
            
            achievementCount.textContent = `${unlocked} unlocked`;
            
        } catch (error) {
            console.error('Failed to load achievements:', error);
            achievementCount.textContent = '0 unlocked';
        }
    }
};

// Initialize when DOM content is loaded
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});