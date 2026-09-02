import { getAuth, clearAuth } from './auth.js';
import { onRouteChange, navigate, startRouter } from './router.js';
import {
  renderWorksView,
  getCategories as getWorksCategories,
  isEditMode as isWorksEditMode,
  addCategory as addWorksCategory,
  deleteCategory as deleteWorksCategory,
  openCategoryModal as openWorksCategoryModal,
} from './views/works.js';
import {
  renderDiagramsView,
  getCategoriesAt as getDiagramsCategoriesAt,
  isEditMode as isDiagramsEditMode,
  addCategoryAt as addDiagramsCategoryAt,
  deleteCategoryAt as deleteDiagramsCategoryAt,
  openCategoryModal as openDiagramsCategoryModal,
} from './views/diagrams.js';

const auth = getAuth();
const ctx = {
  authed: !!auth,
  token: auth?.token || null,
  username: auth?.username || null,
  navigate,
};

let currentDiagramsPath = [];

async function renderWorksSubnav(activeCategoryId) {
  const subnav = document.getElementById('works-subnav');
  if (!subnav) return;
  const categories = await getWorksCategories();
  const editing = isWorksEditMode();
  subnav.innerHTML = `
    ${categories
      .map(
        (c) => `
      <div class="nav-subitem ${c.id === activeCategoryId ? 'active' : ''}" data-cat="${c.id}" style="display:flex; align-items:center;">
        <span style="flex:1; cursor:pointer;">${c.name}</span>
        ${editing ? `<button class="del-btn" data-del-cat="${c.id}" style="position:static;">&#10005;</button>` : ''}
      </div>`
      )
      .join('')}
    ${editing ? `<div class="nav-add" id="add-works-cat">&#65291; 新增分類</div>` : ''}
  `;
  subnav.querySelectorAll('[data-cat] span').forEach((el) => {
    el.addEventListener('click', () => navigate(['works', 'cat', el.parentElement.dataset.cat]));
  });
  subnav.querySelectorAll('[data-del-cat]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteWorksCategory(el.dataset.delCat);
    });
  });
  const addCat = subnav.querySelector('#add-works-cat');
  if (addCat) {
    addCat.addEventListener('click', () => {
      openWorksCategoryModal(({ name }) => addWorksCategory(name));
    });
  }
}

async function renderDiagramsSubnav() {
  const subnav = document.getElementById('diagrams-subnav');
  if (!subnav || !ctx.authed) return;
  const categories = await getDiagramsCategoriesAt([], ctx.token);
  const editing = isDiagramsEditMode();
  subnav.innerHTML = `
    ${categories
      .map(
        (c) => `
      <div class="nav-subitem" data-cat="${c.id}" style="display:flex; align-items:center;">
        <span style="flex:1; cursor:pointer;">${c.name}</span>
        ${editing ? `<button class="del-btn" data-del-cat="${c.id}" style="position:static;">&#10005;</button>` : ''}
      </div>`
      )
      .join('')}
    ${editing ? `<div class="nav-add" id="add-diagrams-cat">&#65291; 新增分類</div>` : ''}
  `;
  subnav.querySelectorAll('[data-cat] span').forEach((el) => {
    el.addEventListener('click', () => navigate(['diagrams', el.parentElement.dataset.cat]));
  });
  subnav.querySelectorAll('[data-del-cat]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteDiagramsCategoryAt([], el.dataset.delCat);
      renderDiagramsSubnav();
    });
  });
  const addCat = subnav.querySelector('#add-diagrams-cat');
  if (addCat) {
    addCat.addEventListener('click', () => {
      openDiagramsCategoryModal(({ name, coverPending }) => {
        addDiagramsCategoryAt([], { name, coverPending });
        renderDiagramsSubnav();
      });
    });
  }
}

function renderShell() {
  const logo = document.getElementById('home-logo');
  if (logo) logo.addEventListener('click', () => navigate(['works']));

  const sidebar = document.getElementById('sidebar-nav');
  sidebar.innerHTML = `
    <button class="nav-item" data-nav="works">&#129506; 作品集</button>
    <div class="nav-section" id="works-subnav"></div>
    ${ctx.authed ? `<button class="nav-item" data-nav="diagrams">&#129737; 圖解</button>` : ''}
    ${ctx.authed ? `<div class="nav-section" id="diagrams-subnav"></div>` : ''}
    ${ctx.authed ? `<button class="nav-item" data-nav="materials">&#129525; 綫材&工具</button>` : ''}
    ${ctx.authed ? `<button class="nav-item" data-nav="settings">&#9986; 設定</button>` : ''}
  `;
  sidebar.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => navigate([el.dataset.nav]));
  });
  renderWorksSubnav();
  window.addEventListener('works:updated', () => renderWorksSubnav());
  window.addEventListener('works:editmode-changed', () => renderWorksSubnav());
  window.addEventListener('diagrams:updated', () => renderDiagramsSubnav());
  window.addEventListener('diagrams:editmode-changed', () => renderDiagramsSubnav());

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

function updateSubnavVisibility(section) {
  const worksSubnav = document.getElementById('works-subnav');
  const diagramsSubnav = document.getElementById('diagrams-subnav');
  if (worksSubnav) worksSubnav.hidden = section !== 'works';
  if (diagramsSubnav) diagramsSubnav.hidden = section !== 'diagrams';
}

async function onRoute(path) {
  const container = document.getElementById('main-content');
  const section = path[0] || 'works';

  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.nav === section);
  });
  updateSubnavVisibility(section);

  if (section !== 'works' && !ctx.authed) {
    container.innerHTML = `<div class="placeholder-panel">這個內容只有登入才能查看。</div>`;
    return;
  }

  if (section === 'works') {
    await renderWorksView(container, path.slice(1), ctx);
    const activeCategoryId = path[1] === 'cat' ? path[2] : null;
    await renderWorksSubnav(activeCategoryId);
  } else if (section === 'diagrams') {
    currentDiagramsPath = path.slice(1);
    await renderDiagramsView(container, currentDiagramsPath, ctx);
    await renderDiagramsSubnav();
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
