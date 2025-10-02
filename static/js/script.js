// document.addEventListener('DOMContentLoaded', () => {

//     // --- Theme Toggler ---
//     const themeToggle = document.getElementById('theme-toggle');
//     const body = document.body;

//     const savedTheme = localStorage.getItem('theme');
//     if (savedTheme) {
//         body.classList.add(savedTheme);
//     } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
//         body.classList.add('light-mode');
//     }

//     if(themeToggle) {
//         themeToggle.addEventListener('click', () => {
//             body.classList.toggle('light-mode');
//             if (body.classList.contains('light-mode')) {
//                 localStorage.setItem('theme', 'light-mode');
//             } else {
//                 localStorage.removeItem('theme');
//             }
//         });
//     }

//     // --- Matrix Background Animation on Banner ---
//     const matrixBackground = document.getElementById('matrix-background');
//     if (matrixBackground) {
//         const canvas = document.createElement('canvas');
//         matrixBackground.appendChild(canvas);
//         const ctx = canvas.getContext('2d');
//         let width = canvas.width = window.innerWidth;
//         let height = canvas.height = window.innerHeight;
//         let columns = Math.floor(width / 20);
//         const drops = Array(columns).fill(1);
//         const characters = '0123456789ABCDEFΓΔΘΛΞΠΣΦΨΩαβγδεζηθικλμνξπρστυφχψω';

//         function drawMatrix() {
//             ctx.fillStyle = 'rgba(13, 13, 43, 0.05)';
//             ctx.fillRect(0, 0, width, height);
//             ctx.fillStyle = '#00f7ff';
//             ctx.font = '15px monospace';
//             for (let i = 0; i < drops.length; i++) {
//                 const text = characters.charAt(Math.floor(Math.random() * characters.length));
//                 ctx.fillText(text, i * 20, drops[i] * 20);
//                 if (drops[i] * 20 > height && Math.random() > 0.975) {
//                     drops[i] = 0;
//                 }
//                 drops[i]++;
//             }
//         }
//         let interval = setInterval(drawMatrix, 40);
//         window.addEventListener('resize', () => {
//              width = canvas.width = window.innerWidth;
//              height = canvas.height = window.innerHeight;
//              columns = Math.floor(width / 20);
//              drops.length = 0;
//              for (let i = 0; i < columns; i++) { drops[i] = 1; }
//         });
//     }

//     // --- AI Quiz Interaction Logic ---
//     const generateBtn = document.getElementById('generate-quiz-btn');
//     const submitBtn = document.getElementById('submit-answer-btn');
//     const quizAreaSection = document.getElementById('quiz-area-section');
//     const loader = document.getElementById('loader');
//     const quizContent = document.getElementById('quiz-content');
//     const questionText = document.getElementById('question-text');
//     const userAnswerTextarea = document.getElementById('user-solution-textarea');
    
//     // Store current quiz data
//     let currentQuizData = {};

//     if (generateBtn) {
//         generateBtn.addEventListener('click', async () => {
//             const topic = document.getElementById('topic-select').value;
//             const difficulty = document.getElementById('difficulty-select').value;

//             quizAreaSection.style.display = 'block';
//             quizContent.style.display = 'none';
//             loader.style.display = 'block';
//             userAnswerTextarea.value = ''; // Clear previous answer

//             const formData = new FormData();
//             formData.append('topic', topic);
//             formData.append('difficulty', difficulty);

//             try {
//                 const response = await fetch('/api/generate_quiz', {
//                     method: 'POST',
//                     body: formData
//                 });
//                 if (!response.ok) throw new Error('Network response was not ok');
                
//                 const data = await response.json();
                
//                 if(data.error) {
//                     questionText.textContent = `Error: ${data.error}`;
//                 } else {
//                     currentQuizData = data; // Save data
//                     questionText.textContent = data.question;
//                 }

//             } catch (error) {
//                 questionText.textContent = 'Failed to load question. Please try again.';
//                 console.error('Error generating quiz:', error);
//             } finally {
//                 loader.style.display = 'none';
//                 quizContent.style.display = 'block';
//             }
//         });
//     }

//     if (submitBtn) {
//         submitBtn.addEventListener('click', async () => {
//             const userAnswer = userAnswerTextarea.value;
//             if (!userAnswer.trim()) {
//                 alert('Please provide your solution before submitting.');
//                 return;
//             }
            
//             loader.style.display = 'block';

//             const formData = new FormData();
//             formData.append('question', currentQuizData.question);
//             formData.append('user_solution', userAnswer);
//             formData.append('correct_solution', currentQuizData.solution);

//             try {
//                 const response = await fetch('/api/evaluate_answer', {
//                     method: 'POST',
//                     body: formData
//                 });
//                  if (!response.ok) throw new Error('Network response was not ok');

//                 const evaluation = await response.json();
//                 displayFeedback(evaluation);

//             } catch (error) {
//                  displayFeedback({error: "Could not get evaluation. Please try again."})
//                  console.error('Error evaluating answer:', error);
//             } finally {
//                 loader.style.display = 'none';
//             }
//         });
//     }
    
//     // --- Modal Logic ---
//     const modal = document.getElementById('feedback-modal');
//     const modalBody = document.getElementById('modal-body');
//     const closeBtn = document.querySelector('.close-btn');

//     function displayFeedback(evaluation) {
//         modalBody.innerHTML = ''; // Clear previous feedback
//         if(evaluation.error) {
//             modalBody.innerHTML = `<h3 class="feedback-incorrect">Error</h3><p>${evaluation.error}</p>`;
//         } else {
//              const resultTitle = evaluation.is_correct
//                 ? '<h3 class="feedback-correct"><i class="fas fa-check-circle"></i> Correct!</h3>'
//                 : '<h3 class="feedback-incorrect"><i class="fas fa-times-circle"></i> Needs Review</h3>';
            
//             modalBody.innerHTML = `
//                 ${resultTitle}
//                 <p><strong>Feedback:</strong> ${evaluation.feedback}</p>
//                 <hr>
//                 <p><strong>Alternative Method:</strong> ${evaluation.smarter_way}</p>
//             `;
//         }
//         modal.style.display = 'flex';
//     }

//     if(closeBtn) {
//         closeBtn.onclick = () => { modal.style.display = "none"; }
//     }
//     if(modal) {
//         window.onclick = (event) => {
//             if (event.target == modal) {
//                 modal.style.display = "none";
//             }
//         }
//     }

// });




document.addEventListener('DOMContentLoaded', () => {

    // --- Theme Toggler ---
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        body.classList.add(savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        // We default to dark, so only switch if OS is light
        // body.classList.add('light-mode');
    }

    if(themeToggle) {
        themeToggle.addEventListener('click', () => {
            body.classList.toggle('light-mode');
            if (body.classList.contains('light-mode')) {
                localStorage.setItem('theme', 'light-mode');
            } else {
                localStorage.removeItem('theme');
            }
        });
    }

    // --- Matrix Background Animation on Banner ---
    const matrixBackground = document.getElementById('matrix-background');
    if (matrixBackground) {
        // This is an intensive animation, so we can check if the user prefers reduced motion
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if(prefersReducedMotion) return;

        const canvas = document.createElement('canvas');
        matrixBackground.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;
        let columns = Math.floor(width / 20);
        const drops = Array(columns).fill(1);
        const characters = '0123456789ABCDEFΓΔΘΛΞΠΣΦΨΩαβγδεζηθικλμνξπρστυφχψω';

        function drawMatrix() {
            // Background fade
            if (body.classList.contains('light-mode')) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; // soft white overlay
            } else {
                ctx.fillStyle = 'rgba(13, 13, 43, 0.05)';
            }
            ctx.fillRect(0, 0, width, height);
        
            // Text style
            if (body.classList.contains('light-mode')) {
                ctx.fillStyle = '#0088cc'; // bright pastel cyan
                ctx.shadowColor = 'rgba(0, 136, 204, 0.5)'; 
                ctx.shadowBlur = 6; 
            } else {
                ctx.fillStyle = '#00f7ff';
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
            }
            ctx.font = '15px monospace';
        
            for (let i = 0; i < drops.length; i++) {
                const text = characters.charAt(Math.floor(Math.random() * characters.length));
                ctx.fillText(text, i * 20, drops[i] * 20);
        
                if (drops[i] * 20 > height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]++;
            }
        }
        
        let interval = setInterval(drawMatrix, 40);
        window.addEventListener('resize', () => {
             width = canvas.width = window.innerWidth;
             height = canvas.height = window.innerHeight;
             columns = Math.floor(width / 20);
             drops.length = 0;
             for (let i = 0; i < columns; i++) { drops[i] = 1; }
        });
    }

    // --- Responsive Navigation Toggle ---
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (navToggle && navLinks) {
        navToggle.addEventListener('click', () => {
            navLinks.classList.toggle('nav-active');
        });
    }
});

