/* Category navigation only: original puzzle nodes retain their game handlers. */
(function () {
  'use strict';
  window.createMathMatrixCategoryChooser = function (options) {
    var bar = document.querySelector('.difficultyBar');
    if (!bar) return null;
    var groups = Array.from(bar.querySelectorAll('.modeGroup'));
    var current = null, lastCategory = null, directReturn = false;
    var entries = [];
    var returnKey = 'mathmatrix-book-return:' + location.pathname.replace(/[^/]*$/, '');
    var pendingReturn = null;
    function cancelReturn() {
      pendingReturn = null;
      try { sessionStorage.removeItem(returnKey); } catch (e) {}
    }
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
    var bookNotes = {
      'Add Magic': 'Make every row, column and diagonal add up equally.',
      'SaNaMaze': 'Choose a maze or an illustrated treasure adventure.',
      'Binary Magic': 'Choose a range, then let the cards guess your number.',
      'Slide Magic': 'Move one tile at a time to put everything in order.',
      'Sudoku': 'Choose a board and difficulty, then fill the missing numbers.',
      'Pallanguzhi': 'Explore the traditional seed-sowing game.',
      'Thayam': 'Choose a board, roll the dice and race to the centre.'
    };
    function choiceNote(choice) {
      var size = choice.dataset.size;
      if (/^\d+x\d+$/.test(size || '')) {
        var side = Number(size.split('x')[0]);
        return 'Fill 1–' + side * side + '.';
      }
      var notes = {
        tunnels: 'Trace the tunnel that reaches the finish.',
        'cave-treasure': 'Find shields and treasure, then escape.',
        'sana-treasure-hunt': 'Follow an illustrated treasure adventure.',
        binary: 'Think of a number; the cards will guess it.',
        binary2: 'Explore the same trick with a wider range.'
      };
      if (notes[size]) return notes[size];
      if (choice.dataset.slideLevel) return {
        fifteen: 'Slide the numbered tiles into order.',
        az: 'Arrange the alphabet from A to Z.',
        azn: 'Put letters and numbers back in order.'
      }[choice.dataset.slideLevel];
      if (choice.dataset.sudLevel) return {
        mini: 'Use 1–3; no repeats.',
        mid4: 'Use 1–4; no repeats.',
        medium: 'Boxes and diagonals.',
        hard: 'Fewer starting clues.',
        master: 'The fewest clues.'
      }[choice.dataset.sudLevel];
      if (choice.dataset.palLevel) return 'Sow seeds and collect cups of four.';
      if (choice.dataset.pal4Level) return 'Explore the four-player sample board.';
      if (choice.dataset.thayamLevel) return choice.dataset.thayamLevel === '5x5'
        ? 'Roll, enter the board and race to the centre.'
        : 'Capture an opponent before turning inward.';
      return choice.querySelector('.lvMeta')?.textContent.trim() || 'Choose this puzzle to start playing.';
    }
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
    var buildLabel = document.title.match(/V\.\d+/);
    var version = element('span', 'categoryVersion', 'Beta ' + (buildLabel ? buildLabel[0] : ''));
    footer.appendChild(version);
    groups.forEach(function (group, index) {
      var name = group.querySelector('.modeHead b').textContent.trim();
      var icon = group.querySelector('.mIco');
      var choices = Array.from(group.querySelectorAll('.toggleBtn'));
      var count = choices.length;
      var button = element('button', 'categoryCard');
      button.type = 'button';
      button.dataset.category = name;
      button.setAttribute('aria-label', name + (count === 1 ? ', play puzzle' : ', ' + count + ' puzzles'));
      if (count > 1) {
        button.setAttribute('aria-controls', panel.id);
        button.setAttribute('aria-expanded', 'false');
      }
      button.style.setProperty('--category-fill', palette[index % palette.length][0]);
      button.style.setProperty('--category-edge', palette[index % palette.length][1]);
      var picture = element('span', 'categoryPicture', icon ? icon.textContent.trim() : '🎲');
      picture.setAttribute('aria-hidden', 'true');
      var text = element('span', 'categoryCardCopy');
      text.append(element('span', 'categoryName', labels[name] || name));
      text.append(element('span', 'categoryCount', count === 1 ? 'Play puzzle' : count + ' puzzles'));
      button.append(picture, text);
      var entry = { group: group, button: button, name: name, choices: choices, lastChoice: null };
      entries.push(entry);
      choices.forEach(function (choice) {
        choice.classList.add('bookChoice');
        if (choice.dataset.sudLevel) {
          var sudokuNames = { mini: ['3×3', 'Easy'], mid4: ['4×4', 'Intermediate'],
            medium: ['9×9', 'Medium'], hard: ['9×9', 'Hard'], master: ['9×9', 'Master'] };
          var sudokuName = sudokuNames[choice.dataset.sudLevel];
          choice.querySelector('.lvName').textContent = sudokuName[0];
          choice.querySelector('.lvDiff').textContent = sudokuName[1];
        }
        choice.querySelector('.lvText').appendChild(element('span', 'bookNote', choiceNote(choice)));
        choice.addEventListener('click', function () {
          cancelReturn();
          entry.lastChoice = choice;
          if (['criss-cross', 'tic-tac-toe', 'tunnels', 'cave-treasure', 'sana-treasure-hunt'].indexOf(choice.dataset.size) !== -1) {
            try {
              sessionStorage.setItem(returnKey, JSON.stringify({ name: name, direct: count === 1,
                choice: choices.indexOf(choice), time: Date.now() }));
            } catch (e) {}
          }
        }, true);
      });
      button.addEventListener('click', function () {
        cancelReturn();
        lastCategory = button;
        directReturn = count === 1;
        current = count === 1 ? null : entry;
        render(count > 1);
        if (count === 1) choices[0].click();
      });
      grid.appendChild(button);
      panel.appendChild(group);
      group.hidden = true;
    });
    bar.replaceChildren(heading, grid, panel, footer);
    bar.classList.add('categoryChooser');

    function fit() {
      if (options.screen() !== 'scHome') return;
      bar.classList.toggle('categoryShort', bar.clientHeight < 350);
      if (current) { fitChoices(); return; }
      // Compact landscape book-cover trial: fit the actual available space.
      // No gameplay, portrait, navigation or device-orientation changes.
      grid.classList.remove('categoryLandscapeSquares');
      bar.classList.remove('categorySquareCompact');
      grid.style.removeProperty('width');
      grid.style.removeProperty('height');
      grid.style.removeProperty('--square-side');
      Array.from(grid.children).forEach(function (button) {
        var name = button.querySelector('.categoryName');
        if (name && name.dataset.fullBookName) name.textContent = name.dataset.fullBookName;
      });
      var desktopBooks = document.documentElement.classList.contains('desktopViewport');
      var landscapeBooks = !desktopBooks && groups.length === 12 &&
        window.innerWidth > window.innerHeight && window.innerWidth >= 600;
      if (landscapeBooks) {
        bar.classList.add('categorySquareCompact');
        // Measure after compacting the header/footer. The grid itself remains
        // inside the normal content panel above the app's bottom navigation.
        var layoutStyle = getComputedStyle(bar);
        var gap = parseFloat(layoutStyle.rowGap || layoutStyle.gap) || 0;
        var freeHeight = bar.clientHeight - heading.offsetHeight - footer.offsetHeight -
          (parseFloat(layoutStyle.paddingTop) || 0) -
          (parseFloat(layoutStyle.paddingBottom) || 0) - gap * 2;
        var side = Math.floor(Math.min((freeHeight - 6) / 2,
          (bar.clientWidth - 30) / 6));
        if (side >= 42) {
          grid.style.setProperty('--square-side', side + 'px');
          grid.style.width = (side * 6 + 30) + 'px';
          grid.style.height = (side * 2 + 6) + 'px';
          grid.classList.add('categoryLandscapeSquares');
          var shortNames = {
            'Add Magic':'Add', 'Multiply Magic':'Multiply', 'Criss-Cross':'Criss-Cross',
            'SaNaMaze':'SaNaMaze', 'Birthday Magic':'Birthday', 'Gate Logic':'Gate Logic',
            'Binary Magic':'Binary', 'Slide Magic':'Slide', 'Sudoku':'Sudoku',
            'Tic-Tac-Toe':'Tic-Tac-Toe', 'Pallanguzhi':'Pallanguzhi', 'Thayam':'Thayam'
          };
          Array.from(grid.children).forEach(function (button) {
            var name = button.querySelector('.categoryName');
            if (!name) return;
            if (!name.dataset.fullBookName) name.dataset.fullBookName = name.textContent;
            name.textContent = shortNames[name.dataset.fullBookName] || name.dataset.fullBookName;
          });
        } else {
          // A genuinely tiny viewport keeps the known-good responsive cards.
          bar.classList.remove('categorySquareCompact');
        }
      }
      var columns = grid.classList.contains('categoryLandscapeSquares') ? 6 : grid.clientWidth >= 820 ? 4 : grid.clientWidth >= 500 ? 3 : 2;
      grid.style.setProperty('--category-columns', columns);
      grid.style.setProperty('--category-rows', Math.ceil(groups.length / columns));
      var rowHeight = grid.clientHeight / Math.ceil(groups.length / columns);
      grid.classList.toggle('categoryCompact', rowHeight < 69);
      grid.style.setProperty('--category-font', Math.max(grid.clientWidth < 320 ? 11.5 : 13, Math.min(desktopBooks ? 23 : 17, rowHeight * 0.205)) + 'px');
      grid.style.setProperty('--category-icon', Math.max(19, Math.min(desktopBooks ? 48 : 35, rowHeight * 0.42)) + 'px');
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
    function fitChoices() {
      var list = current.group.querySelector('.toggleSwitch');
      var count = current.choices.length;
      panel.classList.remove('bookScroll');
      var width = panel.clientWidth, height = panel.clientHeight, columns = 1, score = Infinity;
      // Add Magic: use the same landscape 3 x 2 fit as other compact book menus.
      // Keep portrait and every other book's existing selection logic unchanged.
      // Use the actual screen orientation, not the panel's transient measured
      // height/width: those can be zero while a book is first opening.
      var fitAddMagic = /^Add Magic$/i.test(current.name.trim()) &&
        window.matchMedia('(orientation: landscape)').matches &&
        window.innerWidth >= 600;
      for (var candidate = 1; candidate <= count; candidate++) {
        var rows = Math.ceil(count / candidate);
        var cardWidth = (width - (candidate - 1) * 10) / candidate;
        var cardHeight = (height - (rows - 1) * 10) / rows;
        if (cardWidth < 138 || cardHeight < 72) continue;
        var value = Math.abs(Math.log((cardWidth / cardHeight) / 1.7)) + (candidate * rows - count) * 0.25;
        if (value < score) { score = value; columns = candidate; }
      }
      if (fitAddMagic) columns = 3;
      var desktopChoices = document.documentElement.classList.contains('desktopViewport');
      if (desktopChoices) columns = Math.min(count, Math.max(1, Math.min(3, Math.floor(width / 290))));
      var rowCount = Math.ceil(count / columns);
      list.style.setProperty('--book-row-height', Math.min(200, Math.floor((height - (rowCount - 1) * 12) / rowCount)) + 'px');
      list.style.setProperty('--book-columns', columns);
      list.style.setProperty('--book-rows', rowCount);
      list.classList.toggle('bookOddPair', columns === 2 && count % 2 === 1);
      panel.classList.toggle('addMagicLandscapeFit', fitAddMagic);
      var minimum = 0;
      current.choices.forEach(function (choice) {
        var box = choice.getBoundingClientRect();
        choice.classList.toggle('bookStack', box.height > box.width * 1.15);
        choice.classList.toggle('bookDense', box.height < 125);
        var titleSize = Math.max(15, Math.min(25, box.height * 0.14));
        var iconSize = Math.max(28, Math.min(box.width < 220 ? 44 : 68, box.height * 0.32));
        var scale = 1;
        function size() {
          choice.style.setProperty('--book-title', Math.max(14, titleSize * scale) + 'px');
          choice.style.setProperty('--book-note', Math.max(11, Math.min(box.width < 220 ? 14 : 16, titleSize * 0.65) * scale) + 'px');
          choice.style.setProperty('--book-diff', Math.max(11, Math.min(box.width < 220 ? 12 : 14, titleSize * 0.62) * scale) + 'px');
          choice.style.setProperty('--book-icon', Math.max(26, iconSize * scale) + 'px');
        }
        size();
        var text = choice.querySelector('.lvText');
        var picture = choice.querySelector('.lvGrid,.lvGlyph');
        var style = getComputedStyle(choice);
        var padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        var border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
        function needed() { return text.offsetHeight + (choice.classList.contains('bookStack') ? picture.offsetHeight + 12 : 0); }
        while (needed() > choice.clientHeight - padding && scale > 0.69) { scale -= 0.05; size(); }
        minimum = Math.max(minimum, needed() + padding + border);
      });
      if (!fitAddMagic && minimum > (height - (rowCount - 1) * 10) / rowCount + 1) {
        list.style.setProperty('--book-min-row', Math.ceil(minimum) + 'px');
        panel.classList.add('bookScroll');
      }
    }
    function render(focus) {
      var onHome = options.screen() === 'scHome';
      document.body.classList.toggle('categoryHome', onHome);
      document.body.classList.toggle('categoryOpen', onHome && !!current);
      bar.classList.toggle('categoryInside', !!current);
      grid.hidden = !!current;
      panel.hidden = !current;
      // Mark the Add Magic book before layout measurements. CSS alone can then
      // establish its 3x2 grid even on the first render of a landscape screen.
      panel.classList.toggle('addMagicLandscapeFit', !!current &&
        /^Add Magic$/i.test(current.name.trim()) &&
        window.matchMedia('(orientation: landscape)').matches &&
        window.innerWidth >= 600);
      title.textContent = current ? (labels[current.name] || current.name) : 'Choose a puzzle';
      hint.textContent = current ? bookNotes[current.name] || 'Choose a puzzle below.' : 'All ' + groups.length + ' puzzle books — choose one to play.';
      groups.forEach(function (group) { group.hidden = !current || current.group !== group; });
      Array.from(grid.children).forEach(function (button) {
        if (button.hasAttribute('aria-expanded')) button.setAttribute('aria-expanded', String(!!current && current.button === button));
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
      if (focus && onHome && current) options.announce(hint.textContent);
      bar.scrollTop = 0;
      fit();
    }
    function showCategories(focus) {
      current = null;
      directReturn = false;
      render(false);
      if (focus && lastCategory) lastCategory.focus({ preventScroll: true });
      options.announce('Choose a puzzle book. Single puzzles open straight away.');
    }
    function takeReturn() {
      try {
        var saved = JSON.parse(sessionStorage.getItem(returnKey) || 'null');
        sessionStorage.removeItem(returnKey);
        return saved;
      } catch (e) { return null; }
    }
    function restoreReturn(saved) {
      if (!saved) return;
      try {
        var entry = entries.find(function (item) { return item.name === saved.name; });
        if (!entry) return;
        lastCategory = entry.button;
        current = saved.direct ? null : entry;
        entry.lastChoice = entry.choices[saved.choice] || entry.choices[0];
        directReturn = false;
        render(false);
        requestAnimationFrame(function () { (saved.direct ? entry.button : entry.lastChoice).focus({ preventScroll: true }); });
      } catch (e) {}
    }
    document.getElementById('tab-scHome').addEventListener('click', function () { cancelReturn(); showCategories(false); });
    bar.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && current) {
        event.preventDefault(); event.stopPropagation(); showCategories(true);
      }
    });
    if (window.ResizeObserver) new ResizeObserver(fit).observe(bar);
    window.addEventListener('resize', fit);
    document.addEventListener('pointerdown', cancelReturn, true);
    document.addEventListener('keydown', cancelReturn, true);
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) pendingReturn = takeReturn();
      setTimeout(function () {
        var saved = pendingReturn;
        pendingReturn = null;
        restoreReturn(saved);
      }, 0);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    render(false);
    pendingReturn = takeReturn();
    restoreReturn(pendingReturn);
    return {
      fit: fit,
      isOpen: function () { return !!current; },
      showCategories: showCategories,
      screenChanged: function () {
        var returned = options.screen() === 'scHome' && !document.body.classList.contains('categoryHome');
        render(false);
        if (returned) {
          var target = current ? current.lastChoice : directReturn ? lastCategory : null;
          if (target) target.focus({ preventScroll: true });
          directReturn = false;
        }
      }
    };
  };
})();
