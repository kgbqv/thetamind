function md2html(md) {
    const raw = marked.parse(md);
    const clean = DOMPurify.sanitize(raw);
    return clean;
}

class ChallengeGame {
    constructor() {
        this.nodes = [];
        this.currentNode = null;
        this.userProgress = [];
    }

    static async create() {
        const instance = new ChallengeGame();
        await instance.init();
        return instance;
    }

    async init() {
        await this.loadUserProgress();
        await this.generateChallengeMap();
        this.setupEventListeners();
        this.updateProgressBar();
        this.updateTotalExp(); // ensure exp shows after data is ready
    }

    async loadUserProgress() {
        try {
            const response = await fetch('/api/get_challenge_progress');
            if (response.ok) {
                const data = await response.json();
                this.userProgress = data.completed_nodes || [];
                this.unlockedNodes = data.unlocked_nodes || [];
            }
        } catch (error) {
            console.error('Failed to load user progress:', error);
        }
    }

    updateTotalExp() {
        let totalExp = 0;
        this.userProgress.forEach(nodeId => {
            const node = this.nodes.find(n => n.id === nodeId);
            if (node) {
                totalExp += node.exp;
            }
        });
        this.updateHintCount();
        const hintCountElement = document.getElementById('total-hint');
        let hintCount = hintCountElement.textContent;
        hintCount = parseInt(hintCount) + 1;
        hintCountElement.textContent = hintCount + ' hint used';
        totalExp = totalExp - hintCount*50;

        const totalExpElement = document.getElementById('total-exp-earned');
        if (totalExpElement) {
            totalExpElement.textContent = `${totalExp} exp earned`;
        }
    }

    updateHintCount() {
        let hintCount = 0;
        const hintCountElement = document.getElementById('total-hint');
        hintCount = hintCountElement.textContent.split(' ')[0];
        hintCount = parseInt(hintCount) + 1;
        hintCountElement.textContent = hintCount + ' hint used';
    }

    generateChallengeMap() {
        this.nodes = [
            // Foundation Path (10 nodes)
            { id: 'alg_challenge_1', title: 'Basic Expressions', topic: 'Foundations of Algebra', difficulty: 'Easy', exp: 25, icon: 'fas fa-cubes', prerequisites: [] },
            { id: 'alg_challenge_2', title: 'Order of Ops', topic: 'Foundations of Algebra', difficulty: 'Easy', exp: 25, icon: 'fas fa-sort-amount-down', prerequisites: ['alg_challenge_1'] },
            { id: 'alg_challenge_3', title: 'Simple Equations', topic: 'Solving Linear Equations', difficulty: 'Easy', exp: 30, icon: 'fas fa-equals', prerequisites: ['alg_challenge_2'] },
            { id: 'alg_challenge_4', title: 'Like Terms', topic: 'Foundations of Algebra', difficulty: 'Easy', exp: 30, icon: 'fas fa-layer-group', prerequisites: ['alg_challenge_3'] },
            { id: 'alg_challenge_5', title: 'Distributive Prop', topic: 'Foundations of Algebra', difficulty: 'Medium', exp: 50, icon: 'fas fa-expand', prerequisites: ['alg_challenge_4'] },
            { id: 'alg_challenge_6', title: 'Two-Step Eqs', topic: 'Solving Linear Equations', difficulty: 'Medium', exp: 50, icon: 'fas fa-footsteps', prerequisites: ['alg_challenge_5'] },
            { id: 'alg_challenge_7', title: 'Variables Both Sides', topic: 'Solving Linear Equations', difficulty: 'Medium', exp: 60, icon: 'fas fa-arrows-alt-h', prerequisites: ['alg_challenge_6'] },
            { id: 'alg_challenge_8', title: 'Equation Word Probs', topic: 'Solving Linear Equations', difficulty: 'Medium', exp: 60, icon: 'fas fa-font', prerequisites: ['alg_challenge_7'] },
            { id: 'alg_challenge_9', title: 'Multi-Step Eqs', topic: 'Solving Linear Equations', difficulty: 'Hard', exp: 80, icon: 'fas fa-sitemap', prerequisites: ['alg_challenge_8'] },
            { id: 'alg_challenge_10', title: 'Complex Equations', topic: 'Solving Linear Equations', difficulty: 'Hard', exp: 80, icon: 'fas fa-cogs', prerequisites: ['alg_challenge_9'] },

            // Inequalities Path (8 nodes)
            { id: 'alg_challenge_11', title: 'Basic Inequalities', topic: 'Inequalities', difficulty: 'Easy', exp: 35, icon: 'fas fa-less-than', prerequisites: ['alg_challenge_3'] },
            { id: 'alg_challenge_12', title: 'Ineq Graphing', topic: 'Inequalities', difficulty: 'Medium', exp: 55, icon: 'fas fa-chart-line', prerequisites: ['alg_challenge_11'] },
            { id: 'alg_challenge_13', title: 'Compound Ineq', topic: 'Inequalities', difficulty: 'Medium', exp: 65, icon: 'fas fa-link', prerequisites: ['alg_challenge_12'] },
            { id: 'alg_challenge_14', title: 'Absolute Value Ineq', topic: 'Inequalities', difficulty: 'Hard', exp: 85, icon: 'fas fa-absolute-value', prerequisites: ['alg_challenge_13'] },
            { id: 'alg_challenge_15', title: 'Ineq Word Probs', topic: 'Inequalities', difficulty: 'Hard', exp: 85, icon: 'fas fa-tasks', prerequisites: ['alg_challenge_14'] },
            { id: 'alg_challenge_16', title: 'System of Ineq', topic: 'Inequalities', difficulty: 'Very Hard', exp: 120, icon: 'fas fa-project-diagram', prerequisites: ['alg_challenge_15'] },

            // Polynomials Path (12 nodes)
            { id: 'alg_challenge_17', title: 'Add Polynomials', topic: 'Polynomials and Factoring', difficulty: 'Easy', exp: 40, icon: 'fas fa-plus-circle', prerequisites: ['alg_challenge_4'] },
            { id: 'alg_challenge_18', title: 'Subtract Polynomials', topic: 'Polynomials and Factoring', difficulty: 'Easy', exp: 40, icon: 'fas fa-minus-circle', prerequisites: ['alg_challenge_17'] },
            { id: 'alg_challenge_19', title: 'Multiply Mono', topic: 'Polynomials and Factoring', difficulty: 'Medium', exp: 60, icon: 'fas fa-times-circle', prerequisites: ['alg_challenge_18'] },
            { id: 'alg_challenge_20', title: 'Multiply Poly', topic: 'Polynomials and Factoring', difficulty: 'Medium', exp: 70, icon: 'fas fa-calculator', prerequisites: ['alg_challenge_19'] },
            { id: 'alg_challenge_21', title: 'FOIL Method', topic: 'Polynomials and Factoring', difficulty: 'Medium', exp: 70, icon: 'fas fa-th', prerequisites: ['alg_challenge_20'] },
            { id: 'alg_challenge_22', title: 'GCF Factoring', topic: 'Polynomials and Factoring', difficulty: 'Medium', exp: 75, icon: 'fas fa-compress', prerequisites: ['alg_challenge_21'] },
            { id: 'alg_challenge_23', title: 'Factor Trinomials', topic: 'Polynomials and Factoring', difficulty: 'Hard', exp: 90, icon: 'fas fa-puzzle-piece', prerequisites: ['alg_challenge_22'] },
            { id: 'alg_challenge_24', title: 'Factor Grouping', topic: 'Polynomials and Factoring', difficulty: 'Hard', exp: 95, icon: 'fas fa-object-group', prerequisites: ['alg_challenge_23'] },
            { id: 'alg_challenge_25', title: 'Special Products', topic: 'Polynomials and Factoring', difficulty: 'Hard', exp: 100, icon: 'fas fa-star', prerequisites: ['alg_challenge_24'] },
            { id: 'alg_challenge_26', title: 'Factor Completely', topic: 'Polynomials and Factoring', difficulty: 'Very Hard', exp: 130, icon: 'fas fa-check-double', prerequisites: ['alg_challenge_25'] },
            { id: 'alg_challenge_27', title: 'Poly Division', topic: 'Polynomials and Factoring', difficulty: 'Very Hard', exp: 140, icon: 'fas fa-divide', prerequisites: ['alg_challenge_26'] },
            { id: 'alg_challenge_28', title: 'Synthetic Division', topic: 'Polynomials and Factoring', difficulty: 'Very Hard', exp: 150, icon: 'fas fa-magic', prerequisites: ['alg_challenge_27'] },

            // Quadratics Path (10 nodes)
            { id: 'alg_challenge_29', title: 'Quadratic Intro', topic: 'Quadratic Equations', difficulty: 'Medium', exp: 65, icon: 'fas fa-chart-area', prerequisites: ['alg_challenge_21'] },
            { id: 'alg_challenge_30', title: 'Solve by Factoring', topic: 'Quadratic Equations', difficulty: 'Medium', exp: 70, icon: 'fas fa-filter', prerequisites: ['alg_challenge_29'] },
            { id: 'alg_challenge_31', title: 'Square Roots', topic: 'Quadratic Equations', difficulty: 'Medium', exp: 75, icon: 'fas fa-square-root-alt', prerequisites: ['alg_challenge_30'] },
            { id: 'alg_challenge_32', title: 'Complete Square', topic: 'Quadratic Equations', difficulty: 'Hard', exp: 95, icon: 'fas fa-square', prerequisites: ['alg_challenge_31'] },
            { id: 'alg_challenge_33', title: 'Quadratic Formula', topic: 'Quadratic Equations', difficulty: 'Hard', exp: 100, icon: 'fas fa-infinity', prerequisites: ['alg_challenge_32'] },
            { id: 'alg_challenge_34', title: 'Discriminant', topic: 'Quadratic Equations', difficulty: 'Hard', exp: 105, icon: 'fas fa-filter', prerequisites: ['alg_challenge_33'] },
            { id: 'alg_challenge_35', title: 'Quadratic Graphs', topic: 'Quadratic Equations', difficulty: 'Very Hard', exp: 135, icon: 'fas fa-project-diagram', prerequisites: ['alg_challenge_34'] },
            { id: 'alg_challenge_36', title: 'Vertex Form', topic: 'Quadratic Equations', difficulty: 'Very Hard', exp: 140, icon: 'fas fa-dot-circle', prerequisites: ['alg_challenge_35'] },
            { id: 'alg_challenge_37', title: 'Applications', topic: 'Quadratic Equations', difficulty: 'Very Hard', exp: 145, icon: 'fas fa-rocket', prerequisites: ['alg_challenge_36'] },
            { id: 'alg_challenge_38', title: 'Complex Solutions', topic: 'Quadratic Equations', difficulty: 'Very Hard', exp: 150, icon: 'fas fa-atom', prerequisites: ['alg_challenge_37'] },

            // Advanced Path (10 nodes)
            { id: 'alg_challenge_39', title: 'Rational Expressions', topic: 'Rational Expressions', difficulty: 'Hard', exp: 110, icon: 'fas fa-divide', prerequisites: ['alg_challenge_26', 'alg_challenge_33'] },
            { id: 'alg_challenge_40', title: 'Systems of Eqs', topic: 'Systems of Equations', difficulty: 'Hard', exp: 115, icon: 'fas fa-sitemap', prerequisites: ['alg_challenge_10'] },
            { id: 'alg_challenge_41', title: 'Exponential Eqs', topic: 'Exponents and Radicals', difficulty: 'Hard', exp: 120, icon: 'fas fa-superscript', prerequisites: ['alg_challenge_39'] },
            { id: 'alg_challenge_42', title: 'Radical Eqs', topic: 'Exponents and Radicals', difficulty: 'Very Hard', exp: 155, icon: 'fas fa-radical', prerequisites: ['alg_challenge_41'] },
            { id: 'alg_challenge_43', title: 'Functions Intro', topic: 'Functions and Graphing', difficulty: 'Medium', exp: 80, icon: 'fas fa-function', prerequisites: ['alg_challenge_29'] },
            { id: 'alg_challenge_44', title: 'Function Operations', topic: 'Functions and Graphing', difficulty: 'Hard', exp: 125, icon: 'fas fa-cogs', prerequisites: ['alg_challenge_43'] },
            { id: 'alg_challenge_45', title: 'Composite Functions', topic: 'Functions and Graphing', difficulty: 'Very Hard', exp: 160, icon: 'fas fa-sitemap', prerequisites: ['alg_challenge_44'] },
            { id: 'alg_challenge_46', title: 'Inverse Functions', topic: 'Functions and Graphing', difficulty: 'Very Hard', exp: 165, icon: 'fas fa-exchange-alt', prerequisites: ['alg_challenge_45'] },
            { id: 'alg_challenge_47', title: 'Advanced Systems', topic: 'Systems of Equations', difficulty: 'Very Hard', exp: 170, icon: 'fas fa-network-wired', prerequisites: ['alg_challenge_40', 'alg_challenge_38'] },
            { id: 'alg_challenge_48', title: 'Word Problems Master', topic: 'Applications', difficulty: 'Very Hard', exp: 175, icon: 'fas fa-brain', prerequisites: ['alg_challenge_47'] },
            { id: 'alg_challenge_49', title: 'Algebra Master', topic: 'Comprehensive', difficulty: 'Very Hard', exp: 200, icon: 'fas fa-trophy', prerequisites: ['alg_challenge_48'] },
            { id: 'alg_challenge_50', title: 'Final Challenge', topic: 'Comprehensive', difficulty: 'Very Hard', exp: 250, icon: 'fas fa-crown', prerequisites: ['alg_challenge_49'] }
        ];

        const mapContainer = document.getElementById('challenge-map');
        mapContainer.innerHTML = '';

        this.nodes.forEach(node => {
            const nodeElement = this.createNodeElement(node);
            mapContainer.appendChild(nodeElement);
        });
    }

    createNodeElement(node) {
        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'challenge-node';
        nodeDiv.dataset.nodeId = node.id;

        const isCompleted = this.userProgress.includes(node.id);
        const isUnlocked = this.isNodeUnlocked(node);
        const isCurrent = !isCompleted && isUnlocked && this.getNextAvailableNode() === node.id;

        if (isCompleted) {
            nodeDiv.classList.add('node-completed');
        } else if (isCurrent) {
            nodeDiv.classList.add('node-current');
        } else if (isUnlocked) {
            nodeDiv.classList.add('node-unlocked');
        } else {
            nodeDiv.classList.add('node-locked');
        }

        nodeDiv.innerHTML = `
            <div class="node-icon"><i class="${node.icon}"></i></div>
            <div class="node-title">${node.title}</div>
            <div class="node-reward">${node.exp}</div>
        `;

        if (isUnlocked && !isCompleted) {
            nodeDiv.addEventListener('click', () => this.startChallenge(node));
        }

        return nodeDiv;
    }

    isNodeUnlocked(node) {
        // First node is always unlocked
        if (node.prerequisites.length === 0) return true;
        
        // Check if all prerequisites are completed
        return node.prerequisites.every(prereq => this.userProgress.includes(prereq));
    }

    getNextAvailableNode() {
        return this.nodes.find(node => 
            !this.userProgress.includes(node.id) && this.isNodeUnlocked(node)
        )?.id;
    }

    setupEventListeners() {
        // Modal close buttons
        document.querySelector('#challenge-modal .close-btn').addEventListener('click', () => {
            document.getElementById('challenge-modal').style.display = 'none';
        });

        document.querySelector('#success-modal .close-btn')?.addEventListener('click', () => {
            document.getElementById('success-modal').style.display = 'none';
        });

        document.getElementById('continue-btn').addEventListener('click', () => {
            document.getElementById('success-modal').style.display = 'none';
            this.loadUserProgress().then(() => {
                this.generateChallengeMap();
                this.updateProgressBar();
                updateUserStats();
            });
        });

        // Challenge submission
        document.getElementById('submit-challenge-btn').addEventListener('click', () => {
            this.submitChallenge();
        });

        // Hint purchase
        document.getElementById('buy-hint-btn').addEventListener('click', () => {
            this.buyHint();
        });
    }

    async startChallenge(node) {
        this.currentNode = node;
        const modal = document.getElementById('challenge-modal');
        const loader = document.getElementById('challenge-loader');
        const problemArea = document.getElementById('challenge-problem-area');
        const feedbackArea = document.getElementById('challenge-feedback');

        // Reset modal state
        document.getElementById('challenge-title').textContent = node.title;
        document.getElementById('reward-amount').textContent = `+${node.exp} exp`;
        document.getElementById('difficulty-badge').textContent = node.difficulty;
        document.getElementById('difficulty-badge').className = `difficulty-badge difficulty-${node.difficulty.toLowerCase()}`;
        
        problemArea.style.display = 'none';
        feedbackArea.style.display = 'none';
        document.getElementById('user-solution').value = '';
        document.getElementById('hint-area').style.display = 'none';

        modal.style.display = 'block';
        loader.style.display = 'block';

        try {
            const response = await fetch('/api/generate_quiz', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `topic=${encodeURIComponent(node.topic)}&difficulty=${encodeURIComponent(node.difficulty)}`
            });

            if (response.ok) {
                const quizData = await response.json();
                document.getElementById('problem-text').innerHTML = md2html(quizData.question);
                this.currentProblem = quizData;
                
                loader.style.display = 'none';
                problemArea.style.display = 'block';
            } else {
                throw new Error('Failed to generate problem');
            }
        } catch (error) {
            console.error('Error starting challenge:', error);
            loader.style.display = 'none';
            feedbackArea.style.display = 'block';
            feedbackArea.innerHTML = '<div class="error-message">Failed to load challenge. Please try again.</div>';
        }
    }

    async submitChallenge() {
        const userSolution = document.getElementById('user-solution').value.trim();
        const submitBtn = document.getElementById('submit-challenge-btn');
        const feedbackArea = document.getElementById('challenge-feedback');

        if (!userSolution) {
            feedbackArea.style.display = 'block';
            feedbackArea.innerHTML = '<div class="error-message">Please provide your solution before submitting.</div>';
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Evaluating...';

        try {
            const response = await fetch('/api/evaluate_challenge', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `question=${encodeURIComponent(this.currentProblem.question)}&user_solution=${encodeURIComponent(userSolution)}&correct_solution=${encodeURIComponent(this.currentProblem.solution)}&topic=${encodeURIComponent(this.currentNode.topic)}&difficulty=${encodeURIComponent(this.currentNode.difficulty)}&node_id=${encodeURIComponent(this.currentNode.id)}`
            });

            const result = await response.json();

            feedbackArea.style.display = 'block';
            
            if (result.is_correct) {
                feedbackArea.innerHTML = `<div class="success-message">${md2html(result.feedback)}</div>`;
                this.showSuccessModal(result.exp_earned, result.badge_earned);
            } else {
                feedbackArea.innerHTML = `
                    <div class="error-message">${md2html(result.feedback)}</div>
                    ${md2html(result.smarter_way) ? `<div class="hint-message">${md2html(result.smarter_way)}</div>` : ''}
                `;
            }
        } catch (error) {
            console.error('Error submitting challenge:', error);
            feedbackArea.style.display = 'block';
            feedbackArea.innerHTML = '<div class="error-message">Failed to evaluate your solution. Please try again.</div>';
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Submit Solution';
        }
    }

    async buyHint() {
        const hintBtn = document.getElementById('buy-hint-btn');
        const hintArea = document.getElementById('hint-area');

        const userExp = document.getElementById('total-exp-earned').textContent;
        const userExpValue = parseInt(userExp.split(' ')[0]);
        if (userExpValue < 50) {
            alert('Not enough exp to buy hint');
            return;
        }

        try {
            const response = await fetch('/api/buy_hint', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `node_id=${encodeURIComponent(this.currentNode.id)}`
            });

            const result = await response.json();
            console.log(result);
            if (result.success) {
                hintArea.style.display = 'block';
                hintArea.innerHTML = `<strong>Hint:</strong> ${md2html(result.hint)}`;
                hintBtn.disabled = true;
                hintBtn.innerHTML = '<i class="fas fa-check"></i> Hint Purchased';
                
                // Update exp display
                updateUserStats();
                this.updateHintCount();
            } else {
                alert(result.error || 'Failed to buy hint');
            }
        } catch (error) {
            console.error('Error buying hint:', error);
            alert('Failed to buy hint. Please try again.');
        }
    }

    showSuccessModal(expEarned, badgeEarned) {
        document.getElementById('challenge-modal').style.display = 'none';
        
        const successModal = document.getElementById('success-modal');
        const expEarnedElement = document.getElementById('exp-earned');
        const badgeEarnedElement = document.getElementById('badge-earned');
        const successMessage = document.getElementById('success-message');

        expEarnedElement.textContent = `+ ${expEarned} exp`;
        
        if (badgeEarned) {
            badgeEarnedElement.style.display = 'flex';
            successMessage.textContent = `Congratulations! You've earned the "${badgeEarned}" badge!`;
        } else {
            badgeEarnedElement.style.display = 'none';
            successMessage.textContent = 'You\'ve successfully solved the challenge!';
        }

        successModal.style.display = 'block';
    }

    updateProgressBar() {
        const completed = this.userProgress.length;
        const total = this.nodes.length;
        const percent = Math.round((completed / total) * 100);

        document.getElementById('completed-challenges').textContent = `${completed}/${total}`;
        document.getElementById('progress-percent').textContent = `${percent}%`;
        document.getElementById('progress-fill').style.width = `${percent}%`;

        // Update current level based on progress
        const level = Math.floor(completed / 3) + 1;
        document.getElementById('current-level').textContent = `Level ${level}`;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    window.challengeGame = await ChallengeGame.create(); // wait for full setup
    updateUserStats(); // can run afterward
});