// Real admin dashboard for YobraPulse's owner: payments, subscribers,
// revenue. The real access control is server-side (functions/index.js's
// getAdminStats checks request.auth.uid against a hardcoded ADMIN_UID and
// bypasses anyone else) - the sign-in flow here is just to get a real
// Firebase Auth ID token attached to the callable request, not the
// security boundary itself.
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {
  getFunctions, httpsCallable,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app);

const states = {
  signedOut: document.querySelector('#admin-signed-out'),
  forbidden: document.querySelector('#admin-forbidden'),
  loading: document.querySelector('#admin-loading'),
  content: document.querySelector('#admin-content'),
};

function showState(name) {
  Object.entries(states).forEach(([key, el]) => { el.hidden = key !== name; });
  document.querySelector('#admin-signout-btn').hidden = name === 'signedOut';
}

function fmtKes(n) {
  return `KES ${Number(n || 0).toLocaleString()}`;
}

function fmtDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function renderStats(data) {
  document.querySelector('#stat-total-users').textContent = data.totalUsers;
  document.querySelector('#stat-active-subs').textContent = data.activeSubscribers;
  document.querySelector('#stat-subs-breakdown').textContent = `${data.subscribersByPlan.weekly || 0} weekly · ${data.subscribersByPlan.monthly || 0} monthly`;
  document.querySelector('#stat-revenue').textContent = fmtKes(data.totalRevenueKes);
  document.querySelector('#stat-payments-breakdown').textContent = `${data.successfulPayments} / ${data.failedPayments} / ${data.pendingPayments}`;

  const body = document.querySelector('#admin-payments-body');
  if (!data.recentPayments.length) {
    body.innerHTML = '<tr><td colspan="6" class="muted">No payments yet.</td></tr>';
  } else {
    body.innerHTML = data.recentPayments.map((p) => `
      <tr>
        <td>${fmtDate(p.createdAt)}</td>
        <td>${p.phone || '-'}</td>
        <td>${p.plan || '-'}</td>
        <td>${fmtKes(p.amount)}</td>
        <td><span class="status-pill ${p.status}">${p.status}</span></td>
        <td>${p.mpesaReceiptNumber || '-'}</td>
      </tr>
    `).join('');
  }
  lucide.createIcons();
}

async function loadStats() {
  showState('loading');
  try {
    const getAdminStats = httpsCallable(functions, 'getAdminStats');
    const { data } = await getAdminStats();
    renderStats(data);
    showState('content');
  } catch (err) {
    if (err.code === 'functions/permission-denied') {
      showState('forbidden');
    } else {
      console.error('Failed to load admin stats:', err);
      showState('forbidden');
    }
  }
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    loadStats();
  } else {
    showState('signedOut');
  }
  lucide.createIcons();
});

document.querySelector('#admin-signin-btn').addEventListener('click', () => {
  signInWithPopup(auth, new GoogleAuthProvider()).catch((err) => console.error('Sign-in failed:', err));
});
document.querySelector('#admin-signout-btn').addEventListener('click', () => signOut(auth));
document.querySelector('#admin-refresh-btn')?.addEventListener('click', loadStats);
