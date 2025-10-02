document.addEventListener('DOMContentLoaded', () => {
    updateUserStats();
});

async function updateUserStats() {
    const coinsContainer = document.getElementById('user-coins')?.querySelector('span');
    const badgesContainer = document.getElementById('user-badges');

    if (!coinsContainer || !badgesContainer) return;

    try {
        const response = await fetch('/api/get_user_stats');
        if (!response.ok) {
            coinsContainer.textContent = 'N/A';
            return;
        }
        const stats = await response.json();

        // Animate coin update
        const currentCoins = parseInt(coinsContainer.textContent) || 0;
        if (currentCoins !== stats.coins) {
            animateValue(coinsContainer, currentCoins, stats.coins, 500);
        } else {
            coinsContainer.textContent = stats.coins.toLocaleString();
        }

        badgesContainer.innerHTML = ''; // Clear old badges
        stats.badges.forEach(badgeId => {
            const badgeEl = document.createElement('i');
            badgeEl.className = `fas fa-medal badge`;
            badgeEl.title = `Badge: ${badgeId}`;
            badgeEl.style.color = getBadgeColor(badgeId);
            badgesContainer.appendChild(badgeEl);
        });

    } catch (error) {
        console.error("Failed to fetch user stats:", error);
        coinsContainer.textContent = 'Error';
    }
}

function getBadgeColor(badgeId) {
    const colors = {
        "Algebra Explorer": "#CD7F32", // Bronze
        "Algebra Adventurer": "#C0C0C0", // Silver  
        "Algebra Specialist": "#FFD700", // Gold
        "Algebra Expert": "#E5E4E2", // Platinum
        "Algebra Master": "#FF6B35", // Orange
        "Algebra Grand Master": "#9B59B6", // Purple
        "Foundation Master": "#4CAF50", // Green
        "Polynomial Prodigy": "#2196F3", // Blue
        "Quadratic Champion": "#E74C3C", // Red
        "Challenge Conqueror": "#F39C12", // Orange
        "Quick Starter": "#2ECC71" // Emerald
    };
    return colors[badgeId] || "#FFD700"; // Default to gold
}

function animateValue(element, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        element.textContent = Math.floor(progress * (end - start) + start).toLocaleString();
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}
