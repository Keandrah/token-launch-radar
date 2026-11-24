// Token Launch Radar dashboard. All bytes come from ../data.js; no fetch, no framework, no network.
// The board, the detail view and the filters read the same rows that main.ts wrote to board.json.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, sort: 'implied', dir: -1, tab: 'pre-token', selected: null };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    return d >= 365 ? (d / 365).toFixed(1) + 'y' : Math.round(d) + 'd';
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var raw = window.location.hash.replace(/^#/, '');
    if (!raw) return;
    var p = new URLSearchParams(raw);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('min')) state.minTvl = Number(p.get('min')) || 0;
    if (p.get('sort')) state.sort = p.get('sort');
    if (p.get('p')) state.selected = p.get('p');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.minTvl > 0) p.set('min', String(state.minTvl));
    if (state.sort !== 'implied') p.set('sort', state.sort);
    if (state.selected) p.set('p', state.selected);
    var s = p.toString();
    window.history.replaceState(null, '', s ? '#' + s : window.location.pathname + window.location.search);
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function select(labelText, current, options, onChange) {
    var s = el('select', { 'aria-label': labelText, onchange: function () { onChange(s.value); } },
      options.map(function (o) { return el('option', { value: o[0], text: o[1], selected: String(o[0]) === String(current) ? 'selected' : null }); })
    );
    return el('div', { class: 'field' }, el('label', { text: labelText }), s);
  }

  function topbar() {
    return el('header', { class: 'topbar' },
      el('div', { class: 'brand' },
        el('span', { class: 'sigil', text: 'TL' }),
        el('div', null, el('b', { text: 'TOKEN LAUNCH RADAR' }), el('span', { text: 'PRE-TOKEN INTELLIGENCE / ' + DATA.model_version.toUpperCase() }))
      ),
      el('div', { class: 'topmeta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Index ', el('b', { text: 'DefiLlama protocols' })),
        el('span', { class: 'pill', text: 'no token on record' })
      )
    );
  }

  function hero() {
    return el('section', { class: 'hero' },
      el('div', null,
        el('div', { class: 'eyebrow', text: 'The pre-token watchlist' }),
        el('h1', { text: 'Find value before a token exists.' }),
        el('p', { text: 'Protocols are ranked by a hypothetical launch value derived only from recorded TVL, seven-day TVL change, time with no token on record and chain breadth. Every row is a claim to test, not a prediction of an issue date, and every row carries a costed plan for earning a place first.' }),
        el('p', { class: 'caution', text: 'A missing token field in the index is not proof that no token exists. Check each protocol’s own documentation before risking capital.' })
      ),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'WATCHLIST COVERED' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'stat' }, el('span', { text: 'PROTOCOLS RANKED' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'EARLY FINDS BELOW FLOOR' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'LIVE TOKENS SET ASIDE' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search a protocol, chain or category', value: state.q, 'aria-label': 'Search protocols', oninput: function () { state.q = search.value; writeHash(); render(); } });
    var categories = ['all'].concat(Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort());
    var chains = ['all'].concat(Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort());
    var mins = [[0, 'Any TVL'], [50e6, 'TVL ≥ $50M'], [250e6, 'TVL ≥ $250M'], [1e9, 'TVL ≥ $1B'], [5e9, 'TVL ≥ $5B']];
    var sorts = [['implied', 'Implied value'], ['tvl', 'TVL'], ['growth', '7d change'], ['age', 'Time with no token'], ['name', 'Name']];
    var pre = el('button', { type: 'button', text: 'Pre-token board', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', text: 'Live tokens', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', onclick: function () { state.tab = 'live'; render(); } });
    return el('section', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Find' }), search),
      select('Category', state.category, categories.map(function (c) { return [c, c === 'all' ? 'All categories' : c]; }), function (v) { state.category = v; writeHash(); render(); }),
      select('Chain', state.chain, chains.map(function (c) { return [c, c === 'all' ? 'All chains' : c]; }), function (v) { state.chain = v; writeHash(); render(); }),
      select('Size', state.minTvl, mins, function (v) { state.minTvl = Number(v); writeHash(); render(); }),
      select('Sort by', state.sort, sorts, function (v) { state.sort = v; state.dir = -1; writeHash(); render(); }),
      el('div', { class: 'field' }, el('label', { text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? filtered().length + ' of ' + DATA.board_size + ' rows' : DATA.live.length + ' live protocols' })
    );
  }

  function th(key, label) {
    return el('th', { scope: 'col' }, el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); render(); } }, label, state.sort === key ? el('span', { text: state.dir < 0 ? ' ↓' : ' ↑' }) : null));
  }

  function boardTable() {
    var list = sorted(filtered());
    if (!list.length) return el('section', { class: 'panel' }, el('div', { class: 'empty' }, el('h2', { text: 'Nothing matches these filters' }), el('button', { class: 'close', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; writeHash(); render(); } })));
    var max = list[0].implied_value_usd || 1;
    var rows = list.map(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      return el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'mono rank ' + (r.rank <= 3 ? 'top' : ''), text: String(r.rank).padStart(2, '0') }),
        el('td', null, el('div', { class: 'protocol' }, el('b', { text: r.name }), el('small', { text: (r.category || 'Other') + ' · ' + (r.chains || []).slice(0, 3).join(' / ') }))),
        el('td', { class: 'mono', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'mono ' + (r.change_7d === null ? 'na' : r.change_7d >= 0 ? 'up' : 'down'), text: growth }),
        el('td', { class: 'mono', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'value' }, el('div', { class: 'track', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round(r.implied_value_usd / max * 100)) + '%' })), el('b', { text: fmtUsd(r.implied_value_usd) }))),
        el('td', null, el('span', { class: 'tag', text: 'no token' }))
      );
    });
    return el('section', { class: 'panel' }, el('div', { class: 'tablewrap' },
      el('table', null,
        el('caption', { text: 'Ranked by implied value · select a row for its model maths and six-step farm plan' }),
        el('thead', null, el('tr', null, th('implied', '# / VALUE'), th('name', 'PROTOCOL'), th('tvl', 'TVL'), th('growth', '7D'), th('age', 'NO TOKEN'), th('implied', 'IMPLIED VALUE'), el('th', { scope: 'col', text: 'INDEX' }))),
        el('tbody', null, rows)
      )
    ));
  }

  function liveTable() {
    var rows = DATA.live.map(function (r) {
      return el('tr', null,
        el('td', { class: 'mono', text: '—' }),
        el('td', null, el('div', { class: 'protocol' }, el('b', { text: r.name }), el('small', { text: (r.category || 'Other') + ' · ' + (r.chains || []).slice(0, 3).join(' / ') }))),
        el('td', { class: 'mono', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'mono ' + (r.change_7d !== null && r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'mono', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'mono', text: '—' }),
        el('td', null, el('span', { class: 'tag live', text: 'trading' }))
      );
    });
    return el('section', { class: 'panel' }, el('div', { class: 'tablewrap' },
      el('table', null,
        el('caption', { text: 'These protocols already record a token. Their market cap is a market fact, not a hypothetical value, so they sit outside the ranking.' }),
        el('thead', null, el('tr', null, el('th', { text: '#' }), el('th', { text: 'PROTOCOL' }), el('th', { text: 'TVL' }), el('th', { text: '7D' }), el('th', { text: 'MARKET CAP' }), el('th', { text: 'NO TOKEN' }), el('th', { text: 'INDEX' }))),
        el('tbody', null, rows)
      )
    ));
  }

  function method() {
    var m = DATA.model;
    return el('section', { class: 'panel method' },
      el('h2', { text: 'The model, in the open' }),
      el('div', { class: 'formula', text: 'implied = round( tvl × ' + m.base_multiple + ' × (1 + clamp(7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + ') × (' + m.tenure_floor + ' + min(age, ' + m.tenure_days + ') / ' + m.tenure_days + ' × ' + m.tenure_span + ') × (1 + (min(chains, ' + m.chain_max + ') − 1) × ' + m.chain_step + ') )' }),
      el('div', { class: 'grid2' },
        el('div', null, el('h3', { text: 'Why these four factors' }), el('ul', null,
          el('li', { text: 'TVL sets the scale of the claim: more committed capital means more value to distribute.' }),
          el('li', { text: 'Seven-day TVL change is the live signal: growth is capped so one week cannot dominate.' }),
          el('li', { text: 'Time with no token on record is maturity, not a launch date: a longer run builds a larger potential base.' }),
          el('li', { text: 'Chain breadth adds a small, bounded premium for protocols that already operate across venues.' })
        )),
        el('div', null, el('h3', { text: 'What this is not' }), el('ul', null,
          el('li', { text: 'No protocol name is in the model; each row uses the same function and the same constants.' }),
          el('li', { text: 'It does not predict whether or when a token will be issued, and it makes no promise of a reward.' }),
          el('li', { text: 'The watchlist is a floor: ' + DATA.early_size + ' smaller pre-token protocols are added from the same snapshot.' }),
          el('li', { text: 'Farm plans are operational checklists, not financial advice; every plan states its capital and gas cost.' })
        ))
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', 'aria-label': 'Protocol detail' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
  function openDetail(slug) {
    var r = DATA.rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var m = r.model;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null, el('div', { class: 'eyebrow', text: 'RANK ' + r.rank + ' OF ' + DATA.board_size }), el('h2', { text: r.name }), el('p', { class: 'note', text: (r.category || 'Other') + ' · ' + (r.chains || []).join(' / ') })),
      el('button', { class: 'close', type: 'button', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'section' }, el('h3', { text: 'How the value was derived' }),
      el('div', { class: 'eq' },
        el('div', null, el('span', { text: 'TVL recorded' }), el('b', { text: fmtUsd(r.tvl_usd) })),
        el('div', null, el('span', { text: 'Base = TVL × ' + DATA.model.base_multiple }), el('b', { text: fmtUsd(m.base_usd) })),
        el('div', null, el('span', { text: 'Seven-day TVL change' }), el('b', { text: fmtPct(m.growth_pct) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { text: '× ' + m.growth_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Time with no token on record' }), el('b', { text: fmtAge(r.age_days) })),
        el('div', null, el('span', { text: 'Tenure multiplier' }), el('b', { text: '× ' + m.tenure_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Chain breadth multiplier' }), el('b', { text: '× ' + m.chain_multiplier.toFixed(4) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(r.implied_value_usd) }))
      ),
      el('p', { class: 'note', text: 'First tracked ' + (r.listed_at || 'not recorded') + '. The page shows the same components the program wrote; this is a model value, not a price or a forecast.' })
    ));
    dialog.appendChild(el('section', { class: 'section' }, el('h3', { text: 'Six-step farm plan' }),
      el('ol', { class: 'steps' }, r.farm_steps.map(function (s) {
        var c = s.indexOf(' Cost: ');
        var t = s.indexOf(' Time: ', c < 0 ? 0 : c);
        var action = c < 0 ? s : s.slice(0, c);
        var meta = c < 0 ? '' : s.slice(c + 1, t < 0 ? s.length : t) + ' · ' + (t < 0 ? '' : s.slice(t + 1));
        return el('li', null, action, el('em', { text: meta }));
      })),
      el('p', { class: 'note', text: 'No reward is implied. Confirm every step against the protocol’s own published documentation and never pay to claim anything.' })
    ));
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' }, topbar(), hero(), controls(), state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(method());
    shell.appendChild(el('div', { class: 'foot', text: 'Snapshot ' + DATA.as_of + ' · ' + DATA.model_version + ' · local data only · no network requests' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
