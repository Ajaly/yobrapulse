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
const titles = { dashboard: 'Overview', live: 'Live scores', fpl: 'FPL assistant', performance: 'Performance tracker', fixtures: 'Fixtures', teams: 'Teams & players', settings: 'Settings' };

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

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => { document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active')); tab.classList.add('active'); }));

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

lucide.createIcons();