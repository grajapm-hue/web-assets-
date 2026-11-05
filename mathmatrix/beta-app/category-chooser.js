/* Category navigation only: original puzzle nodes retain their game handlers. */
(function () {
  'use strict';
  window.createMathMatrixCategoryChooser = function (options) {
    var bar = document.querySelector('.difficultyBar');
    if (!bar) return null;
    var groups = Array.from(bar.querySelectorAll('.modeGroup'));
    var current = null, lastCategory = null;
    var palette = [
      ['#D9EECF', '#6A9757'], ['#FFE6A0', '#B69033'],
      ['#CDE9F1', '#639DB0'], ['#D9EBD7', '#6C9868'],
      ['#FFE2B5', '#B38A50'], ['#D7EDD5', '#6F9C6A'],
      ['#F6D6DF', '#B8798D'], ['#E3DAF6', '#9B85BE'],
      ['#E4EABF', '#929D53'], ['#D3EAF2', '#72A2B5'],
      ['#F4DCC5', '#B68D68'], ['#D7E4FA', '#819DC8'],
      ['#F0E4B9', '#A6955C'], ['#E7DBF4', '#A38ABD']
    ];
    var labels = {
      'Tunnels Of SaNa Maze': 'Tunnels of SaNa',
      'SaNa Treasure Hunt · Interactive': 'SaNa Treasure Hunt',
      'Pallanguzhi': 'Pallanguzhi'
    };
    function element(tag, className, text) {
      var node = document.createElement(tag);
      node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    var heading = element('div', 'categoryHeading');
    var copy = element('div', 'categoryHeadingCopy');
    var title = element('h2', 'categoryTitle', 'Choose a puzzle');
    title.tabIndex = -1;
    var hint = element('p', 'categoryHint', 'Pick a category, then choose your puzzle.');
    copy.append(title, hint); heading.append(copy);
    var grid = element('div', 'categoryGrid');
    grid.setAttribute('aria-label', 'All puzzle categories');
    var panel = element('div', 'categoryOptions');
    panel.id = 'categoryOptions';
    var footer = element('div', 'categoryFooter');
    ['diffTip', 'diffInstall', 'diffShare'].forEach(function (id) {
      var node = document.getElementById(id);
      if (node) footer.appendChild(node);
    });
    var version = element('span', 'categoryVersion', 'Beta V.215');
    footer.appendChild(version);
    groups.forEach(function (group, index) {
      var name = group.querySelector('.modeHead b').textContent.trim();
      var icon = group.querySelector('.mIco');
      var count = group.querySelectorAll('.toggleBtn').length;
      var button = element('button', 'categoryCard');
      button.type = 'button';
      button.dataset.category = name;
      button.setAttribute('aria-label', name + ', ' + count + (count === 1 ? ' puzzle' : ' puzzles'));
      button.setAttribute('aria-controls', panel.id);
      button.setAttribute('aria-expanded', 'false');
      button.style.setProperty('--category-fill', palette[index % palette.length][0]);
      button.style.setProperty('--category-edge', palette[index % palette.length][1]);
      var picture = element('span', 'categoryPicture', icon ? icon.textContent.trim() : '🎲');
      picture.setAttribute('aria-hidden', 'true');
      var text = element('span', 'categoryCardCopy');
      text.append(element('span', 'categoryName', labels[name] || name));
      text.append(element('span', 'categoryCount', name.indexOf('Interactive') !== -1 ? 'Interactive story' : count + (count === 1 ? ' puzzle' : ' puzzles')));
      button.append(picture, text);
      button.addEventListener('click', function () {
        current = { group: group, button: button, name: name };
        lastCategory = button;
        render(true);
      });
      grid.appendChild(button);
      panel.appendChild(group);
      group.hidden = true;
    });
    bar.replaceChildren(heading, grid, panel, footer);
    bar.classList.add('categoryChooser');

    function fit() {
      if (options.screen() !== 'scHome') return;
      var columns = grid.clientWidth >= 820 ? 4 : grid.clientWidth >= 500 ? 3 : 2;
      grid.style.setProperty('--category-columns', columns);
      grid.style.setProperty('--category-rows', Math.ceil(groups.length / columns));
      var rowHeight = grid.clientHeight / Math.ceil(groups.length / columns);
      grid.classList.toggle('categoryCompact', rowHeight < 69);
      grid.style.setProperty('--category-font', Math.max(grid.clientWidth < 320 ? 11.5 : 13, Math.min(17, rowHeight * 0.205)) + 'px');
      grid.style.setProperty('--category-icon', Math.max(19, Math.min(35, rowHeight * 0.42)) + 'px');
      bar.classList.toggle('categoryShort', bar.clientHeight < 350);
      bar.style.setProperty('--lvScale', '1');
      // Long titles must fit too; measuring them protects narrow phones and
      // browser font differences without shrinking every other category.
      Array.from(grid.children).forEach(function (button) {
        button.style.removeProperty('--category-font');
        var text = button.querySelector('.categoryCardCopy');
        var style = getComputedStyle(button);
        var available = button.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        var font = parseFloat(getComputedStyle(button.querySelector('.categoryName')).fontSize);
        while (text.offsetHeight > available + 0.5 && font > 10.5) {
          font -= 0.5;
          button.style.setProperty('--category-font', font + 'px');
        }
      });
    }
    function render(focus) {
      var onHome = options.screen() === 'scHome';
      document.body.classList.toggle('categoryHome', onHome);
      document.body.classList.toggle('categoryOpen', onHome && !!current);
      bar.classList.toggle('categoryInside', !!current);
      grid.hidden = !!current;
      panel.hidden = !current;
      title.textContent = current ? (labels[current.name] || current.name) : 'Choose a puzzle';
      hint.textContent = current ? 'Choose a puzzle below.' : 'All ' + groups.length + ' categories — pick one to explore.';
      groups.forEach(function (group) { group.hidden = !current || current.group !== group; });
      Array.from(grid.children).forEach(function (button) {
        button.setAttribute('aria-expanded', String(!!current && current.button === button));
      });
      var nav = document.getElementById('navBack');
      if (nav) {
        nav.classList.toggle('show', !onHome || !!current);
        nav.setAttribute('aria-label', onHome && current ? 'Back to all categories' : current ? 'Back to ' + (labels[current.name] || current.name) : 'Back to puzzles');
        nav.title = nav.getAttribute('aria-label');
      }
      if (onHome) {
        var headerTitle = document.getElementById('appBarTitle');
        if (headerTitle) headerTitle.textContent = current ? (labels[current.name] || current.name) : 'MathMatrix Pro++';
      }
      if (focus && onHome) title.focus({ preventScroll: true });
      bar.scrollTop = 0;
      fit();
    }
    function showCategories(focus) {
      current = null;
      render(false);
      if (focus && lastCategory) lastCategory.focus({ preventScroll: true });
      options.announce('Choose a category, then pick the puzzle you want to play.');
    }
    document.getElementById('tab-scHome').addEventListener('click', function () { showCategories(false); });
    bar.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && current) {
        event.preventDefault(); event.stopPropagation(); showCategories(true);
      }
    });
    if (window.ResizeObserver) new ResizeObserver(fit).observe(bar);
    window.addEventListener('resize', fit);
    render(false);
    return {
      fit: fit,
      isOpen: function () { return !!current; },
      showCategories: showCategories,
      screenChanged: function () { render(false); }
    };
  };
})();
