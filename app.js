// State Management
let state = {
    releases: [],
    selectedIds: new Set(),
    activeCategory: 'all',
    searchQuery: '',
    lastUpdated: null
};

// DOM Elements
const elements = {
    refreshBtn: document.getElementById('btn-refresh'),
    refreshIcon: document.getElementById('refresh-icon'),
    lastUpdatedText: document.getElementById('last-updated-text'),
    searchInput: document.getElementById('search-input'),
    searchClearBtn: document.getElementById('search-clear-btn'),
    categoryFilters: document.getElementById('category-filters'),
    releasesGrid: document.getElementById('releases-grid'),
    loadingState: document.getElementById('loading-state'),
    errorState: document.getElementById('error-state'),
    errorMessage: document.getElementById('error-message'),
    emptyState: document.getElementById('empty-state'),
    btnRetry: document.getElementById('btn-retry'),
    btnClearSearch: document.getElementById('btn-clear-search'),
    
    // Floating Selection Bar
    selectionBar: document.getElementById('selection-bar'),
    selectionCount: document.getElementById('selection-count'),
    btnClearSelection: document.getElementById('btn-clear-selection'),
    btnTweetMulti: document.getElementById('btn-tweet-multi'),
    
    // Modal
    tweetModal: document.getElementById('tweet-modal'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    charCounter: document.getElementById('char-counter'),
    charWarningMsg: document.getElementById('char-warning-msg'),
    btnPublishTweet: document.getElementById('btn-publish-tweet'),
    styleBtnSummary: document.getElementById('style-btn-summary'),
    styleBtnThread: document.getElementById('style-btn-thread')
};

// Active Tweet Modal Configuration
let tweetModalConfig = {
    style: 'summary', // 'summary' or 'thread'
    targetIds: [] // IDs of releases to tweet
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    fetchReleases();
    setupEventListeners();
});

// Setup Events
function setupEventListeners() {
    // Refresh click
    elements.refreshBtn.addEventListener('click', () => fetchReleases(true));
    elements.btnRetry.addEventListener('click', () => fetchReleases(true));
    
    // Search inputs
    elements.searchInput.addEventListener('input', handleSearch);
    elements.searchClearBtn.addEventListener('click', clearSearch);
    elements.btnClearSearch.addEventListener('click', () => {
        clearSearch();
        setCategoryFilter('all');
    });
    
    // Category pills
    elements.categoryFilters.addEventListener('click', (e) => {
        const pill = e.target.closest('.filter-pill');
        if (pill) {
            const category = pill.dataset.category;
            setCategoryFilter(category);
        }
    });
    
    // Floating bar events
    elements.btnClearSelection.addEventListener('click', clearSelection);
    elements.btnTweetMulti.addEventListener('click', openMultiTweetModal);
    
    // Modal events
    elements.modalCloseBtn.addEventListener('click', closeTweetModal);
    elements.modalCancelBtn.addEventListener('click', closeTweetModal);
    elements.tweetTextarea.addEventListener('input', updateCharCounter);
    elements.btnPublishTweet.addEventListener('click', publishTweet);
    
    // Tweet style selector
    elements.styleBtnSummary.addEventListener('click', () => setTweetStyle('summary'));
    elements.styleBtnThread.addEventListener('click', () => setTweetStyle('thread'));
    
    // Close modal on clicking overlay
    elements.tweetModal.addEventListener('click', (e) => {
        if (e.target === elements.tweetModal) closeTweetModal();
    });
}

// Fetch releases from API
async function fetchReleases(forceRefresh = false) {
    showLoading();
    setRefreshIconState(true);
    
    try {
        const url = forceRefresh ? '/api/releases?refresh=true' : '/api/releases';
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Server returned HTTP status ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        state.releases = data.releases;
        state.lastUpdated = data.last_updated;
        
        // If there was a warning (e.g. failed to refresh but returned cache), log it
        if (data.warning) {
            console.warn(data.warning);
        }
        
        updateLastUpdatedText(state.lastUpdated);
        renderFeed();
        
    } catch (error) {
        showError(error.message);
    } finally {
        setRefreshIconState(false);
    }
}

// Toggle Refresh Button Spinner Class
function setRefreshIconState(isSpinning) {
    if (isSpinning) {
        elements.refreshIcon.classList.add('spinning');
        elements.refreshBtn.disabled = true;
    } else {
        elements.refreshIcon.classList.remove('spinning');
        elements.refreshBtn.disabled = false;
    }
}

// Format Last Updated Text
function updateLastUpdatedText(timestamp) {
    if (!timestamp) {
        elements.lastUpdatedText.textContent = "Never updated";
        return;
    }
    
    const date = new Date(timestamp * 1000);
    const options = { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    };
    elements.lastUpdatedText.textContent = `Last updated: ${date.toLocaleDateString(undefined, options)}`;
}

// Render the feed based on current filters and search
function renderFeed() {
    // Filter by Category and Search Query
    const filtered = state.releases.filter(release => {
        const matchesCategory = state.activeCategory === 'all' || 
                                release.category.toLowerCase() === state.activeCategory.toLowerCase();
        
        const textToSearch = `${release.title} ${release.content}`.toLowerCase();
        const matchesSearch = textToSearch.includes(state.searchQuery.toLowerCase());
        
        return matchesCategory && matchesSearch;
    });
    
    // Hide all states
    elements.loadingState.style.display = 'none';
    elements.errorState.style.display = 'none';
    elements.emptyState.style.display = 'none';
    elements.releasesGrid.style.display = 'grid';
    
    if (filtered.length === 0) {
        elements.releasesGrid.style.display = 'none';
        elements.emptyState.style.display = 'flex';
        return;
    }
    
    elements.releasesGrid.innerHTML = '';
    
    filtered.forEach((release, index) => {
        const isSelected = state.selectedIds.has(release.id);
        const card = document.createElement('div');
        card.className = `release-card ${isSelected ? 'selected' : ''}`;
        card.dataset.id = release.id;
        card.style.animationDelay = `${index * 0.05}s`;
        
        // Define badge CSS class mapping
        const badgeClass = getBadgeClass(release.category);
        
        card.innerHTML = `
            <div class="card-top">
                <div class="card-meta">
                    <span class="badge ${badgeClass}">${release.category}</span>
                    <span class="card-date">${release.date}</span>
                </div>
                <div class="select-wrapper">
                    <div class="checkbox-custom">
                        <i class="fa-solid fa-check"></i>
                    </div>
                </div>
            </div>
            <div class="card-body">
                <h3><a href="${release.link}" target="_blank" class="card-title-link">${release.title}</a></h3>
                <div class="card-content">${release.content}</div>
            </div>
            <div class="card-actions">
                <a href="${release.link}" target="_blank" class="link-original">
                    Original Post <i class="fa-solid fa-arrow-up-right-from-square"></i>
                </a>
                <div class="card-actions-right">
                    <button class="btn-card-action btn-tweet-card" title="Tweet this update">
                        <i class="fa-brands fa-x-twitter"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Card Body / Selection Toggle Event
        card.addEventListener('click', (e) => {
            // Prevent selection trigger when clicking links or button icons
            if (e.target.closest('a') || e.target.closest('.btn-card-action')) {
                return;
            }
            toggleCardSelection(release.id);
        });
        
        // Tweet button event
        const tweetBtn = card.querySelector('.btn-tweet-card');
        tweetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openSingleTweetModal(release);
        });
        
        elements.releasesGrid.appendChild(card);
    });
}

// Category Pill Badge Class Helper
function getBadgeClass(category) {
    switch(category.toLowerCase()) {
        case 'feature': return 'feat';
        case 'change': return 'chg';
        case 'fix': return 'fix';
        case 'deprecation': return 'dep';
        case 'announcement': return 'ann';
        default: return 'gen';
    }
}

// Manage States UI
function showLoading() {
    elements.loadingState.style.display = 'flex';
    elements.releasesGrid.style.display = 'none';
    elements.errorState.style.display = 'none';
    elements.emptyState.style.display = 'none';
}

function showError(msg) {
    elements.errorMessage.textContent = msg;
    elements.errorState.style.display = 'flex';
    elements.releasesGrid.style.display = 'none';
    elements.loadingState.style.display = 'none';
    elements.emptyState.style.display = 'none';
}

// Filters logic
function handleSearch(e) {
    state.searchQuery = e.target.value;
    
    if (state.searchQuery.length > 0) {
        elements.searchClearBtn.style.display = 'flex';
    } else {
        elements.searchClearBtn.style.display = 'none';
    }
    
    renderFeed();
}

function clearSearch() {
    elements.searchInput.value = '';
    state.searchQuery = '';
    elements.searchClearBtn.style.display = 'none';
    renderFeed();
}

function setCategoryFilter(category) {
    state.activeCategory = category;
    
    // Update pills active state
    const pills = elements.categoryFilters.querySelectorAll('.filter-pill');
    pills.forEach(pill => {
        if (pill.dataset.category === category) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });
    
    renderFeed();
}

// Selection Logic
function toggleCardSelection(id) {
    if (state.selectedIds.has(id)) {
        state.selectedIds.delete(id);
    } else {
        state.selectedIds.add(id);
    }
    
    // Visual update of card status
    const card = elements.releasesGrid.querySelector(`.release-card[data-id="${id}"]`);
    if (card) {
        card.classList.toggle('selected');
    }
    
    updateSelectionBar();
}

function clearSelection() {
    state.selectedIds.clear();
    
    // Visual update for all cards
    const cards = elements.releasesGrid.querySelectorAll('.release-card');
    cards.forEach(card => card.classList.remove('selected'));
    
    updateSelectionBar();
}

function updateSelectionBar() {
    const count = state.selectedIds.size;
    elements.selectionCount.textContent = `${count} update${count !== 1 ? 's' : ''} selected`;
    
    if (count > 0) {
        elements.selectionBar.classList.add('show');
    } else {
        elements.selectionBar.classList.remove('show');
    }
}

// Modal and Tweeting Logic
function openSingleTweetModal(release) {
    tweetModalConfig.style = 'summary';
    tweetModalConfig.targetIds = [release.id];
    
    // Hide thread button for single tweets
    elements.styleBtnThread.style.display = 'none';
    elements.styleBtnSummary.classList.add('active');
    
    generateTweetDraft();
    elements.tweetModal.classList.add('show');
}

function openMultiTweetModal() {
    if (state.selectedIds.size === 0) return;
    
    tweetModalConfig.targetIds = Array.from(state.selectedIds);
    
    if (state.selectedIds.size > 1) {
        elements.styleBtnThread.style.display = 'flex';
        // Default to thread if multiple items are selected
        setTweetStyle('thread');
    } else {
        elements.styleBtnThread.style.display = 'none';
        setTweetStyle('summary');
    }
    
    elements.tweetModal.classList.add('show');
}

function closeTweetModal() {
    elements.tweetModal.classList.remove('show');
}

function setTweetStyle(style) {
    tweetModalConfig.style = style;
    
    if (style === 'summary') {
        elements.styleBtnSummary.classList.add('active');
        elements.styleBtnThread.classList.remove('active');
    } else {
        elements.styleBtnThread.classList.add('active');
        elements.styleBtnSummary.classList.remove('active');
    }
    
    generateTweetDraft();
}

// Parse HTML contents into plain text
function cleanHtml(html) {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    
    // Handle specific linebreaks
    let text = temp.innerHTML
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/li>/gi, '\n');
        
    temp.innerHTML = text;
    let cleanText = temp.textContent || temp.innerText || "";
    
    // Normalize extra whitespace
    return cleanText.trim().replace(/\n{3,}/g, '\n\n');
}

// Generate Tweet Text Draft
function generateTweetDraft() {
    const selectedReleases = state.releases.filter(r => 
        tweetModalConfig.targetIds.includes(r.id)
    );
    
    if (selectedReleases.length === 0) return;
    
    let draft = '';
    
    if (tweetModalConfig.style === 'summary' || selectedReleases.length === 1) {
        if (selectedReleases.length === 1) {
            const release = selectedReleases[0];
            const cleanBody = cleanHtml(release.content);
            const bodyLimit = 150;
            let truncatedBody = cleanBody;
            if (cleanBody.length > bodyLimit) {
                truncatedBody = cleanBody.substring(0, bodyLimit).trim() + '...';
            }
            
            draft = `📢 BigQuery Update: ${release.title}\n\n${truncatedBody}\n\n🔗 Read details: ${release.link}\n\n#BigQuery #GCP #DataEngineering`;
        } else {
            // Summary of multiple
            draft = `📢 New BigQuery Release Updates:\n\n`;
            selectedReleases.forEach((release) => {
                draft += `• ${release.title}\n`;
            });
            draft += `\n🔗 Full release notes:\nhttps://cloud.google.com/bigquery/docs/release-notes\n\n#BigQuery #GCP #DataEngineering`;
        }
    } else {
        // Thread Style (for multiple selected items)
        draft = `🧵 BigQuery Updates Thread (1/${selectedReleases.length + 1})\n\nHere are the latest BigQuery updates you should know about. Let's dive in 👇\n\n#BigQuery #GCP #DataEngineering\n\n---`;
        
        selectedReleases.forEach((release, index) => {
            const cleanBody = cleanHtml(release.content);
            const bodyLimit = 130;
            let truncatedBody = cleanBody;
            if (cleanBody.length > bodyLimit) {
                truncatedBody = cleanBody.substring(0, bodyLimit).trim() + '...';
            }
            
            draft += `\n\n(${index + 2}/${selectedReleases.length + 1}) ${release.title}\n\n${truncatedBody}\n\n🔗 ${release.link}\n\n---`;
        });
        
        // Remove trailing divider
        draft = draft.replace(/\n\n---$/, '');
    }
    
    elements.tweetTextarea.value = draft;
    updateCharCounter();
}

// Character Limit & Counter Update
function updateCharCounter() {
    const text = elements.tweetTextarea.value;
    const length = text.length;
    
    // X handles thread formats differently. If there are thread dividers, check character counts of individual sections
    if (text.includes('---')) {
        const segments = text.split('---');
        let maxLen = 0;
        segments.forEach(seg => {
            if (seg.trim().length > maxLen) {
                maxLen = seg.trim().length;
            }
        });
        
        elements.charCounter.textContent = `${maxLen} / 280 (max segment)`;
        
        if (maxLen > 280) {
            elements.charCounter.className = 'char-count-badge danger';
            elements.charWarningMsg.style.display = 'inline-flex';
            elements.charWarningMsg.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> A thread segment exceeds 280 chars!';
        } else if (maxLen > 250) {
            elements.charCounter.className = 'char-count-badge warning';
            elements.charWarningMsg.style.display = 'none';
        } else {
            elements.charCounter.className = 'char-count-badge';
            elements.charWarningMsg.style.display = 'none';
        }
    } else {
        elements.charCounter.textContent = `${length} / 280`;
        
        if (length > 280) {
            elements.charCounter.className = 'char-count-badge danger';
            elements.charWarningMsg.style.display = 'inline-flex';
            elements.charWarningMsg.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Exceeds standard X limits (280 chars)';
        } else if (length > 250) {
            elements.charCounter.className = 'char-count-badge warning';
            elements.charWarningMsg.style.display = 'none';
        } else {
            elements.charCounter.className = 'char-count-badge';
            elements.charWarningMsg.style.display = 'none';
        }
    }
}

// Publish Tweet via Twitter Intent
function publishTweet() {
    const text = elements.tweetTextarea.value;
    
    if (!text.trim()) return;
    
    let tweetUrl = '';
    
    if (text.includes('---')) {
        // If it's a thread, let's open the first tweet in Twitter and copy the full text to clipboard
        // so the user can easily create their thread
        const segments = text.split('---');
        const firstTweetText = segments[0].trim();
        
        navigator.clipboard.writeText(text).then(() => {
            alert("📋 The entire thread content has been copied to your clipboard! We'll open Twitter now so you can write and paste your thread.");
            tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(firstTweetText)}`;
            window.open(tweetUrl, '_blank');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            // Fallback: open Twitter with first tweet anyway
            tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(firstTweetText)}`;
            window.open(tweetUrl, '_blank');
        });
    } else {
        tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(tweetUrl, '_blank');
    }
    
    closeTweetModal();
}
