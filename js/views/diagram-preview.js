// 圖解 3D 預覽（簡化版）：依「針法」算出每圈針數，每圈畫成一個圓環往上疊成旋轉體。
// 圈周長 ∝ 針數，所以針數變多就變寬；不模擬單針位置，也不處理多部件合併（腿接身體會畫成突然變寬）。

import { analyzeStitches, roundHeightOf } from '../stitch-count.js';
import { inflateProfile } from '../inflate-profile.js';
import { TEXT_COLORS } from '../text-colors.js';
import { parseStitchHtml } from '../stitch-html.js';

const STITCH_WIDTH = 1; // 一針是正方形（寬 = 高），單位任意，之後自動縮放取景
const ROUND_HEIGHT = 1; // 短針一圈的高度；其他針法依 roundHeightOf 的倍數放大
const CLOSE_THRESHOLD = 8; // 首/末圈針數不超過這個值就當作收口成一點（圓環起針、最後收針）
const PART_SLOT = 30; // 「全部」檢視時每個部位固定佔的寬度；位置只看順序，改一個部位不會推動其他部位
const PART_COLORS = [0xe7b7a3, 0xa9c98f, 0xe9d28a, 0x9fc3d6, 0xc9a9d6, 0xd6a39f];

function toPlainText(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// 「2-3 2」＝第 2～3 圈（共 2 圈）；單一數字＝1 圈；讀不出來就當 1 圈
function parseRoundSpan(html) {
  const m = /^\s*(\d+)(?:\s*[-~–—]\s*(\d+))?/.exec(toPlainText(html));
  if (!m) return 1;
  const start = Number(m[1]);
  const end = m[2] ? Number(m[2]) : start;
  return Math.max(1, end - start + 1);
}

// 回傳 { rounds: [{ count, repeat }], warnings: [字串] }
export function analyzeTable(table) {
  const rounds = [];
  const warnings = [];
  let previous = null;
  let previousHeight = 1;
  for (const row of table.rows || []) {
    const label = toPlainText(row.round).trim() || '?';
    const totalMatch = /\d+/.exec(toPlainText(row.total));
    const written = totalMatch ? Number(totalMatch[0]) : null;
    const parsed = parseStitchHtml(row.stitch); // 純文字 + 每個字的文字顏色
    const stitchText = parsed.text.trim();

    let count = null;
    let blo = false; // 整圈都挑後半針（BLO）：在 3D 預覽折出轉角
    let cells = null; // 每一針的顏色（COLn 標記），沒有指定就維持 null
    if (stitchText) {
      const analysis = analyzeStitches(parsed.text, parsed.charColors);
      count = analysis === null ? null : analysis.total;
      blo = analysis !== null && analysis.total > 0 && analysis.blo === analysis.total;
      if (analysis !== null && analysis.colors.some((c) => c !== null)) {
        cells = analysis.colors.map((c) => (c === null ? null : parseInt(TEXT_COLORS[c].hex.slice(1), 16)));
      }
      if (count === null) {
        warnings.push(`第 ${label} 圈：看不懂針法或括號沒配對，改用總針數${written !== null ? '' : '（沒填，已略過）'}`);
      } else if (written !== null && written !== count) {
        warnings.push(`第 ${label} 圈：針法算出 ${count} 針，但總針數寫 ${written}`);
      }
    }
    if (count === null) count = written;
    if (count === null) count = stitchText ? null : previous; // 針法和總針數都沒填：沿用上一圈
    if (!count || count <= 0) continue;

    const height = stitchText ? roundHeightOf(stitchText) : previousHeight;
    const color = /^#[0-9a-f]{6}$/i.test(row.color || '') ? parseInt(row.color.slice(1), 16) : null; // 圖解文本的換色
    // 每針顏色的數量要和總針數一致才用（總針數是手填、針法又看不懂時就沒有對應）
    rounds.push({ count, repeat: parseRoundSpan(row.round), height, color, blo, cells: cells && cells.length === count ? cells : null });
    previous = count;
    previousHeight = height;
  }
  return { rounds, warnings };
}

// 每圈一個 (半徑, 高度, 顏色)，繞 Y 軸旋轉成形狀；沒指定顏色的圈用 fallbackColor
function buildProfile(rounds, stitchWidth, roundHeight, fallbackColor) {
  return inflateProfile(rounds, { stitchWidth, roundHeight, closeThreshold: CLOSE_THRESHOLD, fallbackColor });
}

// 把每一圈（與每一針）的顏色畫成貼圖：橫向是圓周（一圈有幾針就切幾格），縱向是由下往上的每一圈。
// 一針的寬度等於圈高，所以單針換色在表面上會是一塊方格，邊緣清楚、不做漸層。
function buildColorTexture(THREE, profile, rounds, fallbackColor) {
  const bands = profile.nodeRound.length - 1; // 每兩個節點之間是一圈
  const cellPx = 16;
  const width = Math.min(Math.max(Math.max(...rounds.map((r) => r.count)) * cellPx, 256), 4096);
  const height = Math.min(Math.max(bands * cellPx, 64), 4096);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const css = (n) => `#${n.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = css(rounds[0].color ?? fallbackColor);
  ctx.fillRect(0, 0, width, height);
  for (let j = 1; j <= bands; j++) {
    const round = rounds[profile.nodeRound[j]];
    const y0 = Math.round((1 - j / bands) * height); // 貼圖的上方是 v = 1
    const y1 = Math.round((1 - (j - 1) / bands) * height);
    const base = round.color ?? fallbackColor;
    ctx.fillStyle = css(base);
    ctx.fillRect(0, y0, width, y1 - y0);
    if (!round.cells) continue;
    for (let k = 0; k < round.count; k++) {
      if (round.cells[k] === null) continue;
      const x0 = Math.round((k / round.count) * width);
      const x1 = Math.round(((k + 1) / round.count) * width);
      ctx.fillStyle = css(round.cells[k]);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

let active = null; // 同時只保留一個預覽，換頁或重繪時先釋放舊的 WebGL

function disposeActive() {
  if (active) active.dispose();
  active = null;
}

export async function mountDiagramPreview(host, getTables) {
  disposeActive();
  host.innerHTML = `
    <h3 class="diagram-preview-title">3D 預覽 <span class="diagram-preview-sub">依圈數與針數估算外形，可拖曳旋轉、雙指縮放</span></h3>
    <div class="diagram-preview-chips"></div>
    <div class="diagram-preview-canvas"><span class="diagram-preview-msg">載入中…</span></div>
    <ul class="diagram-preview-warnings"></ul>
  `;
  const chipsEl = host.querySelector('.diagram-preview-chips');
  const canvasHost = host.querySelector('.diagram-preview-canvas');
  const warningsEl = host.querySelector('.diagram-preview-warnings');

  let THREE, OrbitControls;
  try {
    THREE = await import('three');
    ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  } catch {
    canvasHost.innerHTML = '<span class="diagram-preview-msg">3D 元件載入失敗（需要網路）</span>';
    return { refresh() {} };
  }
  if (!host.isConnected) return { refresh() {} };

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  canvasHost.innerHTML = '';
  canvasHost.appendChild(renderer.domElement);
  const msgEl = document.createElement('span');
  msgEl.className = 'diagram-preview-msg';
  canvasHost.appendChild(msgEl);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8dccc, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 6, 4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  const controls = new OrbitControls(camera, renderer.domElement);
  const group = new THREE.Group();
  scene.add(group);

  let selected = 'all';
  let needsFit = true;
  let analyzed = [];

  const render = () => renderer.render(scene, camera);
  controls.addEventListener('change', render);

  function clearGroup() {
    for (const mesh of [...group.children]) {
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
      group.remove(mesh);
    }
  }

  function fitCamera() {
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const dim = Math.max(size.x, size.y, size.z);
    const dist = (dim / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 1.5;
    controls.target.copy(center);
    camera.position.set(center.x, center.y + dim * 0.25, center.z + dist);
    camera.near = dist / 100;
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    controls.update();
  }

  function rebuild() {
    const tables = getTables() || [];
    analyzed = tables.map((t) => ({ part: toPlainText(t.part).trim() || '未命名', ...analyzeTable(t) }));

    chipsEl.innerHTML = '';
    if (analyzed.length > 1) {
      if (selected !== 'all' && !analyzed[selected]) selected = 'all';
      [['all', '全部'], ...analyzed.map((a, i) => [i, a.part])].forEach(([key, label]) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `diagram-preview-chip${key === selected ? ' active' : ''}`;
        chip.textContent = label;
        chip.addEventListener('click', () => {
          selected = key;
          needsFit = true;
          rebuild();
        });
        chipsEl.appendChild(chip);
      });
    }


    clearGroup();
    analyzed.forEach((a, i) => {
      if (selected !== 'all' && selected !== i) return;
      if (!a.rounds.length) return;
      const partColor = PART_COLORS[i % PART_COLORS.length];
      const profile = buildProfile(a.rounds, STITCH_WIDTH, ROUND_HEIGHT, partColor);
      const geometry = new THREE.LatheGeometry(
        profile.map(([r, y]) => new THREE.Vector2(r, y)),
        64
      );
      const material = new THREE.MeshStandardMaterial({
        map: buildColorTexture(THREE, profile, a.rounds, partColor),
        roughness: 0.9,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.x = selected === 'all' ? i * PART_SLOT : 0;
      group.add(mesh);
    });

    msgEl.textContent = group.children.length ? '' : '填寫「針法」後，這裡會顯示預覽';
    warningsEl.innerHTML = '';
    analyzed.forEach((a, i) => {
      if (selected !== 'all' && selected !== i) return; // 單獨檢視某個部位時，不顯示其他部位的警告
      a.warnings.forEach((w) => {
        const li = document.createElement('li');
        li.textContent = `${selected === 'all' && analyzed.length > 1 ? `${a.part}・` : ''}${w}`;
        warningsEl.appendChild(li);
      });
    });

    if (needsFit && group.children.length) {
      fitCamera();
      needsFit = false;
    }
    render();
  }

  function resize() {
    if (!host.isConnected) return dispose();
    const w = canvasHost.clientWidth;
    const h = canvasHost.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvasHost);

  let timer = null;
  function dispose() {
    clearTimeout(timer);
    observer.disconnect();
    controls.dispose();
    clearGroup();
    renderer.dispose();
    if (active === api) active = null;
  }
  const api = {
    // 編輯時連續輸入會觸發很多次，延後一下再重算
    refresh() {
      clearTimeout(timer);
      timer = setTimeout(() => host.isConnected && rebuild(), 300);
    },
    dispose,
  };
  active = api;

  resize();
  rebuild();
  return api;
}
