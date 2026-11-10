/* Shared viewport fitting; game state and rules remain owned by each puzzle. */
(() => {
  'use strict';
  const root = document.documentElement;
  // An older installed container can retain its original portrait default even
  // after the HTML updates. Ask supported containers to allow every orientation.
  // Chromium maps "any" to Android FULL_USER, which follows the user's setting.
  let rotationApplied = false, rotationPending = false, rotationUnsupported = false;
  let rotationGestureRetried = false, rotationRequest = 'browser-managed';
  const installedApp = () => navigator.standalone === true ||
    ['standalone','fullscreen','minimal-ui'].some(mode => matchMedia('(display-mode: ' + mode + ')').matches);
  function applyDeviceOrientation() {
    if (!installedApp() || rotationApplied || rotationPending || rotationUnsupported) return;
    if (!screen.orientation || typeof screen.orientation.lock !== 'function') {
      rotationRequest = 'browser-api-unavailable';
      return;
    }
    rotationPending = true;
    rotationRequest = 'request-pending';
    Promise.resolve().then(() => screen.orientation.lock('any')).then(() => {
      rotationApplied = true;
      rotationRequest = 'request-accepted';
    }, error => {
      rotationUnsupported = error && error.name === 'NotSupportedError';
      rotationRequest = 'request-rejected: ' + (error && error.name || 'unknown');
    }).then(() => { rotationPending = false; });
  }
  document.addEventListener('pointerup', event => {
    if (!event.isTrusted || rotationGestureRetried || rotationApplied || rotationPending || !installedApp()) return;
    rotationGestureRetried = true;
    applyDeviceOrientation();
  }, {passive:true});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { rotationApplied = false; applyDeviceOrientation(); }
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { rotationApplied = false; applyDeviceOrientation(); }
  });
  applyDeviceOrientation();
  // Keep the play surface at its designed scale without restricting scrolling or rotation.
  for (const type of ['gesturestart','gesturechange','gestureend']) {
    document.addEventListener(type, event => event.preventDefault(), {passive:false});
  }
  document.addEventListener('touchmove', event => {
    if (event.touches.length > 1) event.preventDefault();
  }, {passive:false});
  let queued = false;
  const clamp = (low, value, high) => Math.max(low, Math.min(value, high));
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fitGate(); fitTic(); fitCriss(); });
  }
  let viewportKey = '';
  function syncViewport() {
    const viewport = window.visualViewport;
    // Magnification changes the visible area, not the page's layout size.
    // Keyboard/toolbars still reduce this height when scale is one.
    const scale = viewport ? viewport.scale || 1 : 1;
    const width = viewport ? viewport.width * scale : innerWidth;
    const height = viewport ? viewport.height * scale : innerHeight;
    const key = width + 'x' + height;
    if (key === viewportKey) return;
    viewportKey = key;
    root.style.setProperty('--mm-viewport-width', width + 'px');
    root.style.setProperty('--mm-viewport-height', height + 'px');
    root.style.setProperty('--game-physical-width', width + 'px');
    root.style.setProperty('--game-physical-height', height + 'px');
    root.classList.toggle('mmLandscape', width > height);
    root.classList.toggle('gameCompact', height < 700);
    window.dispatchEvent(new Event('mathmatrixviewportchange'));
    schedule();
  }
  window.MathMatrixViewport = Object.freeze({sync:syncViewport, get orientationRequest(){return rotationRequest;}});
  function fitTic() {
    if (!root.classList.contains('tttViewport')) return;
    const main = document.querySelector('main');
    const board = document.querySelector('.board-wrap');
    if (!main || !board) return;
    const style = getComputedStyle(main);
    const children = Array.from(main.children).filter(el => getComputedStyle(el).display !== 'none');
    const occupied = children.filter(el => el !== board).reduce((sum, el) => {
      const css = getComputedStyle(el);
      return sum + el.offsetHeight + parseFloat(css.marginTop) + parseFloat(css.marginBottom);
    }, 0);
    let available = main.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
      - occupied - (children.length - 1) * parseFloat(style.rowGap);
    let width = main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    if (style.display === 'grid') {
      width = parseFloat(style.gridTemplateColumns);
      const hint = main.querySelector('.hint');
      available = main.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
        - (hint ? hint.offsetHeight : 0) - parseFloat(style.rowGap) * 2;
    }
    root.style.setProperty('--ttt-board-size', Math.floor(Math.max(160, Math.min(width, available, 480))) + 'px');
  }
  function fitCriss() {
    if (root.dataset.mmPage !== 'criss-cross') return;
    const wrap = document.querySelector('.ccmWrap'), toolbar = document.querySelector('.ccmBtns');
    if (!wrap || !toolbar) return;
    const width = wrap.clientWidth - 12;
    const height = Math.max(193, wrap.clientHeight - toolbar.offsetHeight - 12);
    let number = 72, operator, answer;
    while (number >= 32) {
      operator = Math.max(18, Math.round(number * .42));
      answer = Math.max(36, Math.round(number * .85));
      if (number * 3 + operator * 2 + answer + 25 <= Math.min(width,height)) break;
      number--;
    }
    root.style.setProperty('--ccm-number', Math.max(32,number) + 'px');
    root.style.setProperty('--ccm-op', operator + 'px');
    root.style.setProperty('--ccm-answer', answer + 'px');
  }
  function gridColumns(count, width, height) {
    let best = 1, score = Infinity;
    for (let columns = 1; columns <= Math.min(4, count); columns++) {
      const rows = Math.ceil(count / columns);
      const w = (width - (columns - 1) * 10) / columns;
      const h = (height - (rows - 1) * 10) / rows;
      if (w < 130 || h < 58) continue;
      const candidate = Math.abs(Math.log(w / h / 1.3)) + (rows * columns - count) * .25;
      if (candidate < score) { score = candidate; best = columns; }
    }
    return best;
  }
  function fitPicker(panel) {
    const grid = panel.querySelector('#gatePicker .learnRows');
    if (!grid) return;
    const back = grid.querySelector('.gateLevelBack');
    const cards = Array.from(grid.querySelectorAll('.rowBtn')).filter(el => el !== back);
    const height = panel.clientHeight - (back ? 54 : 0) - 6;
    const columns = gridColumns(cards.length, panel.clientWidth - 2, height);
    const rows = Math.ceil(cards.length / columns);
    grid.classList.toggle('gateLevelGrid', !!back);
    grid.classList.toggle('gateLastSingle', cards.length % columns === 1);
    grid.style.setProperty('--gate-columns', columns);
    grid.style.setProperty('--gate-rows', rows);
    const h = (height - (rows - 1) * 10) / rows;
    grid.classList.toggle('gateTileGrid', h > 135 && columns > 1);
    let titleSize = clamp(14, h * .18, 22);
    let copySize = clamp(11, h * .12, 14);
    let iconSize = clamp(25, h * .3, 45);
    for (let attempt = 0; attempt < 19; attempt++) {
      grid.style.setProperty('--gate-title-size', titleSize + 'px');
      grid.style.setProperty('--gate-copy-size', copySize + 'px');
      grid.style.setProperty('--gate-icon-size', iconSize + 'px');
      const overflow = cards.some(card => {
        const text = card.querySelector('span:last-child');
        const icon = card.querySelector('i');
        const reserve = grid.classList.contains('gateTileGrid') && icon ? icon.offsetHeight + 9 : 0;
        return text && text.offsetHeight > card.clientHeight - 16 - reserve;
      });
      if (!overflow) break;
      titleSize = Math.max(13, titleSize - .5);
      copySize = Math.max(10.5, copySize - .25);
      iconSize = Math.max(24, iconSize - 1);
    }
  }
  function fitGate() {
    const panel = document.getElementById('gatePanel');
    if (!panel || !panel.clientHeight || !document.body.classList.contains('gateMode')) return;
    panel.classList.toggle('gateCompact', panel.clientHeight < 500);
    const picker = document.getElementById('gatePicker');
    if (picker && getComputedStyle(picker).display !== 'none') { fitPicker(panel); return; }
    const room = document.getElementById('gateRoom');
    if (!room) return;
    room.style.setProperty('--gate-tip-size', panel.classList.contains('gateCompact') ? '13px' : clamp(13, room.clientHeight * .045, 18) + 'px');
    const diagram = room.querySelector('.gateDiagram');
    const choices = room.querySelector('.gateChoices');
    if (!choices) return;
    if (diagram) {
      const fixed = Array.from(room.children).filter(el => el !== diagram && el !== choices)
        .reduce((sum, el) => sum + el.offsetHeight, 0);
      const available = room.clientHeight - fixed - 24;
      room.style.setProperty('--gate-answer-height', (panel.classList.contains('gateCompact') ? 58 : clamp(58, available * .36, 140)) + 'px');
      const lines = diagram.textContent.split('\n');
      const canvas = document.createElement('canvas').getContext('2d');
      canvas.font = '20px ' + getComputedStyle(diagram).fontFamily;
      const longest = Math.max(1, ...lines.map(line => canvas.measureText(line).width));
      const font = Math.max(11, Math.min(24, (diagram.clientHeight - 20) / (lines.length * 1.4), (diagram.clientWidth - 26) * 20 / longest));
      diagram.style.fontSize = font + 'px';
    }
    const card = choices.querySelector('.gateChoiceBtn');
    if (card) {
      room.style.setProperty('--gate-choice-size', clamp(12, card.clientHeight * .16, 20) + 'px');
      room.style.setProperty('--gate-emoji-size', clamp(26, card.clientHeight * .48, 86) + 'px');
    }
  }
  if (root.classList.contains('tttViewport')) {
    const editable = target => target instanceof Element && target.closest('input,textarea,[contenteditable="true"]');
    for (const type of ['selectstart', 'contextmenu']) document.addEventListener(type, event => {
      if (!editable(event.target)) event.preventDefault();
    });
  }
  function install() {
    const target = document.getElementById('gatePanel') || (root.classList.contains('tttViewport') && document.querySelector('main'))
      || (root.dataset.mmPage === 'criss-cross' && document.querySelector('.ccmWrap'));
    if (target) {
      new ResizeObserver(schedule).observe(target);
      new MutationObserver(schedule).observe(target, {childList:true, subtree:true});
    }
    if (document.fonts) document.fonts.ready.then(schedule);
    syncViewport(); schedule();
  }
  window.addEventListener('resize', syncViewport);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', syncViewport);
  if (screen.orientation) screen.orientation.addEventListener('change', syncViewport);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', syncViewport);
  syncViewport();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
