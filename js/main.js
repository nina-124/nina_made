import { getAuth, clearAuth } from './auth.js';
import { onRouteChange, navigate, startRouter } from './router.js';
import { renderWorksView, getTopLevelCategories } from './views/works.js';

const auth = getAuth();
const ctx = {
  authed: !!auth,
  token: auth?.token || null,
  username: auth?.username || null,
  navigate,
};

async function renderWorksSubnav(activeCategoryId) {
  const subnav = document.getElementById('works-subnav');
  if (!subnav) return;
  const categories = await getTopLevelCategories();
  subnav.innerHTML = categories
    .map(
      (c) =>
        `<button class="nav-subitem ${c.id === activeCategoryId ? 'active' : ''}" data-cat="${c.id}">${c.name}</button>`
    )
    .join('');
  subnav.querySelectorAll('[data-cat]').forEach((el) => {
    el.addEventListener('click', () => navigate(['works', el.dataset.cat]));
  });
}

function renderShell() {
  const sidebar = document.getElementById('sidebar-nav');
  sidebar.innerHTML = `
    <button class="nav-item" data-nav="works">&#129506; 作品集</button>
    <div class="nav-section" id="works-subnav"></div>
    ${ctx.authed ? `<button class="nav-item" data-nav="diagrams">&#129737; 圖解</button>` : ''}
    ${ctx.authed ? `<button class="nav-item" data-nav="materials">&#129525; 綫材&工具</button>` : ''}
    ${ctx.authed ? `<button class="nav-item" data-nav="settings">&#9986; 設定</button>` : ''}
  `;
  sidebar.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => navigate([el.dataset.nav]));
  });
  renderWorksSubnav();
  window.addEventListener('works:updated', () => renderWorksSubnav());

  const logoutEl = document.getElementById('logout-link');
  if (ctx.authed) {
    logoutEl.textContent = `${ctx.username || ''} · 登出`;
    logoutEl.onclick = () => {
      clearAuth();
      location.href = 'login.html';
    };
  } else {
    logoutEl.textContent = '登入';
    logoutEl.onclick = () => {
      location.href = 'login.html';
    };
  }
}

function renderPlaceholder(container, title) {
  container.innerHTML = `<div class="placeholder-panel">${title} 尚在開發中。</div>`;
}

async function onRoute(path) {
  const container = document.getElementById('main-content');
  const section = path[0] || 'works';

  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.nav === section);
  });

  if (section !== 'works' && !ctx.authed) {
    container.innerHTML = `<div class="placeholder-panel">這個內容只有登入才能查看。</div>`;
    return;
  }

  if (section === 'works') {
    await renderWorksView(container, path.slice(1), ctx);
    await renderWorksSubnav(path[1]);
  } else if (section === 'diagrams') {
    renderPlaceholder(container, '圖解');
  } else if (section === 'materials') {
    renderPlaceholder(container, '綫材&工具');
  } else if (section === 'settings') {
    renderPlaceholder(container, '設定');
  } else {
    navigate(['works']);
  }
}

renderShell();
onRouteChange(onRoute);
startRouter();
