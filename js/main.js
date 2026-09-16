import { getAuth, clearAuth } from './auth.js';
import { onRouteChange, navigate, startRouter } from './router.js';
import { ICONS } from './icons.js';
import {
  renderWorksView,
  getCategories as getWorksCategories,
  isEditMode as isWorksEditMode,
  addCategory as addWorksCategory,
  deleteCategory as deleteWorksCategory,
  reorderCategories as reorderWorksCategories,
  updateCategory as updateWorksCategory,
  reassignWorkCategory,
  openCategoryModal as openWorksCategoryModal,
} from './views/works.js';
import {
  renderDiagramsView,
  getCategoriesAt as getDiagramsCategoriesAt,
  isEditMode as isDiagramsEditMode,
  addCategoryAt as addDiagramsCategoryAt,
  deleteCategoryAt as deleteDiagramsCategoryAt,
  reorderCategoriesAt as reorderDiagramsCategoriesAt,
  updateCategoryAt as updateDiagramsCategoryAt,
  moveItemToCategory as moveDiagramsItemToCategory,
  openCategoryModal as openDiagramsCategoryModal,
} from './views/diagrams.js';
import { renderMaterialsView } from './views/materials.js';
import { bindDragReorder, bindDropZone } from './drag-reorder.js';

const auth = getAuth();
const ctx = {
  authed: !!auth,
  token: auth?.token || null,
  username: auth?.username || null,
  navigate,
};

let currentWorksPath = [];
let currentDiagramsPath = [];
let currentMaterialsPath = [];

function renderMaterialsSubnav() {
  const subnav = document.getElementById('materials-subnav');
  if (!subnav) return;
  const activeTab = currentMaterialsPath[0] === 'tools' ? 'tools' : 'yarn';
  subnav.innerHTML = `
    <div class="nav-subitem ${activeTab === 'yarn' ? 'active' : ''}" data-materials-tab="yarn">線材</div>
    <div class="nav-subitem ${activeTab === 'tools' ? 'active' : ''}" data-materials-tab="tools">工具</div>
  `;
  subnav.querySelectorAll('[data-materials-tab]').forEach((el) => {
    el.addEventListener('click', () => {
      navigate(el.dataset.materialsTab === 'tools' ? ['materials', 'tools'] : ['materials']);
    });
  });
}

async function renderWorksSubnav(activeCategoryId) {
  const subnav = document.getElementById('works-subnav');
  if (!subnav) return;
  const categories = await getWorksCategories();
  const editing = isWorksEditMode();
  subnav.innerHTML = `
    ${categories
      .map(
        (c) => `
      <div class="nav-subitem ${c.id === activeCategoryId ? 'active' : ''}" data-cat="${c.id}" style="display:flex; align-items:center; gap:6px;">
        ${editing ? `<span class="drag-handle">${ICONS.grip}</span>` : ''}
        <span class="nav-subitem-name" style="flex:1; cursor:pointer;">${c.name}</span>
        ${
          editing
            ? `<button class="del-btn" data-edit-cat="${c.id}" style="position:static; color:var(--green-700);">${ICONS.pencil}</button>
               <button class="del-btn" data-del-cat="${c.id}" style="position:static;">&#10005;</button>`
            : ''
        }
      </div>`
      )
      .join('')}
    ${editing ? `<div class="nav-add" id="add-works-cat">&#65291; 新增分類</div>` : ''}
  `;
  subnav.querySelectorAll('[data-cat] .nav-subitem-name').forEach((el) => {
    el.addEventListener('click', () => navigate(['works', 'cat', el.parentElement.dataset.cat]));
  });
  subnav.querySelectorAll('[data-edit-cat]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const category = categories.find((c) => c.id === el.dataset.editCat);
      openWorksCategoryModal(({ name }) => updateWorksCategory(category.id, name), category);
    });
  });
  subnav.querySelectorAll('[data-del-cat]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteWorksCategory(el.dataset.delCat);
    });
  });
  if (editing) {
    bindDragReorder(
      Array.from(subnav.querySelectorAll('[data-cat]')),
      (el) => el.dataset.cat,
      (draggedId, targetId) => reorderWorksCategories(draggedId, targetId)
    );
    bindDropZone(
      Array.from(subnav.querySelectorAll('[data-cat]')),
      'application/x-work-id',
      (el) => el.dataset.cat,
      (workId, categoryId) => reassignWorkCategory(workId, categoryId, activeCategoryId)
    );
  }
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
      <div class="nav-subitem" data-cat="${c.id}" style="display:flex; align-items:center; gap:6px;">
        ${editing ? `<span class="drag-handle">${ICONS.grip}</span>` : ''}
        <span class="nav-subitem-name" style="flex:1; cursor:pointer;">${c.name}</span>
        ${
          editing
            ? `<button class="del-btn" data-edit-cat="${c.id}" style="position:static; color:var(--green-700);">${ICONS.pencil}</button>
               <button class="del-btn" data-del-cat="${c.id}" style="position:static;">&#10005;</button>`
            : ''
        }
      </div>`
      )
      .join('')}
    ${editing ? `<div class="nav-add" id="add-diagrams-cat">&#65291; 新增分類</div>` : ''}
  `;
  subnav.querySelectorAll('[data-cat] .nav-subitem-name').forEach((el) => {
    el.addEventListener('click', () => navigate(['diagrams', el.parentElement.dataset.cat]));
  });
  subnav.querySelectorAll('[data-edit-cat]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const category = categories.find((c) => c.id === el.dataset.editCat);
      openDiagramsCategoryModal(({ name, coverPending, removeCover }) => {
        updateDiagramsCategoryAt([], category.id, { name, coverPending, removeCover });
        renderDiagramsSubnav();
      }, category);
    });
  });
  subnav.querySelectorAll('[data-del-cat]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteDiagramsCategoryAt([], el.dataset.delCat);
      renderDiagramsSubnav();
    });
  });
  if (editing) {
    bindDragReorder(
      Array.from(subnav.querySelectorAll('[data-cat]')),
      (el) => el.dataset.cat,
      (draggedId, targetId) => {
        reorderDiagramsCategoriesAt([], draggedId, targetId);
        renderDiagramsSubnav();
      }
    );
    bindDropZone(
      Array.from(subnav.querySelectorAll('[data-cat]')),
      'application/x-diagram-item',
      (el) => el.dataset.cat,
      (itemId, categoryId) => {
        moveDiagramsItemToCategory(currentDiagramsPath, itemId, categoryId);
      }
    );
  }
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
    <button class="nav-item" data-nav="works"><span class="nav-icon">${ICONS.gallery}</span>作品集</button>
    <div class="nav-section" id="works-subnav"></div>
    ${ctx.authed ? `<button class="nav-item" data-nav="diagrams"><span class="nav-icon">${ICONS.book}</span>圖解</button>` : ''}
    ${ctx.authed ? `<div class="nav-section" id="diagrams-subnav"></div>` : ''}
    ${ctx.authed ? `<button class="nav-item" data-nav="materials"><span class="nav-icon">${ICONS.scissors}</span>線材&工具</button>` : ''}
    ${ctx.authed ? `<div class="nav-section" id="materials-subnav"></div>` : ''}
    ${ctx.authed ? `<button class="nav-item" data-nav="settings"><span class="nav-icon">${ICONS.sliders}</span>設定</button>` : ''}
  `;
  sidebar.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => navigate([el.dataset.nav]));
  });
  renderWorksSubnav();
  renderMaterialsSubnav();
  window.addEventListener('works:updated', () => onRoute(['works', ...currentWorksPath]));
  window.addEventListener('works:editmode-changed', () => renderWorksSubnav());
  window.addEventListener('diagrams:updated', () => onRoute(['diagrams', ...currentDiagramsPath]));
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
  const materialsSubnav = document.getElementById('materials-subnav');
  if (worksSubnav) worksSubnav.hidden = section !== 'works';
  if (diagramsSubnav) diagramsSubnav.hidden = section !== 'diagrams';
  if (materialsSubnav) materialsSubnav.hidden = section !== 'materials';
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
    currentWorksPath = path.slice(1);
    await renderWorksView(container, currentWorksPath, ctx);
    const activeCategoryId = currentWorksPath[0] === 'cat' ? currentWorksPath[1] : null;
    await renderWorksSubnav(activeCategoryId);
  } else if (section === 'diagrams') {
    currentDiagramsPath = path.slice(1);
    await renderDiagramsView(container, currentDiagramsPath, ctx);
    await renderDiagramsSubnav();
  } else if (section === 'materials') {
    currentMaterialsPath = path.slice(1);
    await renderMaterialsView(container, currentMaterialsPath, ctx);
    renderMaterialsSubnav();
  } else if (section === 'settings') {
    renderPlaceholder(container, '設定');
  } else {
    navigate(['works']);
  }
}

renderShell();
onRouteChange(onRoute);
startRouter();
