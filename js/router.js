let handler = null;

function currentPath() {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash ? hash.split('/').map(decodeURIComponent).filter(Boolean) : ['works'];
}

export function onRouteChange(fn) {
  handler = fn;
}

export function navigate(pathArr) {
  location.hash = '/' + pathArr.map(encodeURIComponent).join('/');
}

export function startRouter() {
  const run = () => handler && handler(currentPath());
  window.addEventListener('hashchange', run);
  run();
}
