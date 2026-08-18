// Real account system: Google sign-in (Firebase Auth) + a persisted
// profile per user (Firestore), so a signed-in person's answers follow
// them across devices - not just saved to one browser's localStorage,
// which is all the rest of this site's "preferences" ever do.
//
// Separate module from app.js on purpose: this is a distinct
// subsystem (auth + a real backend) with its own real setup
// dependency (a real Firebase project - see the setup checklist this
// was handed over with). app.js's existing localStorage-based
// features (favorite-teams watchlist, alert toggles) are untouched -
// this account profile is new, real, additive data, not a replacement
// for what already worked.
//
// Cannot be fully verified end-to-end from here: it's written against
// Firebase's real, documented v10 modular SDK, but real behavior can
// only be confirmed once a real Firebase project exists and its
// config is filled in below (see firebase-config.js).
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

// Real config hasn't been filled in yet (still the REPLACE_ME
// placeholders from firebase-config.js) - skip Firebase entirely
// rather than let the SDK attempt real network calls against a fake
// project, which could surface as a confusing console error instead
// of the clear, actionable one below. The rest of the site (all the
// real match/FPL data) has no dependency on this module and keeps
// working regardless.
const configIsReal = Object.values(firebaseConfig).every((v) => typeof v === 'string' && !v.includes('REPLACE_ME'));
if (!configIsReal) {
  console.warn('YobraPulse account system: firebase-config.js still has placeholder values - sign-in is disabled until a real Firebase project is configured. See the setup checklist.');
}

const app = configIsReal ? initializeApp(firebaseConfig) : null;
const auth = configIsReal ? getAuth(app) : null;
const db = configIsReal ? getFirestore(app) : null;

let currentUser = null;
let currentProfile = null;
let teamNames = [];

// Landing screen: shown once per browser (soft gate, not a hard
// requirement - the whole app still works for anyone who clicks
// "Continue as guest", nothing here blocks access to real content).
// Checked synchronously against localStorage before Firebase's async
// auth check even resolves, so a returning visitor who already
// dismissed it (by signing in or choosing guest) never sees a flash
// of the landing screen while waiting on a network round-trip.
function shouldSkipLanding() {
  return localStorage.getItem('yp-landing-dismissed') === 'true';
}

function dismissLanding() {
  localStorage.setItem('yp-landing-dismissed', 'true');
  const landing = document.querySelector('#landing-screen');
  const shell = document.querySelector('#app-shell');
  if (landing) landing.hidden = true;
  if (shell) shell.hidden = false;
}

if (shouldSkipLanding()) {
  dismissLanding();
}
document.querySelector('#landing-guest-btn')?.addEventListener('click', dismissLanding);
document.querySelector('#landing-signin-btn')?.addEventListener('click', () => handleSignIn());

function initials(name) {
  return (name || '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

async function loadTeamNames() {
  try {
    const res = await fetch('data/fpl.json', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    teamNames = (data.teams || []).map((t) => t.name).sort();
    populateTeamSelect('#account-primary-team', teamNames);
    populateTeamSelect('#account-secondary-team', teamNames);
    syncTeamSelectExclusion();
  } catch (err) {
    // Real team list just isn't available yet (e.g. first-ever run
    // before data/fpl.json exists) - selects stay empty, not fake.
  }
}

function populateTeamSelect(selector, names) {
  const select = document.querySelector(selector);
  if (!select || !names.length) return;
  const placeholder = select.querySelector('option[value=""]');
  select.innerHTML = '';
  if (placeholder) select.appendChild(placeholder);
  names.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

// The team you support and the team you support second can't honestly
// be the same club - hides whichever club is picked as primary from
// the secondary list, and clears secondary if it was already set to
// that club (e.g. right after switching primary to it).
function syncTeamSelectExclusion() {
  const primarySelect = document.querySelector('#account-primary-team');
  const secondarySelect = document.querySelector('#account-secondary-team');
  if (!primarySelect || !secondarySelect) return;
  const primaryValue = primarySelect.value;
  Array.from(secondarySelect.options).forEach((opt) => {
    opt.hidden = !!opt.value && opt.value === primaryValue;
  });
  if (secondarySelect.value && secondarySelect.value === primaryValue) {
    secondarySelect.value = '';
  }
}

function profileIsComplete(profile) {
  return !!(profile && profile.primaryTeam);
}

function renderSignedOut() {
  document.querySelector('#account-signed-out').hidden = false;
  document.querySelector('#account-signed-in').hidden = true;
  document.querySelector('#sidebar-user-name').textContent = 'Sign in';
  document.querySelector('#sidebar-user-status').textContent = 'Save your profile for real';
  const avatarEl = document.querySelector('#sidebar-avatar');
  avatarEl.textContent = '?';
  avatarEl.innerHTML = '?';
  const heroName = document.querySelector('#hero-name');
  if (heroName) heroName.textContent = 'there';
}

function renderSignedIn(user, profile) {
  document.querySelector('#account-signed-out').hidden = true;
  document.querySelector('#account-signed-in').hidden = false;

  const sidebarAvatar = document.querySelector('#sidebar-avatar');
  const accountAvatar = document.querySelector('#account-avatar');
  if (user.photoURL) {
    sidebarAvatar.innerHTML = `<img src="${user.photoURL}" alt="" referrerpolicy="no-referrer">`;
    accountAvatar.src = user.photoURL;
    accountAvatar.hidden = false;
  } else {
    sidebarAvatar.textContent = initials(user.displayName);
    accountAvatar.hidden = true;
  }
  document.querySelector('#sidebar-user-name').textContent = user.displayName || 'Signed in';
  document.querySelector('#sidebar-user-status').textContent = profileIsComplete(profile) ? profile.primaryTeam : 'Finish setting up';
  document.querySelector('#account-name').textContent = user.displayName || '';
  document.querySelector('#account-email').textContent = user.email || '';
  const heroName = document.querySelector('#hero-name');
  if (heroName) heroName.textContent = (user.displayName || 'there').trim().split(/\s+/)[0];

  document.querySelector('#account-incomplete-banner').hidden = profileIsComplete(profile);

  const isManager = !!(profile && profile.isFplManager);
  document.querySelector('#account-fpl-manager').checked = isManager;
  document.querySelector('#account-fpl-fields').hidden = !isManager;
  document.querySelector('#account-fpl-team-name').value = (profile && profile.fplTeamName) || '';
  document.querySelector('#account-fpl-team-id').value = (profile && profile.fplTeamId) || '';
  document.querySelector('#account-primary-team').value = (profile && profile.primaryTeam) || '';
  document.querySelector('#account-secondary-team').value = (profile && profile.secondaryTeam) || '';
  syncTeamSelectExclusion();
}

async function loadProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

async function refreshAccountUI() {
  await loadTeamNames();
  if (!currentUser) {
    renderSignedOut();
    return;
  }
  currentProfile = await loadProfile(currentUser.uid);
  renderSignedIn(currentUser, currentProfile);
}

if (configIsReal) {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) dismissLanding();
    await refreshAccountUI();
  });
} else {
  // No real project configured yet - still populate team selects and
  // show the signed-out state so Settings doesn't look broken/blank.
  loadTeamNames();
  renderSignedOut();
}

function handleSignIn() {
  if (!configIsReal) {
    console.warn('Sign-in is disabled until firebase-config.js has real values.');
    return;
  }
  signInWithPopup(auth, new GoogleAuthProvider()).catch((err) => {
    console.error('Google sign-in failed:', err);
  });
}

function handleSignOut() {
  if (configIsReal) signOut(auth);
}

async function handleSave() {
  if (!configIsReal || !currentUser) return;
  const primaryTeam = document.querySelector('#account-primary-team').value;
  if (!primaryTeam) {
    document.querySelector('#account-primary-team').focus();
    return;
  }
  const isManager = document.querySelector('#account-fpl-manager').checked;
  const profile = {
    name: currentUser.displayName || '',
    email: currentUser.email || '',
    photoURL: currentUser.photoURL || '',
    isFplManager: isManager,
    fplTeamName: isManager ? document.querySelector('#account-fpl-team-name').value.trim() || null : null,
    fplTeamId: isManager ? document.querySelector('#account-fpl-team-id').value.trim() || null : null,
    primaryTeam,
    secondaryTeam: document.querySelector('#account-secondary-team').value || null,
    updatedAt: serverTimestamp(),
  };
  if (!currentProfile) profile.createdAt = serverTimestamp();
  await setDoc(doc(db, 'users', currentUser.uid), profile, { merge: true });
  currentProfile = { ...currentProfile, ...profile };
  renderSignedIn(currentUser, currentProfile);

  const status = document.querySelector('#account-save-status');
  if (status) {
    status.style.display = 'inline-flex';
    setTimeout(() => { status.style.display = 'none'; }, 1800);
  }
}

document.querySelector('#google-signin-btn')?.addEventListener('click', handleSignIn);
document.querySelector('#account-signout-btn')?.addEventListener('click', handleSignOut);
document.querySelector('#account-save-btn')?.addEventListener('click', handleSave);
document.querySelector('#account-fpl-manager')?.addEventListener('change', (event) => {
  document.querySelector('#account-fpl-fields').hidden = !event.target.checked;
});
document.querySelector('#account-primary-team')?.addEventListener('change', syncTeamSelectExclusion);
document.querySelector('#sidebar-user-profile')?.addEventListener('click', () => {
  if (currentUser) {
    document.querySelector('[data-view="settings"]')?.click();
  } else {
    handleSignIn();
  }
});
