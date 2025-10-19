// Forum functionality
class ThetaMindForum {
    constructor() {
        this.currentCategory = 'all';
        this.currentSort = 'recent';
        this.currentSearch = '';
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadThreads();
        this.renderCategories();
    }

    bindEvents() {
        // Category filter
        document.getElementById('category-filter').addEventListener('change', (e) => {
            this.currentCategory = e.target.value;
            this.loadThreads();
        });

        // Sort filter
        document.getElementById('sort-filter').addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.loadThreads();
        });

        // Search
        const searchInput = document.getElementById('search-input');
        const searchBtn = document.querySelector('.search-btn');
        
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.currentSearch = e.target.value;
                this.loadThreads();
            }, 500);
        });

        searchBtn.addEventListener('click', () => {
            this.currentSearch = searchInput.value;
            this.loadThreads();
        });

        // Category cards
        document.querySelectorAll('.category-card').forEach(card => {
            card.addEventListener('click', () => {
                const category = card.dataset.category;
                document.getElementById('category-filter').value = category;
                this.currentCategory = category;
                this.loadThreads();
            });
        });

        // New thread form
        const newThreadForm = document.getElementById('new-thread-form');
        if (newThreadForm) {
            newThreadForm.addEventListener('submit', (e) => this.handleNewThread(e));
        }
    }

    async loadThreads() {
        const spinner = document.getElementById('loading-spinner');
        const threadsList = document.getElementById('threads-list');
        
        spinner.style.display = 'block';
        threadsList.innerHTML = '';

        try {
            const params = new URLSearchParams({
                category: this.currentCategory,
                sort: this.currentSort,
                ...(this.currentSearch && { search: this.currentSearch })
            });

            const response = await fetch(`/api/forum/threads?${params}`);
            const data = await response.json();

            spinner.style.display = 'none';
            this.renderThreads(data.threads);
        } catch (error) {
            console.error('Error loading threads:', error);
            spinner.style.display = 'none';
            threadsList.innerHTML = `
                <div class="no-threads">
                    <i class="fas fa-exclamation-triangle fa-3x"></i>
                    <h3>Error loading threads</h3>
                    <p>Please try again later.</p>
                </div>
            `;
        }
    }

    renderThreads(threads) {
        const threadsList = document.getElementById('threads-list');
        
        if (threads.length === 0) {
            threadsList.innerHTML = `
                <div class="no-threads">
                    <i class="fas fa-comments fa-3x"></i>
                    <h3>No threads found</h3>
                    <p>Be the first to start a discussion in this category!</p>
                    <button class="btn btn-primary" onclick="openNewThreadModal()">
                        <i class="fas fa-plus"></i> Start New Thread
                    </button>
                </div>
            `;
            return;
        }

        threadsList.innerHTML = threads.map(thread => `
            <div class="thread-item ${thread.is_pinned ? 'pinned' : ''}">
                ${thread.is_pinned ? '<div class="thread-pin-indicator"><i class="fas fa-thumbtack"></i> Pinned</div>' : ''}
                <div class="thread-main">
                    <div class="thread-title-section">
                        <h3 class="thread-title">
                            <a href="/forum/thread/${thread.id}">${this.escapeHtml(thread.title)}</a>
                        </h3>
                        <div class="thread-preview">
                            ${this.escapeHtml(thread.content.substring(0, 150))}...
                        </div>
                    </div>
                    <div class="thread-meta">
                        <span class="category-tag" style="background: ${thread.category_color}20; border-color: ${thread.category_color}; color: ${thread.category_color};">
                            ${thread.category_name}
                        </span>
                        ${thread.reply_count === 0 ? '<span class="unanswered-indicator">Unanswered</span>' : ''}
                    </div>
                </div>
                <div class="thread-stats">
                    <div class="stat">
                        <i class="fas fa-eye"></i>
                        <span>${thread.view_count}</span>
                    </div>
                    <div class="stat">
                        <i class="fas fa-comment"></i>
                        <span>${thread.reply_count}</span>
                    </div>
                    <div class="stat">
                        <i class="fas fa-heart"></i>
                        <span>0</span>
                    </div>
                </div>
                <div class="thread-author">
                    <div class="author-avatar">
                        ${thread.avatar_url ? 
                            `<img src="${thread.avatar_url}" alt="${thread.username}">` : 
                            `<i class="fas fa-user"></i>`
                        }
                    </div>
                    <div class="author-info">
                        <span class="author-name">${thread.username}</span>
                        <span class="thread-date">${new Date(thread.created_at).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderCategories() {
        // This would be populated from server data
        // For now, it uses the static HTML
    }

    async handleNewThread(e) {
        e.preventDefault();
        
        const form = e.target;
        const formData = new FormData(form);
        
        const threadData = {
            title: formData.get('title'),
            content: formData.get('content'),
            category_id: parseInt(formData.get('category'))
        };

        try {
            const response = await fetch('/api/forum/threads', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(threadData)
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('Thread created successfully!', 'success');
                closeNewThreadModal();
                this.loadThreads();
                // Redirect to new thread
                window.location.href = `/forum/thread/${result.thread_id}`;
            } else {
                this.showNotification('Error creating thread', 'error');
            }
        } catch (error) {
            console.error('Error creating thread:', error);
            this.showNotification('Error creating thread', 'error');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `forum-notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : 'info'}-circle"></i>
                <span>${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;

        document.body.appendChild(notification);

        // Auto remove after 5 seconds
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 5000);

        // Close button
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        });
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// Modal functions
function openNewThreadModal() {
    document.getElementById('new-thread-modal').style.display = 'block';
}

function closeNewThreadModal() {
    document.getElementById('new-thread-modal').style.display = 'none';
    document.getElementById('new-thread-form').reset();
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    const modal = document.getElementById('new-thread-modal');
    if (e.target === modal) {
        closeNewThreadModal();
    }
});

// Initialize forum when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.forum = new ThetaMindForum();
});