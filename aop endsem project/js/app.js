// ====== State & Data Management ======
let allUsers = [];
let currentSession = null;
let currentUser = null; 
let events = [];
let currentFilter = 'All';
let currentSort = 'upcoming';
let hidePast = false;
let currentView = 'home'; // 'home', 'dashboard', 'about'
let searchQuery = '';

let actionPending = null; 
let currentEventId = null;

let pendingAttachments = []; 
let pendingEditAttachments = [];
let currentEditEventId = null;

// ====== Initialization ======
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadData();
    setupAuthListeners();
    setupEventListeners();
    setupCreatePostForm();
    setupEditPostForm();
    checkSession();
});

function loadData() {
    const storedUsers = localStorage.getItem('cc_users'); if (storedUsers) allUsers = JSON.parse(storedUsers);
    const storedSession = localStorage.getItem('cc_session'); if (storedSession) currentSession = JSON.parse(storedSession);
    const storedEvents = localStorage.getItem('cc_events'); if (storedEvents) events = JSON.parse(storedEvents);
}

function saveData() {
    localStorage.setItem('cc_users', JSON.stringify(allUsers));
    if (currentSession) localStorage.setItem('cc_session', JSON.stringify(currentSession));
    else localStorage.removeItem('cc_session');
    
    try { localStorage.setItem('cc_events', JSON.stringify(events)); return true; } 
    catch (e) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') return false;
        throw e;
    }
}

// ====== Utility & Security ======
function generateId() { return '_' + Math.random().toString(36).substr(2, 9); }
function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}
function isValidURL(string) { try { const url = new URL(string); return url.protocol === "http:" || url.protocol === "https:"; } catch (_) { return false; } }
function getAvatarUrl(seed) { return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=e2e8f0,c7d2fe,fbcfe8,fed7aa&textColor=0f172a`; }

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer'); const toast = document.createElement('div'); toast.className = 'toast';
    toast.innerHTML = `<div style="font-weight: 500;">${escapeHTML(message)}</div><div class="toast-progress" style="background: ${type === 'error' ? 'var(--danger)' : 'var(--primary)'}"></div>`;
    container.appendChild(toast);
    const progress = toast.querySelector('.toast-progress');
    progress.style.transition = 'width 3s linear'; setTimeout(() => progress.style.width = '0%', 10);
    setTimeout(() => { toast.style.animation = 'slideOutRight 0.3s ease forwards'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// Web Crypto API
async function hashPassword(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" }, keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const exportedKey = await crypto.subtle.exportKey("raw", key);
    return Array.from(new Uint8Array(exportedKey)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function generateSalt() {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
}

function compressImage(file, callback) {
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = event => {
        const img = new Image(); img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
            const MAX_WIDTH = 256; const MAX_HEIGHT = 256; let width = img.width; let height = img.height;
            if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } }
            else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }
            canvas.width = width; canvas.height = height; ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.8));
        }
    }
}

// ====== Theme ======
function initTheme() {
    const savedTheme = localStorage.getItem('cc_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
}
document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const newTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme); localStorage.setItem('cc_theme', newTheme);
});

// ====== Authentication ======
function checkSession() {
    if (!currentSession) { showAuthScreen(); return; }
    const now = new Date().getTime();
    if (now > currentSession.expiresAt) {
        currentSession = null; currentUser = null; saveData(); showToast('Session expired. Please log in again.', 'error'); showAuthScreen(); return;
    }
    currentUser = allUsers.find(u => u.id === currentSession.userId);
    if (!currentUser) { currentSession = null; saveData(); showAuthScreen(); return; }
    if (!currentUser.savedEvents) currentUser.savedEvents = [];
    showAppContent();
}

function showAuthScreen() {
    document.getElementById('appContent').classList.add('hidden'); document.getElementById('authScreen').classList.add('active');
    document.getElementById('loginBox').classList.add('active'); document.getElementById('signupBox').classList.remove('active');
}

function showAppContent() {
    document.getElementById('authScreen').classList.remove('active'); document.getElementById('appContent').classList.remove('hidden');
    updateProfileDisplay(); renderFeed();
}

function setupAuthListeners() {
    document.getElementById('showSignup').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('loginBox').classList.remove('active'); document.getElementById('signupBox').classList.add('active'); });
    document.getElementById('showLogin').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('signupBox').classList.remove('active'); document.getElementById('loginBox').classList.add('active'); });
    document.querySelectorAll('.pwd-toggle').forEach(icon => {
        icon.addEventListener('click', function() { const input = this.previousElementSibling; if (input.type === 'password') { input.type = 'text'; this.setAttribute('name', 'eye-off-outline'); } else { input.type = 'password'; this.setAttribute('name', 'eye-outline'); } });
    });
    const pwdInput = document.getElementById('signupPassword');
    pwdInput.addEventListener('input', () => {
        const val = pwdInput.value; toggleReq('reqLength', val.length >= 8); toggleReq('reqUpper', /[A-Z]/.test(val)); toggleReq('reqLower', /[a-z]/.test(val)); toggleReq('reqNum', /[0-9]/.test(val));
    });
    document.getElementById('signupForm').addEventListener('submit', handleSignup);
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    let pendingAvatar = null;
    document.getElementById('signupAvatarInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) { if (file.size > 5 * 1024 * 1024) { showToast('Image too large (max 5MB).', 'error'); return; } document.getElementById('signupAvatarName').textContent = file.name; compressImage(file, (base64) => { pendingAvatar = base64; }); }
    });
    window.getPendingAvatar = () => pendingAvatar;
}

function toggleReq(id, isMet) { const el = document.getElementById(id); if (isMet) el.classList.add('met'); else { el.classList.remove('met'); el.innerHTML = '<ion-icon name="close"></ion-icon> ' + el.innerText; } }

async function handleSignup(e) {
    e.preventDefault();
    const name = document.getElementById('signupName').value.trim(); const email = document.getElementById('signupEmail').value.trim().toLowerCase();
    const password = document.getElementById('signupPassword').value; const confirmPwd = document.getElementById('signupConfirmPassword').value;
    const userClass = document.getElementById('signupClass').value.trim(); const roll = document.getElementById('signupRoll').value.trim(); const uid = document.getElementById('signupUid').value.trim();
    
    if (password !== confirmPwd) { document.getElementById('pwdMatchError').classList.remove('hidden'); return; }
    document.getElementById('pwdMatchError').classList.add('hidden');
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) { showToast('Password does not meet all requirements.', 'error'); return; }
    if (allUsers.some(u => u.email === email)) { showToast('Account with this email already exists.', 'error'); return; }
    if (allUsers.some(u => u.uid === uid)) { showToast('Account with this UID already exists.', 'error'); return; }

    const salt = generateSalt(); const passwordHash = await hashPassword(password, salt);
    const newUser = { id: generateId(), name, email, userClass, roll, uid, passwordHash, passwordSalt: salt, profilePicture: window.getPendingAvatar() || '', savedEvents: [], createdAt: new Date().toISOString() };
    allUsers.push(newUser);
    currentSession = { userId: newUser.id, loginTime: new Date().getTime(), expiresAt: new Date().getTime() + (7 * 24 * 60 * 60 * 1000) };
    currentUser = newUser; saveData(); document.getElementById('signupForm').reset(); showToast('Account created successfully!'); showAppContent();
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim().toLowerCase(); const password = document.getElementById('loginPassword').value; const rememberMe = document.getElementById('rememberMe').checked;
    const user = allUsers.find(u => u.email === email);
    if (!user) { showToast('Incorrect email or password.', 'error'); return; }
    const hash = await hashPassword(password, user.passwordSalt);
    if (hash !== user.passwordHash) { showToast('Incorrect email or password.', 'error'); return; }

    if (!user.savedEvents) user.savedEvents = [];
    const duration = rememberMe ? (30 * 24 * 60 * 60 * 1000) : (1 * 24 * 60 * 60 * 1000);
    currentSession = { userId: user.id, loginTime: new Date().getTime(), expiresAt: new Date().getTime() + duration };
    currentUser = user; saveData(); document.getElementById('loginForm').reset(); showToast('Logged in successfully!'); showAppContent();
}

function handleLogout() { currentSession = null; currentUser = null; saveData(); document.getElementById('profileModal').classList.remove('active'); showAuthScreen(); showToast('You have been logged out.'); }

// ====== Setup Main Listeners ======
function setupEventListeners() {
    document.getElementById('userProfileDisplay').addEventListener('click', showProfileModal);
    document.getElementById('closeProfileModal').addEventListener('click', () => { document.getElementById('profileModal').classList.remove('active'); });
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('changePicBtn').addEventListener('click', () => { document.getElementById('updateAvatarInput').click(); });
    document.getElementById('updateAvatarInput').addEventListener('change', (e) => { const file = e.target.files[0]; if (file) { compressImage(file, (base64) => { currentUser.profilePicture = base64; saveData(); updateProfileDisplay(); showProfileModal(); showToast('Profile picture updated.'); }); } });
    document.getElementById('removePicBtn').addEventListener('click', () => { currentUser.profilePicture = ''; saveData(); updateProfileDisplay(); showProfileModal(); showToast('Profile picture removed.'); });
    document.getElementById('dockCreateBtn').addEventListener('click', () => { 
        document.getElementById('createPostModal').classList.add('active'); 
        toggleAnnouncementFields('Events', 'post'); // reset
    });
    document.getElementById('closeCreateModal').addEventListener('click', () => { document.getElementById('createPostModal').classList.remove('active'); });
    document.getElementById('closeEventDetailsModal').addEventListener('click', () => { document.getElementById('eventDetailsModal').classList.remove('active'); });

    document.getElementById('categoryTabs').addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-btn')) { document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active')); e.target.classList.add('active'); currentFilter = e.target.dataset.category; renderFeed(); }
    });

    document.getElementById('sortSelect').addEventListener('change', (e) => { currentSort = e.target.value; renderFeed(); });
    document.getElementById('hidePastToggle').addEventListener('change', (e) => { hidePast = e.target.checked; renderFeed(); });

    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(searchTimeout); searchQuery = e.target.value.toLowerCase();
        searchTimeout = setTimeout(() => { if (currentView === 'home') renderFeed(); else if(currentView === 'dashboard') renderDashboard(); }, 300);
    });

    document.getElementById('logoBtn').addEventListener('click', () => { currentView = 'about'; updateDockState('about'); });
    document.getElementById('dockHomeBtn').addEventListener('click', () => { currentView = 'home'; updateDockState('home'); renderFeed(); });
    document.getElementById('dockDashboardBtn').addEventListener('click', () => { currentView = 'dashboard'; updateDockState('dashboard'); renderDashboard(); });

    document.getElementById('closePinModal').addEventListener('click', () => { document.getElementById('pinPromptModal').classList.remove('active'); document.getElementById('pinInput').value = ''; document.getElementById('pinError').classList.add('hidden'); });
    document.getElementById('verifyPinBtn').addEventListener('click', handlePinVerification);
    document.getElementById('closeAttendeesModal').addEventListener('click', () => { document.getElementById('attendeesModal').classList.remove('active'); });
}

function updateProfileDisplay() {
    if (!currentUser) return;
    document.getElementById('headerName').textContent = currentUser.name;
    document.getElementById('headerAvatar').src = currentUser.profilePicture || getAvatarUrl(currentUser.uid);
}

function showProfileModal() {
    if (!currentUser) return;
    document.getElementById('modalProfilePic').src = currentUser.profilePicture || getAvatarUrl(currentUser.uid);
    document.getElementById('modalProfileName').textContent = currentUser.name; document.getElementById('modalProfileClass').textContent = currentUser.userClass;
    document.getElementById('modalProfileRoll').textContent = currentUser.roll; document.getElementById('modalProfileUid').textContent = currentUser.uid;
    document.getElementById('modalProfileEmail').textContent = currentUser.email;
    document.getElementById('modalProfileJoined').textContent = new Date(currentUser.createdAt).toLocaleDateString([], { month: 'long', year: 'numeric' });
    document.getElementById('modalProfilePosts').textContent = events.filter(e => e.organizerId === currentUser.uid).length; 
    
    // Calculate total RSVPs, being careful with types
    const rsvpCount = events.filter(e => Array.isArray(e.rsvps) && e.rsvps.some(r => r.uid === currentUser.uid)).length;
    document.getElementById('modalProfileRsvps').textContent = rsvpCount;
    
    document.getElementById('profileModal').classList.add('active');
}

function updateDockState(mode) {
    document.getElementById('dockHomeBtn').classList.remove('active'); document.getElementById('dockDashboardBtn').classList.remove('active');
    document.getElementById('homeFeedView').classList.add('hidden'); document.getElementById('dashboardView').classList.add('hidden');
    document.getElementById('aboutView').classList.add('hidden'); document.getElementById('controlsSection').classList.add('hidden');
    if (mode === 'home') { document.getElementById('dockHomeBtn').classList.add('active'); document.getElementById('homeFeedView').classList.remove('hidden'); document.getElementById('controlsSection').classList.remove('hidden'); } 
    else if (mode === 'dashboard') { document.getElementById('dockDashboardBtn').classList.add('active'); document.getElementById('dashboardView').classList.remove('hidden'); document.getElementById('dashWelcomeName').textContent = currentUser.name; } 
    else if (mode === 'about') { document.getElementById('aboutView').classList.remove('hidden'); }
}

// ====== Announcement Field Adaptivity ======
function toggleAnnouncementFields(category, prefix) {
    const isAnnouncement = category === 'Announcements';
    const formatContainer = document.getElementById(prefix + 'EventFormatContainer');
    const capacityContainer = document.getElementById(prefix + 'CapacityContainer');
    const helper = document.getElementById(prefix + 'AnnouncementHelper');
    
    const dateInput = document.getElementById(prefix + 'Date');
    const timeInput = document.getElementById(prefix + 'Time');
    const dateStar = document.getElementById(prefix + 'DateReqStar');
    const timeStar = document.getElementById(prefix + 'TimeReqStar');

    if (isAnnouncement) {
        formatContainer.classList.add('hidden'); capacityContainer.classList.add('hidden');
        helper.classList.remove('hidden');
        dateInput.removeAttribute('required'); timeInput.removeAttribute('required');
        if(dateStar) dateStar.style.display = 'none'; if(timeStar) timeStar.style.display = 'none';
        document.querySelectorAll(`input[name="${prefix === 'post' ? 'eventFormat' : 'editFormat'}"]`).forEach(el => el.removeAttribute('required'));
        // clear fields to prevent stale data
        if(prefix === 'post') { document.getElementById('postCapacity').value = ''; document.querySelector(`input[name="eventFormat"]:checked`) && (document.querySelector(`input[name="eventFormat"]:checked`).checked = false); document.getElementById('postVenue').value = ''; document.getElementById('postMeetingLink').value = ''; document.getElementById('offlineFields').classList.add('hidden'); document.getElementById('onlineFields').classList.add('hidden'); }
    } else {
        formatContainer.classList.remove('hidden'); capacityContainer.classList.remove('hidden');
        helper.classList.add('hidden');
        dateInput.setAttribute('required', 'true'); timeInput.setAttribute('required', 'true');
        if(dateStar) dateStar.style.display = 'inline'; if(timeStar) timeStar.style.display = 'inline';
        document.querySelectorAll(`input[name="${prefix === 'post' ? 'eventFormat' : 'editFormat'}"]`).forEach(el => el.setAttribute('required', 'true'));
    }
}

// ====== Create Post Handlers ======
function setupCreatePostForm() {
    const formatRadios = document.querySelectorAll('input[name="eventFormat"]');
    const offlineFields = document.getElementById('offlineFields'); const onlineFields = document.getElementById('onlineFields');
    formatRadios.forEach(r => {
        r.addEventListener('change', (e) => {
            if (e.target.value === 'offline') { offlineFields.classList.remove('hidden'); document.getElementById('postVenue').setAttribute('required', 'true'); onlineFields.classList.add('hidden'); document.getElementById('postMeetingLink').removeAttribute('required'); } 
            else { onlineFields.classList.remove('hidden'); document.getElementById('postMeetingLink').setAttribute('required', 'true'); offlineFields.classList.add('hidden'); document.getElementById('postVenue').removeAttribute('required'); }
        });
    });

    document.getElementById('postCategory').addEventListener('change', (e) => toggleAnnouncementFields(e.target.value, 'post'));

    const attachInput = document.getElementById('postAttachmentInput');
    document.getElementById('addAttachmentBtn').addEventListener('click', () => attachInput.click());
    attachInput.addEventListener('change', (e) => handleAttachmentSelect(e, pendingAttachments, renderAttachmentPreview, attachInput));
    document.getElementById('createPostForm').addEventListener('submit', handleCreatePost);
}

function handleAttachmentSelect(e, arr, renderer, inputEl) {
    const file = e.target.files[0]; if (!file) return;
    if (arr.length >= 3) { showToast('You can add up to 3 attachments per event.', 'error'); return; }
    const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) { showToast('This file type isn\'t supported. Please upload a PDF, JPG, JPEG, or PNG.', 'error'); return; }
    if (file.size > 500 * 1024) { showToast('Attachment is too large. Each file must be 500 KB or smaller.', 'error'); return; }

    const reader = new FileReader();
    reader.onload = (ev) => { arr.push({ name: file.name, type: file.type, size: file.size, data: ev.target.result }); renderer(); };
    reader.readAsDataURL(file); inputEl.value = ''; 
}

function renderAttachmentPreview() {
    const container = document.getElementById('attachmentsPreview'); container.innerHTML = '';
    pendingAttachments.forEach((att, index) => {
        const sizeKB = (att.size / 1024).toFixed(1) + ' KB'; const icon = att.type.includes('pdf') ? 'document-text' : 'image';
        container.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--glass-bg); border:1px solid var(--card-border); padding:0.5rem; border-radius:0.5rem; margin-bottom:0.5rem; font-size:0.85rem;"><div style="display:flex; align-items:center; gap:0.5rem; overflow:hidden;"><ion-icon name="${icon}"></ion-icon><span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px;">${escapeHTML(att.name)}</span><span style="color:var(--text-muted)">(${sizeKB})</span></div><button type="button" class="card-icon-btn danger" style="width:24px; height:24px; font-size:0.9rem;" onclick="removeAttachment(${index})"><ion-icon name="close"></ion-icon></button></div>`;
    });
}
window.removeAttachment = function(index) { pendingAttachments.splice(index, 1); renderAttachmentPreview(); }

function normalizeTags(tagString) {
    if (!tagString.trim()) return [];
    return tagString.split(' ').map(t => t.trim().toLowerCase()).filter(t => t.length > 0).map(t => t.startsWith('#') ? t : '#' + t).filter((t, index, self) => self.indexOf(t) === index).slice(0, 8);
}

async function handleCreatePost(e) {
    e.preventDefault();
    if (!currentUser) { showToast("Unauthorized.", "error"); return; }
    
    const title = document.getElementById('postTitle').value.trim(); const category = document.getElementById('postCategory').value;
    const desc = document.getElementById('postDescription').value.trim(); const isAnnouncement = category === 'Announcements';
    let date = document.getElementById('postDate').value; let time = document.getElementById('postTime').value;
    
    let format = null; let venue = null; let locLink = null; let meetLink = null; let capacity = null;
    
    if (isAnnouncement) {
        if(!date) date = null; if(!time) time = null;
    } else {
        format = document.querySelector('input[name="eventFormat"]:checked')?.value;
        if (!format) { showToast('Please select an Event Format.', 'error'); return; }
        
        const capacityVal = document.getElementById('postCapacity').value.trim();
        if (capacityVal !== "") {
            capacity = Number(capacityVal);
            if (!Number.isInteger(capacity) || capacity < 1 || !Number.isFinite(capacity)) { 
                showToast("Capacity must be a positive whole number.", "error"); 
                return; 
            }
        }
        
        locLink = document.getElementById('postLocationLink').value.trim() || null;
        meetLink = document.getElementById('postMeetingLink').value.trim() || null;
        venue = document.getElementById('postVenue').value.trim() || null;
        
        if (format === 'online') { venue = null; locLink = null; } 
        else if (format === 'offline') { meetLink = null; }

        if (locLink && !isValidURL(locLink)) { showToast('Location link is not a valid URL (must be http/https).', 'error'); return; }
        if (format === 'online' && meetLink && !isValidURL(meetLink)) { showToast('Meeting link is not a valid URL (must be http/https).', 'error'); return; }
    }

    const status = document.querySelector('input[name="eventStatus"]:checked')?.value;
    if (!status) { showToast('Please complete all required fields.', 'error'); return; }
    
    let imageUrl = document.getElementById('postImage').value.trim();
    if (imageUrl && !isValidURL(imageUrl)) { showToast('Banner image URL is invalid.', 'error'); return; }

    const pin = document.getElementById('postPin').value;
    const pinSalt = generateSalt(); const pinHash = await hashPassword(pin, pinSalt);

    const newEvent = {
        id: generateId(), title: title, category: category, description: desc,
        date: date, time: time, dateTime: (date && time) ? `${date}T${time}` : null,
        eventFormat: format, venue: venue, locationLink: locLink, onlineMeetingLink: meetLink,
        isOfficial: (status === 'official'), organizationName: document.getElementById('postOrganization').value.trim(),
        organizerId: currentUser.uid, organizerName: currentUser.name,
        contactNumber: document.getElementById('postContact').value.trim(), showContact: document.getElementById('postShowContact').checked,
        tags: normalizeTags(document.getElementById('postTags').value),
        capacity: capacity, imageUrl: imageUrl, pinHash: pinHash, pinSalt: pinSalt,
        attachments: [...pendingAttachments], createdAt: new Date().toISOString(), rsvps: [], flags: 0
    };

    events.push(newEvent);
    if (!saveData()) { events.pop(); showToast("Storage limit reached. Please remove some attachments or older data and try again.", 'error'); return; }
    
    document.getElementById('createPostForm').reset(); pendingAttachments = []; renderAttachmentPreview();
    document.getElementById('offlineFields').classList.add('hidden'); document.getElementById('onlineFields').classList.add('hidden');
    document.getElementById('createPostModal').classList.remove('active');
    showToast('Post created successfully!');
    if (currentView === 'home') renderFeed(); else if (currentView === 'dashboard') renderDashboard();
}

// ====== Edit Post Handlers ======
function setupEditPostForm() {
    document.getElementById('closeEditModal').addEventListener('click', () => { document.getElementById('editPostModal').classList.remove('active'); });
    document.getElementById('cancelEditBtn').addEventListener('click', () => { document.getElementById('editPostModal').classList.remove('active'); });

    const formatRadios = document.querySelectorAll('input[name="editFormat"]');
    const offlineFields = document.getElementById('editOfflineFields'); const onlineFields = document.getElementById('editOnlineFields');
    formatRadios.forEach(r => {
        r.addEventListener('change', (e) => {
            if (e.target.value === 'offline') { offlineFields.classList.remove('hidden'); document.getElementById('editVenue').setAttribute('required', 'true'); onlineFields.classList.add('hidden'); document.getElementById('editMeetingLink').removeAttribute('required'); } 
            else { onlineFields.classList.remove('hidden'); document.getElementById('editMeetingLink').setAttribute('required', 'true'); offlineFields.classList.add('hidden'); document.getElementById('editVenue').removeAttribute('required'); }
        });
    });

    document.getElementById('editCategory').addEventListener('change', (e) => toggleAnnouncementFields(e.target.value, 'edit'));

    const attachInput = document.getElementById('editAttachmentInput');
    document.getElementById('editAddAttachmentBtn').addEventListener('click', () => attachInput.click());
    attachInput.addEventListener('change', (e) => handleAttachmentSelect(e, pendingEditAttachments, renderEditAttachmentPreview, attachInput));
    document.getElementById('clearEditBannerBtn').addEventListener('click', () => { document.getElementById('editImage').value = ''; });
    document.getElementById('editPostForm').addEventListener('submit', handleEditPost);
}

function renderEditAttachmentPreview() {
    const container = document.getElementById('editAttachmentsPreview'); container.innerHTML = '';
    pendingEditAttachments.forEach((att, index) => {
        const sizeKB = att.size ? (att.size / 1024).toFixed(1) + ' KB' : 'Existing'; const icon = att.type.includes('pdf') ? 'document-text' : 'image';
        container.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--glass-bg); border:1px solid var(--card-border); padding:0.5rem; border-radius:0.5rem; margin-bottom:0.5rem; font-size:0.85rem;"><div style="display:flex; align-items:center; gap:0.5rem; overflow:hidden;"><ion-icon name="${icon}"></ion-icon><span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px;">${escapeHTML(att.name)}</span><span style="color:var(--text-muted)">(${sizeKB})</span></div><button type="button" class="card-icon-btn danger" style="width:24px; height:24px; font-size:0.9rem;" onclick="removeEditAttachment(${index})"><ion-icon name="close"></ion-icon></button></div>`;
    });
}
window.removeEditAttachment = function(index) { pendingEditAttachments.splice(index, 1); renderEditAttachmentPreview(); }

window.editEvent = function(id) {
    if (!currentUser) return;
    const ev = events.find(e => e.id === id);
    if (!ev || ev.organizerId !== currentUser.uid) { showToast("Unauthorized action.", "error"); return; }
    
    currentEditEventId = id;
    document.getElementById('editTitle').value = ev.title || ''; 
    document.getElementById('editCategory').value = ev.category || 'Events';
    toggleAnnouncementFields(ev.category || 'Events', 'edit');

    document.getElementById('editOrganization').value = ev.organizationName || ''; document.getElementById('editDescription').value = ev.description || '';
    document.getElementById('editDate').value = ev.date || ''; document.getElementById('editTime').value = ev.time || '';
    
    const format = ev.eventFormat || 'offline';
    if(ev.category !== 'Announcements') {
        const radio = document.querySelector(`input[name="editFormat"][value="${format}"]`);
        if (radio) radio.checked = true;
        if (format === 'offline') { document.getElementById('editOfflineFields').classList.remove('hidden'); document.getElementById('editVenue').setAttribute('required', 'true'); document.getElementById('editOnlineFields').classList.add('hidden'); document.getElementById('editMeetingLink').removeAttribute('required'); } 
        else { document.getElementById('editOnlineFields').classList.remove('hidden'); document.getElementById('editMeetingLink').setAttribute('required', 'true'); document.getElementById('editOfflineFields').classList.add('hidden'); document.getElementById('editVenue').removeAttribute('required'); }
    }

    document.getElementById('editVenue').value = ev.venue || (ev.location || ''); document.getElementById('editLocationLink').value = ev.locationLink || ''; document.getElementById('editMeetingLink').value = ev.onlineMeetingLink || '';
    const isOff = ev.isOfficial ? 'official' : 'unofficial'; document.querySelector(`input[name="editStatus"][value="${isOff}"]`).checked = true;

    document.getElementById('editTags').value = (ev.tags && ev.tags.length) ? ev.tags.join(' ') : '';
    
    // Robust parsing for prefill
    let rsvpCount = Array.isArray(ev.rsvps) ? ev.rsvps.length : 0;
    document.getElementById('editCapacity').value = (ev.capacity !== null && ev.capacity !== undefined) ? ev.capacity : ''; 
    document.getElementById('editCapacityNotice').textContent = `Current RSVPs: ${rsvpCount}`;
    
    document.getElementById('editContact').value = ev.contactNumber || ev.contact || ''; document.getElementById('editShowContact').checked = ev.showContact !== undefined ? ev.showContact : true;
    document.getElementById('editImage').value = ev.imageUrl || ''; document.getElementById('editPin').value = ''; document.getElementById('editPinError').classList.add('hidden');

    pendingEditAttachments = ev.attachments ? JSON.parse(JSON.stringify(ev.attachments)) : []; renderEditAttachmentPreview();
    document.getElementById('eventDetailsModal').classList.remove('active'); document.getElementById('editPostModal').classList.add('active');
}

async function handleEditPost(e) {
    e.preventDefault();
    if (!currentUser) { showToast("Unauthorized action.", "error"); return; }
    const ev = events.find(e => e.id === currentEditEventId);
    if (!ev || ev.organizerId !== currentUser.uid) { showToast("Unauthorized action.", "error"); return; } 

    const pin = document.getElementById('editPin').value;
    if (ev.pinHash && ev.pinSalt) {
        const enteredPinHash = await hashPassword(pin, ev.pinSalt);
        if (enteredPinHash !== ev.pinHash) { document.getElementById('editPinError').classList.remove('hidden'); return; }
    } else if (ev.pin) {
        if (pin !== ev.pin) { document.getElementById('editPinError').classList.remove('hidden'); return; }
    } else { document.getElementById('editPinError').classList.remove('hidden'); return; } 

    const category = document.getElementById('editCategory').value;
    const isAnnouncement = category === 'Announcements';
    let date = document.getElementById('editDate').value; let time = document.getElementById('editTime').value;

    let format = null; let venue = null; let locLink = null; let meetLink = null; let capacity = null;
    let currentRsvpCount = Array.isArray(ev.rsvps) ? ev.rsvps.length : 0;
    
    if (isAnnouncement) {
        if(!date) date = null; if(!time) time = null;
    } else {
        format = document.querySelector('input[name="editFormat"]:checked')?.value;
        if (!format) { showToast('Please select an Event Format.', 'error'); return; }

        const capacityVal = document.getElementById('editCapacity').value.trim();
        if (capacityVal !== "") {
            capacity = Number(capacityVal);
            if (!Number.isInteger(capacity) || capacity <= 0 || !Number.isFinite(capacity)) { 
                showToast("Capacity must be a positive whole number.", "error"); 
                return; 
            }
        }
        
        if (capacity !== null && capacity < currentRsvpCount) { 
            showToast(`Capacity cannot be lower than the current number of RSVPs (${currentRsvpCount}).`, 'error'); 
            return; 
        }

        locLink = document.getElementById('editLocationLink').value.trim() || null;
        meetLink = document.getElementById('editMeetingLink').value.trim() || null;
        venue = document.getElementById('editVenue').value.trim() || null;
        if (format === 'online') { venue = null; locLink = null; } else if (format === 'offline') { meetLink = null; }

        if (locLink && !isValidURL(locLink)) { showToast('Location link is not a valid URL (must be http/https).', 'error'); return; }
        if (format === 'online' && meetLink && !isValidURL(meetLink)) { showToast('Meeting link is not a valid URL (must be http/https).', 'error'); return; }
    }

    const status = document.querySelector('input[name="editStatus"]:checked')?.value;
    if (!status) { showToast('Please complete all required fields.', 'error'); return; }

    let imageUrl = document.getElementById('editImage').value.trim();
    if (imageUrl && !isValidURL(imageUrl)) { showToast('Banner image URL is invalid.', 'error'); return; }

    const originalEventData = JSON.parse(JSON.stringify(ev));

    ev.title = document.getElementById('editTitle').value.trim(); ev.category = category;
    ev.description = document.getElementById('editDescription').value.trim(); ev.date = date; ev.time = time;
    ev.dateTime = (date && time) ? `${date}T${time}` : null; ev.eventFormat = format; ev.venue = venue; ev.locationLink = locLink; ev.onlineMeetingLink = meetLink;
    ev.isOfficial = (status === 'official'); ev.organizationName = document.getElementById('editOrganization').value.trim();
    ev.contactNumber = document.getElementById('editContact').value.trim(); ev.showContact = document.getElementById('editShowContact').checked;
    ev.tags = normalizeTags(document.getElementById('editTags').value); 
    ev.capacity = capacity; 
    if (isAnnouncement) ev.rsvps = []; // clear rsvps if converted to announcement
    ev.imageUrl = imageUrl; ev.attachments = [...pendingEditAttachments];
    ev.updatedAt = new Date().toISOString();

    if (ev.pin) {
        const newSalt = generateSalt();
        ev.pinSalt = newSalt; ev.pinHash = await hashPassword(pin, newSalt);
        delete ev.pin;
    }

    if (!saveData()) { 
        Object.assign(ev, originalEventData);
        showToast("Storage limit reached. Please remove some attachments or older data and try again.", 'error'); return; 
    }
    
    document.getElementById('editPostModal').classList.remove('active'); showToast('Post updated successfully.');
    if (currentView === 'home') renderFeed(); else if (currentView === 'dashboard') renderDashboard();
    showEventDetails(ev.id);
}


// ====== Render Engine ======
function generateSkeletons(count = 3) {
    let html = '';
    for(let i=0; i<count; i++){ html += `<div class="event-card"><div class="skeleton" style="height: 160px; margin-bottom: 1rem;"></div><div class="skeleton" style="height: 20px; width: 40%; margin-bottom: 1rem;"></div><div class="skeleton" style="height: 28px; width: 80%; margin-bottom: 1rem;"></div><div class="skeleton" style="height: 60px; margin-bottom: 1rem;"></div><div class="skeleton" style="height: 40px;"></div></div>`; }
    return html;
}

function renderFeed() {
    const feed = document.getElementById('masonryFeed'); const emptyState = document.getElementById('emptyState');
    feed.innerHTML = generateSkeletons(6);
    setTimeout(() => {
        feed.innerHTML = '';
        let displayEvents = [...events].filter(e => e.flags < 3);

        if (currentFilter !== 'All') displayEvents = displayEvents.filter(e => e.category === currentFilter);
        if (hidePast) displayEvents = displayEvents.filter(e => {
            if(e.category === 'Announcements' && !e.dateTime) return true; 
            return e.dateTime ? new Date(e.dateTime) >= new Date() : true;
        });
        if (searchQuery) { displayEvents = displayEvents.filter(e => e.title.toLowerCase().includes(searchQuery) || (e.description && e.description.toLowerCase().includes(searchQuery))); }

        displayEvents.sort((a, b) => {
            if (currentSort === 'upcoming') {
                const tA = a.dateTime ? new Date(a.dateTime).getTime() : new Date(a.createdAt).getTime();
                const tB = b.dateTime ? new Date(b.dateTime).getTime() : new Date(b.createdAt).getTime();
                return tA - tB;
            }
            if (currentSort === 'recent') return new Date(b.createdAt) - new Date(a.createdAt);
            if (currentSort === 'popular') {
                const rA = Array.isArray(a.rsvps) ? a.rsvps.length : 0;
                const rB = Array.isArray(b.rsvps) ? b.rsvps.length : 0;
                return rB - rA;
            }
        });

        if (displayEvents.length === 0) { emptyState.classList.remove('hidden'); } 
        else { emptyState.classList.add('hidden'); displayEvents.forEach((ev, index) => feed.insertAdjacentHTML('beforeend', generateCardHTML(ev, index))); }
    }, 300);
}

function renderDashboard() {
    const savedFeed = document.getElementById('dashSavedEvents'); const rsvpFeed = document.getElementById('dashRsvpEvents'); const myEventsFeed = document.getElementById('dashMyEvents');
    savedFeed.innerHTML = generateSkeletons(3); rsvpFeed.innerHTML = generateSkeletons(3); myEventsFeed.innerHTML = generateSkeletons(3);
    setTimeout(() => {
        savedFeed.innerHTML = ''; rsvpFeed.innerHTML = ''; myEventsFeed.innerHTML = '';
        
        let safeEvents = events.filter(e => e.flags < 3);
        if (searchQuery) { safeEvents = safeEvents.filter(e => e.title.toLowerCase().includes(searchQuery) || (e.description && e.description.toLowerCase().includes(searchQuery))); }

        const saved = safeEvents.filter(e => currentUser.savedEvents.includes(e.id));
        const rsvps = safeEvents.filter(e => Array.isArray(e.rsvps) && e.rsvps.some(r => r.uid === currentUser.uid));
        const mine = safeEvents.filter(e => e.organizerId === currentUser.uid);

        const sortUp = (a, b) => {
            const tA = a.dateTime ? new Date(a.dateTime).getTime() : new Date(a.createdAt).getTime();
            const tB = b.dateTime ? new Date(b.dateTime).getTime() : new Date(b.createdAt).getTime();
            return tA - tB;
        };
        saved.sort(sortUp); rsvps.sort(sortUp); mine.sort(sortUp);

        if (saved.length === 0) document.getElementById('emptySaved').classList.remove('hidden');
        else { document.getElementById('emptySaved').classList.add('hidden'); saved.forEach((ev, i) => savedFeed.insertAdjacentHTML('beforeend', generateCardHTML(ev, i))); }
        
        if (rsvps.length === 0) document.getElementById('emptyRsvp').classList.remove('hidden');
        else { document.getElementById('emptyRsvp').classList.add('hidden'); rsvps.forEach((ev, i) => rsvpFeed.insertAdjacentHTML('beforeend', generateCardHTML(ev, i))); }
        
        if (mine.length === 0) document.getElementById('emptyMyEvents').classList.remove('hidden');
        else { document.getElementById('emptyMyEvents').classList.add('hidden'); mine.forEach((ev, i) => myEventsFeed.insertAdjacentHTML('beforeend', generateCardHTML(ev, i))); }
    }, 300);
}

function highlightText(text) {
    if (!searchQuery || !text) return escapeHTML(text);
    const escaped = escapeHTML(text); const regex = new RegExp(`(${escapeHTML(searchQuery)})`, 'gi');
    return escaped.replace(regex, '<span class="highlight">$1</span>');
}

// ====== Card Generation ======
function generateCardHTML(ev, index) {
    const isAnnouncement = ev.category === 'Announcements';
    const isExpired = ev.dateTime ? new Date(ev.dateTime) < new Date() : false;
    const rsvpArray = Array.isArray(ev.rsvps) ? ev.rsvps : [];
    const hasRsvpd = rsvpArray.some(r => r.uid === currentUser?.uid);
    const isSaved = currentUser.savedEvents && currentUser.savedEvents.includes(ev.id);
    const isOwner = currentUser && ev.organizerId === currentUser.uid;

    let dateStr = ''; let timeStr = '';
    if (ev.dateTime) {
        let dateObj = new Date(ev.dateTime);
        dateStr = ev.date ? dateObj.toLocaleDateString([], { month: 'long', day: 'numeric' }) : dateObj.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        timeStr = ev.time ? (function(){ let [h, m] = ev.time.split(':'); let hr = parseInt(h); const ampm = hr >= 12 ? 'PM' : 'AM'; hr = hr % 12 || 12; return `${hr}:${m} ${ampm}`; })() : dateObj.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });
    } else if (ev.date) {
        dateStr = new Date(ev.date).toLocaleDateString([], { month: 'long', day: 'numeric' });
    }

    let dateTimeHtml = (dateStr || timeStr) ? `<div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:0.2rem;"><ion-icon name="calendar"></ion-icon> ${dateStr} ${timeStr ? '&middot; ' + timeStr : ''}</div>` : '';
    let imageHtml = ev.imageUrl ? `<img src="${escapeHTML(ev.imageUrl)}" class="card-image" alt="Banner Image" onerror="this.style.display='none'">` : '';
    const animDelay = (index * 0.1) + 's';
    
    let badgeHtml = '';
    if (ev.isOfficial !== undefined) {
        if (ev.isOfficial) badgeHtml = `<div style="display:flex; align-items:center; gap:0.25rem; font-size:0.75rem; color:var(--success); font-weight:600; margin-bottom:0.5rem;"><ion-icon name="checkmark-circle"></ion-icon> Official College Source</div>`;
        else badgeHtml = `<div style="display:flex; align-items:center; gap:0.25rem; font-size:0.75rem; color:var(--text-muted); font-weight:600; margin-bottom:0.5rem;"><ion-icon name="people"></ion-icon> Student / Unofficial</div>`;
    }

    let locHtml = '';
    if (!isAnnouncement) {
        if (ev.eventFormat === 'online') { locHtml = `<div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:0.5rem;"><ion-icon name="laptop-outline"></ion-icon> Online Event</div>`; } 
        else if (ev.eventFormat === 'offline' && ev.venue) { locHtml = `<div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:0.5rem;"><ion-icon name="location"></ion-icon> Offline &middot; ${escapeHTML(ev.venue)}</div>`; } 
        else if (ev.location) { locHtml = `<div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:0.5rem;"><ion-icon name="location"></ion-icon> ${escapeHTML(ev.location)}</div>`; }
    }

    let orgDisplay = ev.organizationName ? escapeHTML(ev.organizationName) : escapeHTML(ev.organizerName);
    let tagsHtml = '';
    if (ev.tags && ev.tags.length > 0) { tagsHtml = `<div style="display:flex; gap:0.3rem; flex-wrap:wrap; margin-bottom:0.5rem;">` + ev.tags.map(t => `<span style="font-size:0.7rem; background:var(--glass-bg); padding:0.1rem 0.4rem; border-radius:0.2rem; color:var(--primary);">${escapeHTML(t)}</span>`).join('') + `</div>`; }
    
    let capHtml = '';
    let isFull = false;
    
    // Robust Capacity Rendering
    if (!isAnnouncement) {
        const safeCapacity = (ev.capacity === null || ev.capacity === undefined || ev.capacity === "") ? null : Number(ev.capacity);
        const rsvpCount = rsvpArray.length;

        if (safeCapacity !== null && Number.isFinite(safeCapacity)) {
            isFull = rsvpCount >= safeCapacity;
            const pct = Math.min(100, Math.round((rsvpCount / safeCapacity) * 100));
            capHtml = `
            <div style="margin-bottom:1rem; width:100%;">
                <div style="font-size:0.8rem; color:var(--text-muted); display:flex; justify-content:space-between; margin-bottom:0.3rem;">
                    <span><ion-icon name="people-outline"></ion-icon> 👥 ${rsvpCount} / ${safeCapacity} participants</span>
                    <span style="font-weight:600;">${pct}%</span>
                </div>
                <div style="width:100%; height:4px; background:var(--card-border); border-radius:2px; overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:${isFull ? 'var(--danger)' : 'var(--primary)'}; transition:width 0.3s;"></div>
                </div>
            </div>`;
        } else {
            capHtml = `<div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:1rem;"><ion-icon name="people-outline"></ion-icon> 👥 ${rsvpCount} participants</div>`;
        }
    }

    let actionBtnHtml = '';
    if (!isAnnouncement) {
        if (!isExpired) {
            if (hasRsvpd) {
                actionBtnHtml = `<button class="btn-primary" id="rsvp-btn-${ev.id}" onclick="toggleRSVP('${ev.id}', event)"><ion-icon name="checkmark-circle"></ion-icon> Joined</button>`;
            } else if (isFull) {
                // Completely disable button and make it visually distinct
                actionBtnHtml = `<button class="btn-primary" style="background:var(--card-border); color:var(--text-muted); border-color:var(--card-border); cursor:not-allowed;" disabled><ion-icon name="close-circle"></ion-icon> Event Full</button>`;
            } else {
                actionBtnHtml = `<button class="btn-primary" id="rsvp-btn-${ev.id}" onclick="toggleRSVP('${ev.id}', event)"><ion-icon name="calendar-number"></ion-icon> RSVP</button>`;
            }
        } else {
            actionBtnHtml = `<button class="btn-primary" disabled>Ended</button>`;
        }
    } else {
        if(ev.attachments && ev.attachments.length > 0) {
            actionBtnHtml = `<span style="font-size:0.85rem; color:var(--text-muted); display:flex; align-items:center; gap:0.25rem;"><ion-icon name="attach"></ion-icon> ${ev.attachments.length} Attachment${ev.attachments.length > 1 ? 's' : ''}</span>`;
        }
    }

    let categoryDisplay = isAnnouncement ? `<span class="announcement-badge"><ion-icon name="megaphone"></ion-icon> Announcement</span>` : `<span class="card-category">${escapeHTML(ev.category)}</span>`;

    return `
        <div class="event-card ${isExpired ? 'status-expired' : ''}" style="animation-delay: ${animDelay}; cursor:pointer;" onclick="if(!event.target.closest('.card-icon-btn, .btn-primary, .card-actions')){ showEventDetails('${ev.id}'); }">
            ${imageHtml}
            <div class="card-menu" style="display:flex; gap:0.5rem;">
                <button class="card-icon-btn ${isSaved ? 'saved' : ''}" style="color:${isSaved?'var(--warning)':'var(--text-muted)'}" onclick="window.toggleSave('${ev.id}', event)" title="Save Post"><ion-icon name="${isSaved ? 'bookmark' : 'bookmark-outline'}"></ion-icon></button>
                ${isOwner ? `<button class="card-icon-btn" style="color:var(--primary)" onclick="editEvent('${ev.id}')" title="Edit Post"><ion-icon name="create-outline"></ion-icon></button><button class="card-icon-btn danger" onclick="promptPin('${ev.id}', 'delete')" title="Delete Post"><ion-icon name="trash"></ion-icon></button>` : ''}
            </div>
            <div class="card-header">${categoryDisplay}${isExpired && !isAnnouncement ? '<span class="badge-expired">Ended</span>' : ''}</div>
            ${badgeHtml}
            ${isFull && !isAnnouncement ? `<div style="color:var(--danger); font-size:0.75rem; font-weight:700; letter-spacing:1px; margin-bottom:0.25rem;">EVENT FULL</div>` : ''}
            <h3 class="card-title">${highlightText(ev.title)}</h3>
            ${dateTimeHtml}
            ${locHtml}
            <div style="font-size:0.85rem; font-weight:500; margin-bottom:0.5rem;">${orgDisplay}</div>
            ${tagsHtml} ${capHtml}
            <div class="card-actions" style="margin-top:0.5rem;">
                ${actionBtnHtml}
            </div>
        </div>
    `;
}

// ====== Event Details Modal ======
window.showEventDetails = function(id) {
    const ev = events.find(e => e.id === id); if (!ev) return;
    const isAnnouncement = ev.category === 'Announcements';
    const isExpired = ev.dateTime ? new Date(ev.dateTime) < new Date() : false; 
    
    const rsvpArray = Array.isArray(ev.rsvps) ? ev.rsvps : [];
    const hasRsvpd = rsvpArray.some(r => r.uid === currentUser?.uid);
    const isSaved = currentUser.savedEvents && currentUser.savedEvents.includes(ev.id); 
    
    const safeCapacity = (ev.capacity === null || ev.capacity === undefined || ev.capacity === "") ? null : Number(ev.capacity);
    const isFull = !isAnnouncement && safeCapacity !== null && rsvpArray.length >= safeCapacity && !hasRsvpd;
    const isOwner = currentUser && ev.organizerId === currentUser.uid;
    
    let dateStr = ''; let timeStr = '';
    if (ev.dateTime) {
        let dateObj = new Date(ev.dateTime);
        dateStr = ev.date ? dateObj.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }) : dateObj.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        timeStr = ev.time ? (function(){ let [h, m] = ev.time.split(':'); let hr = parseInt(h); const ampm = hr >= 12 ? 'PM' : 'AM'; hr = hr % 12 || 12; return `${hr}:${m} ${ampm}`; })() : dateObj.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });
    } else if (ev.date) {
        dateStr = new Date(ev.date).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
    }

    let dateTimeHtml = (dateStr || timeStr) ? `<div style="margin-top:1.5rem; margin-bottom:1.5rem; color:var(--text-main);">${dateStr ? `<p style="margin-bottom:0.5rem;"><ion-icon name="calendar"></ion-icon> ${dateStr}</p>` : ''}${timeStr ? `<p style="margin-bottom:0.5rem;"><ion-icon name="time-outline"></ion-icon> ${timeStr}</p>` : ''}</div>` : '';

    let updatedHtml = ev.updatedAt ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.5rem; font-style:italic;">Last updated: ${new Date(ev.updatedAt).toLocaleString()}</div>` : '';
    let imageHtml = ev.imageUrl ? `<img src="${escapeHTML(ev.imageUrl)}" style="width:100%; height:200px; object-fit:cover; border-radius:1rem 1rem 0 0; background:var(--glass-bg);" alt="Banner" onerror="this.style.display='none'">` : '';

    let badgeHtml = '';
    if (ev.isOfficial !== undefined) { 
        if (ev.isOfficial) badgeHtml = `<div style="display:flex; align-items:center; gap:0.25rem; font-size:0.85rem; color:var(--success); font-weight:600; margin-bottom:1rem;"><ion-icon name="checkmark-circle"></ion-icon> Official College Source</div>`; 
        else badgeHtml = `<div style="display:flex; align-items:center; gap:0.25rem; font-size:0.85rem; color:var(--text-muted); font-weight:600; margin-bottom:1rem;"><ion-icon name="people"></ion-icon> Student / Unofficial</div>`; 
    }

    let locHtml = '';
    if (!isAnnouncement) {
        if (ev.eventFormat === 'online') { locHtml = `<p style="margin-bottom:0.5rem; color:var(--text-main);"><ion-icon name="laptop-outline"></ion-icon> Online Event</p>${ev.onlineMeetingLink ? `<a href="${escapeHTML(ev.onlineMeetingLink)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary); font-size:0.9rem;">Join Meeting</a>` : ''}`; } 
        else if (ev.eventFormat === 'offline' && ev.venue) { locHtml = `<p style="margin-bottom:0.5rem; color:var(--text-main);"><ion-icon name="location"></ion-icon> ${escapeHTML(ev.venue)}</p>${ev.locationLink ? `<a href="${escapeHTML(ev.locationLink)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary); font-size:0.9rem;">View Location</a>` : ''}`; } 
        else if (ev.location) { locHtml = `<p style="margin-bottom:0.5rem; color:var(--text-main);"><ion-icon name="location"></ion-icon> ${escapeHTML(ev.location)}</p>`; }
    }

    if(locHtml && dateTimeHtml) { dateTimeHtml = dateTimeHtml.replace('</div>', locHtml + '</div>'); } 
    else if (locHtml) { dateTimeHtml = `<div style="margin-top:1.5rem; margin-bottom:1.5rem; color:var(--text-main);">${locHtml}</div>`; }

    let orgHtml = ev.organizationName ? `<h4 style="margin-bottom:0.5rem;">${escapeHTML(ev.organizationName)}</h4>` : '';
    let orgUserUid = ev.organizerId || (allUsers.find(u => u.name.toLowerCase() === ev.organizerName.toLowerCase())?.uid || ev.organizerName);
    const orgPicUrl = allUsers.find(u => u.uid === orgUserUid)?.profilePicture || getAvatarUrl(orgUserUid);
    let contactHtml = ev.showContact ? `<button class="btn-secondary btn-small mt-3" onclick="window.contactOrganizer('${escapeHTML(ev.contactNumber || ev.contact || '')}')"><ion-icon name="call"></ion-icon> Contact Organizer</button>` : '';

    let tagsHtml = '';
    if (ev.tags && ev.tags.length > 0) { tagsHtml = `<hr style="border:none; border-top:1px solid var(--card-border); margin: 1.5rem 0;"><div style="color:var(--text-muted); font-size:0.75rem; font-weight:700; letter-spacing:1px; margin-bottom:0.5rem;">TAGS</div><div style="display:flex; gap:0.5rem; flex-wrap:wrap;">` + ev.tags.map(t => `<span style="font-size:0.8rem; background:var(--glass-bg); padding:0.2rem 0.6rem; border-radius:1rem; color:var(--primary);">${escapeHTML(t)}</span>`).join('') + `</div>`; }

    let capHtml = '';
    if (!isAnnouncement) { 
        capHtml = `<hr style="border:none; border-top:1px solid var(--card-border); margin: 1.5rem 0;"><div style="color:var(--text-muted); font-size:0.75rem; font-weight:700; letter-spacing:1px; margin-bottom:1rem;">PARTICIPANTS</div>`;
        if (safeCapacity !== null && Number.isFinite(safeCapacity)) {
            const pct = Math.min(100, Math.round((rsvpArray.length / safeCapacity) * 100));
            capHtml += `
            <div style="margin-bottom:1rem; max-width:300px;">
                <div style="font-size:0.95rem; color:var(--text-main); display:flex; justify-content:space-between; margin-bottom:0.5rem;">
                    <span>👥 ${rsvpArray.length} / ${safeCapacity} registered</span>
                    <span style="font-weight:700; color:${isFull ? 'var(--danger)' : 'var(--text-main)'}">${pct}%</span>
                </div>
                <div style="width:100%; height:8px; background:var(--card-border); border-radius:4px; overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:${isFull ? 'var(--danger)' : 'var(--primary)'};"></div>
                </div>
            </div>`;
        } else {
            capHtml += `<div style="font-size:0.95rem; color:var(--text-main); margin-bottom:1rem;">👥 ${rsvpArray.length} registered</div>`;
        }
    }

    let attHtml = '';
    if (ev.attachments && ev.attachments.length > 0) {
        attHtml = `<hr style="border:none; border-top:1px solid var(--card-border); margin: 1.5rem 0;"><div style="color:var(--text-muted); font-size:0.75rem; font-weight:700; letter-spacing:1px; margin-bottom:0.5rem;">ATTACHMENTS</div><div style="display:flex; flex-direction:column; gap:0.5rem;">`;
        ev.attachments.forEach(att => {
            const isPdf = att.type.includes('pdf');
            attHtml += `<div style="display:flex; align-items:center; justify-content:space-between; background:var(--glass-bg); border:1px solid var(--card-border); padding:0.5rem 1rem; border-radius:0.5rem;"><div style="display:flex; align-items:center; gap:0.5rem;"><ion-icon name="${isPdf ? 'document-text' : 'image'}"></ion-icon> <span>${escapeHTML(att.name)}</span></div><div><a href="${escapeHTML(att.data)}" ${isPdf ? `download="${escapeHTML(att.name)}"` : `target="_blank"`} class="btn-secondary btn-small">${isPdf ? 'Download' : 'View'}</a></div></div>`;
        });
        attHtml += `</div>`;
    }

    let rsvpButtonHtml = '';
    let viewAttendeesBtn = '';
    if (!isAnnouncement) {
        if (!isExpired) {
            if (hasRsvpd) {
                rsvpButtonHtml = `<button class="btn-primary" onclick="toggleRSVP('${ev.id}', event); document.getElementById('closeEventDetailsModal').click();"><ion-icon name="checkmark-circle"></ion-icon> Joined (Cancel)</button>`;
            } else if (isFull) {
                rsvpButtonHtml = `<button class="btn-primary" style="background:var(--card-border); color:var(--text-muted); border-color:var(--card-border); cursor:not-allowed;" disabled><ion-icon name="close-circle"></ion-icon> Event Full</button>`;
            } else {
                rsvpButtonHtml = `<button class="btn-primary" onclick="toggleRSVP('${ev.id}', event); document.getElementById('closeEventDetailsModal').click();"><ion-icon name="calendar-number"></ion-icon> RSVP</button>`;
            }
        } else {
            rsvpButtonHtml = `<button class="btn-primary" disabled>Ended</button>`;
        }
        if (isOwner) { viewAttendeesBtn = `<button class="btn-secondary" onclick="promptPin('${ev.id}', 'attendees')"><ion-icon name="people"></ion-icon> View RSVPs</button>`; }
    }

    const modalContent = `
        ${imageHtml}
        <div style="padding: 2rem;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    ${isAnnouncement ? `<span class="announcement-badge" style="margin-bottom:0.5rem; display:inline-flex;"><ion-icon name="megaphone"></ion-icon> Announcement</span>` : ''}
                    ${badgeHtml}
                </div>
                ${isOwner ? `<button class="btn-secondary btn-small" onclick="editEvent('${ev.id}')"><ion-icon name="create-outline"></ion-icon> Edit</button>` : ''}
            </div>
            <h2 style="font-size:1.75rem; margin-bottom:1rem; line-height:1.2;">${escapeHTML(ev.title)}</h2>
            ${updatedHtml}
            ${dateTimeHtml}
            <hr style="border:none; border-top:1px solid var(--card-border); margin: 1.5rem 0;">
            <div style="color:var(--text-muted); font-size:0.75rem; font-weight:700; letter-spacing:1px; margin-bottom:0.5rem;">ABOUT</div>
            <p style="line-height:1.6; white-space:pre-wrap;">${escapeHTML(ev.description)}</p>
            <hr style="border:none; border-top:1px solid var(--card-border); margin: 1.5rem 0;">
            <div style="color:var(--text-muted); font-size:0.75rem; font-weight:700; letter-spacing:1px; margin-bottom:0.5rem;">ORGANIZATION</div>
            ${orgHtml}
            <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:0.25rem;">Organizer:</div>
            <div style="display:flex; align-items:center; gap:0.5rem;"><img src="${orgPicUrl}" alt="Avatar" style="width:32px; height:32px; border-radius:50%; object-fit:cover;"><span style="font-weight:600;">${escapeHTML(ev.organizerName)}</span></div>
            ${contactHtml} ${tagsHtml} ${capHtml} ${attHtml}
            <hr style="border:none; border-top:1px solid var(--card-border); margin: 1.5rem 0;">
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:space-between; align-items:center;">
                <div style="display:flex; gap:0.5rem;">
                    ${rsvpButtonHtml}
                    <button class="btn-secondary" onclick="window.toggleSave('${ev.id}', event)" style="color:${isSaved?'var(--warning)':''}"><ion-icon name="${isSaved ? 'bookmark' : 'bookmark-outline'}"></ion-icon> ${isSaved ? 'Saved' : 'Save'}</button>
                </div>
                <div style="display:flex; gap:0.5rem;">
                    ${viewAttendeesBtn}
                    ${!isAnnouncement && !isExpired ? `<button class="card-icon-btn" onclick="downloadICS('${ev.id}')" title="Add to Calendar"><ion-icon name="calendar-outline"></ion-icon></button>` : ''}
                    <button class="card-icon-btn" onclick="shareEvent('${ev.id}')" title="Share"><ion-icon name="share-social"></ion-icon></button>
                    <button class="card-icon-btn danger" onclick="flagEvent('${ev.id}')" title="Flag"><ion-icon name="flag"></ion-icon></button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('eventDetailsContent').innerHTML = modalContent;
    document.getElementById('eventDetailsModal').classList.add('active');
}

// ====== Interactivity ======
window.toggleSave = function(id, event) {
    if (!currentUser) return;
    if (!currentUser.savedEvents) currentUser.savedEvents = [];
    const index = currentUser.savedEvents.indexOf(id);
    if (index >= 0) { currentUser.savedEvents.splice(index, 1); showToast('Post removed from saved posts.'); } 
    else { currentUser.savedEvents.push(id); showToast('Post saved.'); }
    saveData(); if (currentView === 'home') renderFeed(); else if (currentView === 'dashboard') renderDashboard();
}

window.contactOrganizer = function(phone) {
    if (!phone || phone.trim() === '') { showToast('Contact number not available.', 'error'); return; }
    if (navigator.clipboard) { navigator.clipboard.writeText(phone); showToast('Contact number copied.'); }
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) { window.location.href = `tel:${phone}`; }
}

// Centralized authoritative RSVP validator & handler
window.toggleRSVP = function(id, event) {
    if (!currentUser) { showToast("Please log in to RSVP.", "error"); return; }
    
    // Always query fresh from state array to mitigate UI race conditions
    const ev = events.find(e => e.id === id);
    if (!ev) { showToast("Event not found.", "error"); return; }
    if (ev.dateTime && new Date(ev.dateTime) < new Date()) { showToast("This event has ended.", "error"); return; }
    if (ev.category === 'Announcements') { showToast("Announcements do not support RSVPs.", "error"); return; }
    
    // Normalize properties
    const rsvps = Array.isArray(ev.rsvps) ? ev.rsvps : [];
    const capacity = (ev.capacity === null || ev.capacity === undefined || ev.capacity === "") ? null : Number(ev.capacity);
    
    const existingIndex = rsvps.findIndex(r => r.uid === currentUser.uid);
    
    // Cancellation block
    if (existingIndex >= 0) { 
        rsvps.splice(existingIndex, 1); 
        ev.rsvps = rsvps;
        showToast('Removed from RSVPs'); 
    } 
    // Registration block
    else {
        // Enforce strict capacity limit
        if (capacity !== null && Number.isFinite(capacity) && rsvps.length >= capacity) { 
            showToast('This event is full.', 'error'); 
            return; 
        }
        
        rsvps.push({ uid: currentUser.uid, name: currentUser.name, userClass: currentUser.userClass, roll: currentUser.roll });
        ev.rsvps = rsvps;
        createParticles(event.clientX || window.innerWidth/2, event.clientY || window.innerHeight/2); 
        showToast('RSVP confirmed! 🎉');
    }
    
    saveData(); 
    if (currentView === 'home') renderFeed(); 
    else if (currentView === 'dashboard') renderDashboard();
}

window.promptPin = function(id, action) {
    if (!currentUser) { showToast("Unauthorized action.", "error"); return; }
    const ev = events.find(e => e.id === id);
    if (!ev || ev.organizerId !== currentUser.uid) { showToast("Unauthorized action.", "error"); return; }

    currentEventId = id; actionPending = action;
    document.getElementById('pinPromptTitle').textContent = action === 'delete' ? 'Delete Post' : 'View Attendees';
    document.getElementById('pinInput').value = '';
    document.getElementById('pinError').classList.add('hidden');
    document.getElementById('pinPromptModal').classList.add('active');
}

async function handlePinVerification() {
    if (!currentUser) { showToast("Unauthorized action.", "error"); return; }
    const pin = document.getElementById('pinInput').value;
    const ev = events.find(e => e.id === currentEventId);
    
    if (!ev) { showToast("Post not found.", "error"); return; }
    if (ev.organizerId !== currentUser.uid) { showToast("Unauthorized action.", "error"); return; }

    let isValid = false;
    if (ev.pinHash && ev.pinSalt) {
        const enteredPinHash = await hashPassword(pin, ev.pinSalt);
        isValid = (enteredPinHash === ev.pinHash);
    } else if (ev.pin) { isValid = (pin === ev.pin); }

    if (isValid) {
        document.getElementById('pinPromptModal').classList.remove('active');
        if (actionPending === 'delete') {
            const originalEvents = [...events];
            events = events.filter(e => e.id !== currentEventId);
            if(!saveData()) { events = originalEvents; showToast("Storage error prevented deletion.", "error"); } 
            else { showToast('Post deleted successfully'); if (currentView === 'home') renderFeed(); else if (currentView === 'dashboard') renderDashboard(); }
        } else if (actionPending === 'attendees') showAttendees(ev);
    } else { document.getElementById('pinError').classList.remove('hidden'); }
}

function showAttendees(ev) {
    const list = document.getElementById('attendeesList'); list.innerHTML = '';
    const rsvps = Array.isArray(ev.rsvps) ? ev.rsvps : [];
    
    let headerText = '';
    if (ev.category !== 'Announcements') {
        const safeCapacity = (ev.capacity === null || ev.capacity === undefined || ev.capacity === "") ? null : Number(ev.capacity);
        if (safeCapacity !== null && Number.isFinite(safeCapacity)) {
            headerText = `<div style="font-size:0.95rem; font-weight:600; color:var(--text-main); padding-bottom:1rem; text-align:center; border-bottom:1px solid var(--card-border); margin-bottom:1rem;">Registered: ${rsvps.length} / ${safeCapacity}</div>`;
        } else {
            headerText = `<div style="font-size:0.95rem; font-weight:600; color:var(--text-main); padding-bottom:1rem; text-align:center; border-bottom:1px solid var(--card-border); margin-bottom:1rem;">Registered: ${rsvps.length}</div>`;
        }
        list.innerHTML = headerText;
    }

    if (ev.category === 'Announcements') { list.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Announcements do not have attendees.</p>'; }
    else if (rsvps.length === 0) { list.innerHTML += '<p style="text-align:center; color:var(--text-muted);">No attendees yet.</p>'; }
    else {
        rsvps.forEach(userRef => {
            const realUser = allUsers.find(u => u.uid === userRef.uid); const picUrl = realUser?.profilePicture || getAvatarUrl(userRef.uid);
            list.innerHTML += `<div class="attendee-item"><img src="${picUrl}" alt="Avatar"><div class="attendee-info"><span class="attendee-name">${escapeHTML(userRef.name)}</span><span class="attendee-meta">${escapeHTML(userRef.userClass.toUpperCase())} | Roll: ${escapeHTML(userRef.roll)}</span></div></div>`;
        });
    }
    document.getElementById('attendeesModal').classList.add('active');
}

window.flagEvent = function(id) {
    const ev = events.find(e => e.id === id);
    if (ev) { ev.flags = (ev.flags || 0) + 1; saveData(); showToast('Post flagged for moderation.'); if (currentView === 'home') renderFeed(); else if (currentView === 'dashboard') renderDashboard(); }
}

window.shareEvent = function(id) {
    const ev = events.find(e => e.id === id); if (!ev) return;
    const dateText = ev.dateTime ? ` on ${new Date(ev.dateTime).toLocaleString()}` : '';
    const shareText = `Check out "${ev.title}"${dateText} via CampusConnect!`;
    if (navigator.clipboard) navigator.clipboard.writeText(shareText).then(() => showToast('Post details copied to clipboard!'));
    else showToast('Copy to clipboard not supported on this browser', 'error');
}

window.downloadICS = function(id) {
    const ev = events.find(e => e.id === id); 
    if (!ev || ev.category === 'Announcements') { showToast('Calendar export is not available for announcements.', 'error'); return; }
    
    const startDate = new Date(ev.dateTime); const endDate = new Date(startDate.getTime() + (2 * 60 * 60 * 1000));
    const formatDate = (date) => date.toISOString().replace(/-|:|\.\d+/g, '');
    const icsContent = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `DTSTART:${formatDate(startDate)}`, `DTEND:${formatDate(endDate)}`, `SUMMARY:${ev.title}`, `DESCRIPTION:${ev.description.replace(/\n/g, '\\n')}`, `LOCATION:${ev.venue || ev.location || ev.onlineMeetingLink || ''}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${ev.title.replace(/\s+/g, '_')}.ics`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); showToast('Calendar file downloaded!');
}

function createParticles(x, y) {
    const colors = ['#6c5ce7', '#a29bfe', '#fdcb6e', '#00b894'];
    for (let i = 0; i < 15; i++) {
        const particle = document.createElement('div'); particle.className = 'particle';
        const size = Math.random() * 8 + 4; particle.style.width = `${size}px`; particle.style.height = `${size}px`; particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        particle.style.left = `${x}px`; particle.style.top = `${y}px`;
        const angle = Math.random() * Math.PI * 2; const velocity = 30 + Math.random() * 50;
        particle.style.setProperty('--tx', `${Math.cos(angle) * velocity}px`); particle.style.setProperty('--ty', `${Math.sin(angle) * velocity}px`);
        document.body.appendChild(particle); setTimeout(() => particle.remove(), 800);
    }
}
