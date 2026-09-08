// 共用的拖曳排序工具：依 id 在陣列中搬移項目，並讓整個項目本身可直接拖曳排序

export function reorderById(arr, draggedId, targetId) {
  const fromIndex = arr.findIndex((x) => x.id === draggedId);
  const toIndex = arr.findIndex((x) => x.id === targetId);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return false;
  const [moved] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, moved);
  return true;
}

// 這些元素本身有自己的互動行為（輸入、點擊、編輯），拖曳不應該從它們身上啟動
const NON_DRAG_SELECTOR = 'input, textarea, button, a, [contenteditable="true"], img';

// 拖曳到畫面上/下邊緣時自動捲動（原生 HTML5 拖放不一定會自動捲動長頁面，這裡手動補上）
let autoScrollBound = false;
function ensureAutoScroll() {
  if (autoScrollBound) return;
  autoScrollBound = true;
  const EDGE = 80; // 距離視窗上/下邊緣多少 px 內開始捲動
  const MAX_SPEED = 22; // 每次事件最多捲動的 px 數
  document.addEventListener('dragover', (e) => {
    const y = e.clientY;
    const h = window.innerHeight;
    if (y < EDGE) {
      window.scrollBy(0, -Math.ceil(((EDGE - y) / EDGE) * MAX_SPEED));
    } else if (y > h - EDGE) {
      window.scrollBy(0, Math.ceil(((y - (h - EDGE)) / EDGE) * MAX_SPEED));
    }
  });
}

// itemEls：每一個可排序的項目元素，點擊項目本身（不含上述互動元素）即可拖曳
// getId：從項目元素取得該項目的 id
// onDrop(draggedId, targetId)：放開時呼叫，負責重新排序底層資料並重繪
export function bindDragReorder(itemEls, getId, onDrop) {
  ensureAutoScroll();
  let draggedId = null;
  itemEls.forEach((item) => {
    item.draggable = true;
    item.classList.add('is-draggable');
    item.querySelectorAll(NON_DRAG_SELECTOR).forEach((el) => {
      el.draggable = false;
    });
    item.addEventListener('dragstart', (e) => {
      draggedId = getId(item);
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedId);
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      draggedId = null;
    });
    item.addEventListener('dragover', (e) => {
      if (draggedId) e.preventDefault();
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetId = getId(item);
      if (draggedId && draggedId !== targetId) onDrop(draggedId, targetId);
      draggedId = null;
    });
  });
}
