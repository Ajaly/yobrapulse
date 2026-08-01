const heroDate = document.querySelector('#hero-date');
if (heroDate) {
  heroDate.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const greeting = document.querySelector('#greeting');
if (greeting) {
  const hour = new Date().getHours();
  greeting.textContent = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

const views = document.querySelectorAll('.view');
const navItems = document.querySelectorAll('[data-view]');
const pageTitle = document.querySelector('#page-title');
const titles = { dashboard: 'Overview', live: 'Live scores', fpl: 'FPL assistant', performance: 'Performance tracker', fixtures: 'Fixtures', teams: 'Teams & players', news: 'News', settings: 'Settings' };

function showView(viewName) {
  const target = document.querySelector(`#${viewName}-view`) || document.querySelector('#dashboard-view');
  views.forEach((view) => view.classList.toggle('active', view === target));
  document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === viewName));
  pageTitle.textContent = titles[viewName] || titles.dashboard;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

navItems.forEach((item) => item.addEventListener('click', () => showView(item.dataset.view)));

const initialView = window.location.hash.slice(1);
if (titles[initialView]) {
  showView(initialView);
}

document.querySelectorAll('.tabs').forEach((group) => {
  group.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
    group.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
  }));
});

const prefs = JSON.parse(localStorage.getItem('yp-prefs') || '{}');
document.querySelectorAll('[data-pref]').forEach((input) => {
  const key = input.dataset.pref;
  if (key in prefs) input.checked = prefs[key];
  input.addEventListener('change', () => {
    prefs[key] = input.checked;
    localStorage.setItem('yp-prefs', JSON.stringify(prefs));
  });
});

const teamChips = document.querySelectorAll('#team-chips .chip');
const savedTeams = JSON.parse(localStorage.getItem('yp-teams') || 'null');
if (savedTeams) {
  teamChips.forEach((chip) => chip.classList.toggle('selected', savedTeams.includes(chip.dataset.team)));
}
teamChips.forEach((chip) => chip.addEventListener('click', () => {
  chip.classList.toggle('selected');
  const selected = Array.from(teamChips).filter((c) => c.classList.contains('selected')).map((c) => c.dataset.team);
  localStorage.setItem('yp-teams', JSON.stringify(selected));
}));

function initials(name) {
  return name.trim().split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase();
}

function applyProfile(name) {
  const first = name.trim().split(/\s+/)[0] || 'Jordan';
  document.querySelectorAll('.user-profile strong').forEach((el) => { el.textContent = name; });
  document.querySelectorAll('.avatar').forEach((el) => { el.textContent = initials(name); });
  const heroName = document.querySelector('#hero-name');
  if (heroName) heroName.textContent = first;
}

const nameInput = document.querySelector('#settings-name');
const emailInput = document.querySelector('#settings-email');
const savedProfile = JSON.parse(localStorage.getItem('yp-profile') || 'null');
if (savedProfile && nameInput && emailInput) {
  nameInput.value = savedProfile.name;
  emailInput.value = savedProfile.email;
  applyProfile(savedProfile.name);
}

const saveButton = document.querySelector('#settings-save');
const saveStatus = document.querySelector('#save-status');
if (saveButton) {
  saveButton.addEventListener('click', () => {
    const name = nameInput.value.trim() || 'Jordan Davis';
    const email = emailInput.value.trim();
    localStorage.setItem('yp-profile', JSON.stringify({ name, email }));
    applyProfile(name);
    if (saveStatus) {
      saveStatus.style.display = 'inline-flex';
      setTimeout(() => { saveStatus.style.display = 'none'; }, 1800);
    }
  });
}

const players = {
  saka: { name: 'Bukayo Saka', position: 'RW', team: 'Arsenal', nation: 'England', avatar: 'BS', avatarClass: '', rating: '8.7', minutes: 612, goals: 5, assists: 4, form: ['high', 'high', 'mid', 'high', 'high'], price: '£9.1m', owned: '52.8%', points: 13, next: "vs Southampton (H) · Sun 20 Oct" },
  haaland: { name: 'Erling Haaland', position: 'ST', team: 'Man City', nation: 'Norway', avatar: 'EH', avatarClass: 'blue-avatar', rating: '8.4', minutes: 648, goals: 8, assists: 2, form: ['high', 'mid', 'high', 'high', 'low'], price: '£15.2m', owned: '68.4%', points: 18, next: "vs Tottenham (H) · Sun 20 Oct" },
  kvaratskhelia: { name: 'Khvicha Kvaratskhelia', position: 'LW', team: 'Napoli', nation: 'Georgia', avatar: 'KM', avatarClass: 'orange-avatar', rating: '8.2', minutes: 570, goals: 4, assists: 5, form: ['mid', 'high', 'high', 'mid', 'high'], price: '£8.2m', owned: '24.6%', points: 9, next: "vs AC Milan (A) · Sun 20 Oct" },
  odegaard: { name: 'Martin Ødegaard', position: 'CM', team: 'Arsenal', nation: 'Norway', avatar: 'MO', avatarClass: 'pink-avatar', rating: '8.1', minutes: 598, goals: 2, assists: 6, form: ['mid', 'high', 'mid', 'high', 'high'], price: '£6.7m', owned: '31.4%', points: 8, next: "vs Southampton (H) · Sun 20 Oct" },
  palmer: { name: 'Cole Palmer', position: 'MID', team: 'Chelsea', nation: 'England', avatar: 'CP', avatarClass: 'pink-avatar', rating: '8.0', minutes: 590, goals: 6, assists: 3, form: ['high', 'high', 'mid', 'high', 'mid'], price: '£6.4m', owned: '41.2%', points: 15, next: "vs Liverpool (A) · Sat 19 Oct" },
  salah: { name: 'Mohamed Salah', position: 'RW', team: 'Liverpool', nation: 'Egypt', avatar: 'MS', avatarClass: 'orange-avatar', rating: '8.3', minutes: 605, goals: 7, assists: 4, form: ['high', 'high', 'high', 'mid', 'high'], price: '£12.8m', owned: '63.5%', points: 11, next: "vs Chelsea (H) · Sat 19 Oct" },
};

const playerModal = document.querySelector('#player-modal');
const playerModalClose = document.querySelector('#player-modal-close');
let lastPlayerTrigger = null;

function openPlayerModal(key, triggerEl) {
  const p = players[key];
  if (!p || !playerModal) return;
  const isReal = !p.team;
  lastPlayerTrigger = triggerEl;
  document.querySelector('#pm-avatar').textContent = p.avatar;
  document.querySelector('#pm-avatar').className = 'modal-avatar' + (p.avatarClass ? ' ' + p.avatarClass : '');
  document.querySelector('#pm-name').textContent = p.name;
  document.querySelector('#pm-meta').textContent = isReal ? p.position : `${p.position} · ${p.team} · ${p.nation}`;
  document.querySelector('#pm-rating').textContent = typeof p.rating === 'number' ? p.rating.toFixed(1) : p.rating;
  document.querySelector('#pm-minutes').textContent = p.minutes;
  document.querySelector('#pm-goals').textContent = p.goals;
  document.querySelector('#pm-assists').textContent = p.assists;
  document.querySelector('#pm-price').textContent = p.price;
  document.querySelector('#pm-owned').textContent = p.owned;
  document.querySelector('#pm-points').textContent = p.points;
  document.querySelector('#pm-points-label').textContent = isReal ? 'Points (25/26)' : 'GW9 pts';
  const formEl = document.querySelector('#pm-form');
  if (Array.isArray(p.form)) {
    formEl.innerHTML = p.form.map((level) => `<i class="${level}"></i>`).join('');
  } else {
    const level = p.form >= 5 ? 'high' : p.form >= 2.5 ? 'mid' : 'low';
    formEl.innerHTML = Array(5).fill(`<i class="${level}"></i>`).join('');
  }
  const nextKicker = document.querySelector('#pm-next-kicker');
  const nextEl = document.querySelector('#pm-next');
  if (isReal) {
    nextKicker.textContent = 'Outlook';
    nextEl.textContent = `Projected ${p.epNext.toFixed(1)} pts next gameweek`;
  } else {
    nextKicker.textContent = 'Next fixture';
    nextEl.textContent = p.next;
  }
  playerModal.hidden = false;
  document.body.classList.add('modal-open');
  playerModalClose.focus();
}

function closePlayerModal() {
  if (!playerModal || playerModal.hidden) return;
  playerModal.hidden = true;
  document.body.classList.remove('modal-open');
  if (lastPlayerTrigger) lastPlayerTrigger.focus();
}

function bindPlayerTriggers(scope) {
  scope.querySelectorAll('[data-player]').forEach((row) => {
    row.addEventListener('click', () => openPlayerModal(row.dataset.player, row));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openPlayerModal(row.dataset.player, row);
      }
    });
  });
}

bindPlayerTriggers(document);

if (playerModalClose) playerModalClose.addEventListener('click', closePlayerModal);
if (playerModal) playerModal.addEventListener('click', (event) => { if (event.target === playerModal) closePlayerModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePlayerModal(); });

fetch('data/fpl.json')
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error('fpl.json ' + res.status))))
  .then((data) => {
    const deadlineText = document.querySelector('#fpl-deadline-text');
    if (deadlineText) deadlineText.textContent = `${data.gameweek.name} deadline · ${data.gameweek.deadlineLabel}`;

    Object.entries(data.players).forEach(([id, p]) => {
      players['fpl-' + id] = {
        name: p.name,
        position: p.position,
        avatar: p.avatar,
        avatarClass: p.avatarClass,
        rating: p.points && p.minutes ? Math.round((p.points / Math.max(p.minutes, 1)) * 90 * 10) / 10 : 0,
        minutes: p.minutes,
        goals: p.goals,
        assists: p.assists,
        form: p.form,
        price: p.price,
        owned: p.owned,
        points: p.points,
        epNext: p.epNext,
      };
    });

    const captainList = document.querySelector('#captain-list');
    if (captainList && data.captainPicks.length) {
      captainList.innerHTML = data.captainPicks.map((id, i) => {
        const p = data.players[id];
        return `<article class="captain-row${i === 0 ? ' top-pick' : ''}" data-player="fpl-${id}" tabindex="0" role="button" aria-label="View ${p.name}">
          <span class="captain-rank">${i + 1}</span>
          <div class="player-cell"><div class="player-avatar ${p.avatarClass}">${p.avatar}</div><strong>${p.shortName}<small>${p.position} · ${p.owned} owned</small></strong></div>
          <div class="captain-reason"><small>${p.points} pts last season</small><span class="fixture-tag easy">${p.epNext.toFixed(1)} proj.</span></div>
          <strong class="captain-score">${p.epNext.toFixed(1)}</strong>
        </article>`;
      }).join('');
      bindPlayerTriggers(captainList);
      const badge = document.querySelector('#captain-live-badge');
      if (badge) badge.hidden = false;
    }

    const performersTable = document.querySelector('#fpl-performers-table');
    if (performersTable && data.topPerformers.length) {
      performersTable.querySelectorAll('.table-row').forEach((row) => row.remove());
      const colLabel = document.querySelector('#fpl-performers-col2');
      if (colLabel) colLabel.textContent = 'Position';
      data.topPerformers.forEach((id) => {
        const p = data.players[id];
        const row = document.createElement('div');
        row.className = 'table-row';
        row.dataset.player = 'fpl-' + id;
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', 'View ' + p.name);
        row.innerHTML = `<div class="player-cell"><div class="player-avatar ${p.avatarClass}">${p.avatar}</div><strong>${p.shortName}<small>${p.position} · ${p.owned} owned</small></strong></div>
          <span>${p.position}</span><span>${p.price}</span><span>${p.owned}</span><strong>${p.points}</strong>
          <span class="row-arrow" aria-hidden="true"><i data-lucide="chevron-right"></i></span>`;
        performersTable.appendChild(row);
      });
      bindPlayerTriggers(performersTable);
      const badge = document.querySelector('#performers-live-badge');
      if (badge) badge.hidden = false;
      lucide.createIcons();
    }
  })
  .catch(() => { /* keep the illustrative fallback content already in the page */ });

lucide.createIcons();