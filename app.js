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
const titles = { dashboard: 'Overview', live: 'Live scores', fpl: 'FPL assistant', performance: 'Performance tracker', fixtures: 'Fixtures', teams: 'Teams & players', news: 'News', stats: 'Stats', settings: 'Settings' };

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
function updateAlertsMetric() {
  const alertInputs = document.querySelectorAll('[data-pref]');
  const enabled = Array.from(alertInputs).filter((input) => input.checked).length;
  const countEl = document.querySelector('#dash-alerts-count');
  const subEl = document.querySelector('#dash-alerts-sub');
  if (countEl) countEl.textContent = String(enabled).padStart(2, '0');
  if (subEl) subEl.textContent = `${enabled} of ${alertInputs.length} alert types active`;
}
document.querySelectorAll('[data-pref]').forEach((input) => {
  const key = input.dataset.pref;
  if (key in prefs) input.checked = prefs[key];
  input.addEventListener('change', () => {
    prefs[key] = input.checked;
    localStorage.setItem('yp-prefs', JSON.stringify(prefs));
    updateAlertsMetric();
  });
});
updateAlertsMetric();

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

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function playerRating(p) {
  return p.points && p.minutes ? Math.round((p.points / Math.max(p.minutes, 1)) * 90 * 10) / 10 : 0;
}

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
  const isReal = !!p.isReal;
  lastPlayerTrigger = triggerEl;
  document.querySelector('#pm-avatar').textContent = p.avatar;
  document.querySelector('#pm-avatar').className = 'modal-avatar' + (p.avatarClass ? ' ' + p.avatarClass : '');
  document.querySelector('#pm-name').textContent = p.name;
  document.querySelector('#pm-meta').textContent = isReal ? `${p.position} · ${p.team}` : `${p.position} · ${p.team} · ${p.nation}`;
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
  nextKicker.textContent = 'Next fixture';
  nextEl.textContent = p.fixture ? `${p.fixture} · Proj. ${p.epNext.toFixed(1)} pts` : p.next;
  const contextEl = document.querySelector('#pm-context');
  if (isReal && typeof p.positionPercentile === 'number') {
    const topPercent = Math.max(1, Math.round(100 - p.positionPercentile));
    const strengthText = typeof p.teamStrengthHome === 'number'
      ? ` · ${p.team} strength ${p.teamStrengthHome}/5 (H) · ${p.teamStrengthAway}/5 (A)`
      : '';
    contextEl.textContent = `Top ${topPercent}% by pts/90 among ${p.position}s${strengthText}`;
    contextEl.hidden = false;
  } else {
    contextEl.hidden = true;
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

function getFavoriteTeams() {
  return JSON.parse(localStorage.getItem('yp-teams') || 'null') || [];
}

function teamSpan(name) {
  const isFavorite = getFavoriteTeams().includes(name);
  return `<span class="${isFavorite ? 'favorite-team' : ''}">${name}</span>`;
}

function predictChip(f) {
  const max = Math.max(f.homeWinPct, f.drawPct, f.awayWinPct);
  let label = 'Draw';
  if (max === f.homeWinPct) label = 'Home win';
  else if (max === f.awayWinPct) label = 'Away win';
  const title = `Home ${f.homeWinPct}% · Draw ${f.drawPct}% · Away ${f.awayWinPct}% · Predicted score ${f.predictedScore}`;
  return `<div class="predict-chip" title="${title}"><i data-lucide="target"></i> ${max}% ${label}</div>`;
}

fetch('data/fpl.json')
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error('fpl.json ' + res.status))))
  .then((data) => {
    const deadlineText = document.querySelector('#fpl-deadline-text');
    if (deadlineText) deadlineText.textContent = `${data.gameweek.name} deadline · ${data.gameweek.deadlineLabel}`;

    const fixturesList = document.querySelector('#fixtures-list');
    if (fixturesList && data.fixtures && data.fixtures.length) {
      fixturesList.innerHTML = data.fixtures.map((f) => `
        <article class="match-row">
          <div class="competition"><span class="competition-badge pl">PL</span><div><strong>Premier League</strong><small>${data.gameweek.name}</small></div></div>
          <div class="teams">${teamSpan(f.home)}<strong>VS</strong>${teamSpan(f.away)}</div>
          <div class="match-outcome">
            <div class="match-status upcoming"><span></span> ${f.kickoffLabel}</div>
            ${predictChip(f)}
          </div>
        </article>
      `).join('');
      const fixturesKicker = document.querySelector('#fixtures-kicker');
      if (fixturesKicker) fixturesKicker.textContent = data.gameweek.name;
      const fixturesBadge = document.querySelector('#fixtures-live-badge');
      if (fixturesBadge) fixturesBadge.hidden = false;
      refreshIcons();
    }

    const teamsGrid = document.querySelector('#teams-grid');
    if (teamsGrid && data.teams && data.teams.length) {
      const favorites = getFavoriteTeams();
      const sorted = data.teams.slice().sort((a, b) => {
        const fa = favorites.includes(a.name) ? 0 : 1;
        const fb = favorites.includes(b.name) ? 0 : 1;
        return fa - fb || a.name.localeCompare(b.name);
      });
      teamsGrid.innerHTML = sorted.map((t) => {
        const isFavorite = favorites.includes(t.name);
        return `<article class="team-card${isFavorite ? ' favorited' : ''}" data-team="${t.name}">
          <div class="team-card-head">
            <span class="team-crest ${t.crestClass}">${t.shortName}</span>
            <div><strong>${t.name}</strong><small>Premier League${t.leagueRank ? ' · #' + t.leagueRank + ' rated' : ''}</small></div>
            ${isFavorite ? '<i data-lucide="sparkles" class="team-card-favorite"></i>' : ''}
          </div>
          <div class="team-card-stats">
            <div><small>Squad rating</small><strong>${t.squadRating === null ? 'New to PL' : t.squadRating.toFixed(1)}</strong></div>
            <div><small>Squad size</small><strong>${t.squadSize}</strong></div>
            <div><small>Squad value</small><strong>${t.squadValue}</strong></div>
          </div>
        </article>`;
      }).join('');
      const teamsBadge = document.querySelector('#teams-live-badge');
      if (teamsBadge) teamsBadge.hidden = false;
      refreshIcons();
    }

    function renderLeaderboard(containerId, ids, valueFn) {
      const container = document.querySelector('#' + containerId);
      if (!container || !ids || !ids.length) return;
      container.innerHTML = ids.map((id, i) => {
        const p = data.players[id];
        return `<div class="leaderboard-row" data-player="fpl-${id}" tabindex="0" role="button" aria-label="View ${p.name}">
          <span class="leaderboard-rank">${i + 1}</span>
          <div class="player-cell"><div class="player-avatar ${p.avatarClass}">${p.avatar}</div><strong>${p.shortName}<small>${p.team} · ${p.position}</small></strong></div>
          <span class="leaderboard-value">${valueFn(p)}</span>
        </div>`;
      }).join('');
      bindPlayerTriggers(container);
    }

    if (data.leaderboards) {
      renderLeaderboard('leaderboard-points', data.leaderboards.points, (p) => `${p.points} pts`);
      renderLeaderboard('leaderboard-assists', data.leaderboards.assists, (p) => `${p.assists} assists`);
      renderLeaderboard('leaderboard-xg', data.leaderboards.xg, (p) => `${p.xg.toFixed(1)} xG`);
      renderLeaderboard('leaderboard-value', data.leaderboards.value, (p) => `${p.valueScore.toFixed(1)} pts/£m`);
      renderLeaderboard('leaderboard-tackles', data.leaderboards.tackles, (p) => `${p.tackles} tackles`);
      renderLeaderboard('leaderboard-saves', data.leaderboards.saves, (p) => `${p.saves} saves`);
      const statsBadge = document.querySelector('#stats-live-badge');
      if (statsBadge) statsBadge.hidden = false;
    }

    if (data.comparisonPool) {
      setupPlayerComparison(data.comparisonPool, data.players);
    }

    // Dashboard metric-grid: replace illustrative cards with real figures
    // derived from this same fpl.json payload (no fabricated trend data -
    // see code review notes for why "prediction accuracy" and "alerts"
    // were dropped in favour of numbers this data can actually back up).
    const dashFixturesCount = document.querySelector('#dash-fixtures-count');
    const dashFixturesSub = document.querySelector('#dash-fixtures-sub');
    if (dashFixturesCount && data.fixtures) {
      dashFixturesCount.textContent = data.fixtures.length;
      if (dashFixturesSub) dashFixturesSub.innerHTML = `<i data-lucide="calendar-days"></i> ${data.gameweek.name} &middot; model-based`;
    }
    const dashTrackedCount = document.querySelector('#dash-tracked-count');
    if (dashTrackedCount && data.comparisonPool) {
      dashTrackedCount.textContent = data.comparisonPool.length;
    }

    const performancePool = (data.comparisonPool || []).map((id) => ({ id, ...data.players[id] }));

    const dashWatchlist = document.querySelector('#dashboard-watchlist-table');
    if (dashWatchlist && data.topPerformers.length) {
      dashWatchlist.querySelectorAll('.table-row').forEach((row) => row.remove());
      data.topPerformers.slice(0, 3).forEach((id) => {
        const p = data.players[id];
        const formLevel = p.form >= 6 ? 'high' : p.form >= 3 ? 'mid' : 'low';
        const row = document.createElement('div');
        row.className = 'table-row';
        row.dataset.player = 'fpl-' + id;
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', 'View ' + p.name);
        row.innerHTML = `<div class="player-cell"><div class="player-avatar ${p.avatarClass}">${p.avatar}</div><strong>${p.shortName}<small>${p.position} &middot; ${p.team}</small></strong></div>
          <span>${p.team}</span>
          <span class="form-bars">${Array(5).fill(`<i class="${formLevel}"></i>`).join('')}</span>
          <strong>${playerRating(p).toFixed(1)}</strong>
          <span class="row-arrow" aria-hidden="true"><i data-lucide="chevron-right"></i></span>`;
        dashWatchlist.appendChild(row);
      });
      bindPlayerTriggers(dashWatchlist);
      refreshIcons();
    }

    // Performance tracker: real squad-rating average, real goal tally
    // across tracked players, and a real "in-form" count (current FPL
    // form rating, not a fabricated week-over-week trend this snapshot
    // data can't support).
    const perfAvgRating = document.querySelector('#perf-avg-rating');
    const perfAvgRatingSub = document.querySelector('#perf-avg-rating-sub');
    if (perfAvgRating && data.teams) {
      const rated = data.teams.filter((t) => typeof t.squadRating === 'number');
      if (rated.length) {
        const avg = rated.reduce((sum, t) => sum + t.squadRating, 0) / rated.length;
        perfAvgRating.textContent = avg.toFixed(2);
        if (perfAvgRatingSub) perfAvgRatingSub.textContent = `Across ${rated.length} Premier League clubs`;
      }
    }
    const perfGoalsTracked = document.querySelector('#perf-goals-tracked');
    const perfGoalsSub = document.querySelector('#perf-goals-sub');
    if (perfGoalsTracked && data.players) {
      const allPlayers = Object.values(data.players);
      const totalGoals = allPlayers.reduce((sum, p) => sum + (p.goals || 0), 0);
      perfGoalsTracked.textContent = totalGoals;
      if (perfGoalsSub) perfGoalsSub.textContent = `Across ${allPlayers.length} tracked players`;
    }
    const perfInFormCount = document.querySelector('#perf-inform-count');
    const perfInFormSub = document.querySelector('#perf-inform-sub');
    if (perfInFormCount) {
      const inForm = performancePool.filter((p) => p.form >= 6);
      perfInFormCount.textContent = inForm.length;
      if (perfInFormSub) perfInFormSub.textContent = 'Form rating 6.0+';
    }

    function renderPerformanceTable(filter) {
      const table = document.querySelector('#performance-table');
      if (!table) return;
      let rows = performancePool.slice();
      if (filter === 'rising') {
        rows = rows.filter((p) => p.form >= 6).sort((a, b) => b.form - a.form);
      } else if (filter === 'attention') {
        rows = rows.filter((p) => p.minutes >= 450 && p.form <= 3).sort((a, b) => a.form - b.form);
      } else {
        rows = rows.sort((a, b) => b.points - a.points);
      }
      rows = rows.slice(0, 12);
      table.querySelectorAll('.table-row').forEach((row) => row.remove());
      rows.forEach((p) => {
        const row = document.createElement('div');
        row.className = 'table-row';
        row.dataset.player = 'fpl-' + p.id;
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', 'View ' + p.name);
        row.innerHTML = `<div class="player-cell"><div class="player-avatar ${p.avatarClass}">${p.avatar}</div><strong>${p.shortName}<small>${p.position} &middot; ${p.team}</small></strong></div>
          <span>${p.team}</span><span>${p.minutes}</span><span>${p.goals}</span><span>${p.assists}</span><strong>${playerRating(p).toFixed(1)}</strong>`;
        table.appendChild(row);
      });
      bindPlayerTriggers(table);
    }

    if (performancePool.length) {
      renderPerformanceTable('all');
      document.querySelectorAll('#performance-tabs .tab').forEach((tab) => {
        tab.addEventListener('click', () => renderPerformanceTable(tab.dataset.filter));
      });
    }

    Object.entries(data.players).forEach(([id, p]) => {
      players['fpl-' + id] = {
        isReal: true,
        name: p.name,
        position: p.position,
        team: p.team,
        avatar: p.avatar,
        avatarClass: p.avatarClass,
        rating: playerRating(p),
        minutes: p.minutes,
        goals: p.goals,
        assists: p.assists,
        form: p.form,
        price: p.price,
        owned: p.owned,
        points: p.points,
        epNext: p.epNext,
        fixture: p.fixture,
        positionPercentile: p.positionPercentile,
        teamStrengthHome: p.teamStrengthHome,
        teamStrengthAway: p.teamStrengthAway,
      };
    });

    if (data.topPerformers.length) {
      const topScorer = data.players[data.topPerformers[0]];
      const rankValue = document.querySelector('#rank-metric-value');
      const rankSub = document.querySelector('#rank-metric-sub');
      if (rankValue) rankValue.textContent = topScorer.points;
      if (rankSub) rankSub.innerHTML = `<i data-lucide="trending-up"></i> ${topScorer.shortName} · 25/26`;
    }

    const captainList = document.querySelector('#captain-list');
    if (captainList && data.captainPicks.length) {
      captainList.innerHTML = data.captainPicks.map((id, i) => {
        const p = data.players[id];
        return `<article class="captain-row${i === 0 ? ' top-pick' : ''}" data-player="fpl-${id}" tabindex="0" role="button" aria-label="View ${p.name}">
          <span class="captain-rank">${i + 1}</span>
          <div class="player-cell"><div class="player-avatar ${p.avatarClass}">${p.avatar}</div><strong>${p.shortName}<small>${p.team} · ${p.position}</small></strong></div>
          <div class="captain-reason"><small>${p.fixture || ''}</small><span class="fixture-tag ${p.fdrClass || 'easy'}">FDR ${p.fdr || '-'}</span></div>
          <strong class="captain-score">${p.epNext.toFixed(1)}</strong>
        </article>`;
      }).join('');
      bindPlayerTriggers(captainList);
      const badge = document.querySelector('#captain-live-badge');
      if (badge) badge.hidden = false;
    }

    const transferList = document.querySelector('#transfer-list');
    if (transferList && data.transferAdvice && (data.transferAdvice.in.length || data.transferAdvice.out.length)) {
      const inRows = data.transferAdvice.in.map((item) => {
        const p = data.players[item.id];
        return `<article class="transfer-row" data-player="fpl-${item.id}" tabindex="0" role="button" aria-label="View ${p.name}">
          <span class="transfer-tag in">IN</span>
          <div class="player-cell"><div class="player-avatar ${p.avatarClass}">${p.avatar}</div><strong>${p.shortName}<small>${p.team} · ${p.position}</small></strong></div>
          <div class="transfer-meta"><small>${p.price}</small><span class="positive"><i data-lucide="trending-up"></i> ${item.reason}</span></div>
        </article>`;
      });
      const outRows = data.transferAdvice.out.map((item) => {
        const p = data.players[item.id];
        return `<article class="transfer-row" data-player="fpl-${item.id}" tabindex="0" role="button" aria-label="View ${p.name}">
          <span class="transfer-tag out">OUT</span>
          <div class="player-cell"><div class="player-avatar ${p.avatarClass}">${p.avatar}</div><strong>${p.shortName}<small>${p.team} · ${p.position}</small></strong></div>
          <div class="transfer-meta"><small>${p.price}</small><span class="negative"><i data-lucide="trending-down"></i> ${item.reason}</span></div>
        </article>`;
      });
      transferList.innerHTML = inRows.concat(outRows).join('');
      bindPlayerTriggers(transferList);
      const transferBadge = document.querySelector('#transfer-live-badge');
      if (transferBadge) transferBadge.hidden = false;
      refreshIcons();
    }

    const wildcardList = document.querySelector('#wildcard-watch-list');
    if (wildcardList && data.wildcardWatch && data.wildcardWatch.length) {
      wildcardList.innerHTML = data.wildcardWatch.map((w, i) => `
        <div class="leaderboard-row">
          <span class="leaderboard-rank">${i + 1}</span>
          <div><strong>${w.team}</strong><small style="display:block;color:#7f8e96;font-size:10px;margin-top:2px">Next 6: ${w.fixtures.join(', ')}</small></div>
          <span class="leaderboard-value">+${w.swing.toFixed(1)}</span>
        </div>
      `).join('');
      const wildcardBadge = document.querySelector('#wildcard-live-badge');
      if (wildcardBadge) wildcardBadge.hidden = false;
    }

    const performersTable = document.querySelector('#fpl-performers-table');
    if (performersTable && data.topPerformers.length) {
      performersTable.querySelectorAll('.table-row').forEach((row) => row.remove());
      const colLabel = document.querySelector('#fpl-performers-col2');
      if (colLabel) colLabel.textContent = 'Team';
      data.topPerformers.forEach((id) => {
        const p = data.players[id];
        const row = document.createElement('div');
        row.className = 'table-row';
        row.dataset.player = 'fpl-' + id;
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', 'View ' + p.name);
        row.innerHTML = `<div class="player-cell"><div class="player-avatar ${p.avatarClass}">${p.avatar}</div><strong>${p.shortName}<small>${p.position} · ${p.owned} owned</small></strong></div>
          <span>${p.team}</span><span>${p.price}</span><span>${p.owned}</span><strong>${p.points}</strong>
          <span class="row-arrow" aria-hidden="true"><i data-lucide="chevron-right"></i></span>`;
        performersTable.appendChild(row);
      });
      bindPlayerTriggers(performersTable);
      const badge = document.querySelector('#performers-live-badge');
      if (badge) badge.hidden = false;
      refreshIcons();
    }
  })
  .catch((err) => { console.error('[YobraPulse] fpl.json failed to load, showing fallback content', err); });

function relativeTime(iso) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return mins + 'm ago';
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.round(hours / 24) + 'd ago';
}

fetch('data/news.json')
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error('news.json ' + res.status))))
  .then((data) => {
    const feed = document.querySelector('#news-feed');
    if (feed && data.items.length) {
      feed.innerHTML = data.items.map((item) => `
        <article class="news-card" data-category="${item.category}">
          <div class="news-card-head"><span class="news-tag ${item.category}">${item.categoryLabel}</span><span class="news-time">${relativeTime(item.pubDateISO)}</span></div>
          <h3><a href="${item.link}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${item.title}</a></h3>
          <p>${item.description}</p>
          <div class="news-source"><span class="source-dot"></span> ${item.source}</div>
        </article>
      `).join('');
      const updatedText = document.querySelector('#news-updated-text');
      if (updatedText) updatedText.textContent = 'Updated ' + relativeTime(data.generatedAt);
      const badge = document.querySelector('#news-live-badge');
      if (badge) badge.hidden = false;
    }
  })
  .catch((err) => { console.error('[YobraPulse] news.json failed to load, showing fallback content', err); });

document.querySelectorAll('#news-tabs .tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const filter = tab.dataset.filter;
    document.querySelectorAll('#news-feed .news-card').forEach((card) => {
      card.style.display = (filter === 'all' || card.dataset.category === filter) ? '' : 'none';
    });
  });
});

const LIVE_COMPETITIONS = [
  { slug: 'eng.1', badge: 'pl', code: 'PL', name: 'Premier League' },
  { slug: 'uefa.champions', badge: 'cl', code: 'CL', name: 'Champions League' },
  { slug: 'ita.1', badge: 'la', code: 'SA', name: 'Serie A' },
];

function fetchScoreboard(comp) {
  return fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${comp.slug}/scoreboard`)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error('scoreboard ' + res.status))))
    .then((data) => (data.events || []).map((ev) => {
      const c = ev.competitions[0];
      const home = c.competitors.find((t) => t.homeAway === 'home');
      const away = c.competitors.find((t) => t.homeAway === 'away');
      return {
        competitionCode: comp.code,
        competitionBadge: comp.badge,
        competitionName: comp.name,
        home: home.team.shortDisplayName,
        away: away.team.shortDisplayName,
        homeScore: home.score,
        awayScore: away.score,
        state: c.status.type.state,
        clock: c.status.type.shortDetail,
        kickoff: new Date(ev.date),
      };
    }))
    .catch((err) => { console.warn(`[YobraPulse] scoreboard fetch failed for ${comp.slug}`, err); return []; });
}

function matchRowHTML(m) {
  const smallText = m.state === 'in' ? m.clock : m.state === 'post' ? 'Full-time' : 'Upcoming';
  let statusHTML;
  if (m.state === 'in') {
    statusHTML = '<div class="match-status live-status"><span></span> Live</div>';
  } else if (m.state === 'post') {
    statusHTML = '<div class="match-status upcoming"><span></span> Full-time</div>';
  } else {
    const kickoffLabel = m.kickoff.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
    statusHTML = `<div class="match-status upcoming"><span></span> ${kickoffLabel}</div>`;
  }
  const scoreHTML = m.state === 'pre' ? '<strong>VS</strong>' : `<strong>${m.homeScore} <small>—</small> ${m.awayScore}</strong>`;
  return `<article class="match-row">
    <div class="competition"><span class="competition-badge ${m.competitionBadge}">${m.competitionCode}</span><div><strong>${m.competitionName}</strong><small>${smallText}</small></div></div>
    <div class="teams">${teamSpan(m.home)}${scoreHTML}${teamSpan(m.away)}</div>
    ${statusHTML}
  </article>`;
}

function loadLiveScores() {
  Promise.all(LIVE_COMPETITIONS.map(fetchScoreboard)).then((results) => {
    const all = [].concat(...results);
    if (!all.length) return;
    const rank = { in: 0, pre: 1, post: 2 };
    all.sort((a, b) => (rank[a.state] - rank[b.state]) || (a.kickoff - b.kickoff));

    const liveCount = all.filter((m) => m.state === 'in').length;

    const dashboardList = document.querySelector('#dashboard-live-list');
    if (dashboardList) dashboardList.innerHTML = all.slice(0, 3).map(matchRowHTML).join('');

    const fullList = document.querySelector('#live-scores-list');
    if (fullList) fullList.innerHTML = all.slice(0, 12).map(matchRowHTML).join('');

    const statusText = document.querySelector('#live-status-text');
    if (statusText) statusText.textContent = liveCount > 0 ? `${liveCount} match${liveCount === 1 ? '' : 'es'} live` : 'No matches live right now';

    const navCount = document.querySelector('#live-nav-count');
    if (navCount) navCount.textContent = liveCount;

    const metricCount = document.querySelector('#live-metric-count');
    const metricSub = document.querySelector('#live-metric-sub');
    if (metricCount) metricCount.textContent = liveCount;
    if (metricSub) metricSub.innerHTML = liveCount > 0
      ? '<i data-lucide="trending-up"></i> Updating live'
      : `${all.length} scheduled this gameweek`;

    const badge = document.querySelector('#live-scores-badge');
    if (badge) badge.hidden = false;

    refreshIcons();
  }).catch((err) => { console.error('[YobraPulse] live scores failed to load, showing fallback content', err); });
}

loadLiveScores();
setInterval(loadLiveScores, 60000);

function setupPlayerComparison(pool, playersMap) {
  const selectA = document.querySelector('#compare-a');
  const selectB = document.querySelector('#compare-b');
  const table = document.querySelector('#compare-table');
  if (!selectA || !selectB || !table) return;

  const optionsHTML = pool.map((id) => {
    const p = playersMap[id];
    return `<option value="${id}">${p.name} (${p.team})</option>`;
  }).join('');
  selectA.innerHTML = '<option value="">Select a player&hellip;</option>' + optionsHTML;
  selectB.innerHTML = '<option value="">Select a player&hellip;</option>' + optionsHTML;

  function renderComparison() {
    const idA = selectA.value;
    const idB = selectB.value;
    if (!idA || !idB || idA === idB) {
      table.hidden = true;
      return;
    }
    const a = playersMap[idA];
    const b = playersMap[idB];
    const rows = [
      { label: 'Points', a: a.points, b: b.points },
      { label: 'Goals', a: a.goals, b: b.goals },
      { label: 'Assists', a: a.assists, b: b.assists },
      { label: 'xG', a: a.xg, b: b.xg },
      { label: 'Minutes', a: a.minutes, b: b.minutes },
      { label: 'Tackles', a: a.tackles, b: b.tackles },
      { label: 'Price', a: a.price, b: b.price, noWinner: true },
    ];
    table.innerHTML = rows.map((r) => {
      const aBetter = !r.noWinner && Number(r.a) > Number(r.b);
      const bBetter = !r.noWinner && Number(r.b) > Number(r.a);
      return `<div class="compare-row">
        <span class="compare-value left${aBetter ? ' better' : ''}">${r.a}</span>
        <span class="compare-label">${r.label}</span>
        <span class="compare-value right${bBetter ? ' better' : ''}">${r.b}</span>
      </div>`;
    }).join('');
    table.hidden = false;
  }

  selectA.addEventListener('change', renderComparison);
  selectB.addEventListener('change', renderComparison);
}

fetch('data/leagues.json')
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error('leagues.json ' + res.status))))
  .then((data) => {
    let currentLeague = 'eng.1';
    let currentSeason = 'current';

    function renderLeagueTable() {
      const league = data.leagues.find((l) => l.code === currentLeague);
      const body = document.querySelector('#league-table-body');
      if (!league || !body) return;
      const rows = currentSeason === 'current' ? league.current : league.lastSeason;
      const note = document.querySelector('#league-table-note');
      if (note) note.hidden = !(currentSeason === 'current' && rows.every((r) => r.played === 0));
      body.innerHTML = '<div class="league-table-head"><span>#</span><span>Team</span><span>P</span><span>W</span><span>D</span><span>L</span><span>Pts</span></div>' +
        rows.map((r) => `<div class="league-table-row">
          <span>${r.rank}</span>
          <strong>${r.team}</strong>
          <span>${r.played}</span>
          <span>${r.wins}</span>
          <span>${r.draws}</span>
          <span>${r.losses}</span>
          <strong>${r.points}</strong>
        </div>`).join('');
    }

    document.querySelectorAll('#league-tabs .tab').forEach((tab) => {
      tab.addEventListener('click', () => { currentLeague = tab.dataset.league; renderLeagueTable(); });
    });
    document.querySelectorAll('#season-tabs .tab').forEach((tab) => {
      tab.addEventListener('click', () => { currentSeason = tab.dataset.season; renderLeagueTable(); });
    });

    renderLeagueTable();
  })
  .catch((err) => {
    console.error('[YobraPulse] leagues.json failed to load', err);
    const body = document.querySelector('#league-table-body');
    if (body) {
      const fetching = body.querySelector('p');
      if (fetching) fetching.textContent = 'Live standings unavailable right now.';
    }
  });

refreshIcons();