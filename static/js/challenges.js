class ChallengeGame {
    constructor() {
        this.nodes = [];
        this.currentNode = null;
        this.userProgress = [];
        this.init();
    }

    async init() {
        await this.loadUserProgress();
        await this.generateChallengeMap();
        this.setupEventListeners();
        this.updateProgressBar();
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

    generateChallengeMap() {
        // Define challenge nodes
        this.nodes = [
            { id: 'alg_challenge_1', title: 'Basic Expressions', topic: 'Foundations of Algebra', difficulty: 'Easy', coins: 50, icon: 'fas fa-cubes', prerequisites: [] },
            { id: 'alg_challenge_2', title: 'Linear Equations', topic: 'Solving Linear Equations', difficulty: 'Easy', coins: 50, icon: 'fas fa-equals', prerequisites: ['alg_challenge_1'] },
            { id: 'alg_challenge_3', title: 'Inequalities', topic: 'Inequalities', difficulty: 'Medium', coins: 75, icon: 'fas fa-less-than-equal', prerequisites: ['alg_challenge_2'] },
            { id: 'alg_challenge_4', title: 'Polynomial Basics', topic: 'Polynomials and Factoring', difficulty: 'Medium', coins: 75, icon: 'fas fa-superscript', prerequisites: ['alg_challenge_2'] },
            { id: 'alg_challenge_5', title: 'Factoring', topic: 'Polynomials and Factoring', difficulty: 'Hard', coins: 100, icon: 'fas fa-superscript', prerequisites: ['alg_challenge_4'] },
            { id: 'alg_challenge_6', title: 'Quadratic Equations', topic: 'Quadratic Equations', difficulty: 'Hard', coins: 100, icon: 'fas fa-square-root-alt', prerequisites: ['alg_challenge_5'] },
            { id: 'alg_challenge_7', title: 'Advanced Factoring', topic: 'Polynomials and Factoring', difficulty: 'Very Hard', coins: 150, icon: 'fas fa-superscript', prerequisites: ['alg_challenge_5', 'alg_challenge_6'] },
            { id: 'alg_challenge_8', title: 'Complex Quadratics', topic: 'Quadratic Equations', difficulty: 'Very Hard', coins: 150, icon: 'fas fa-square-root-alt', prerequisites: ['alg_challenge_6'] },
            { id: 'alg_challenge_9', title: 'Systems', topic: 'Systems of Equations', difficulty: 'Hard', coins: 125, icon: 'fas fa-project-diagram', prerequisites: ['alg_challenge_3', 'alg_challenge_4'] },
            { id: 'alg_challenge_10', title: 'Word Problems', topic: 'Solving Linear Equations', difficulty: 'Medium', coins: 100, icon: 'fas fa-font', prerequisites: ['alg_challenge_2'] },
            { id: 'alg_challenge_11', title: 'Master Challenge', topic: 'Quadratic Equations', difficulty: 'Very Hard', coins: 200, icon: 'fas fa-trophy', prerequisites: ['alg_challenge_7', 'alg_challenge_8'] },
            { id: 'alg_challenge_12', title: 'Final Boss', topic: 'Polynomials and Factoring', difficulty: 'Very Hard', coins: 250, icon: 'fas fa-crown', prerequisites: ['alg_challenge_11'] }
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
            <div class="node-reward">${node.coins}</div>
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
        document.getElementById('reward-amount').textContent = `+${node.coins} coins`;
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
                document.getElementById('problem-text').textContent = quizData.question;
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
                feedbackArea.innerHTML = `<div class="success-message">${result.feedback}</div>`;
                this.showSuccessModal(result.coins_earned, result.badge_earned);
            } else {
                feedbackArea.innerHTML = `
                    <div class="error-message">${result.feedback}</div>
                    ${result.smarter_way ? `<div class="hint-message">${result.smarter_way}</div>` : ''}
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

        try {
            const response = await fetch('/api/buy_hint', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `node_id=${encodeURIComponent(this.currentNode.id)}&coins=50`
            });

            const result = await response.json();

            if (result.success) {
                hintArea.style.display = 'block';
                hintArea.innerHTML = `<strong>Hint:</strong> ${result.hint}`;
                hintBtn.disabled = true;
                hintBtn.innerHTML = '<i class="fas fa-check"></i> Hint Purchased';
                
                // Update coins display
                updateUserStats();
            } else {
                alert(result.error || 'Failed to buy hint');
            }
        } catch (error) {
            console.error('Error buying hint:', error);
            alert('Failed to buy hint. Please try again.');
        }
    }

    showSuccessModal(coinsEarned, badgeEarned) {
        document.getElementById('challenge-modal').style.display = 'none';
        
        const successModal = document.getElementById('success-modal');
        const coinsEarnedElement = document.getElementById('coins-earned');
        const badgeEarnedElement = document.getElementById('badge-earned');
        const successMessage = document.getElementById('success-message');

        coinsEarnedElement.textContent = `+${coinsEarned} coins`;
        
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

// Initialize the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.challengeGame = new ChallengeGame();
    updateUserStats();
});