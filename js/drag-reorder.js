// 共用的拖曳排序工具：依 id 在陣列中搬移項目，並綁定拖曳把手的事件

export function reorderById(arr, draggedId, targetId) {
  const fromIndex = arr.findIndex((x) => x.id === draggedId);
  const toIndex = arr.findIndex((x) => x.id === targetId);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return false;
  const [moved] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, moved);
  return true;
}

// itemEls：每一個可排序的項目元素（需各自包含一個 .drag-handle 把手）
// getId：從項目元素取得該項目的 id
// onDrop(draggedId, targetId)：放開時呼叫，負責重新排序底層資料並重繪
export function bindDragReorder(itemEls, getId, onDrop) {
  let draggedId = null;
  itemEls.forEach((item) => {
    const handle = item.querySelector('.drag-handle');
    if (!handle) return;
    handle.draggable = true;
    handle.addEventListener('dragstart', (e) => {
      draggedId = getId(item);
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedId);
    });
    handle.addEventListener('dragend', () => {
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
