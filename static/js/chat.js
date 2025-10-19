
class MathChat {
    constructor() {
        this.currentConversationId = null;
        this.conversations = [];
        this.isSidebarOpen = window.innerWidth > 768;
        this.currentImageData = null;
        this.isMobile = this.checkMobile();
        this.mathJaxLoaded = false;
        this.mathJaxQueue = [];
        this.maxWords = 2000;
        this.maxCharacters = 10000;
        this.maxImageSize = 30 * 1024 * 1024; // 30MB
        this.rateLimit = {
            messages: { count: 0, lastReset: Date.now(), limit: 50, window: 60000 }, // 50 messages per minute
            uploads: { count: 0, lastReset: Date.now(), limit: 10, window: 60000 } // 10 uploads per minute
        };
        this.suspiciousPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /eval\s*\(/gi,
            /document\./gi,
            /window\./gi,
            /alert\s*\(/gi,
            /fromCharCode/gi,
            /\\x[0-9a-f]{2}/gi,
            /%[0-9a-f]{2}/gi
        ];
        
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
        this.setupSecurityMonitoring();

        await this.waitForMathJax();
    }

    setupSecurityMonitoring() {
        // Monitor for suspicious activities
        this.setupInputSanitization();
        this.setupRateLimitMonitoring();
        this.setupErrorTracking();
    }

    setupInputSanitization() {
        const chatInput = document.getElementById('chat-input');
        
        // Input validation and sanitization
        chatInput.addEventListener('input', (e) => {
            this.sanitizeInput(e.target);
        });

        chatInput.addEventListener('paste', (e) => {
            this.handlePasteEvent(e);
        });
    }

    setupRateLimitMonitoring() {
        // Reset rate limits every minute
        setInterval(() => {
            const now = Date.now();
            Object.keys(this.rateLimit).forEach(key => {
                if (now - this.rateLimit[key].lastReset > this.rateLimit[key].window) {
                    this.rateLimit[key].count = 0;
                    this.rateLimit[key].lastReset = now;
                }
            });
        }, 10000); // Check every 10 seconds
    }

    setupErrorTracking() {
        window.addEventListener('error', (e) => {
            console.error('Global error:', e.error);
            this.logSecurityEvent('client_error', {
                message: e.message,
                filename: e.filename,
                lineno: e.lineno,
                colno: e.colno
            });
        });

        window.addEventListener('unhandledrejection', (e) => {
            console.error('Unhandled promise rejection:', e.reason);
            this.logSecurityEvent('promise_rejection', {
                reason: e.reason?.toString()
            });
        });
    }

    // Input validation and sanitization
    sanitizeInput(inputElement) {
        const value = inputElement.value;
        
        // Check for suspicious patterns
        if (this.detectSuspiciousPatterns(value)) {
            this.showSecurityWarning('Suspicious input detected. Please remove any scripts or malicious content.');
            inputElement.value = this.removeSuspiciousContent(value);
            return;
        }

        // Check character limit
        if (value.length > this.maxCharacters) {
            this.showError(`Message exceeds maximum character limit of ${this.maxCharacters}.`);
            inputElement.value = value.substring(0, this.maxCharacters);
            return;
        }

        // Check word limit in real-time
        const wordCount = this.countWords(value);
        if (wordCount > this.maxWords) {
            this.showError(`Message exceeds maximum word limit of ${this.maxWords}.`);
            // Truncate to max words
            inputElement.value = this.truncateToWords(value, this.maxWords);
        }
    }

    handlePasteEvent(e) {
        const clipboardData = e.clipboardData || window.clipboardData;
        const pastedText = clipboardData.getData('text');
        
        if (this.detectSuspiciousPatterns(pastedText)) {
            e.preventDefault();
            this.showSecurityWarning('Pasted content contains suspicious patterns and was blocked.');
            return;
        }

        // Check if paste would exceed limits
        const currentText = e.target.value;
        const newText = currentText + pastedText;
        
        if (newText.length > this.maxCharacters) {
            e.preventDefault();
            this.showError(`Pasting this content would exceed character limit.`);
            return;
        }

        const newWordCount = this.countWords(newText);
        if (newWordCount > this.maxWords) {
            e.preventDefault();
            this.showError(`Pasting this content would exceed word limit.`);
        }
    }

    detectSuspiciousPatterns(text) {
        return this.suspiciousPatterns.some(pattern => pattern.test(text));
    }

    removeSuspiciousContent(text) {
        let cleaned = text;
        this.suspiciousPatterns.forEach(pattern => {
            cleaned = cleaned.replace(pattern, '');
        });
        return cleaned;
    }

    countWords(text) {
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }

    truncateToWords(text, maxWords) {
        const words = text.trim().split(/\s+/);
        return words.slice(0, maxWords).join(' ');
    }

    // Enhanced image upload security
    handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Check if file is an image
        if (!file.type.startsWith('image/')) {
            this.showError('Please upload only image files (JPEG, PNG, etc.).');
            this.resetFileInputs();
            return;
        }

        // Check file size (max 30MB)
        if (file.size > this.maxImageSize) {
            this.showError(`Image size should be less than ${this.formatFileSize(this.maxImageSize)}.`);
            this.resetFileInputs();
            return;
        }

        // Check rate limit for uploads
        if (!this.checkRateLimit('uploads')) {
            this.showError('Too many uploads. Please wait a moment before uploading another image.');
            this.resetFileInputs();
            return;
        }

        // Validate image dimensions and type
        this.validateImageFile(file).then(isValid => {
            if (!isValid) {
                this.showError('Invalid image file. Please upload a valid image.');
                this.resetFileInputs();
                return;
            }

            const reader = new FileReader();
            
            reader.onload = (e) => {
                this.currentImageData = e.target.result;
                this.showOCRModal(e.target.result);
            };

            reader.onerror = () => {
                this.showError('Failed to read the image file. Please try again.');
                this.resetFileInputs();
            };

            reader.readAsDataURL(file);
            
        }).catch(error => {
            console.error('Image validation error:', error);
            this.showError('Error validating image. Please try again.');
            this.resetFileInputs();
        });
    }

    validateImageFile(file) {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            
            img.onload = () => {
                URL.revokeObjectURL(url);
                
                // Check image dimensions
                const maxDimension = 5000;
                if (img.width > maxDimension || img.height > maxDimension) {
                    resolve(false);
                    return;
                }
                
                // Check file type by magic numbers
                const reader = new FileReader();
                reader.onload = (e) => {
                    const arr = new Uint8Array(e.target.result).subarray(0, 4);
                    const header = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
                    
                    // Check for valid image headers
                    const validHeaders = {
                        '89504E47': 'png',  // PNG
                        'FFD8FF': 'jpg',    // JPEG
                        '47494638': 'gif',  // GIF
                        '52494646': 'webp'  // WEBP
                    };
                    
                    const isValid = Object.keys(validHeaders).some(h => header.startsWith(h));
                    resolve(isValid);
                };
                
                reader.onerror = () => resolve(false);
                reader.readAsArrayBuffer(file.slice(0, 4));
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(false);
            };
            
            img.src = url;
        });
    }

    resetFileInputs() {
        document.getElementById('gallery-upload').value = '';
        document.getElementById('camera-upload').value = '';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    setupMathJax() {
        // Only configure if MathJax hasn't been configured yet
        if (!window.MathJax) {
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
                    typeset: false,
                    pageReady: () => {
                        return Promise.resolve().then(() => {
                            console.log("MathJax is fully loaded and ready");
                            this.mathJaxLoaded = true;
                            // Process any queued render requests
                            this.processMathJaxQueue();
                            return window.MathJax.startup.defaultPageReady();
                        });
                    }
                }
            };
        }
    }

    async waitForMathJax() {
        return new Promise((resolve) => {
            const maxWaitTime = 10000; // 10 seconds max
            const startTime = Date.now();
            
            const checkMathJax = () => {
                if (window.MathJax && window.MathJax.typeset) {
                    console.log("MathJax is ready");
                    this.mathJaxLoaded = true;
                    this.processMathJaxQueue();
                    resolve();
                } else if (Date.now() - startTime > maxWaitTime) {
                    console.warn("MathJax loading timeout");
                    resolve(); // Resolve anyway to avoid blocking
                } else {
                    setTimeout(checkMathJax, 100);
                }
            };

            // Also listen for the MathJax script load event
            const mathJaxScript = document.getElementById('MathJax-script');
            if (mathJaxScript) {
                mathJaxScript.addEventListener('load', () => {
                    console.log("MathJax script loaded");
                    setTimeout(checkMathJax, 100);
                });
            }

            checkMathJax();
        });
    }

    processMathJaxQueue() {
        if (this.mathJaxLoaded && this.mathJaxQueue.length > 0) {
            console.log(`Processing ${this.mathJaxQueue.length} queued MathJax renders`);
            this.mathJaxQueue.forEach(task => {
                setTimeout(() => this.rerenderMathJax(task.element), task.delay);
            });
            this.mathJaxQueue = [];
        }
    }

    queueMathJaxRender(element = null, delay = 100) {
        this.mathJaxQueue.push({ element, delay });
        if (this.mathJaxLoaded) {
            this.processMathJaxQueue();
        }
    }

    rerenderMathJax(targetElement = null) {
        if (!this.mathJaxLoaded) {
            console.log("MathJax not loaded yet, queuing render request");
            this.queueMathJaxRender(targetElement, 100);
            return;
        }

        if (window.MathJax && window.MathJax.typeset) {
            console.log("Rerendering MathJax (v3.x)...");
            
            try {
                const elements = targetElement ? [targetElement] : [document.body];
                window.MathJax.typeset(elements);
            } catch (e) {
                console.error("MathJax v3 Typeset error:", e);
                // Try alternative method
                this.fallbackMathJaxRender();
            }
        } else {
            console.warn("MathJax.typeset is not available.");
            this.fallbackMathJaxRender();
        }
    }

    fallbackMathJaxRender() {
        // Alternative rendering methods
        if (window.MathJax && window.MathJax.tex2chtml) {
            console.log("Using fallback MathJax rendering");
            // You could implement manual rendering here if needed
        }
        
        // If KaTeX is available, use it as backup
        if (window.renderMathInElement) {
            console.log("Using KaTeX as fallback");
            window.renderMathInElement(document.body, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\(', right: '\\)', display: false},
                    {left: '\\[', right: '\\]', display: true}
                ]
            });
        }
    }

    optimizeMathJaxForMobile() {
        if (this.isMobile && window.MathJax) {
            // Reduce scale for mobile
            window.MathJax.options.scale = 0.75;
        }
    }

    // Update the addMessage method to use the new queue system
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

        console.log(content);
        console.log(this.md2html(content));
        
        if (role === 'assistant') {
            messageDiv.innerHTML = `<div class="message-content">${this.md2html(content)}</div>`;
        } else {
            messageDiv.innerHTML = `<div class="message-content">${this.md2html(content)}</div>`;
            this.queueMathJaxRender(messageDiv, 150);
        }
    
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
        // Use the queue system for MathJax rendering
        if (role === 'assistant') {
            this.queueMathJaxRender(messageDiv, 150);
            // Additional render after a longer delay for complex content
            this.queueMathJaxRender(messageDiv, 1000);
        }
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
                // extractedText = extractedText.replace(/\\/g, '\\\\');
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
        let message = input.value.trim();

        if (!message) {
            this.showError('Please enter a message first.');
            return;
        }

        // Final security checks before sending
        if (this.detectSuspiciousPatterns(message)) {
            this.showSecurityWarning('Message contains suspicious content and cannot be sent.');
            return;
        }

        const messageWordCount = this.countWords(message);
        if (messageWordCount > this.maxWords) {
            this.showError(`Message exceeds maximum word limit of ${this.maxWords}.`);
            return;
        }

        if (message.length > this.maxCharacters) {
            this.showError(`Message exceeds maximum character limit of ${this.maxCharacters}.`);
            return;
        }

        // Check rate limit
        if (!this.checkRateLimit('messages')) {
            this.showError('Too many messages sent. Please wait a moment before sending another message.');
            return;
        }

        // Clear input and reset height
        input.value = '';
        input.style.height = 'auto';

        // Add user message to chat (with sanitized content)
        this.addMessage('user', message);

        // Show typing indicator
        this.showTypingIndicator();

        console.log(message);

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

            // Check for HTTP errors
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            // Validate response data
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid response from server');
            }

            // Remove typing indicator
            this.removeTypingIndicator();

            // Add AI response with security check
            if (data.response && typeof data.response === 'string') {
                this.addMessage('assistant', data.response);
            } else {
                throw new Error('Invalid response format');
            }
            
            // Update current conversation ID if this was a new chat
            if (!this.currentConversationId && data.conversation_id) {
                this.currentConversationId = data.conversation_id;
                await this.loadConversations();
                this.updateChatTitle();
            }

        } catch (error) {
            console.error('Error sending message:', error);
            this.removeTypingIndicator();
            this.logSecurityEvent('api_error', { error: error.message });
            this.addMessage('assistant', `I'm sorry, I encountered an error: ${this.sanitizeError(error.message)}. Please try again.`);
        }
    }

    sendOCRMessage(text) {
        // Security check for OCR text
        if (this.detectSuspiciousPatterns(text)) {
            this.showSecurityWarning('Extracted text contains suspicious content and cannot be sent.');
            return;
        }

        const wordCount = this.countWords(text);
        if (wordCount > this.maxWords) {
            this.showError(`Extracted text exceeds maximum word limit of ${this.maxWords}.`);
            return;
        }

        if (text.length > this.maxCharacters) {
            this.showError(`Extracted text exceeds maximum character limit of ${this.maxCharacters}.`);
            return;
        }

        document.getElementById('chat-input').value = text;
        this.sendMessage();
    }
    
    checkRateLimit(type) {
        const limit = this.rateLimit[type];
        if (!limit) return true;

        const now = Date.now();
        if (now - limit.lastReset > limit.window) {
            limit.count = 0;
            limit.lastReset = now;
        }

        if (limit.count >= limit.limit) {
            return false;
        }

        limit.count++;
        return true;
    }

    // Security logging
    logSecurityEvent(type, data) {
        const event = {
            type,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            currentConversation: this.currentConversationId,
            ...data
        };

        // Send to server for logging
        this.sendSecurityLog(event).catch(() => {
            // Fallback to console if server logging fails
            console.warn('Security event:', event);
        });
    }

    async sendSecurityLog(event) {
        try {
            await fetch('/api/security/log', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(event)
            });
        } catch (error) {
            console.error('Failed to send security log:', error);
        }
    }

    // Enhanced error handling
    sanitizeError(error) {
        // Remove any potentially sensitive information from errors
        return error.replace(/at .*?\(.*?\)/g, '')
                   .replace(/\s+/g, ' ')
                   .trim()
                   .substring(0, 200); // Limit error length
    }

    showSecurityWarning(message) {
        const warningDiv = document.createElement('div');
        warningDiv.className = 'security-warning';
        warningDiv.innerHTML = `
            <div class="warning-content">
                <i class="fas fa-shield-alt"></i>
                <span>${this.escapeHtml(message)}</span>
            </div>
        `;
        
        document.body.appendChild(warningDiv);
        
        setTimeout(() => {
            if (warningDiv.parentNode) {
                warningDiv.parentNode.removeChild(warningDiv);
            }
        }, 5000);
    }

    fixLatex(content) {
        // Replace escaped block math with correct format
        return content.replace(/\\\[([^\]]+)\\\]/g, '\\[$1\\]')
                    .replace(/\\\(([^\)]+)\\\)/g, '\\($1\\)');
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

            // Check maximum words
            const wordCount = result.text.split(/\s+/).length;
            
            
    
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

        console.log(content);

        // Fix LaTeX content for MathJax
        const fixedContent = this.fixLatex(content);
        
        console.log(fixedContent);
        console.log(this.md2html(fixedContent));
        
        if (role === 'assistant') {
            messageDiv.innerHTML = `<div class="message-content">${this.md2html(fixedContent)}</div>`;
        } else {
            messageDiv.innerHTML = `<div class="message-content">${this.md2html(fixedContent)}</div>`;
            this.queueMathJaxRender(messageDiv, 150);
        }

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Use the queue system for MathJax rendering
        if (role === 'assistant') {
            this.queueMathJaxRender(messageDiv, 150);
            // Additional render after a longer delay for complex content
            this.queueMathJaxRender(messageDiv, 1000);
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
            // messagesContainer.querySelectorAll('.example-chip').forEach(chip => {
            //     chip.addEventListener('click', (e) => {
            //         const question = e.target.dataset.question;
            //         document.getElementById('chat-input').value = question;
            //         this.sendMessage();
            //     });
            // });
    
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
        // Additional sanitization before processing
        const sanitizedMd = this.removeSuspiciousContent(md);
        
        marked.setOptions({
            breaks: true,
            gfm: true,
            sanitize: false // We'll use DOMPurify instead
        });

        const raw = marked.parse(sanitizedMd);
        const clean = DOMPurify.sanitize(raw, {
            ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'span', 'div', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
            ALLOWED_ATTR: ['class', 'style'],
            FORBID_ATTR: ['onclick', 'onload', 'onerror']
        });
        
        this.queueMathJaxRender(null, 100);
        
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