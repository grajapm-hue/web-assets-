/* Shared browsing controls; existing app handlers continue to own every action. */
(function () {
  'use strict';
  window.initMathMatrixNavigation = function (options) {
    var bar = document.querySelector('.appBar');
    if (!bar || document.getElementById('appUtilities')) return;
    document.body.classList.add('navigationShell');
    var utilities = document.createElement('div');
    utilities.id = 'appUtilities';
    utilities.setAttribute('role', 'group');
    utilities.setAttribute('aria-label', 'App options');
    ['appBarChip', 'diffInstall', 'diffTip', 'diffShare'].forEach(function (id) {
      var control = document.getElementById(id);
      if (control) utilities.appendChild(control);
    });
    bar.insertBefore(utilities, document.getElementById('appBarTitle'));

    var install = document.getElementById('diffInstall');
    function installLabel() {
      var label = install.disabled ? 'Installed' : 'Install';
      if (install.textContent !== label) install.textContent = label;
      install.dataset.installed = String(install.disabled);
      install.setAttribute('aria-label', install.disabled ? 'App installed' : 'Install app or view installation instructions');
    }
    new MutationObserver(installLabel).observe(install, {childList:true, characterData:true, subtree:true, attributes:true, attributeFilter:['disabled']});
    installLabel();
    var tip = document.getElementById('diffTip');
    tip.setAttribute('aria-label', 'Play offline — instructions');
    var share = document.getElementById('diffShare');
    share.setAttribute('aria-label', 'Share app');

    var footer = document.querySelector('.categoryFooter');
    var version = document.querySelector('.categoryVersion');
    var aboutTitle = document.querySelector('.titleCard');
    if (version) aboutTitle.insertBefore(version, aboutTitle.children[1]);
    if (footer) footer.remove();
    var heading = document.querySelector('.categoryHeadingCopy');
    var brand = document.createElement('div');
    brand.className = 'categoryBrand';
    brand.textContent = 'MathMatrix Pro++';
    heading.insertBefore(brand, heading.firstChild);

    // The legacy targets retain their listeners, including the Update bridge.
    var legacy = document.getElementById('legacyAppUtilities');
    legacy.hidden = true;
    var offlineRow = document.getElementById('rowOffline');
    if (offlineRow) offlineRow.remove();
    document.getElementById('copyLinkBtn').parentElement.classList.add('qrCopyAction');
    document.getElementById('rowAbout').parentElement.classList.add('qrAbout');
    var qrScreen = document.querySelector('[data-screen="scApp"]');
    var qrCard = document.querySelector('.shareQrCard');
    var copyAction = document.querySelector('.qrCopyAction');
    var aboutAction = document.querySelector('.qrAbout');
    var qrActions = document.createElement('div');
    qrActions.className = 'qrDetailsActions';
    qrCard.querySelector('.shareQrCopy').appendChild(qrActions);
    var tab = document.getElementById('tab-scApp');
    tab.querySelector('.tabIco').textContent = '';
    tab.querySelector('.tabIco').setAttribute('aria-hidden', 'true');
    tab.lastChild.textContent = 'QR Code';
    tab.setAttribute('aria-label', 'QR Code');

    var queued = false;
    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; fit(); });
    }
    function fit() {
      if (document.body.classList.contains('utilityScreen')) {
        var bounds = bar.getBoundingClientRect();
        var controls = utilities.getBoundingClientRect();
        var sound = document.getElementById('barMore').getBoundingClientRect();
        var center = bounds.x + bounds.width / 2;
        var room = Math.floor(2 * Math.max(0, Math.min(center - controls.right - 8, sound.left - center - 8)));
        bar.style.setProperty('--brand-room', room + 'px');
        bar.classList.toggle('headerTight', room < 110);
      }
      var wide = matchMedia('(orientation: landscape)').matches && innerWidth >= 480;
      qrScreen.classList.toggle('qrWide', wide);
      var focusedAction = document.activeElement;
      var movedActions = false;
      if (wide && copyAction.parentElement !== qrActions) {
        qrActions.append(copyAction, aboutAction);
        movedActions = true;
      } else if (!wide && copyAction.parentElement !== qrScreen) {
        qrScreen.insertBefore(copyAction, qrCard);
        qrScreen.appendChild(aboutAction);
        movedActions = true;
      }
      if (movedActions && focusedAction && (copyAction.contains(focusedAction) || aboutAction.contains(focusedAction))) focusedAction.focus({preventScroll:true});
      var card = qrCard;
      if (card.clientHeight && card.clientWidth) {
        var style = getComputedStyle(card);
        var height = card.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        var width = card.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        var copy = card.querySelector('.shareQrCopy');
        var side = Math.floor(Math.min(wide ? width * .49 : width, wide ? height : height - copy.offsetHeight - 12, wide ? 360 : 480));
        card.style.setProperty('--qr-side', Math.max(100, side) + 'px');
      }
      if (options && options.fit) options.fit();
    }
    document.querySelectorAll('.screen').forEach(function (screen) {
      new MutationObserver(schedule).observe(screen, {attributes:true, attributeFilter:['class']});
    });
    if (window.ResizeObserver) {
      var observer = new ResizeObserver(schedule);
      observer.observe(bar);
      observer.observe(document.querySelector('.shareQrCard'));
    }
    document.addEventListener('click', schedule, true);
    window.addEventListener('resize', schedule);
    window.addEventListener('mathmatrixviewportchange', schedule);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    fit();
  };
})();
