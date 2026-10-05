// 防止「穿透點擊」：有些按鍵在手指按下（pointerdown）時就處理，之後鍵盤收起、畫面重畫，
// 手指抬起產生的那一次 click 會落在後面原本被蓋住的東西上（例如鍵盤後面的「登出」）。
// 在 pointerdown 處理完呼叫 swallowNextClick()，緊接著的那一次 click 就會被吃掉。
let armed = false;
let timer = null;

export function swallowNextClick() {
  armed = true;
  clearTimeout(timer);
  timer = setTimeout(() => { armed = false; }, 1500); // 長按後才放開也算；超過就不再吃，避免吃掉之後真正的點擊
}

// 新的一次按下代表上一次點擊已經結束
document.addEventListener('pointerdown', () => { armed = false; }, true);

document.addEventListener(
  'click',
  (e) => {
    if (!armed) return;
    armed = false;
    e.preventDefault();
    e.stopPropagation();
  },
  true
);
