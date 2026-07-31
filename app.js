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
const titles = { dashboard: 'Overview', live: 'Live scores', fpl: 'FPL assistant', performance: 'Performance tracker', fixtures: 'Fixtures', teams: 'Teams & players' };

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
lucide.createIcons();