function md2html(md) {
    const raw = marked.parse(md);
    const clean = DOMPurify.sanitize(raw);
    return clean;
}

document.addEventListener('DOMContentLoaded', () => {
    const practiceBtns = document.querySelectorAll('.practice-btn');
    const learnBtns = document.querySelectorAll('.learn-btn');
    const modal = document.getElementById('ai-modal');
    if (!modal) return;

    const closeBtn = modal.querySelector('.close-btn');
    const modalTitle = document.getElementById('modal-title');
    const loader = document.getElementById('modal-loader');
    
    // Areas inside modal
    const lessonArea = document.getElementById('lesson-content-area');
    const quizArea = document.getElementById('quiz-content-area');
    
    // Quiz specific elements
    const quizTopicText = document.getElementById('quiz-topic-text');
    const generateBtn = document.getElementById('generate-quiz-btn');
    const submitBtn = document.getElementById('submit-answer-btn');
    const quizContent = document.getElementById('quiz-content');
    const questionText = document.getElementById('question-text');
    const userAnswerTextarea = document.getElementById('user-solution-textarea');
    const feedbackArea = document.getElementById('feedback-area');
    
    let currentQuizData = {};

    // --- Modal Control ---
    function openModal() { modal.style.display = 'flex'; }
    function closeModal() { modal.style.display = 'none'; }
    closeBtn.onclick = closeModal;
    window.onclick = (event) => { if (event.target == modal) closeModal(); }

    function showInModal(mode) { // 'quiz' or 'lesson'
        lessonArea.style.display = mode === 'lesson' ? 'block' : 'none';
        quizArea.style.display = mode === 'quiz' ? 'block' : 'none';
        loader.style.display = 'none';
        openModal();
    }

    // --- Learn Button Logic ---
    learnBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const topic = btn.getAttribute('data-topic');
            modalTitle.textContent = `Lesson: ${topic}`;
            loader.style.display = 'block';
            lessonArea.style.display = 'none';
            quizArea.style.display = 'none';
            openModal();

            const formData = new FormData();
            formData.append('topic', topic);

            try {
                const response = await fetch('/api/get_lesson', { method: 'POST', body: formData });
                if (!response.ok) throw new Error('Network error');
                const data = await response.json();
                
                if(data.error) {

                     lessonArea.innerHTML = `<p style="color: var(--error-color);">${md2html(data.error)}</p>`;
                } else {
                     lessonArea.innerHTML = `<p>${md2html(data.lesson)}</p>`;
                }
            } catch (e) {
                 lessonArea.innerHTML = `<p style="color: var(--error-color);">Failed to load lesson.</p>`;
            } finally {
                showInModal('lesson');
            }
        });
    });

    // --- Practice Button Logic ---
    practiceBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const topic = btn.getAttribute('data-topic');
            modalTitle.textContent = `Practice: ${topic}`;
            quizTopicText.textContent = topic;
            feedbackArea.style.display = 'none';
            userAnswerTextarea.value = '';
            showInModal('quiz');
            generateNewProblem();
        });
    });
    
    generateBtn.addEventListener('click', generateNewProblem);
    submitBtn.addEventListener('click', evaluateAnswer);

    async function generateNewProblem() {
        const topic = quizTopicText.textContent;
        const difficulty = document.getElementById('difficulty-select').value;

        quizContent.style.display = 'none';
        feedbackArea.style.display = 'none';
        loader.style.display = 'block';
        userAnswerTextarea.value = '';

        const formData = new FormData();
        formData.append('topic', topic);
        formData.append('difficulty', difficulty);

        try {
            const response = await fetch('/api/generate_quiz', { method: 'POST', body: formData });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            currentQuizData = await response.json();
            if (currentQuizData.error) throw new Error(currentQuizData.error);
            questionText.innerHTML = md2html(currentQuizData.question);
        } catch (error) {
            questionText.textContent = `Failed to load question: ${error.message}`;
        } finally {
            loader.style.display = 'none';
            quizContent.style.display = 'block';
        }
    }

    async function evaluateAnswer() {
        const userAnswer = userAnswerTextarea.value;
        if (!userAnswer.trim()) return;

        feedbackArea.style.display = 'none';
        loader.style.display = 'block';

        const formData = new FormData();
        formData.append('question', currentQuizData.question);
        formData.append('user_solution', userAnswer);
        formData.append('correct_solution', currentQuizData.solution);
        formData.append('topic', quizTopicText.textContent);
        formData.append('difficulty', document.getElementById('difficulty-select').value);

        try {
            const response = await fetch('/api/evaluate_answer', { method: 'POST', body: formData });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const evaluation = await response.json();
            if (evaluation.error) throw new Error(evaluation.error);
            displayFeedback(evaluation);
        } catch (error) {
            displayFeedback({ error: `Could not get evaluation: ${error.message}` });
        } finally {
            loader.style.display = 'none';
        }
    }

    function displayFeedback(evaluation) {
        if (evaluation.error) {
            feedbackArea.innerHTML = `<h3 class="feedback-incorrect">Error</h3><p>${md2html(evaluation.error)}</p>`;
        } else {
            const resultTitle = evaluation.is_correct ? '<h3 class="feedback-correct"><i class="fas fa-check-circle"></i> Correct!</h3>' : '<h3 class="feedback-incorrect"><i class="fas fa-times-circle"></i> Needs Review</h3>';
            feedbackArea.innerHTML = `${resultTitle}<p><strong>Feedback:</strong> ${md2html(evaluation.feedback)}</p><hr><p><strong>Alternative Method:</strong> ${md2html(evaluation.smarter_way)}</p>`;
        }
        feedbackArea.style.display = 'block';
    }
});

