class MathChat {
    constructor() {
        this.currentConversationId = null;
        this.conversations = [];
        this.isSidebarOpen = window.innerWidth > 768;
        this.currentImageData = null;
        this.init();
    }

    async init() {
        await this.loadConversations();
        this.setupEventListeners();
        this.updateSidebarVisibility();
        this.setupMathJax();
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
                }
            },
            startup: {
                typeset: false
            }
        };
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

        // Image upload
        document.getElementById('upload-image-btn').addEventListener('click', () => {
            document.getElementById('image-upload').click();
        });

        document.getElementById('image-upload').addEventListener('change', (e) => {
            this.handleImageUpload(e);
        });

        // Example questions
        document.querySelectorAll('.example-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                const question = e.target.dataset.question;
                document.getElementById('chat-input').value = question;
                this.sendMessage();
            });
        });

        // OCR Modal events
        this.setupOCRModalEvents();

        // Auto-resize textarea
        this.setupTextareaAutoResize();

        // Theme change handler
        this.setupThemeHandler();
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
    }

    setupTextareaAutoResize() {
        const textarea = document.getElementById('chat-input');
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
    }

    setupThemeHandler() {
        // Observe theme changes and re-render MathJax
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
                
                if (window.innerWidth <= 768) {
                    this.isSidebarOpen = false;
                    this.updateSidebarVisibility();
                }
            }
        } catch (error) {
            console.error('Failed to load conversation:', error);
        }
    }

    async sendMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();

        if (!message) return;

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
            alert('Please upload an image file (JPEG, PNG, etc.).');
            return;
        }

        // Check file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            alert('Image size should be less than 10MB.');
            return;
        }

        const reader = new FileReader();
        
        reader.onload = (e) => {
            this.currentImageData = e.target.result;
            this.showOCRModal(e.target.result);
        };

        reader.onerror = () => {
            alert('Failed to read the image file. Please try again.');
        };

        reader.readAsDataURL(file);
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
        
        // Reset file input
        document.getElementById('image-upload').value = '';
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
                extractedText.setAttribute('readonly', false);
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
            messageDiv.innerHTML = `<div class="message-content">${this.md2html(content)}</div>`;
        } else {
            messageDiv.innerHTML = `<div class="message-content">${this.escapeHtml(content)}</div>`;
        }

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Render MathJax for new messages
        if (window.MathJax && role === 'assistant') {
            this.rerenderMathJax();
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
            // Show welcome message
            messagesContainer.innerHTML = document.querySelector('.welcome-message').outerHTML;
            
            // Re-add event listeners for example chips
            messagesContainer.querySelectorAll('.example-chip').forEach(chip => {
                chip.addEventListener('click', (e) => {
                    const question = e.target.dataset.question;
                    document.getElementById('chat-input').value = question;
                    this.sendMessage();
                });
            });

            return;
        }

        messages.forEach(message => {
            this.addMessage(message.role, message.content);
        });
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
                }
            } catch (error) {
                console.error('Failed to delete conversation:', error);
                alert('Failed to delete conversation. Please try again.');
            }
        }
    }

    async exportChat() {
        if (!this.currentConversationId) {
            alert('No conversation to export.');
            return;
        }

        try {
            const response = await fetch(`/api/chat/messages/${this.currentConversationId}`);
            if (response.ok) {
                const data = await response.json();
                const messages = data.messages || [];
                
                let exportText = `ThetaMind Chat Export\n`;
                exportText += `Conversation: ${document.getElementById('current-chat-title').textContent}\n`;
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
            }
        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to export chat. Please try again.');
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

    updateSidebarVisibility() {
        const sidebar = document.querySelector('.chat-sidebar');
        if (this.isSidebarOpen) {
            sidebar.classList.add('open');
        } else {
            sidebar.classList.remove('open');
        }
    }

    rerenderMathJax() {
        if (window.MathJax && MathJax.typesetPromise) {
            MathJax.typesetPromise();
        }
    }

    // Utility functions
    md2html(md) {
        // Configure marked for math support
        marked.setOptions({
            breaks: true,
            gfm: true,
            sanitize: false // We'll use DOMPurify instead
        });

        const raw = marked.parse(md);
        const clean = DOMPurify.sanitize(raw);
        
        // Schedule MathJax rendering after the message is added
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