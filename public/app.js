// app.js - Frontend JavaScript for IndexRapidly
let currentUser = null;
let authToken = null;
let currentPage = 1;
let selectedPackage = null;

document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
});

function initializeApp() {
    authToken = localStorage.getItem('token');
    if (authToken) {
        try {
            const payload = JSON.parse(atob(authToken.split('.')[1]));
            if (payload.exp * 1000 > Date.now()) {
                currentUser = payload;
                showDashboard();
                loadDashboardData();
            } else {
                logout();
            }
        } catch (e) {
            logout();
        }
    }
}

function setupEventListeners() {
    // Auth tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            const targetTab = this.dataset.tab;
            document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
            document.getElementById(`${targetTab}-form`).classList.remove('hidden');
        });
    });
    
    // Forms
    const loginForm = document.getElementById('login-form-element');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    
    const registerForm = document.getElementById('register-form-element');
    if (registerForm) registerForm.addEventListener('submit', handleRegister);
    
    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    
    // URL input
    const urlInput = document.getElementById('url-input');
    if (urlInput) urlInput.addEventListener('input', updateUrlCount);
    
    // Clear URLs
    const clearBtn = document.getElementById('clear-urls');
    if (clearBtn) clearBtn.addEventListener('click', () => {
        document.getElementById('url-input').value = '';
        updateUrlCount();
    });
    
    // Schedule type
    const scheduleType = document.getElementById('schedule-type');
    if (scheduleType) {
        scheduleType.addEventListener('change', function() {
            const timeContainer = document.getElementById('schedule-time-container');
            if (this.value === 'scheduled') {
                timeContainer.classList.remove('hidden');
                const minTime = new Date(Date.now() + 3600000);
                document.getElementById('schedule-time').min = minTime.toISOString().slice(0, 16);
            } else {
                timeContainer.classList.add('hidden');
            }
        });
    }
    
    // Submit URLs
    const submitBtn = document.getElementById('submit-urls-btn');
    if (submitBtn) submitBtn.addEventListener('click', handleUrlSubmission);
    
    // Refresh history
    const refreshBtn = document.getElementById('refresh-history');
    if (refreshBtn) refreshBtn.addEventListener('click', () => loadSubmissionHistory(1));
    
    // Pagination
    document.getElementById('prev-page')?.addEventListener('click', () => {
        if (currentPage > 1) loadSubmissionHistory(currentPage - 1);
    });
    document.getElementById('next-page')?.addEventListener('click', () => {
        loadSubmissionHistory(currentPage + 1);
    });
    
    // Payment modal
    document.getElementById('close-payment-modal')?.addEventListener('click', closePaymentModal);
    document.getElementById('crypto-type')?.addEventListener('change', updatePaymentDetails);
    document.getElementById('copy-address')?.addEventListener('click', copyPaymentAddress);
    document.getElementById('confirm-payment-btn')?.addEventListener('click', confirmPayment);
    
    // Close modal on outside click
    window.onclick = function(event) {
        if (event.target === document.getElementById('payment-modal')) {
            closePaymentModal();
        }
    };
}

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('token', authToken);
            showDashboard();
            loadDashboardData();
            showToast('Login successful!', 'success');
        } else {
            showToast(data.error || 'Login failed', 'error');
        }
    } catch (error) {
        showToast('Network error', 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('token', authToken);
            showDashboard();
            loadDashboardData();
            showToast('Registration successful!', 'success');
        } else {
            showToast(data.error || 'Registration failed', 'error');
        }
    } catch (error) {
        showToast('Network error', 'error');
    }
}

function logout() {
    localStorage.removeItem('token');
    authToken = null;
    currentUser = null;
    document.getElementById('auth-section').classList.remove('hidden');
    document.getElementById('dashboard-content').classList.add('hidden');
    showToast('Logged out', 'info');
}

function showDashboard() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('dashboard-content').classList.remove('hidden');
    if (currentUser) {
        document.getElementById('user-display').textContent = currentUser.username;
    }
}

async function loadDashboardData() {
    if (!authToken) return;
    await Promise.all([loadUserProfile(), loadPackages(), loadSubmissionHistory(1)]);
}

async function loadUserProfile() {
    try {
        const response = await fetch('/api/user/profile', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            const user = await response.json();
            currentUser = user;
            document.getElementById('credits-count').textContent = user.credits_balance;
            document.getElementById('stats-credits').textContent = user.credits_balance;
            document.getElementById('credits-display').classList.remove('hidden');
            updateUrlCount();
        } else if (response.status === 401) {
            logout();
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

async function loadPackages() {
    try {
        const response = await fetch('/api/packages', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            const packages = await response.json();
            displayPackages(packages);
        }
    } catch (error) {
        console.error('Error loading packages:', error);
    }
}

function displayPackages(packages) {
    const container = document.getElementById('package-cards');
    if (!container) return;
    
    container.innerHTML = packages.map(pkg => `
        <div class="border-2 border-gray-200 rounded-lg p-4 hover:border-blue-500 transition">
            <h3 class="text-lg font-semibold text-gray-900 mb-2">${escapeHtml(pkg.name)}</h3>
            <div class="text-2xl font-bold text-blue-600 mb-3">$${pkg.price_usd}</div>
            <div class="text-gray-600 mb-3">
                <span class="font-semibold">${pkg.credits.toLocaleString()}</span> Credits
            </div>
            <button onclick="openPaymentModal(${pkg.id}, '${escapeHtml(pkg.name)}', ${pkg.credits}, ${pkg.price_btc}, ${pkg.price_eth}, ${pkg.price_usdt})" 
                class="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700">
                Purchase
            </button>
        </div>
    `).join('');
}

async function loadSubmissionHistory(page) {
    try {
        const response = await fetch(`/api/submissions?page=${page}&limit=20`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            displayHistory(data.submissions);
            updatePagination(data.pagination);
            currentPage = page;
        }
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

function displayHistory(submissions) {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;
    
    if (submissions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">No submissions yet</td></tr>';
        return;
    }
    
    tbody.innerHTML = submissions.map(sub => {
        const statusClass = getStatusClass(sub.status);
        const typeIcon = sub.schedule_type === 'instant' ? '⚡' : '🕐';
        const date = new Date(sub.created_at).toLocaleString();
        
        return `
            <tr>
                <td class="px-6 py-4 text-sm text-gray-900 truncate max-w-xs" title="${escapeHtml(sub.url)}">
                    ${escapeHtml(sub.url.substring(0, 50))}${sub.url.length > 50 ? '...' : ''}
                </td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusClass}">
                        ${sub.status}
                    </span>
                </td>
                <td class="px-6 py-4 text-sm text-gray-500">${typeIcon} ${sub.schedule_type}</td>
                <td class="px-6 py-4 text-sm text-gray-500">${date}</td>
            </tr>
        `;
    }).join('');
}

function updatePagination(pagination) {
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');
    
    if (prevBtn) prevBtn.disabled = pagination.page <= 1;
    if (nextBtn) nextBtn.disabled = pagination.page >= pagination.pages;
    if (pageInfo) pageInfo.textContent = `Page ${pagination.page} of ${pagination.pages}`;
}

function getStatusClass(status) {
    const classes = {
        'submitted': 'bg-yellow-100 text-yellow-800',
        'in_progress': 'bg-blue-100 text-blue-800',
        'delivered': 'bg-green-100 text-green-800',
        'scheduled': 'bg-purple-100 text-purple-800',
        'failed': 'bg-red-100 text-red-800'
    };
    return classes[status] || 'bg-gray-100 text-gray-800';
}

function updateUrlCount() {
    const urlInput = document.getElementById('url-input');
    if (!urlInput) return;
    
    const urls = urlInput.value.trim().split('\n').filter(url => url.trim().length > 0);
    const count = urls.length;
    
    document.getElementById('url-count').textContent = `${count} URL${count !== 1 ? 's' : ''} entered`;
    document.getElementById('credits-needed').textContent = count;
    
    const submitBtn = document.getElementById('submit-urls-btn');
    if (submitBtn) {
        submitBtn.disabled = count === 0 || (currentUser && currentUser.credits_balance < count);
    }
}

async function handleUrlSubmission() {
    if (!authToken) {
        showToast('Please login first', 'error');
        return;
    }
    
    const urlInput = document.getElementById('url-input');
    const scheduleType = document.getElementById('schedule-type').value;
    
    const urls = urlInput.value.trim().split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0);
    
    if (urls.length === 0) {
        showToast('Please enter at least one URL', 'error');
        return;
    }
    
    for (const url of urls) {
        if (!isValidUrl(url)) {
            showToast(`Invalid URL: ${url}`, 'error');
            return;
        }
    }
    
    const payload = { urls, schedule_type: scheduleType };
    
    if (scheduleType === 'scheduled') {
        const scheduleTime = document.getElementById('schedule-time').value;
        if (!scheduleTime) {
            showToast('Please select a schedule time', 'error');
            return;
        }
        payload.scheduled_time = new Date(scheduleTime).toISOString();
    }
    
    const submitBtn = document.getElementById('submit-urls-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Submitting...';
    
    try {
        const response = await fetch('/api/submit-urls', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(`Successfully submitted ${urls.length} URL(s)!`, 'success');
            urlInput.value = '';
            updateUrlCount();
            loadUserProfile();
            loadSubmissionHistory(1);
        } else {
            showToast(data.error || 'Submission failed', 'error');
        }
    } catch (error) {
        showToast('Network error', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Submit URLs';
    }
}

async function openPaymentModal(packageId, name, credits, priceBtc, priceEth, priceUsdt) {
    selectedPackage = { id: packageId, name, credits, price_btc: priceBtc, price_eth: priceEth, price_usdt: priceUsdt };
    
    document.getElementById('modal-package-name').textContent = name;
    document.getElementById('modal-package-credits').textContent = credits;
    document.getElementById('transaction-hash').value = '';
    
    try {
        const response = await fetch('/api/payment-addresses');
        const addresses = await response.json();
        selectedPackage.addresses = addresses;
        
        document.getElementById('payment-modal').classList.remove('hidden');
        updatePaymentDetails();
    } catch (error) {
        showToast('Error loading payment details', 'error');
    }
}

function closePaymentModal() {
    document.getElementById('payment-modal').classList.add('hidden');
    selectedPackage = null;
}

function updatePaymentDetails() {
    if (!selectedPackage || !selectedPackage.addresses) return;
    
    const cryptoType = document.getElementById('crypto-type').value;
    const address = selectedPackage.addresses[cryptoType];
    let amount;
    
    switch(cryptoType) {
        case 'BTC': amount = selectedPackage.price_btc; break;
        case 'ETH': amount = selectedPackage.price_eth; break;
        case 'USDT': amount = selectedPackage.price_usdt; break;
    }
    
    document.getElementById('payment-address').textContent = address;
    document.getElementById('payment-amount').textContent = `${amount} ${cryptoType}`;
}

async function copyPaymentAddress() {
    const address = document.getElementById('payment-address').textContent;
    try {
        await navigator.clipboard.writeText(address);
        showToast('Address copied!', 'success');
    } catch (err) {
        showToast('Failed to copy', 'error');
    }
}

async function confirmPayment() {
    if (!selectedPackage) return;
    
    const transactionHash = document.getElementById('transaction-hash').value.trim();
    const cryptoType = document.getElementById('crypto-type').value;
    
    if (!transactionHash) {
        showToast('Please enter transaction hash', 'error');
        return;
    }
    
    const confirmBtn = document.getElementById('confirm-payment-btn');
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Confirming...';
    
    try {
        const response = await fetch('/api/payment/confirm', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                transaction_hash: transactionHash,
                crypto_type: cryptoType,
                package_id: selectedPackage.id
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('Payment confirmation submitted!', 'success');
            closePaymentModal();
            loadUserProfile();
        } else {
            showToast(data.error || 'Confirmation failed', 'error');
        }
    } catch (error) {
        showToast('Network error', 'error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Confirm Payment';
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toast-icon');
    const toastMessage = document.getElementById('toast-message');
    
    if (!toast || !toastIcon || !toastMessage) return;
    
    const icons = {
        'success': 'fas fa-check-circle text-green-500',
        'error': 'fas fa-exclamation-circle text-red-500',
        'info': 'fas fa-info-circle text-blue-500'
    };
    
    toastIcon.className = icons[type] || icons.info;
    toastMessage.textContent = message;
    
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 5000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}
