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
const titles = { dashboard: 'Overview', live: 'Live scores', fpl: 'FPL assistant', performance: 'Performance tracker', fixtures: 'Fixtures', predictions: 'Predictions', teams: 'Teams & players', news: 'News', stats: 'Stats', settings: 'Settings' };

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

// FPL assistant page split into 3 sub-tabs (Overview / This gameweek /
// Squad intelligence) so the page isn't one long scroll of ~10 panels -
// the generic .tabs handler above already toggles the active tab
// styling; this just additionally shows/hides the matching section.
document.querySelectorAll('#fpl-section-tabs .tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const section = tab.dataset.section;
    document.querySelectorAll('.fpl-section').forEach((el) => { el.hidden = el.dataset.section !== section; });
  });
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

function renderTeamChips(teamNames) {
  const container = document.querySelector('#team-chips');
  if (!container || !teamNames || !teamNames.length) return;
  const savedTeams = JSON.parse(localStorage.getItem('yp-teams') || 'null') || [];
  container.innerHTML = teamNames.map((name) => `<button class="chip${savedTeams.includes(name) ? ' selected' : ''}" data-team="${name}">${name}</button>`).join('');
  container.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => {
    chip.classList.toggle('selected');
    const selected = Array.from(container.querySelectorAll('.chip.selected')).map((c) => c.dataset.team);
    localStorage.setItem('yp-teams', JSON.stringify(selected));
  }));
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function playerRating(p) {
  return p.points && p.minutes ? Math.round((p.points / Math.max(p.minutes, 1)) * 90 * 10) / 10 : 0;
}

// Real FPL status codes (a=available, d=doubtful, i=injured, s=suspended,
// u=unavailable, n=not eligible for this competition) - straight from
// the API, not something this app invented.
const STATUS_LABELS = { a: 'Fit', d: 'Doubtful', i: 'Injured', s: 'Suspended', u: 'Unavailable', n: 'N/A' };

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
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePlayerModal(); closeTeamModal(); });

const teamModal = document.querySelector('#team-modal');
const teamModalClose = document.querySelector('#team-modal-close');
let lastTeamTrigger = null;

function openTeamModal(teamName, data, triggerEl) {
  const t = (data.teams || []).find((team) => team.name === teamName);
  if (!t || !teamModal) return;
  lastTeamTrigger = triggerEl;
  document.querySelector('#tm-crest').textContent = t.shortName;
  document.querySelector('#tm-crest').className = 'modal-avatar team-crest ' + (t.crestClass || '');
  document.querySelector('#tm-name').textContent = t.name;
  document.querySelector('#tm-meta').textContent = `Premier League${t.leagueRank ? ' · #' + t.leagueRank + ' rated' : ''}`;
  document.querySelector('#tm-rating').textContent = t.squadRating === null ? 'New to PL' : t.squadRating.toFixed(2);
  document.querySelector('#tm-size').textContent = t.squadSize;
  document.querySelector('#tm-value').textContent = t.squadValue;
  const formEl = document.querySelector('#tm-form');
  if (t.form === null || t.form === undefined) {
    formEl.innerHTML = '<i class="mid"></i><i class="mid"></i><i class="mid"></i><i class="mid"></i><i class="mid"></i>';
  } else {
    const level = t.form >= 0.6 ? 'high' : t.form >= 0.35 ? 'mid' : 'low';
    formEl.innerHTML = Array(5).fill(`<i class="${level}"></i>`).join('');
  }
  document.querySelector('#tm-load').textContent = t.fixtureLoad ?? '-';
  document.querySelector('#tm-strength-home').textContent = t.strengthHome ? `${t.strengthHome}/5` : '-';
  document.querySelector('#tm-strength-away').textContent = t.strengthAway ? `${t.strengthAway}/5` : '-';

  const changesEl = document.querySelector('#tm-changes');
  const changesParts = [];
  if (t.managerChange) changesParts.push(`New manager from ${t.managerChange.effectiveDate} (${t.managerChange.newManager})`);
  if (t.recentTransfers && (t.recentTransfers.in || t.recentTransfers.out)) {
    const bits = [];
    if (t.recentTransfers.in) bits.push(`${t.recentTransfers.in} in`);
    if (t.recentTransfers.out) bits.push(`${t.recentTransfers.out} out`);
    changesParts.push(`${bits.join(', ')} real transfer(s), last ${t.recentTransfers.windowDays} days`);
  }
  if (changesParts.length) {
    changesEl.textContent = changesParts.join(' · ');
    changesEl.hidden = false;
  } else {
    changesEl.hidden = true;
  }

  const nextEl = document.querySelector('#tm-next');
  nextEl.textContent = t.nextOpponent ? `${t.nextIsHome ? 'vs' : '@'} ${t.nextOpponent} · FDR ${t.nextFdr ?? '-'}` : 'Not yet scheduled';

  const squadListEl = document.querySelector('#tm-squad-list');
  const squad = t.squad || [];
  squadListEl.innerHTML = squad.map((sp) => {
    const richId = String(sp.id);
    const hasCard = !!(data.players && data.players[richId]);
    const attrs = hasCard ? `data-player="fpl-${richId}" tabindex="0" role="button"` : '';
    return `<div class="modal-squad-row${hasCard ? ' clickable' : ''}" ${attrs}>
      <strong>${sp.name}</strong>
      <small>${sp.position}</small>
    </div>`;
  }).join('') || '<p class="lede" style="margin:0;font-size:12px">No real squad data yet.</p>';
  bindPlayerTriggers(squadListEl);

  teamModal.hidden = false;
  document.body.classList.add('modal-open');
  if (teamModalClose) teamModalClose.focus();
  refreshIcons();
}

function closeTeamModal() {
  if (!teamModal || teamModal.hidden) return;
  teamModal.hidden = true;
  document.body.classList.remove('modal-open');
  if (lastTeamTrigger) lastTeamTrigger.focus();
}

function bindTeamTriggers(scope, data) {
  scope.querySelectorAll('[data-team]').forEach((card) => {
    card.addEventListener('click', () => openTeamModal(card.dataset.team, data, card));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openTeamModal(card.dataset.team, data, card);
      }
    });
  });
}

if (teamModalClose) teamModalClose.addEventListener('click', closeTeamModal);
if (teamModal) teamModal.addEventListener('click', (event) => { if (event.target === teamModal) closeTeamModal(); });

function getFavoriteTeams() {
  return JSON.parse(localStorage.getItem('yp-teams') || 'null') || [];
}

function teamSpan(name) {
  const isFavorite = getFavoriteTeams().includes(name);
  return `<span class="${isFavorite ? 'favorite-team' : ''}">${name}</span>`;
}

function playerFactorsTitle(factors) {
  if (!factors) return '';
  const parts = [`Projected ${factors.epNext.toFixed(1)} pts`];
  if (factors.ownForm !== null && factors.ownForm !== undefined) parts.push(`own form ${factors.ownForm.toFixed(1)}`);
  if (factors.teamForm !== null && factors.teamForm !== undefined) parts.push(`team form ${Math.round(factors.teamForm * 100)}%`);
  if (factors.opponentForm !== null && factors.opponentForm !== undefined) parts.push(`${factors.opponent || 'opponent'} form ${Math.round(factors.opponentForm * 100)}%`);
  if (factors.fixtureLoad !== null && factors.fixtureLoad !== undefined) parts.push(`${factors.fixtureLoad} real PL fixture${factors.fixtureLoad === 1 ? '' : 's'} in next 10 days`);
  if (factors.trackRecordVsOpponent) {
    const tr = factors.trackRecordVsOpponent;
    parts.push(`real record vs ${factors.opponent}: ${tr.goals}G ${tr.assists}A across ${tr.meetings} real meetings`);
  }
  return parts.join(' · ');
}

function teamRecentChangesLine(t) {
  const parts = [];
  if (t.managerChange) {
    parts.push(`New manager from ${t.managerChange.effectiveDate} (${t.managerChange.newManager})`);
  }
  if (t.recentTransfers && (t.recentTransfers.in || t.recentTransfers.out)) {
    const bits = [];
    if (t.recentTransfers.in) bits.push(`${t.recentTransfers.in} in`);
    if (t.recentTransfers.out) bits.push(`${t.recentTransfers.out} out`);
    parts.push(`${bits.join(', ')} (real transfers, last ${t.recentTransfers.windowDays}d)`);
  }
  if (!parts.length) return '';
  return `<div class="recent-changes-note team-card-note">${parts.join(' · ')} <span class="muted">(context)</span></div>`;
}

const OTHER_LEAGUE_BADGES = {
  'La Liga': { badge: 'll', code: 'LL' },
  'Serie A': { badge: 'la', code: 'SA' },
  'Bundesliga': { badge: 'bl', code: 'BL' },
  'Ligue 1': { badge: 'l1', code: 'L1' },
};

function otherLeagueChip(f) {
  const max = Math.max(f.homeWinPct, f.drawPct, f.awayWinPct);
  let label = 'Draw';
  if (max === f.homeWinPct) label = 'Home win';
  else if (max === f.awayWinPct) label = 'Away win';
  const title = f.hasRealStrengthData
    ? `Home ${f.homeWinPct}% · Draw ${f.drawPct}% · Away ${f.awayWinPct}% · Real signal used: last season's final standings only - no squad quality, form or availability data for this league.`
    : `Home ${f.homeWinPct}% · Draw ${f.drawPct}% · Away ${f.awayWinPct}% · No real last-season top-flight record for one or both clubs (e.g. newly promoted) - falls back to a neutral base rate.`;
  return `<div class="predict-chip" title="${title}"><i data-lucide="target"></i> ${max}% ${label}</div>`;
}

function renderOtherLeagueMatches(leagueName, data) {
  const list = document.querySelector('#other-leagues-list');
  if (!list) return;
  const preds = (data.otherLeaguePredictions && data.otherLeaguePredictions[leagueName]) || [];
  const meta = OTHER_LEAGUE_BADGES[leagueName] || { badge: 'mid', code: '?' };
  if (!preds.length) {
    list.innerHTML = '<p class="lede" style="margin:0;font-size:12px">No real upcoming fixtures found in the next couple of weeks for this league.</p>';
    return;
  }
  list.innerHTML = preds.map((f) => `
    <article class="match-row">
      <div class="competition"><span class="competition-badge ${meta.badge}">${meta.code}</span><div><strong>${leagueName}</strong><small>Upcoming</small></div></div>
      <div class="teams">${teamSpan(f.home)}<strong>VS</strong>${teamSpan(f.away)}</div>
      <div class="match-outcome">
        <div class="match-status upcoming"><span></span> ${f.kickoffLabel}</div>
        ${otherLeagueChip(f)}
      </div>
    </article>
  `).join('');
  refreshIcons();
}

function predictChip(f) {
  const max = Math.max(f.homeWinPct, f.drawPct, f.awayWinPct);
  let label = 'Draw';
  if (max === f.homeWinPct) label = 'Home win';
  else if (max === f.awayWinPct) label = 'Away win';

  const factors = f.factors || {};
  const signals = [];
  if (factors.homeForm !== null && factors.homeForm !== undefined && factors.awayForm !== null && factors.awayForm !== undefined) signals.push('recent form');
  if (factors.h2h) signals.push(`head-to-head (${factors.h2h.meetings} real meeting${factors.h2h.meetings === 1 ? '' : 's'})`);
  if (factors.homeAvailability !== null && factors.homeAvailability !== undefined) signals.push('squad availability');
  if (f.marketOdds) signals.push(`${f.marketOdds.provider} odds`);
  const signalsText = signals.length
    ? `Real signals used: team strength, squad quality, ${signals.join(', ')}.`
    : 'Real signals used: team strength, squad quality only - no real form/H2H/odds match found for this fixture.';
  const title = `Home ${f.homeWinPct}% · Draw ${f.drawPct}% · Away ${f.awayWinPct}% · Predicted score ${f.predictedScore} · ${signalsText}`;
  const oddsTag = f.marketOdds ? '<span class="predict-odds-tag">odds-backed</span>' : '';
  return `<div class="predict-chip" title="${title}"><i data-lucide="target"></i> ${max}% ${label}${oddsTag}</div>`;
}

function recentChangesLine(f) {
  const rc = f.recentChanges;
  if (!rc) return '';
  const notes = [];
  ['home', 'away'].forEach((side) => {
    const info = rc[side];
    if (!info) return;
    const parts = [];
    if (info.managerChange) {
      const d = new Date(info.managerChange.effectiveDate);
      const dateLabel = isNaN(d) ? info.managerChange.effectiveDate : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      parts.push(`new manager from ${dateLabel} (${info.managerChange.newManager})`);
    }
    if (info.transfers && (info.transfers.in || info.transfers.out)) {
      const bits = [];
      if (info.transfers.in) bits.push(`${info.transfers.in} in`);
      if (info.transfers.out) bits.push(`${info.transfers.out} out`);
      parts.push(`${bits.join(', ')} (real transfers, last ${info.transfers.windowDays}d)`);
    }
    if (parts.length) notes.push(`${f[side]}: ${parts.join(' · ')}`);
  });
  if (!notes.length) return '';
  return `<div class="recent-changes-note">${notes.join(' &nbsp;·&nbsp; ')} <span class="muted">(context, not scored)</span></div>`;
}

function renderTrackRecord(record) {
  if (!record) return;
  const resolvedEl = document.querySelector('#track-record-resolved');
  const resolvedSub = document.querySelector('#track-record-resolved-sub');
  const accuracyEl = document.querySelector('#track-record-accuracy');
  const accuracySub = document.querySelector('#track-record-accuracy-sub');
  const marketEl = document.querySelector('#track-record-market');
  const marketSub = document.querySelector('#track-record-market-sub');
  const liveBadge = document.querySelector('#track-record-live-badge');

  if (resolvedEl) resolvedEl.textContent = record.totalResolved;
  if (resolvedSub) resolvedSub.textContent = `${record.totalLogged} logged total`;

  if (accuracyEl) {
    accuracyEl.textContent = record.accuracyPct === null ? '—' : `${record.accuracyPct}%`;
  }
  if (accuracySub) {
    accuracySub.textContent = record.totalResolved
      ? `${record.correct} of ${record.totalResolved} correct`
      : 'No resolved predictions yet - check back after Gameweek 1';
  }

  if (record.marketComparison) {
    if (marketEl) marketEl.textContent = `${record.marketComparison.modelAccuracyPct}%`;
    if (marketSub) marketSub.textContent = `vs ${record.marketComparison.marketAccuracyPct}% market favorite (${record.marketComparison.sampleSize} fixture${record.marketComparison.sampleSize === 1 ? '' : 's'} with real odds)`;
  } else if (marketSub) {
    marketSub.textContent = 'Needs real odds coverage on resolved fixtures';
  }

  if (liveBadge) liveBadge.hidden = false;
}

function renderFriendlyPredictions(predictions, record) {
  const panel = document.querySelector('#friendly-predictions-panel');
  const list = document.querySelector('#friendly-predictions-list');
  if (!panel || !list || !predictions || !predictions.length) return;

  list.innerHTML = predictions.map((f) => `
    <article class="match-row">
      <div class="competition"><span class="competition-badge fr">FR</span><div><strong>Club friendly</strong><small>Pre-season</small></div></div>
      <div class="teams">${teamSpan(f.home)}<strong>VS</strong>${teamSpan(f.away)}</div>
      <div class="match-outcome">
        <div class="match-status upcoming"><span></span> ${f.kickoffLabel}</div>
        ${predictChip(f)}
        ${recentChangesLine(f)}
      </div>
    </article>
  `).join('');

  const accuracyEl = document.querySelector('#friendly-track-accuracy');
  const subEl = document.querySelector('#friendly-track-sub');
  if (record && accuracyEl) accuracyEl.textContent = record.accuracyPct === null ? '—' : `${record.accuracyPct}%`;
  if (record && subEl) {
    subEl.textContent = record.totalResolved
      ? `${record.correct} of ${record.totalResolved} correct`
      : `${record.totalLogged} logged today, none resolved yet`;
  }

  const liveBadge = document.querySelector('#friendly-live-badge');
  if (liveBadge) liveBadge.hidden = false;
  panel.hidden = false;
  refreshIcons();
}

fetch('data/fpl.json')
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error('fpl.json ' + res.status))))
  .then((data) => {
    const deadlineText = document.querySelector('#fpl-deadline-text');
    if (deadlineText) deadlineText.textContent = `${data.gameweek.name} deadline · ${data.gameweek.deadlineLabel}`;

    const fplFixturesList = document.querySelector('#fpl-fixtures-list');
    if (fplFixturesList && data.fixtures && data.fixtures.length) {
      fplFixturesList.innerHTML = data.fixtures.map((f) => `
        <article class="match-row">
          <div class="competition"><span class="competition-badge pl">PL</span><div><strong>Premier League</strong><small>${data.gameweek.name}</small></div></div>
          <div class="teams">${teamSpan(f.home)}<strong>VS</strong>${teamSpan(f.away)}</div>
          <div class="match-outcome">
            <div class="match-status upcoming"><span></span> ${f.kickoffLabel}</div>
            ${predictChip(f)}
            ${recentChangesLine(f)}
          </div>
        </article>
      `).join('');
      const fplFixturesKicker = document.querySelector('#fpl-fixtures-kicker');
      if (fplFixturesKicker) fplFixturesKicker.textContent = data.gameweek.name;
      const fplFixturesBadge = document.querySelector('#fpl-fixtures-live-badge');
      if (fplFixturesBadge) fplFixturesBadge.hidden = false;
      refreshIcons();
    }

    renderTrackRecord(data.predictionTrackRecord);
    renderFriendlyPredictions(data.friendlyPredictions, data.friendlyTrackRecord);

    const otherLeaguesPanel = document.querySelector('#other-leagues-panel');
    if (otherLeaguesPanel && data.otherLeaguePredictions) {
      otherLeaguesPanel.hidden = false;
      const otherLeaguesBadge = document.querySelector('#other-leagues-live-badge');
      if (otherLeaguesBadge) otherLeaguesBadge.hidden = false;
      const activeTab = document.querySelector('#other-leagues-tabs .tab.active');
      renderOtherLeagueMatches(activeTab ? activeTab.dataset.league : 'La Liga', data);
      document.querySelectorAll('#other-leagues-tabs .tab').forEach((tab) => {
        tab.addEventListener('click', () => renderOtherLeagueMatches(tab.dataset.league, data));
      });
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
        const nextFixtureHtml = t.nextOpponent
          ? `<div class="team-card-next"><span>${t.nextIsHome ? 'vs' : '@'} ${t.nextOpponent}</span><span class="fixture-tag ${t.nextFdrClass || 'mid'}">FDR ${t.nextFdr ?? '-'}</span></div>`
          : '';
        return `<article class="team-card${isFavorite ? ' favorited' : ''}" data-team="${t.name}" tabindex="0" role="button" aria-label="View ${t.name} squad">
          <div class="team-card-head">
            <span class="team-crest ${t.crestClass}">${t.shortName}</span>
            <div><strong>${t.name}</strong><small>Premier League${t.leagueRank ? ' · #' + t.leagueRank + ' rated' : ''}</small></div>
            ${isFavorite ? '<i data-lucide="sparkles" class="team-card-favorite"></i>' : ''}
          </div>
          ${nextFixtureHtml}
          <div class="team-card-stats">
            <div><small>Squad rating</small><strong>${t.squadRating === null ? 'New to PL' : t.squadRating.toFixed(1)}</strong></div>
            <div><small>Squad size</small><strong>${t.squadSize}</strong></div>
            <div><small>Squad value</small><strong>${t.squadValue}</strong></div>
          </div>
          ${teamRecentChangesLine(t)}
        </article>`;
      }).join('');
      const teamsBadge = document.querySelector('#teams-live-badge');
      if (teamsBadge) teamsBadge.hidden = false;
      bindTeamTriggers(teamsGrid, data);
      refreshIcons();
    }
    if (data.teams && data.teams.length) {
      renderTeamChips(data.teams.map((t) => t.name).sort());
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

    // Like renderLeaderboard, but for entries carrying their own extra
    // real value (price change, gameweek stat, starts count etc.) rather
    // than a bare id - the new price/gameweek/rotation/ownership panels
    // all use this shape.
    function renderEntryList(containerId, entries, emptyMessage, valueFn) {
      const container = document.querySelector('#' + containerId);
      if (!container) return;
      if (!entries || !entries.length) {
        container.innerHTML = `<p class="lede" style="margin:0;font-size:12px">${emptyMessage}</p>`;
        return;
      }
      container.innerHTML = entries.map((entry, i) => {
        const p = data.players[entry.id];
        if (!p) return '';
        return `<div class="leaderboard-row" data-player="fpl-${entry.id}" tabindex="0" role="button" aria-label="View ${p.name}">
          <span class="leaderboard-rank">${i + 1}</span>
          <div class="player-cell"><div class="player-avatar ${p.avatarClass}">${p.avatar}</div><strong>${p.shortName}<small>${p.team} · ${p.position}</small></strong></div>
          <span class="leaderboard-value">${valueFn(entry, p)}</span>
        </div>`;
      }).join('');
      bindPlayerTriggers(container);
    }

    if (data.priceMovement) {
      renderEntryList('price-risers-list', data.priceMovement.risers, 'No price rises this gameweek yet.', (e) => `<span class="positive">+£${e.changeEvent.toFixed(1)}m</span>`);
      renderEntryList('price-fallers-list', data.priceMovement.fallers, 'No price falls this gameweek yet.', (e) => `<span class="negative">£${e.changeEvent.toFixed(1)}m</span>`);
    }

    if (data.ownershipWatch) {
      renderEntryList('ownership-rising-list', data.ownershipWatch.rising, 'No net ownership rises this gameweek yet.', (e, p) => `<span class="positive">+${e.netTransfersEvent.toLocaleString()}</span> <small style="color:#75838c">· ${p.owned} owned</small>`);
      renderEntryList('ownership-falling-list', data.ownershipWatch.falling, 'No net ownership falls this gameweek yet.', (e, p) => `<span class="negative">${e.netTransfersEvent.toLocaleString()}</span> <small style="color:#75838c">· ${p.owned} owned</small>`);
    }

    if (data.gameweekPerformers) {
      const gwKicker = document.querySelector('#gw-performers-kicker');
      if (gwKicker) gwKicker.textContent = data.gameweekPerformers.eventName || 'No gameweek in progress yet';
      const noGwMsg = 'No gameweek in progress yet.';
      renderEntryList('gw-performers-points', data.gameweekPerformers.points, noGwMsg, (e) => `${e.value} pts`);
      renderEntryList('gw-performers-goals', data.gameweekPerformers.goals, noGwMsg, (e) => `${e.value} goal${e.value === 1 ? '' : 's'}`);
      renderEntryList('gw-performers-assists', data.gameweekPerformers.assists, noGwMsg, (e) => `${e.value} assist${e.value === 1 ? '' : 's'}`);
      renderEntryList('gw-performers-defensive', data.gameweekPerformers.defensive, noGwMsg, (e) => `${e.value} pts`);
      renderEntryList('gw-performers-bonus', data.gameweekPerformers.bonus, noGwMsg, (e) => `${e.value} bonus`);
      renderEntryList('gw-performers-saves', data.gameweekPerformers.saves, noGwMsg, (e) => `${e.value} save${e.value === 1 ? '' : 's'}`);
    }

    if (data.rotationWatch) {
      renderEntryList('rotation-watch-list', data.rotationWatch, 'Not enough real minutes yet to judge rotation patterns.', (e) => `${e.starts} starts <small style="color:#75838c">· ${e.minutes} mins</small>`);
    }

    const injuryList = document.querySelector('#injury-report-list');
    if (injuryList) {
      if (!data.injuryReport || !data.injuryReport.length) {
        injuryList.innerHTML = '<p class="lede" style="margin:0;font-size:12px">No availability concerns among tracked players right now.</p>';
      } else {
        injuryList.innerHTML = data.injuryReport.map((entry) => {
          const p = data.players[entry.id];
          if (!p) return '';
          const chanceText = entry.chanceNextRound !== null && entry.chanceNextRound !== undefined ? `${entry.chanceNextRound}% next round` : 'Chance unknown';
          const trendHTML = entry.improving ? '<br><span class="positive"><i data-lucide="trending-up"></i> Improving</span>' : '';
          return `<div class="leaderboard-row injury-row" data-player="fpl-${entry.id}" tabindex="0" role="button" aria-label="View ${p.name}">
            <div class="player-cell"><div class="player-avatar ${p.avatarClass}">${p.avatar}</div><strong>${p.shortName}<small><span class="fixture-tag mid">${STATUS_LABELS[entry.status] || entry.status}</span> ${p.team} · ${entry.news}</small></strong></div>
            <span class="leaderboard-value">${chanceText}${trendHTML}</span>
          </div>`;
        }).join('');
        bindPlayerTriggers(injuryList);
        refreshIcons();
      }
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

    // Cross-references the real injury report (built for FPL assistant's
    // Squad intelligence tab) so a struggling player's row here shows
    // *why* if it's a real, known injury/availability concern - the two
    // pages were covering related ground with zero connection between
    // them, which meant checking both to get the full picture.
    const injuryById = new Map((data.injuryReport || []).map((e) => [String(e.id), e]));

    const METRIC_LABELS = { rating: 'Rating', xg: 'xG', price: 'Price' };
    const METRIC_CYCLE = ['rating', 'xg', 'price'];
    function metricValue(p, metric) {
      if (metric === 'xg') return typeof p.xg === 'number' ? p.xg : 0;
      if (metric === 'price') return parseFloat(String(p.price).replace(/[^0-9.]/g, '')) || 0;
      return playerRating(p);
    }
    function metricDisplay(p, metric) {
      if (metric === 'xg') return (typeof p.xg === 'number' ? p.xg : 0).toFixed(1);
      if (metric === 'price') return p.price;
      return playerRating(p).toFixed(1);
    }

    let performancePositionFilter = '';
    let performanceMetric = 'rating';
    let currentPerformanceRows = [];

    function renderPerformanceTable(filter) {
      const table = document.querySelector('#performance-table');
      if (!table) return;
      let rows = performancePool.slice();
      if (performancePositionFilter) rows = rows.filter((p) => p.position === performancePositionFilter);
      if (filter === 'rising') {
        rows = rows.filter((p) => p.form >= 6).sort((a, b) => b.form - a.form);
      } else if (filter === 'attention') {
        rows = rows.filter((p) => p.minutes >= 450 && p.form <= 3).sort((a, b) => a.form - b.form);
      } else {
        rows = rows.sort((a, b) => metricValue(b, performanceMetric) - metricValue(a, performanceMetric));
      }
      rows = rows.slice(0, 12);
      currentPerformanceRows = rows;

      const metricLabel = document.querySelector('#performance-metric-label');
      if (metricLabel) metricLabel.textContent = METRIC_LABELS[performanceMetric];
      const metricName = document.querySelector('#performance-metric-name');
      if (metricName) metricName.textContent = METRIC_LABELS[performanceMetric];

      table.querySelectorAll('.table-row').forEach((row) => row.remove());
      rows.forEach((p) => {
        const row = document.createElement('div');
        row.className = 'table-row';
        row.dataset.player = 'fpl-' + p.id;
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', 'View ' + p.name);
        const injury = injuryById.get(String(p.id));
        const injuryBadge = injury ? ` <span class="fixture-tag mid">${STATUS_LABELS[injury.status] || injury.status}</span>` : '';
        row.innerHTML = `<div class="player-cell"><div class="player-avatar ${p.avatarClass}">${p.avatar}</div><strong>${p.shortName}<small>${p.position} &middot; ${p.team}${injuryBadge}</small></strong></div>
          <span>${p.team}</span><span>${p.minutes}</span><span>${p.goals}</span><span>${p.assists}</span><strong>${metricDisplay(p, performanceMetric)}</strong>`;
        table.appendChild(row);
      });
      bindPlayerTriggers(table);
    }

    if (performancePool.length) {
      renderPerformanceTable('all');
      document.querySelectorAll('#performance-tabs .tab').forEach((tab) => {
        tab.addEventListener('click', () => renderPerformanceTable(tab.dataset.filter));
      });

      function activePerformanceFilter() {
        const activeTab = document.querySelector('#performance-tabs .tab.active');
        return activeTab ? activeTab.dataset.filter : 'all';
      }

      const positionFilterSelect = document.querySelector('#performance-position-filter');
      const filterToggle = document.querySelector('#performance-filter-toggle');
      if (filterToggle && positionFilterSelect) {
        filterToggle.addEventListener('click', () => { positionFilterSelect.hidden = !positionFilterSelect.hidden; });
        positionFilterSelect.addEventListener('change', (e) => {
          performancePositionFilter = e.target.value;
          renderPerformanceTable(activePerformanceFilter());
        });
      }

      const metricsToggle = document.querySelector('#performance-metrics-toggle');
      if (metricsToggle) {
        metricsToggle.addEventListener('click', () => {
          const nextIndex = (METRIC_CYCLE.indexOf(performanceMetric) + 1) % METRIC_CYCLE.length;
          performanceMetric = METRIC_CYCLE[nextIndex];
          renderPerformanceTable(activePerformanceFilter());
        });
      }

      const exportBtn = document.querySelector('#performance-export-btn');
      if (exportBtn) {
        exportBtn.addEventListener('click', () => {
          const header = ['Player', 'Team', 'Position', 'Minutes', 'Goals', 'Assists', METRIC_LABELS[performanceMetric]];
          const csvRows = currentPerformanceRows.map((p) => [p.name, p.team, p.position, p.minutes, p.goals, p.assists, metricDisplay(p, performanceMetric)]);
          const csv = [header].concat(csvRows).map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `yobrapulse-performance-${activePerformanceFilter()}.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        });
      }
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

    // Real, always-available, non-personal FPL facts - not a stand-in for
    // "your squad value", which needs a real logged-in FPL Team ID this
    // app doesn't have (deferred accounts work, not a data gap).
    if (typeof data.totalManagers === 'number') {
      const managersValue = document.querySelector('#managers-metric-value');
      if (managersValue) managersValue.innerHTML = `${(data.totalManagers / 1000000).toFixed(1)}<em>m</em>`;
    }
    if (typeof data.totalPlayers === 'number') {
      const playersValue = document.querySelector('#players-metric-value');
      if (playersValue) playersValue.textContent = data.totalPlayers;
    }

    const captainList = document.querySelector('#captain-list');
    if (captainList && data.captainPicks.length) {
      captainList.innerHTML = data.captainPicks.map((cp, i) => {
        const p = data.players[cp.id];
        return `<article class="captain-row${i === 0 ? ' top-pick' : ''}" data-player="fpl-${cp.id}" tabindex="0" role="button" aria-label="View ${p.name}">
          <span class="captain-rank">${i + 1}</span>
          <div class="player-cell"><div class="player-avatar ${p.avatarClass}">${p.avatar}</div><strong>${p.shortName}<small>${p.team} · ${p.position}</small></strong></div>
          <div class="captain-reason"><small>${p.fixture || ''}</small><span class="fixture-tag ${p.fdrClass || 'easy'}">FDR ${p.fdr || '-'}</span></div>
          <strong class="captain-score" title="${playerFactorsTitle(cp.factors)}">${cp.score.toFixed(1)}</strong>
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
        return `<article class="transfer-row" data-player="fpl-${item.id}" tabindex="0" role="button" aria-label="View ${p.name}" title="${playerFactorsTitle(item.factors)}">
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
      // Default view is the top 6 overall (data.topPerformers). Picking a
      // position switches to the real comparison pool (~130 real players)
      // filtered to that position and sorted by points - filtering the
      // top-6-overall list itself would leave most positions with only
      // 0-2 rows, which isn't a useful filter.
      function renderPerformersTable(positionFilter) {
        performersTable.querySelectorAll('.table-row').forEach((row) => row.remove());
        const colLabel = document.querySelector('#fpl-performers-col2');
        if (colLabel) colLabel.textContent = 'Team';
        const ids = positionFilter
          ? (data.comparisonPool || [])
            .filter((id) => data.players[id].position === positionFilter)
            .sort((a, b) => data.players[b].points - data.players[a].points)
            .slice(0, 8)
          : data.topPerformers;
        ids.forEach((id) => {
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
        refreshIcons();
      }

      renderPerformersTable('');
      const badge = document.querySelector('#performers-live-badge');
      if (badge) badge.hidden = false;

      const positionFilterSelect = document.querySelector('#fpl-performers-position-filter');
      if (positionFilterSelect) positionFilterSelect.addEventListener('change', (e) => renderPerformersTable(e.target.value));
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

// Every competition Live Scores and Fixtures both draw from. club.friendly
// is ESPN's single global bucket of every pre-season club friendly
// worldwide, not scoped to any league, so it's filtered below to only
// matches involving a club from the other five. Filtering by real ESPN
// team id (not name) since matching team names across two different ESPN
// endpoints is fragile (kit sponsors, short names etc. can differ); ids
// are stable.
//
// ESPN's own friendly coverage is itself inconsistent: some tournaments
// (e.g. the Premier League Summer Series) show up inside club.friendly,
// but others get their own separate competition slug entirely and never
// appear in club.friendly at all - found this the hard way when
// Arsenal's Emirates Cup match against Dortmund was missing from
// Fixtures despite club.friendly being correctly fixed. Checked ESPN's
// full leagues list for every other named preseason-tournament slug
// (global.club_challenge, global.pinatar_cup, jpn.world_challenge) -
// none had any real matches scheduled, so emirates_cup is the only one
// worth tracking right now. If this keeps happening, it's a sign ESPN
// just doesn't have one single feed that covers every club friendly.
// Domestic cups, super cups and secondary European competitions all
// include clubs well beyond our five tracked leagues (the FA Cup alone
// has 700+ possible entrants across every English tier; Europa League
// mixes in Portuguese, Dutch, Scottish, Turkish etc. clubs) - every one
// of these gets filterToTrackedTeams: true for the same reason
// club.friendly does. Champions League gets the same treatment now too:
// it was shipped without a tracked-team filter originally, which meant
// a match between two non-tracked clubs (e.g. Benfica vs Ajax) would
// show up alongside real tracked-club fixtures - same bug class,
// just never caught until doing this pass properly.
const TRACKED_COMPETITIONS = [
  { slug: 'eng.1', badge: 'pl', code: 'PL', name: 'Premier League' },
  { slug: 'esp.1', badge: 'll', code: 'LL', name: 'La Liga' },
  { slug: 'ita.1', badge: 'la', code: 'SA', name: 'Serie A' },
  { slug: 'ger.1', badge: 'bl', code: 'BL', name: 'Bundesliga' },
  { slug: 'fra.1', badge: 'l1', code: 'L1', name: 'Ligue 1' },
  { slug: 'uefa.champions', badge: 'cl', code: 'CL', name: 'Champions League', filterToTrackedTeams: true },
  { slug: 'uefa.europa', badge: 'eu', code: 'EL', name: 'Europa League', filterToTrackedTeams: true },
  { slug: 'uefa.europa.conf', badge: 'eu', code: 'ECL', name: 'Europa Conference League', filterToTrackedTeams: true },
  { slug: 'uefa.super_cup', badge: 'eu', code: 'USC', name: 'UEFA Super Cup', filterToTrackedTeams: true },
  { slug: 'eng.fa', badge: 'cup', code: 'FAC', name: 'FA Cup', filterToTrackedTeams: true },
  { slug: 'eng.league_cup', badge: 'cup', code: 'EFL', name: 'EFL Cup', filterToTrackedTeams: true },
  { slug: 'eng.charity', badge: 'cup', code: 'CS', name: 'Community Shield', filterToTrackedTeams: true },
  { slug: 'esp.copa_del_rey', badge: 'cup', code: 'CDR', name: 'Copa del Rey', filterToTrackedTeams: true },
  { slug: 'esp.super_cup', badge: 'cup', code: 'SSC', name: 'Spanish Super Cup', filterToTrackedTeams: true },
  { slug: 'esp.joan_gamper', badge: 'fr', code: 'JG', name: 'Joan Gamper Trophy', filterToTrackedTeams: true },
  { slug: 'ita.coppa_italia', badge: 'cup', code: 'CI', name: 'Coppa Italia', filterToTrackedTeams: true },
  { slug: 'ita.super_cup', badge: 'cup', code: 'SCI', name: 'Supercoppa Italiana', filterToTrackedTeams: true },
  { slug: 'ger.dfb_pokal', badge: 'cup', code: 'DFB', name: 'DFB-Pokal', filterToTrackedTeams: true },
  { slug: 'ger.super_cup', badge: 'cup', code: 'DSC', name: 'DFL-Supercup', filterToTrackedTeams: true },
  { slug: 'fra.coupe_de_france', badge: 'cup', code: 'CDF', name: 'Coupe de France', filterToTrackedTeams: true },
  { slug: 'fra.super_cup', badge: 'cup', code: 'TDC', name: 'Trophee des Champions', filterToTrackedTeams: true },
  { slug: 'club.friendly', badge: 'fr', code: 'FR', name: 'Club friendly', filterToTrackedTeams: true },
  { slug: 'friendly.emirates_cup', badge: 'fr', code: 'EC', name: 'Emirates Cup', filterToTrackedTeams: true },
];
// Single shared fetch of data/leagues.json - both the League Tables
// panel (Stats page) and the tracked-team roster below need it, and a
// plain Promise only ever runs its underlying fetch once no matter how
// many .then() chains hang off it, so this avoids requesting the same
// file twice on every page load.
const leaguesJsonPromise = fetch('data/leagues.json')
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error('leagues.json ' + res.status))));

// Real club rosters (id + name) for all five leagues, from that same
// file - fetched hourly server-side by fetch-league-data.py. This
// exists instead of calling ESPN's own /teams endpoint directly from
// the browser: that endpoint sends no CORS header at all (found via a
// real browser console - curl-based checks never catch this, since
// curl doesn't enforce CORS and the endpoint still returns a normal
// 200), so every fetch of it silently failed in production while
// looking fine in every server-side test. leagues.json's standings
// entries already carry each team's real id, and the standings
// endpoint they come from is confirmed CORS-open, so this avoids the
// broken endpoint entirely rather than working around it.
const trackedTeamsPromise = leaguesJsonPromise
  .then((data) => [].concat(...data.leagues.map((l) => l.teams.map((t) => ({ id: String(t.id), name: t.name, league: l.name }))))
    .sort((a, b) => a.name.localeCompare(b.name)))
  .catch((err) => { console.error('[YobraPulse] tracked team list failed to load', err); return []; });

const trackedTeamIdsPromise = trackedTeamsPromise.then((teams) => new Set(teams.map((t) => t.id)));

// Date helpers - everything here works in UTC (matching ESPN's kickoff
// timestamps and the kickoff labels already shown elsewhere) so "today"
// means the same thing consistently regardless of the viewer's own
// timezone.
function ymd(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}
function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
function isSameUTCDay(a, b) {
  return ymd(a) === ymd(b);
}
function dayLabel(date) {
  const today = new Date();
  if (isSameUTCDay(date, today)) return 'Today';
  if (isSameUTCDay(date, addDays(today, 1))) return 'Tomorrow';
  if (isSameUTCDay(date, addDays(today, -1))) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
}
function dateNavLabel(date) {
  return `${dayLabel(date)} · ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
}

// datesParam is either 'YYYYMMDD' (a single day) or 'YYYYMMDD-YYYYMMDD'
// (a range) - ESPN's scoreboard endpoint supports both directly.
function fetchCompetitionMatches(comp, datesParam) {
  return fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${comp.slug}/scoreboard?dates=${datesParam}`)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error('scoreboard ' + res.status))))
    .then((data) => {
      const events = data.events || [];
      const build = (trackedIds) => events
        .filter((ev) => {
          if (!comp.filterToTrackedTeams) return true;
          const c = ev.competitions[0];
          return c.competitors.some((t) => trackedIds.has(String(t.team.id)));
        })
        .map((ev) => {
          const c = ev.competitions[0];
          const home = c.competitors.find((t) => t.homeAway === 'home');
          const away = c.competitors.find((t) => t.homeAway === 'away');
          return {
            id: String(ev.id),
            leagueSlug: comp.slug,
            competitionCode: comp.code,
            competitionBadge: comp.badge,
            competitionName: comp.name,
            homeId: String(home.team.id),
            awayId: String(away.team.id),
            home: home.team.shortDisplayName,
            away: away.team.shortDisplayName,
            homeScore: home.score,
            awayScore: away.score,
            state: c.status.type.state,
            clock: c.status.type.shortDetail,
            kickoff: new Date(ev.date),
            // Real venue from ESPN - the only reliable way to tell apart
            // two real same-day, same-opponent friendlies (a club can
            // genuinely schedule both a public first-team friendly and a
            // separate closed-doors squad friendly against the same
            // opponent same day - found this looking at a real Liverpool
            // vs Como case: one at Anfield, one at the training ground).
            venue: c.venue ? c.venue.fullName : null,
          };
        });
      return comp.filterToTrackedTeams ? trackedTeamIdsPromise.then(build) : build(new Set());
    })
    .catch((err) => { console.warn(`[YobraPulse] scoreboard fetch failed for ${comp.slug} (${datesParam})`, err); return []; });
}

function fetchMatchesForDates(datesParam, competitions) {
  return Promise.all((competitions || TRACKED_COMPETITIONS).map((comp) => fetchCompetitionMatches(comp, datesParam)))
    .then((results) => [].concat(...results));
}

// Full match detail (events, statistics, line-up): ESPN's scoreboard
// endpoint above only carries the score, not what happened - all of
// this lives on a separate per-match summary endpoint, confirmed
// CORS-open the same as the scoreboard. One fetch of that endpoint
// carries everything for all three expandable tabs, so this is called
// once per match rather than three times.
//
// What's deliberately NOT here, checked directly against real match
// data before building this (two real top-flight matches inspected
// field-by-field): expected goals (xG) isn't in the statistics data at
// all, there's no player "match rating" field anywhere in the payload,
// and per-player stats only cover appearances/cards/goals/assists/
// shots/saves - no passes, pass accuracy, duels or distance covered
// per player. Rather than fake those or leave empty placeholders,
// they're simply not shown - what's below is everything that's real.
// Penalty goals and misses get their own icons, not folded into the
// plain "goal" bucket - checked real match data first and found ESPN
// uses "Penalty - Scored" (a real goal, distinct icon) and
// "Penalty - Saved" (NOT a goal) as separate event types. The earlier
// classifier matched on the bare substring "penalty", which caught
// both under the "goal" kind - a saved penalty was showing a goal
// icon for a shot that didn't score. Order matters below: the
// saved/missed check has to run before the generic goal-or-penalty
// fallback, or it never gets reached.
const MATCH_EVENT_ICONS = { goal: '⚽', penaltyGoal: '🎯', penaltyMiss: '❌', ownGoal: '⚽', card: '🟨', redCard: '🟥', sub: '🔁' };

function classifyMatchEvent(typeText) {
  const lower = (typeText || '').toLowerCase();
  if (lower.includes('red card')) return 'redCard';
  if (lower.includes('yellow card')) return 'card';
  if (lower.includes('substitution')) return 'sub';
  if (lower.includes('own goal')) return 'ownGoal';
  if (lower.includes('penalty') && (lower.includes('saved') || lower.includes('missed'))) return 'penaltyMiss';
  if (lower.includes('penalty')) return 'penaltyGoal';
  if (lower.includes('goal')) return 'goal';
  return null;
}

// Curated subset of the ~28 raw team-statistic fields ESPN returns -
// the rest (crosses, long balls, blocked shots, clearance splits etc.)
// are real too but repetitive/niche enough to skip for a first pass.
// format() exists because ESPN's own displayValue is inconsistent
// between fields: possessionPct already comes as "55.8" (append %),
// but passPct comes as a bare fraction like "0.9" (needs x100) -
// verified directly per-field before writing this, not assumed.
const MATCH_STAT_DEFS = [
  { key: 'possessionPct', label: 'Possession', format: (v) => `${v}%` },
  { key: 'totalShots', label: 'Shots', format: (v) => v },
  { key: 'shotsOnTarget', label: 'Shots on target', format: (v) => v },
  { key: 'wonCorners', label: 'Corners', format: (v) => v },
  { key: 'passPct', label: 'Pass accuracy', format: (v) => `${Math.round(parseFloat(v) * 100)}%` },
  { key: 'foulsCommitted', label: 'Fouls', format: (v) => v },
  { key: 'offsides', label: 'Offsides', format: (v) => v },
  { key: 'yellowCards', label: 'Yellow cards', format: (v) => v },
  { key: 'redCards', label: 'Red cards', format: (v) => v },
  { key: 'saves', label: 'Saves', format: (v) => v },
];

function extractMatchStats(boxscore) {
  const teams = (boxscore && boxscore.teams) || [];
  const home = teams.find((t) => t.homeAway === 'home');
  const away = teams.find((t) => t.homeAway === 'away');
  if (!home || !away || !home.statistics || !home.statistics.length) return null;
  const byKey = (team) => Object.fromEntries((team.statistics || []).map((s) => [s.name, s.displayValue]));
  const homeStats = byKey(home);
  const awayStats = byKey(away);
  return MATCH_STAT_DEFS
    .filter((def) => homeStats[def.key] !== undefined || awayStats[def.key] !== undefined)
    .map((def) => ({
      label: def.label,
      home: homeStats[def.key] !== undefined ? def.format(homeStats[def.key]) : '-',
      away: awayStats[def.key] !== undefined ? def.format(awayStats[def.key]) : '-',
    }));
}

function extractLineupSide(roster) {
  if (!roster) return null;
  const playerRow = (e) => ({
    name: e.athlete ? e.athlete.shortName || e.athlete.displayName : 'Unknown',
    jersey: e.jersey || '',
    position: (e.position && e.position.abbreviation) || '',
    subbedOut: !!e.subbedOut,
    subbedIn: !!e.subbedIn,
    yellowCards: Number((e.stats || []).find((s) => s.name === 'yellowCards')?.displayValue || 0),
    redCards: Number((e.stats || []).find((s) => s.name === 'redCards')?.displayValue || 0),
    goals: Number((e.stats || []).find((s) => s.name === 'totalGoals')?.displayValue || 0),
  });
  const all = roster.roster || [];
  return {
    formation: roster.formation || '',
    starters: all.filter((e) => e.starter).map(playerRow),
    bench: all.filter((e) => !e.starter).map(playerRow),
  };
}

function fetchMatchDetail(match) {
  return fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${match.leagueSlug}/summary?event=${match.id}`)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error('summary ' + res.status))))
    .then((data) => {
      const events = (data.keyEvents || [])
        .map((e) => ({
          kind: classifyMatchEvent(e.type && e.type.text),
          minute: e.clock && e.clock.displayValue,
          clockValue: e.clock ? e.clock.value : 0,
          text: e.text || e.shortText || '',
        }))
        .filter((e) => e.kind && e.text)
        .sort((a, b) => a.clockValue - b.clockValue);
      const stats = extractMatchStats(data.boxscore);
      const rosters = data.rosters || [];
      const lineup = {
        home: extractLineupSide(rosters.find((r) => r.homeAway === 'home')),
        away: extractLineupSide(rosters.find((r) => r.homeAway === 'away')),
      };
      return { events, stats, lineup };
    })
    .catch((err) => { console.warn(`[YobraPulse] match summary failed for event ${match.id}`, err); return { events: [], stats: null, lineup: { home: null, away: null } }; });
}

// Highlights = goals (including penalty goals/misses) and bookings only.
// Substitutions are real events too (captured in `events` and still
// visible via the IN/OUT badges on the Line-up tab) but on a match with
// a lot of subbing, they buried the moments actually worth surfacing
// here - dropped from this view specifically, not from the underlying
// data.
const HIGHLIGHT_KINDS = new Set(['goal', 'penaltyGoal', 'penaltyMiss', 'ownGoal', 'card', 'redCard']);

function matchEventsHTML(events) {
  const highlights = (events || []).filter((e) => HIGHLIGHT_KINDS.has(e.kind));
  if (!highlights.length) return '';
  return `<ul class="match-events">${highlights.map((e) => `
    <li><span class="match-event-icon">${MATCH_EVENT_ICONS[e.kind] || ''}</span><span class="match-event-minute">${e.minute || ''}</span><span class="match-event-text">${e.text}</span></li>
  `).join('')}</ul>`;
}

function matchSummaryTabHTML(events) {
  return matchEventsHTML(events) || '<p class="lede" style="margin:0;font-size:12px">No goals or bookings yet.</p>';
}

function matchStatsTabHTML(stats) {
  if (!stats || !stats.length) return '<p class="lede" style="margin:0;font-size:12px">Statistics not available for this match.</p>';
  return `<div class="match-stats">${stats.map((s) => `
    <div class="match-stat-row">
      <span class="match-stat-value">${s.home}</span>
      <span class="match-stat-label">${s.label}</span>
      <span class="match-stat-value">${s.away}</span>
    </div>
  `).join('')}</div>`;
}

function lineupPlayerHTML(p) {
  const badges = `${p.goals ? ` <span class="lineup-badge goal">⚽${p.goals > 1 ? '×' + p.goals : ''}</span>` : ''}${p.yellowCards ? ' <span class="lineup-badge yellow">🟨</span>' : ''}${p.redCards ? ' <span class="lineup-badge red">🟥</span>' : ''}${p.subbedOut ? ' <span class="lineup-badge sub-out">OUT</span>' : ''}${p.subbedIn ? ' <span class="lineup-badge sub-in">IN</span>' : ''}`;
  return `<li><span class="lineup-jersey">${p.jersey}</span><span class="lineup-name">${p.name}</span><span class="lineup-pos">${p.position}</span>${badges}</li>`;
}

function lineupSideHTML(side, label) {
  if (!side) return `<div class="lineup-side"><h4>${label}</h4><p class="lede" style="margin:0;font-size:12px">Line-up not available yet.</p></div>`;
  return `<div class="lineup-side">
    <h4>${label}${side.formation ? ` <small>(${side.formation})</small>` : ''}</h4>
    <ul class="lineup-list">${side.starters.map(lineupPlayerHTML).join('')}</ul>
    ${side.bench.length ? `<p class="lineup-bench-label">Bench</p><ul class="lineup-list bench">${side.bench.map(lineupPlayerHTML).join('')}</ul>` : ''}
  </div>`;
}

function matchLineupTabHTML(lineup, m) {
  if (!lineup.home && !lineup.away) return '<p class="lede" style="margin:0;font-size:12px">Line-up not available yet.</p>';
  return `<div class="match-lineup">${lineupSideHTML(lineup.home, m.home)}${lineupSideHTML(lineup.away, m.away)}</div>`;
}

// Expanding a match row fetches its full detail on demand (not for
// every match on every poll - only when a user actually opens one).
// Cached indefinitely for finished matches (nothing about them
// changes); re-fetched on open for a live match, since that data is
// actively changing.
const matchDetailCache = new Map();
const expandedMatchIds = new Set();

function renderMatchDetailPanel(panel, m, detail, activeTab) {
  const tabs = [['summary', 'Highlights'], ['stats', 'Statistics'], ['lineup', 'Line-up']];
  const tabsHTML = tabs.map(([key, label]) => `<button class="tab${key === activeTab ? ' active' : ''}" data-tab="${key}">${label}</button>`).join('');
  let bodyHTML;
  if (activeTab === 'stats') bodyHTML = matchStatsTabHTML(detail.stats);
  else if (activeTab === 'lineup') bodyHTML = matchLineupTabHTML(detail.lineup, m);
  else bodyHTML = matchSummaryTabHTML(detail.events);

  panel.innerHTML = `<div class="tabs match-detail-tabs">${tabsHTML}</div><div class="match-detail-body">${bodyHTML}</div>`;
  panel.querySelectorAll('.tab').forEach((tabEl) => {
    tabEl.addEventListener('click', () => renderMatchDetailPanel(panel, m, detail, tabEl.dataset.tab));
  });
  refreshIcons();
}

function toggleMatchDetail(rowEl, m) {
  const existing = rowEl.nextElementSibling;
  if (existing && existing.classList.contains('match-detail-panel')) {
    existing.remove();
    rowEl.classList.remove('expanded');
    expandedMatchIds.delete(m.id);
    return;
  }
  rowEl.classList.add('expanded');
  expandedMatchIds.add(m.id);
  const panel = document.createElement('div');
  panel.className = 'match-detail-panel';
  panel.innerHTML = '<p class="lede" style="margin:0;padding:14px 0;font-size:12px">Loading match detail&hellip;</p>';
  rowEl.after(panel);

  const cached = m.state !== 'in' ? matchDetailCache.get(m.id) : null;
  if (cached) {
    renderMatchDetailPanel(panel, m, cached, 'summary');
    return;
  }
  fetchMatchDetail(m).then((detail) => {
    if (m.state !== 'in') matchDetailCache.set(m.id, detail);
    renderMatchDetailPanel(panel, m, detail, 'summary');
  });
}

// Event delegation, not per-row listeners - match lists are rebuilt
// with innerHTML on every poll/filter change, so binding to the
// container once (idempotent - a stale ref would just no-op) survives
// that instead of needing to be re-bound after every render.
const matchExpandContainers = new WeakSet();
function bindMatchExpandTriggers(container) {
  if (!container || matchExpandContainers.has(container)) return;
  matchExpandContainers.add(container);
  container.addEventListener('click', (event) => {
    const rowEl = event.target.closest('.match-row[data-match-id]');
    if (!rowEl || event.target.closest('a')) return;
    const m = {
      id: rowEl.dataset.matchId,
      leagueSlug: rowEl.dataset.leagueSlug,
      state: rowEl.dataset.matchState,
      home: rowEl.dataset.matchHome,
      away: rowEl.dataset.matchAway,
    };
    toggleMatchDetail(rowEl, m);
  });
}

function matchRowHTML(m) {
  const kickoffLabel = m.kickoff.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
  let statusHTML;
  if (m.state === 'in') {
    statusHTML = `<div class="match-status live-status"><span></span> ${m.clock || 'Live'}</div>`;
  } else if (m.state === 'post') {
    statusHTML = '<div class="match-status upcoming"><span></span> Full-time</div>';
  } else {
    statusHTML = `<div class="match-status upcoming"><span></span> ${kickoffLabel}</div>`;
  }
  const smallText = m.state === 'in' ? (m.clock || 'Live') : m.state === 'post' ? 'Full-time' : 'Upcoming';
  const scoreHTML = m.state === 'pre' ? '<strong>VS</strong>' : `<strong>${m.homeScore} <small>—</small> ${m.awayScore}</strong>`;
  const kickoffNoteHTML = m.state !== 'pre' ? `<small class="match-kickoff-note">Kick-off ${kickoffLabel}</small>` : '';
  const hasHighlights = m.events && m.events.some((e) => HIGHLIGHT_KINDS.has(e.kind));
  const venueText = m.venue ? ` · ${m.venue}` : '';
  return `<article class="match-row${hasHighlights ? ' has-events' : ''}" data-match-id="${m.id}" data-league-slug="${m.leagueSlug}" data-match-state="${m.state}" data-match-home="${m.home}" data-match-away="${m.away}">
    <div class="competition"><span class="competition-badge ${m.competitionBadge}">${m.competitionCode}</span><div><strong>${m.competitionName}</strong><small>${smallText}${venueText}</small></div></div>
    <div class="teams">${teamSpan(m.home)}${scoreHTML}${teamSpan(m.away)}</div>
    ${statusHTML}
    <i class="match-expand-chevron" data-lucide="chevron-down"></i>
    ${kickoffNoteHTML}
    ${matchEventsHTML(m.events)}
  </article>`;
}

// Renders a flat match list as sections grouped by competition - shared
// by Live Scores and Fixtures so "grouped by competition" behaves the
// same way in both places.
function renderMatchGroups(container, matches, emptyMessage) {
  if (!container) return;
  if (!matches.length) {
    container.innerHTML = `<p class="lede" style="margin:0;font-size:12px">${emptyMessage}</p>`;
    return;
  }
  const order = [];
  const groups = {};
  matches.forEach((m) => {
    if (!groups[m.competitionName]) {
      groups[m.competitionName] = { badge: m.competitionBadge, code: m.competitionCode, items: [] };
      order.push(m.competitionName);
    }
    groups[m.competitionName].items.push(m);
  });
  container.innerHTML = order.map((name) => {
    const g = groups[name];
    return `<div class="competition-group">
      <div class="competition-group-head"><span class="competition-badge ${g.badge}">${g.code}</span><strong>${name}</strong><span class="competition-group-count">${g.items.length} match${g.items.length === 1 ? '' : 'es'}</span></div>
      <div class="match-list">${g.items.map((m) => matchRowHTML(m)).join('')}</div>
    </div>`;
  }).join('');
  bindMatchExpandTriggers(container);
  refreshIcons();
}

// ---- Live Scores: one day at a time, grouped by competition, with a
// date nav to browse other days. Auto-refreshes every 60s only while
// looking at today - past/future days don't change in real time.
let liveScoresDate = new Date();
let liveScoresCompetitionFilter = '';

function loadLiveScoresForDate(date) {
  const label = document.querySelector('#live-date-label');
  if (label) label.textContent = dateNavLabel(date);

  fetchMatchesForDates(ymd(date), filterCompetitions(liveScoresCompetitionFilter)).then((all) => {
    const rank = { in: 0, pre: 1, post: 2 };
    all.sort((a, b) => (rank[a.state] - rank[b.state]) || (a.kickoff - b.kickoff));
    const liveMatches = all.filter((m) => m.state === 'in');

    function render() {
      renderMatchGroups(document.querySelector('#live-scores-groups'), all, 'No matches scheduled on this date across the tracked leagues and competitions.');

      if (isSameUTCDay(date, new Date())) {
        const dashboardList = document.querySelector('#dashboard-live-list');
        if (dashboardList) {
          dashboardList.innerHTML = all.slice(0, 3).map((m) => matchRowHTML(m)).join('');
          bindMatchExpandTriggers(dashboardList);
        }
      }

      const liveCount = liveMatches.length;
      const statusText = document.querySelector('#live-status-text');
      if (statusText) statusText.textContent = liveCount > 0 ? `${liveCount} match${liveCount === 1 ? '' : 'es'} live` : 'No live matches right now across the tracked leagues';
      const navCount = document.querySelector('#live-nav-count');
      if (navCount) navCount.textContent = liveCount;
      const metricCount = document.querySelector('#live-metric-count');
      const metricSub = document.querySelector('#live-metric-sub');
      if (metricCount) metricCount.textContent = liveCount;
      if (metricSub) metricSub.innerHTML = liveCount > 0
        ? '<i data-lucide="trending-up"></i> Updating live'
        : `${all.length} match${all.length === 1 ? '' : 'es'} today`;
      const badge = document.querySelector('#live-scores-badge');
      if (badge) badge.hidden = false;
      refreshIcons();
    }

    if (!liveMatches.length) { render(); return; }
    Promise.all(liveMatches.map((m) => fetchMatchDetail(m).then((detail) => { m.events = detail.events; matchDetailCache.set(m.id, detail); })))
      .then(render)
      .catch(render);
  }).catch((err) => { console.error('[YobraPulse] live scores failed to load, showing fallback content', err); });
}

function refreshLiveScoresView() {
  loadLiveScoresForDate(liveScoresDate);
}

const liveDatePrev = document.querySelector('#live-date-prev');
const liveDateNext = document.querySelector('#live-date-next');
const liveDateToday = document.querySelector('#live-date-today');
if (liveDatePrev) liveDatePrev.addEventListener('click', () => { liveScoresDate = addDays(liveScoresDate, -1); refreshLiveScoresView(); });
if (liveDateNext) liveDateNext.addEventListener('click', () => { liveScoresDate = addDays(liveScoresDate, 1); refreshLiveScoresView(); });
if (liveDateToday) liveDateToday.addEventListener('click', () => { liveScoresDate = new Date(); refreshLiveScoresView(); });

const liveCompetitionSelect = document.querySelector('#live-competition-filter');
if (liveCompetitionSelect) liveCompetitionSelect.addEventListener('change', (e) => { liveScoresCompetitionFilter = e.target.value; refreshLiveScoresView(); });

refreshLiveScoresView();
setInterval(() => {
  if (isSameUTCDay(liveScoresDate, new Date())) refreshLiveScoresView();
}, 60000);

// ---- Fixtures: browse by date + competition (default), or search a
// specific team's schedule (a -14d..+70d window across all competitions,
// since ESPN's own per-team schedule endpoint returned nothing during
// pre-season testing - a wide scoreboard range proved reliable instead).
let fixturesDate = new Date();
let fixturesCompetitionFilter = '';
let fixturesTeamFilter = '';

// Shared by Live Scores and Fixtures: an empty slug means "all tracked
// competitions", otherwise just the one selected.
function filterCompetitions(slug) {
  return slug
    ? TRACKED_COMPETITIONS.filter((c) => c.slug === slug)
    : TRACKED_COMPETITIONS;
}

function renderFixtures() {
  const dateNav = document.querySelector('#fixtures-date-nav');
  const heading = document.querySelector('#fixtures-heading');
  const kicker = document.querySelector('#fixtures-kicker');
  const badge = document.querySelector('#fixtures-live-badge');

  if (fixturesTeamFilter) {
    if (dateNav) dateNav.style.visibility = 'hidden';
    trackedTeamsPromise.then((teams) => {
      const t = teams.find((x) => x.id === fixturesTeamFilter);
      if (heading) heading.textContent = t ? `${t.name} fixtures` : 'Team fixtures';
      if (kicker) kicker.textContent = 'Next 70 days & last 14 days';
    });
    const start = addDays(new Date(), -14);
    const end = addDays(new Date(), 70);
    fetchMatchesForDates(`${ymd(start)}-${ymd(end)}`, filterCompetitions(fixturesCompetitionFilter)).then((all) => {
      const filtered = all.filter((m) => m.homeId === fixturesTeamFilter || m.awayId === fixturesTeamFilter);
      filtered.sort((a, b) => a.kickoff - b.kickoff);
      renderMatchGroups(document.querySelector('#fixtures-groups'), filtered, 'No fixtures found for this team in the current window.');
      if (badge) badge.hidden = false;
    });
    return;
  }

  if (dateNav) dateNav.style.visibility = 'visible';
  if (heading) heading.textContent = 'Fixtures';
  if (kicker) kicker.textContent = 'Grouped by competition';
  const label = document.querySelector('#fixtures-date-label');
  if (label) label.textContent = dateNavLabel(fixturesDate);

  fetchMatchesForDates(ymd(fixturesDate), filterCompetitions(fixturesCompetitionFilter)).then((all) => {
    all.sort((a, b) => a.kickoff - b.kickoff);
    renderMatchGroups(document.querySelector('#fixtures-groups'), all, 'No fixtures scheduled on this date across the tracked leagues and competitions.');
    if (badge) badge.hidden = false;
  });
}

const fixturesDatePrev = document.querySelector('#fixtures-date-prev');
const fixturesDateNext = document.querySelector('#fixtures-date-next');
const fixturesDateToday = document.querySelector('#fixtures-date-today');
if (fixturesDatePrev) fixturesDatePrev.addEventListener('click', () => { fixturesDate = addDays(fixturesDate, -1); renderFixtures(); });
if (fixturesDateNext) fixturesDateNext.addEventListener('click', () => { fixturesDate = addDays(fixturesDate, 1); renderFixtures(); });
if (fixturesDateToday) fixturesDateToday.addEventListener('click', () => { fixturesDate = new Date(); renderFixtures(); });

const fixturesCompetitionSelect = document.querySelector('#fixtures-competition-filter');
if (fixturesCompetitionSelect) fixturesCompetitionSelect.addEventListener('change', (e) => { fixturesCompetitionFilter = e.target.value; renderFixtures(); });

const fixturesTeamSelect = document.querySelector('#fixtures-team-filter');
if (fixturesTeamSelect) {
  trackedTeamsPromise.then((teams) => {
    fixturesTeamSelect.innerHTML = '<option value="">All teams</option>' + teams.map((t) => `<option value="${t.id}">${t.name} (${t.league})</option>`).join('');
  });
  fixturesTeamSelect.addEventListener('change', (e) => { fixturesTeamFilter = e.target.value; renderFixtures(); });
}

renderFixtures();

function setupPlayerComparison(pool, playersMap) {
  const selectA = document.querySelector('#compare-a');
  const selectB = document.querySelector('#compare-b');
  const table = document.querySelector('#compare-table');
  if (!selectA || !selectB || !table) return;

  function buildOptions(restrictToGK) {
    return pool
      .filter((id) => !restrictToGK || playersMap[id].position === 'GKP')
      .map((id) => `<option value="${id}">${playersMap[id].name} (${playersMap[id].team})</option>`)
      .join('');
  }

  // Real goalkeepers play a fundamentally different game to outfield
  // players (saves/clean sheets, not goals/assists/tackles) - a real
  // comparison between a keeper and an outfielder is never meaningful,
  // so picking a keeper on one side restricts the other side to
  // keepers too, rather than letting a nonsensical pairing through.
  function refreshSelectOptions() {
    const idA = selectA.value;
    const idB = selectB.value;
    const aIsGK = !!(idA && playersMap[idA].position === 'GKP');
    const bIsGK = !!(idB && playersMap[idB].position === 'GKP');
    selectA.innerHTML = '<option value="">Select a player&hellip;</option>' + buildOptions(bIsGK);
    selectB.innerHTML = '<option value="">Select a player&hellip;</option>' + buildOptions(aIsGK);
    selectA.value = idA;
    selectB.value = idB;
  }

  refreshSelectOptions();

  function renderComparison() {
    const idA = selectA.value;
    const idB = selectB.value;
    if (!idA || !idB || idA === idB) {
      table.hidden = true;
      return;
    }
    const a = playersMap[idA];
    const b = playersMap[idB];
    const bothGK = a.position === 'GKP' && b.position === 'GKP';
    const rows = bothGK ? [
      { label: 'Points', a: a.points, b: b.points },
      { label: 'Saves', a: a.saves, b: b.saves },
      { label: 'Clean sheets', a: a.cleanSheets, b: b.cleanSheets },
      { label: 'Minutes', a: a.minutes, b: b.minutes },
      { label: 'Price', a: a.price, b: b.price, noWinner: true },
    ] : [
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

  selectA.addEventListener('change', () => { refreshSelectOptions(); renderComparison(); });
  selectB.addEventListener('change', () => { refreshSelectOptions(); renderComparison(); });
}

leaguesJsonPromise
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