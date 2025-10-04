class MathChat {
    constructor() {
        this.currentConversationId = null;
        this.conversations = [];
        this.isSidebarOpen = window.innerWidth > 768;
        this.currentImageData = null;
        this.isMobile = this.checkMobile();
        this.init();
    }

    checkMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
               window.innerWidth <= 768;
    }

    async init() {
        await this.loadConversations();
        this.setupEventListeners();
        this.updateSidebarVisibility();
        this.setupMathJax();
        this.setupMobileFeatures();
        this.setupPreviewFeatures();

        // setTimeout(() => this.rerenderMathJax(), 500);
        if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
            window.MathJax.startup.promise.then(() => {
                // This executes only after MathJax is fully loaded and configured.
                this.rerenderMathJax(); 
            }).catch(e => {
                console.error("MathJax startup promise failed:", e);
            });
        } else {
            // Fallback if MathJax object hasn't even started loading (should be rare)
            console.warn("Cannot find MathJax.startup. Falling back to load listener.");
            window.addEventListener('load', () => this.rerenderMathJax());
        }
    }

    setupMathJax() {
        // Configure MathJax for better performance
        window.MathJax = {
            tex: {
                inlineMath: [['$', '$'], ['\\(', '\\)']],
                displayMath: [['$$', '$$'], ['\\[', '\\]']],
                processEscapes: true,
                processEnvironments: true
            },
            options: {
                skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
                renderActions: {
                    addMenu: [0, '', '']
                },
                scale: 0.85
            },
            startup: {
                typeset: false
            }
        };
    }

    setupMobileFeatures() {
        // Update UI for mobile
        if (this.isMobile) {
            document.body.classList.add('mobile');
            this.setupMobileGestures();
            this.setupMobileOptimizations();
        }
    }

    setupMobileOptimizations() {
        // Optimize for mobile performance
        this.setupTouchEvents();
        this.optimizeMathJaxForMobile();
    }

    setupTouchEvents() {
        // Better touch handling for mobile
        const chatInput = document.getElementById('chat-input');
        
        // Prevent zoom on focus (iOS)
        chatInput.addEventListener('touchstart', function() {
            this.style.fontSize = '16px'; // Prevent zoom
        });
        
        // Improved touch scrolling
        const messagesContainer = document.getElementById('chat-messages');
        messagesContainer.addEventListener('touchstart', function(e) {
            this.classList.add('scrolling');
        });
        
        messagesContainer.addEventListener('touchend', function(e) {
            setTimeout(() => this.classList.remove('scrolling'), 100);
        });
    }

    setupPreviewFeatures() {
        // Toggle preview in main chat
        document.getElementById('toggle-preview').addEventListener('click', () => {
            this.toggleInputPreview();
        });
    
        document.getElementById('hide-preview').addEventListener('click', () => {
            this.hideInputPreview();
        });
    
        // Update preview when typing
        document.getElementById('chat-input').addEventListener('input', () => {
            this.updateInputPreview();
        });
    
        // OCR modal tabs
        this.setupOCRModalTabs();
    }
    
    setupOCRModalTabs() {
        const tabBtns = document.querySelectorAll('.ocr-tab-btn');
        
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                this.switchOCRTab(tabName);
            });
        });
    
        // Format text button
        document.getElementById('format-text').addEventListener('click', () => {
            this.formatOCRText();
        });
    }
    
    switchOCRTab(tabName) {
        // Update buttons
        document.querySelectorAll('.ocr-tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
        // Update content
        document.querySelectorAll('.ocr-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
    
        // Update content for specific tabs
        if (tabName === 'preview') {
            this.updateOCRPreview();
        } else if (tabName === 'raw') {
            document.getElementById('raw-text').value = 
                document.getElementById('extracted-text').value;
        }
    }
    
    toggleInputPreview() {
        const preview = document.getElementById('input-preview');
        if (preview.style.display === 'none') {
            preview.style.display = 'block';
            this.updateInputPreview();
        } else {
            preview.style.display = 'none';
        }
    }
    
    hideInputPreview() {
        document.getElementById('input-preview').style.display = 'none';
    }
    
    updateInputPreview() {
        const input = document.getElementById('chat-input');
        const preview = document.getElementById('preview-content');
        
        if (input.value.trim()) {
            preview.innerHTML = this.md2html(input.value);
            this.rerenderMathJax();
        } else {
            preview.innerHTML = '<em class="text-muted">Type something to see preview...</em>';
        }
    }
    
    updateOCRPreview() {
        const extractedText = document.getElementById('extracted-text');
        const previewContent = document.getElementById('ocr-preview-content');
        
        if (extractedText.value.trim()) {
            previewContent.innerHTML = this.md2html(extractedText.value);
            this.rerenderMathJax();
        } else {
            previewContent.innerHTML = '<em class="text-muted">No text to preview</em>';
        }
    }
    
    formatOCRText() {
        const textarea = document.getElementById('extracted-text');
        const text = textarea.value;
        
        // Simple formatting for Vietnamese and math
        let formatted = text
            .replace(/(\d+)\/(\d+)/g, '$$\\frac{$1}{$2}$$') // Fractions
            .replace(/(\w)\^(\d+)/g, '$1^{$2}') // Exponents
            .replace(/(\w)_(\d+)/g, '$1_{$2}') // Subscripts
            .replace(/sqrt\(([^)]+)\)/g, '$$\\sqrt{$1}$$'); // Square roots
        
        textarea.value = formatted;
        this.updateOCRPreview();
    }

    setupEventListeners() {
        // Send message
        document.getElementById('send-message').addEventListener('click', () => {
            this.sendMessage();
        });

        // Enter key to send
        document.getElementById('chat-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // New chat
        document.getElementById('new-chat-btn').addEventListener('click', () => {
            this.startNewChat();
            if (this.isMobile) {
                this.closeSidebar();
            }
        });

        // Clear chat
        document.getElementById('clear-chat').addEventListener('click', () => {
            this.clearCurrentChat();
        });

        // Export chat
        document.getElementById('export-chat').addEventListener('click', () => {
            this.exportChat();
        });

        // Sidebar toggle
        document.getElementById('sidebar-toggle').addEventListener('click', () => {
            this.toggleSidebar();
        });

        // Upload options
        document.getElementById('upload-image-btn').addEventListener('click', () => {
            document.getElementById('gallery-upload').click();
        });

        document.getElementById('scan-image-btn').addEventListener('click', () => {
            document.getElementById('camera-upload').click();
        });

        // File uploads
        document.getElementById('gallery-upload').addEventListener('change', (e) => {
            this.handleImageUpload(e);
        });

        document.getElementById('camera-upload').addEventListener('change', (e) => {
            this.handleImageUpload(e);
        });

        const chatInput = document.getElementById('chat-input');
        chatInput.addEventListener('focus', () => {
            // Ensure proper alignment when focused
            document.querySelector('.input-wrapper').style.alignItems = 'center';
        });

        // Example questions
        this.setupExampleQuestions();

        // OCR Modal events
        this.setupOCRModalEvents();

        // Auto-resize textarea
        this.setupTextareaAutoResize();

        // Theme change handler
        this.setupThemeHandler();

        // Mobile overlay
        // this.setupMobileOverlay();
        document.addEventListener('click', (e) => {
            if (this.isMobile && this.isSidebarOpen) {
                const sidebar = document.querySelector('.chat-sidebar');
                const toggleBtn = document.getElementById('sidebar-toggle');
                
                // Check if click is outside sidebar and not on toggle button
                if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
                    this.closeSidebar();
                }
            }
        });
    }

    setupMobileGestures() {
        const sidebar = document.querySelector('.chat-sidebar');
        
        sidebar.addEventListener('touchstart', (e) => {
            this.touchStartX = e.touches[0].clientX;
        });
    
        sidebar.addEventListener('touchmove', (e) => {
            if (!this.isSidebarOpen) return;
            
            const currentX = e.touches[0].clientX;
            const diff = this.touchStartX - currentX;
            
            if (diff > 50) { // Swipe left to close
                this.closeSidebar();
            }
        });
    }

    closeSidebar() {
        this.isSidebarOpen = false;
        this.updateSidebarVisibility();
    }
    
    updateSidebarVisibility() {
        const sidebar = document.querySelector('.chat-sidebar');
        
        if (this.isSidebarOpen) {
            sidebar.classList.add('open');
            document.body.style.overflow = 'hidden';
        } else {
            sidebar.classList.remove('open');
            document.body.style.overflow = '';
        }
    }

    // setupMobileOverlay() {
    //     const overlay = document.getElementById('sidebar-overlay');
    //     overlay.addEventListener('click', () => {
    //         this.closeSidebar();
    //     });
    // }

    setupExampleQuestions() {
        // Delegate event handling since example questions might be recreated
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('example-chip')) {
                const question = e.target.dataset.question;
                document.getElementById('chat-input').value = question;
                this.sendMessage();
            }
        });
    }

    setupOCRModalEvents() {
        const modal = document.getElementById('ocr-preview-modal');
        const closeBtn = modal.querySelector('.close-btn');
        const cancelBtn = document.getElementById('cancel-ocr');
        const sendBtn = document.getElementById('send-ocr-text');
        const editBtn = document.getElementById('edit-text');
        const retryBtn = document.getElementById('retry-ocr');

        closeBtn.addEventListener('click', () => this.closeOCRModal());
        cancelBtn.addEventListener('click', () => this.closeOCRModal());
        
        sendBtn.addEventListener('click', () => {
            const extractedText = document.getElementById('extracted-text').value;
            if (extractedText.trim()) {
                this.closeOCRModal();
                this.sendOCRMessage(extractedText);
            } else {
                alert('Please extract text first or enter a message.');
            }
        });

        editBtn.addEventListener('click', () => {
            const textarea = document.getElementById('extracted-text');
            textarea.removeAttribute('readonly');
            textarea.focus();
        });

        retryBtn.addEventListener('click', () => {
            if (this.currentImageData) {
                this.extractTextFromImage(this.currentImageData);
            }
        });

        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeOCRModal();
            }
        });

        // ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'block') {
                this.closeOCRModal();
            }
        });
    }

    setupTextareaAutoResize() {
        const textarea = document.getElementById('chat-input');
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            const newHeight = Math.min(this.scrollHeight, 120);
            this.style.height = newHeight + 'px';
            
            // Maintain center alignment
            const inputWrapper = this.closest('.input-wrapper');
            if (inputWrapper) {
                if (newHeight > 56) { // If multi-line
                    inputWrapper.style.alignItems = 'flex-end';
                } else { // If single line
                    inputWrapper.style.alignItems = 'center';
                }
            }
        });
    
        // Reset to center alignment when input is cleared
        textarea.addEventListener('change', function() {
            if (!this.value.trim()) {
                const inputWrapper = this.closest('.input-wrapper');
                if (inputWrapper) {
                    inputWrapper.style.alignItems = 'center';
                    this.style.height = 'auto';
                }
            }
        });
    
        // Focus on input when clicking on chat area (mobile)
        if (this.isMobile) {
            document.querySelector('.chat-messages').addEventListener('click', () => {
                textarea.focus();
            });
        }
    }

    setupThemeHandler() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    setTimeout(() => {
                        this.rerenderMathJax();
                    }, 100);
                }
            });
        });

        observer.observe(document.body, { attributes: true });
    }

    async loadConversations() {
        try {
            const response = await fetch('/api/chat/conversations');
            if (response.ok) {
                const data = await response.json();
                this.conversations = data.conversations || [];
                this.renderConversations();
            }
        } catch (error) {
            console.error('Failed to load conversations:', error);
            this.showError('Failed to load conversations. Please refresh the page.');
        }
    }

    renderConversations() {
        const container = document.getElementById('conversations-list');
        
        if (this.conversations.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comments"></i>
                    <p>No conversations yet</p>
                    <small>Start a new chat to begin!</small>
                </div>
            `;
            return;
        }

        container.innerHTML = this.conversations.map(conv => `
            <div class="conversation-item ${conv.conversation_id === this.currentConversationId ? 'active' : ''}" 
                 data-conversation-id="${conv.conversation_id}">
                <div class="conversation-title">${this.escapeHtml(conv.title)}</div>
                <div class="conversation-date">${this.formatDate(conv.updated_at)}</div>
            </div>
        `).join('');

        // Add click listeners
        container.querySelectorAll('.conversation-item').forEach(item => {
            item.addEventListener('click', () => {
                const conversationId = item.dataset.conversationId;
                this.loadConversation(conversationId);
                if (this.isMobile) {
                    this.closeSidebar();
                }
            });
        });
    }

    async loadConversation(conversationId) {
        try {
            const response = await fetch(`/api/chat/messages/${conversationId}`);
            if (response.ok) {
                const data = await response.json();
                this.currentConversationId = conversationId;
                this.renderMessages(data.messages);
                this.updateChatTitle();
                this.renderConversations();
            } else {
                throw new Error('Failed to load conversation');
            }
        } catch (error) {
            console.error('Failed to load conversation:', error);
            this.showError('Failed to load conversation. Please try again.');
        }
    }

    async sendMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();

        if (!message) {
            this.showError('Please enter a message first.');
            return;
        }

        // Clear input and reset height
        input.value = '';
        input.style.height = 'auto';

        // Add user message to chat
        this.addMessage('user', message);

        // Show typing indicator
        this.showTypingIndicator();

        try {
            const response = await fetch('/api/chat/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    conversation_id: this.currentConversationId
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to send message');
            }

            // Remove typing indicator
            this.removeTypingIndicator();

            // Add AI response
            this.addMessage('assistant', data.response);
            
            // Update current conversation ID if this was a new chat
            if (!this.currentConversationId) {
                this.currentConversationId = data.conversation_id;
                await this.loadConversations();
                this.updateChatTitle();
            }

        } catch (error) {
            console.error('Error sending message:', error);
            this.removeTypingIndicator();
            this.addMessage('assistant', `I'm sorry, I encountered an error: ${error.message}. Please try again.`);
        }
    }

    sendOCRMessage(text) {
        document.getElementById('chat-input').value = text;
        this.sendMessage();
    }

    handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Check if file is an image
        if (!file.type.startsWith('image/')) {
            this.showError('Please upload an image file (JPEG, PNG, etc.).');
            return;
        }

        // Check file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            this.showError('Image size should be less than 10MB.');
            return;
        }

        const reader = new FileReader();
        
        reader.onload = (e) => {
            this.currentImageData = e.target.result;
            this.showOCRModal(e.target.result);
        };

        reader.onerror = () => {
            this.showError('Failed to read the image file. Please try again.');
        };

        reader.readAsDataURL(file);
        
        // Reset file inputs
        document.getElementById('gallery-upload').value = '';
        document.getElementById('camera-upload').value = '';
    }

    showOCRModal(imageData) {
        const modal = document.getElementById('ocr-preview-modal');
        const previewImg = document.getElementById('ocr-preview-img');
        const extractedText = document.getElementById('extracted-text');

        // Show image preview
        previewImg.src = imageData;
        
        // Reset text area
        extractedText.value = 'Extracting text from image...';
        extractedText.setAttribute('readonly', true);

        // Show modal
        modal.style.display = 'block';

        // Extract text
        this.extractTextFromImage(imageData);
    }

    closeOCRModal() {
        const modal = document.getElementById('ocr-preview-modal');
        modal.style.display = 'none';
        this.currentImageData = null;
    }

    async extractTextFromImage(imageData) {
        const extractedText = document.getElementById('extracted-text');
        const sendBtn = document.getElementById('send-ocr-text');
        const retryBtn = document.getElementById('retry-ocr');
    
        // Show loading state
        extractedText.value = '🔄 Extracting text from image...';
        sendBtn.disabled = true;
        retryBtn.disabled = true;
    
        try {
            const response = await fetch('/api/ocr/extract-text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ image_data: imageData })
            });
    
            const result = await response.json();
    
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'OCR failed');
            }
    
            // Display extracted text
            extractedText.value = result.text || 'No text could be extracted from the image.';
            sendBtn.disabled = !result.text.trim();
            retryBtn.disabled = false;
    
            if (result.text.trim()) {
                extractedText.removeAttribute('readonly');
            }
    
        } catch (error) {
            console.error('OCR Error:', error);
            extractedText.value = `❌ Failed to extract text: ${error.message}\n\nPlease try again with a clearer image.`;
            sendBtn.disabled = true;
            retryBtn.disabled = false;
        }
    }

    addMessage(role, content) {
        const messagesContainer = document.getElementById('chat-messages');
        
        // Remove welcome message if it's the first user message
        if (role === 'user') {
            const welcomeMessage = messagesContainer.querySelector('.welcome-message');
            if (welcomeMessage) {
                welcomeMessage.remove();
            }
        }
    
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        
        if (role === 'assistant') {
            setTimeout(() => this.rerenderMathJax(), 100);
            messageDiv.innerHTML = `<div class="message-content">${this.md2html(content)}</div>`;
        } else {
            messageDiv.innerHTML = `<div class="message-content">${this.escapeHtml(content)}</div>`;
        }
    
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
        // Enhanced MathJax rendering with retry logic
        if (window.MathJax && role === 'assistant') {
            setTimeout(() => this.rerenderMathJax(), 100);
            // Additional retry for complex equations
            setTimeout(() => this.rerenderMathJax(), 500);
        }
    }

    showTypingIndicator() {
        const messagesContainer = document.getElementById('chat-messages');
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    removeTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    renderMessages(messages) {
        const messagesContainer = document.getElementById('chat-messages');
        messagesContainer.innerHTML = '';
    
        if (messages.length === 0) {
            messagesContainer.innerHTML = this.createWelcomeMessage();
            
            // Re-add event listeners for example chips
            messagesContainer.querySelectorAll('.example-chip').forEach(chip => {
                chip.addEventListener('click', (e) => {
                    const question = e.target.dataset.question;
                    document.getElementById('chat-input').value = question;
                    this.sendMessage();
                });
            });
    
            // Render MathJax for welcome message if needed
            setTimeout(() => this.rerenderMathJax(), 100);
            return;
        }
    
        messages.forEach(message => {
            this.addMessage(message.role, message.content);
        });
    
        // Ensure MathJax renders after all messages are loaded
        setTimeout(() => {
            this.rerenderMathJax();
            // Additional check after a longer delay
            setTimeout(() => this.rerenderMathJax(), 1000);
        }, 100);
    }

    createWelcomeMessage() {
        return `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <i class="fas fa-robot"></i>
                </div>
                <h1>Hello! I'm Your AI Math Tutor</h1>
                <p class="welcome-subtitle">I can help you with any math problem. Type your question or upload an image!</p>
                
                <div class="features-grid">
                    <div class="feature-item">
                        <i class="fas fa-camera"></i>
                        <h4>Image to Text</h4>
                        <p>Upload images of math problems</p>
                    </div>
                    <div class="feature-item">
                        <i class="fas fa-code"></i>
                        <h4>LaTeX Support</h4>
                        <p>Beautiful math rendering</p>
                    </div>
                    <div class="feature-item">
                        <i class="fas fa-list-ol"></i>
                        <h4>Step-by-Step</h4>
                        <p>Detailed explanations</p>
                    </div>
                    <div class="feature-item">
                        <i class="fas fa-infinity"></i>
                        <h4>All Math Topics</h4>
                        <p>From algebra to calculus</p>
                    </div>
                </div>
    
                <div class="example-section">
                    <h3>Try These Examples:</h3>
                    <div class="example-questions">
                        <div class="example-chip" data-question="Solve the quadratic equation: x² - 5x + 6 = 0">
                            Solve: x² - 5x + 6 = 0
                        </div>
                        <div class="example-chip" data-question="Explain the Pythagorean theorem with an example">
                            Pythagorean theorem
                        </div>
                        <div class="example-chip" data-question="How do I find the derivative of f(x) = 3x² + 2x - 1?">
                            Derivative of 3x² + 2x - 1
                        </div>
                        <div class="example-chip" data-question="Factor the expression: 2x² + 7x + 3">
                            Factor 2x² + 7x + 3
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    startNewChat() {
        this.currentConversationId = null;
        this.renderMessages([]);
        this.updateChatTitle();
        this.renderConversations();
        
        // Focus on input
        document.getElementById('chat-input').focus();
    }

    async clearCurrentChat() {
        if (!this.currentConversationId) {
            this.startNewChat();
            return;
        }

        if (confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
            try {
                const response = await fetch(`/api/chat/conversation/${this.currentConversationId}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    this.startNewChat();
                    await this.loadConversations();
                } else {
                    throw new Error('Failed to delete conversation');
                }
            } catch (error) {
                console.error('Failed to delete conversation:', error);
                this.showError('Failed to delete conversation. Please try again.');
            }
        }
    }

    async exportChat() {
        if (!this.currentConversationId) {
            this.showError('No conversation to export.');
            return;
        }

        try {
            const response = await fetch(`/api/chat/messages/${this.currentConversationId}`);
            if (response.ok) {
                const data = await response.json();
                const messages = data.messages || [];
                
                const title = document.getElementById('current-chat-title').textContent;
                const firstThreeWords = title.split(' ').slice(0, 3).join(' ');

                let exportText = `ThetaMind Chat Export\n`;
                exportText += `Conversation: ${firstThreeWords}\n`;
                exportText += `Exported: ${new Date().toLocaleString()}\n\n`;
                
                messages.forEach(msg => {
                    const role = msg.role === 'user' ? 'You' : 'AI Tutor';
                    exportText += `${role}: ${msg.content}\n\n`;
                });

                // Create and download file
                const blob = new Blob([exportText], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `thetamind-chat-${new Date().toISOString().split('T')[0]}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                throw new Error('Failed to export chat');
            }
        } catch (error) {
            console.error('Export failed:', error);
            this.showError('Failed to export chat. Please try again.');
        }
    }

    updateChatTitle() {
        const titleElement = document.getElementById('current-chat-title');
        if (this.currentConversationId) {
            const conversation = this.conversations.find(c => c.conversation_id === this.currentConversationId);
            titleElement.textContent = conversation ? conversation.title : 'Chat';
        } else {
            titleElement.textContent = 'New Chat';
        }
    }

    toggleSidebar() {
        this.isSidebarOpen = !this.isSidebarOpen;
        this.updateSidebarVisibility();
    }

    closeSidebar() {
        this.isSidebarOpen = false;
        this.updateSidebarVisibility();
    }

    updateSidebarVisibility() {
        const sidebar = document.querySelector('.chat-sidebar');
        // const overlay = document.getElementById('sidebar-overlay');
        
        if (this.isSidebarOpen) {
            sidebar.classList.add('open');
            // overlay.classList.add('active');
            document.body.style.overflow = 'hidden'; // Prevent background scrolling
        } else {
            sidebar.classList.remove('open');
            // overlay.classList.remove('active');
            document.body.style.overflow = ''; // Restore scrolling
        }
    }

    rerenderMathJax(targetElement = null) {
        // MathJax v3 uses a promise-based typeset function.
        if (window.MathJax && window.MathJax.typeset) {
            console.log("Rerendering MathJax (v3.x)...");
            
            // If a targetElement is provided (e.g., a new message), only typeset that.
            // Otherwise, typeset the whole document body.
            const elements = targetElement ? [targetElement] : [document.body];
            
            // Using typesetPromise is cleaner if you need to chain async actions, 
            // but simple typeset(elements) will re-render them.
            try {
                window.MathJax.typeset(elements); 
            } catch (e) {
                console.error("MathJax v3 Typeset error:", e);
            }
            
        } else {
            console.warn("MathJax.typeset is not available.");
            // This will now catch the error from line 32 in your log.
        }
    }

    showError(message) {
        // Simple error notification
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-notification';
        errorDiv.innerHTML = `
            <div class="error-content">
                <i class="fas fa-exclamation-circle"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(errorDiv);
        
        // Remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }

    // Utility functions (keep the existing ones)
    md2html(md) {
        marked.setOptions({
            breaks: true,
            gfm: true,
            sanitize: false
        });

        const raw = marked.parse(md);
        const clean = DOMPurify.sanitize(raw);
        
        setTimeout(() => {
            this.rerenderMathJax();
        }, 100);
        
        return clean;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
            return 'Today';
        } else if (diffDays === 2) {
            return 'Yesterday';
        } else if (diffDays <= 7) {
            return `${diffDays - 1} days ago`;
        } else {
            return date.toLocaleDateString();
        }
    }
}

// Initialize chat when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.mathChat = new MathChat();
});