document.addEventListener('DOMContentLoaded', () => {
    const statsData = JSON.parse(document.getElementById('profile-data').textContent || '{}');

    initPreferences(statsData.preferences || {});
    loadCharts(statsData.charts || {});
    bindAvatarUpload();
});

function initPreferences(preferences) {
    const toggleGroups = document.querySelectorAll('.toggle-options');
    toggleGroups.forEach(group => {
        const field = group.dataset.field;
        group.querySelectorAll('button').forEach(btn => {
            if (btn.dataset.value === preferences[field]) {
                btn.classList.add('active');
            }
            btn.addEventListener('click', () => {
                group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    });

    document.querySelectorAll('.checkbox-item input').forEach(input => {
        const key = input.name;
        if (preferences[key]) {
            input.checked = true;
        }
    });

    const form = document.getElementById('ai-preferences-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = collectPreferences(form);
        try {
            const response = await fetch('/api/profile/preferences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                showToast('Preferences saved', 'success');
            } else {
                showToast('Failed to save preferences', 'error');
            }
        } catch (error) {
            console.error('Preferences update failed', error);
            showToast('An error occurred', 'error');
        }
    });
}

function collectPreferences(form) {
    const data = {};

    form.querySelectorAll('.toggle-options').forEach(group => {
        const active = group.querySelector('button.active');
        data[group.dataset.field] = active ? active.dataset.value : null;
    });

    form.querySelectorAll('.checkbox-item input').forEach(input => {
        data[input.name] = input.checked;
    });

    return data;
}

function bindAvatarUpload() {
    const changeBtn = document.getElementById('change-avatar');
    if (!changeBtn) return;

    changeBtn.addEventListener('click', () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('avatar', file);

            try {
                const response = await fetch('/api/profile/avatar', {
                    method: 'POST',
                    body: formData
                });
                if (response.ok) {
                    const { avatar_url } = await response.json();
                    document.querySelector('.profile-avatar').src = avatar_url;
                    showToast('Avatar updated', 'success');
                } else {
                    showToast('Failed to update avatar', 'error');
                }
            } catch (error) {
                console.error('Avatar upload failed', error);
                showToast('An error occurred', 'error');
            }
        });
        fileInput.click();
    });
}

function loadCharts(charts) {
    if (!window.Chart) return;

    const topicCtx = document.getElementById('topicProficiencyChart')?.getContext('2d');
    if (topicCtx && charts.topicProficiency) {
        new Chart(topicCtx, {
            type: 'radar',
            data: {
                labels: charts.topicProficiency.labels,
                datasets: [{
                    label: 'Proficiency',
                    data: charts.topicProficiency.values,
                    backgroundColor: 'rgba(0, 247, 255, 0.2)',
                    borderColor: 'rgba(0, 247, 255, 0.8)',
                    pointBackgroundColor: '#00f7ff'
                }]
            },
            options: {
                scales: {
                    r: {
                        angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        pointLabels: { color: '#e0e0e0' },
                        ticks: { display: false }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    const weekCtx = document.getElementById('weeklyProgressChart')?.getContext('2d');
    if (weekCtx && charts.weeklyProgress) {
        new Chart(weekCtx, {
            type: 'line',
            data: {
                labels: charts.weeklyProgress.labels,
                datasets: [{
                    data: charts.weeklyProgress.values,
                    borderColor: 'rgba(255, 0, 255, 0.8)',
                    backgroundColor: 'rgba(255, 0, 255, 0.15)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 4,
                    pointBackgroundColor: '#ff00ff'
                }]
            },
            options: {
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#e0e0e0' } },
                    y: { grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#e0e0e0' } }
                }
            }
        });
    }
}

function showToast(message, type = 'info') {
    let toast = document.createElement('div');
    toast.className = `profile-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 10);
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}
