// Token Radar's page: renders window.RADAR (data.js, written by main.ts) with no network.
// The page recomputes nothing from a second source: it renders the board the model wrote, and the
// detail view's farm plan from the same rules the model uses, so the page and board.json agree.
(function () {
  var D = window.RADAR;
  var $ = function (id) { return document.getElementById(id); };
  if (!D) { document.body.innerHTML = '<p style="padding:30px">The radar data did not load.</p>'; return; }

  var money = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
  var pct = function (n) { return n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; };
  var age = function (n) { return n === null || n === undefined ? '—' : n + 'd'; };
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };

  // ---- hash state ------------------------------------------------------------
  function readHash() {
    var h = location.hash.replace(/^#/, '');
    var out = { q: '', category: '', chain: '', tab: 'board', p: '', sort: 'rank', dir: 1 };
    h.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i < 0) return;
      var k = kv.slice(0, i), v = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
      if (k in out) out[k] = v;
    });
    return out;
  }
  function writeHash() {
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.category) parts.push('category=' + encodeURIComponent(state.category));
    if (state.chain) parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.tab !== 'board') parts.push('tab=' + state.tab);
    if (state.p) parts.push('p=' + state.p);
    if (state.sort !== 'rank' || state.dir !== 1) parts.push('sort=' + state.sort + '&dir=' + state.dir);
    history.replaceState(null, '', parts.length ? '#' + parts.join('&') : '#');
  }
  var state = readHash();
  var wlOnly = false;

  // ---- farm plan: the same rules the model uses ------------------------------
  function chainOf(r) { return r.chains.length ? r.chains[0] : 'its main chain'; }
  function capitalFor(r) {
    if (r.tvl_usd >= 5000000000) return 250;
    if (r.tvl_usd >= 1000000000) return 150;
    if (r.tvl_usd >= 100000000) return 100;
    return 50;
  }
  function holdFor(r) {
    if (r.age_days === null || r.age_days === undefined) return 30;
    if (r.age_days < 180) return 60;
    if (r.age_days < 365) return 45;
    return 30;
  }
  function actionFor(r, capital, chain) {
    var c = (r.category || '').toLowerCase(), n = r.name;
    if (c.indexOf('risk curator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('capital allocator') >= 0) return 'Deposit $' + capital + ' into a ' + n + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + n + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + n + '\'s main pool on ' + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + n + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + n + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + n + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + n + '.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + n + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of the protocol\'s yield asset on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + n + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('payment') >= 0) return 'Pay $' + capital + ' through ' + n + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' into ' + n + ' on ' + chain + ' and vote on one proposal.';
    if (c.indexOf('chain') >= 0 || c.indexOf('liquid') >= 0) return 'Use $' + capital + ' of ' + n + ' on ' + chain + ' for one full round trip and keep the receipt.';
    return 'Deposit $' + capital + ' of USDC into ' + n + ' on ' + chain + ' and keep the position open.';
  }
  function farmSteps(r) {
    var chain = chainOf(r), capital = capitalFor(r), hold = holdFor(r), action = actionFor(r, capital, chain);
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: action, cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Open the protocol\'s own points or rewards page once a week and check whether your activity is counted.', cost: 'no fee to check', time: '5 minutes a week' },
      { text: 'Before you withdraw, claim only from the link the protocol itself publishes, and never pay anyone to claim for you.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ];
    return steps.map(function (s) { return s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.'; });
  }

  // ---- header, lede, strip ---------------------------------------------------
  $('meta').textContent = 'Snapshot: DefiLlama, ' + D.as_of + ' · floor ' + money(D.floor_usd) + ' TVL · model ' + D.model_version + ' · ' + D.rows.length + ' rows';
  var wl = D.rows.filter(function (r) { return r.watchlist; }).length;
  var top = D.rows[0], low = D.rows[D.rows.length - 1];
  $('lede').innerHTML =
    '<h1>' + D.watchlist_size + ' protocols above the floor record no token. ' + D.early_size + ' more wait below it.</h1>' +
    '<p>The board ranks every protocol in the snapshot that records no token and is not a wrapped or staked product of one that trades, by what its launch would be worth. The top row is worth ' + money(top.implied_value_usd) + '; the last row on the board is worth ' + money(low.implied_value_usd) + '. The live tokens are set aside and shown on their own tab, so the board never mixes a market price with a model estimate.</p>' +
    '<div class="facts">' +
    '<div class="fact"><b>' + wl + '/' + D.watchlist_size + '</b><span>watchlist covered</span></div>' +
    '<div class="fact"><b>' + D.rows.length + '</b><span>rows on the board</span></div>' +
    '<div class="fact"><b>' + D.early_size + '</b><span>early rows below the floor</span></div>' +
    '<div class="fact"><b>' + D.live_size + '</b><span>live tokens set aside</span></div>' +
    '</div>';
  var maxV = D.rows[0].implied_value_usd;
  $('strip').innerHTML = '<h2>Top 10 by implied launch value</h2>' + D.rows.slice(0, 10).map(function (r) {
    return '<div class="bar-row"><span class="nm">#' + r.rank + ' ' + esc(r.name) + '</span><span class="bar-track"><span class="bar-fill" style="display:block;width:' + (r.implied_value_usd / maxV * 100).toFixed(1) + '%"></span></span><span class="val">' + money(r.implied_value_usd) + '</span></div>';
  }).join('');

  // ---- controls ---------------------------------------------------------------
  var cats = [...new Set(D.rows.map(function (r) { return r.category || 'Other'; }))].sort();
  var chains = [...new Set(D.rows.flatMap(function (r) { return r.chains; }))].sort();
  $('controls').innerHTML =
    '<div class="tabs"><button id="tab-board" class="' + (state.tab === 'board' ? 'on' : '') + '">Pre-token board (' + D.rows.length + ')</button>' +
    '<button id="tab-live" class="' + (state.tab === 'live' ? 'on' : '') + '">Live tokens (' + D.live.length + ')</button></div>' +
    '<input id="q" type="search" placeholder="Search a protocol…" value="' + esc(state.q) + '">' +
    '<select id="cat"><option value="">All categories</option>' + cats.map(function (c) { return '<option' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
    '<select id="chn"><option value="">All chains</option>' + chains.map(function (c) { return '<option' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
    '<label><input type="checkbox" id="wlo"' + (wlOnly ? ' checked' : '') + '> Watchlist only</label>' +
    '<span class="count" id="count"></span>';
  $('tab-board').onclick = function () { state.tab = 'board'; writeHash(); render(); };
  $('tab-live').onclick = function () { state.tab = 'live'; writeHash(); render(); };
  $('q').oninput = function () { state.q = this.value; writeHash(); render(); };
  $('cat').onchange = function () { state.category = this.value; writeHash(); render(); };
  $('chn').onchange = function () { state.chain = this.value; writeHash(); render(); };
  $('wlo').onchange = function () { wlOnly = this.checked; render(); };

  // ---- table ------------------------------------------------------------------
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return D.rows.filter(function (r) {
      if (state.category && (r.category || 'Other') !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (wlOnly && !r.watchlist) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function sortRows(rows) {
    var k = state.sort, d = state.dir;
    var val = function (r) {
      if (k === 'name') return r.name.toLowerCase();
      if (k === 'tvl') return r.tvl_usd;
      if (k === 'change') return r.change_7d === null ? -1e18 : r.change_7d;
      if (k === 'age') return r.age_days === null ? -1 : r.age_days;
      if (k === 'implied') return r.implied_value_usd;
      return r.rank;
    };
    return rows.slice().sort(function (a, b) {
      var va = val(a), vb = val(b);
      return (va < vb ? -1 : va > vb ? 1 : a.rank - b.rank) * d;
    });
  }
  function renderBoard() {
    var rows = sortRows(filtered());
    $('count').textContent = 'Showing ' + rows.length + ' of ' + D.rows.length + ' rows';
    var th = function (label, key, cls) {
      var arrow = state.sort === key ? (state.dir === 1 ? ' ▲' : ' ▼') : '';
      return '<th data-k="' + key + '" class="' + (cls || '') + '">' + label + arrow + '</th>';
    };
    var html = '<table><thead><tr>' + th('#', 'rank') + th('Protocol', 'name') + th('TVL', 'tvl', 'num') + th('7d', 'change', 'num') + th('Age', 'age', 'num') + th('Implied launch value', 'implied', 'num') + '</tr></thead><tbody>';
    html += rows.map(function (r) {
      var chg = r.change_7d === null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(r.change_7d) + '</span>';
      return '<tr data-slug="' + esc(r.slug) + '"><td>' + r.rank + '</td>' +
        '<td><b>' + esc(r.name) + '</b><span class="pill ' + (r.watchlist ? 'wl' : 'early') + '">' + (r.watchlist ? 'watchlist' : 'early') + '</span><br><span class="cat">' + esc(r.category || 'Other') + '</span><br><span class="chains">' + esc(r.chains.join(', ')) + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + chg + '</td><td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b><div class="bar-mini"><i style="width:' + (r.implied_value_usd / maxV * 100).toFixed(1) + '%"></i></div></td></tr>';
    }).join('');
    html += '</tbody></table>';
    $('board').innerHTML = html;
    $('board').querySelectorAll('th').forEach(function (el) {
      el.onclick = function () {
        var k = el.getAttribute('data-k');
        if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'name' ? 1 : -1; }
        writeHash(); render();
      };
    });
    $('board').querySelectorAll('tbody tr').forEach(function (el) {
      el.onclick = function () { openDetail(el.getAttribute('data-slug')); };
    });
  }
  function renderLive() {
    $('count').textContent = D.live.length + ' live tokens, by market cap';
    var html = '<table><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Mcap / TVL</th><th class="num">7d</th></tr></thead><tbody>';
    html += D.live.map(function (r) {
      var ratio = r.mcap_usd && r.tvl_usd ? (r.mcap_usd / r.tvl_usd).toFixed(2) + '×' : '—';
      return '<tr data-slug="' + esc(r.slug) + '"><td><b>' + esc(r.name) + '</b><br><span class="cat">' + esc(r.category || 'Other') + '</span><br><span class="chains">' + esc(r.chains.join(', ')) + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + (r.mcap_usd ? money(r.mcap_usd) : '—') + '</td><td class="num">' + ratio + '</td><td class="num">' + pct(r.change_7d) + '</td></tr>';
    }).join('');
    html += '</tbody></table><p style="color:var(--muted);font-size:13px;margin-top:10px">These already trade, so the board shows the market\'s own value for them instead of a model estimate. Their market-cap-to-TVL ratios are the comparables the model prices the pre-token board with.</p>';
    $('board').innerHTML = html;
  }

  // ---- detail dialog ------------------------------------------------------------
  function openDetail(slug) {
    var r = D.rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    state.p = slug; writeHash();
    var comp = D.comparables.find(function (c) { return c.category === (r.category || 'Other'); });
    var steps = farmSteps(r).map(function (s) {
      var i = s.indexOf(' Cost: ');
      var action = i >= 0 ? s.slice(0, i) : s;
      var meta = i >= 0 ? s.slice(i + 7) : '';
      return '<li>' + esc(action) + '<div class="meta2">' + esc(meta) + '</div></li>';
    }).join('');
    var dlg = $('detail');
    dlg.innerHTML = '<div class="dlg-head"><div><h2>' + esc(r.name) + '</h2><div class="cat">' + esc(r.category || 'Other') + ' · ' + esc(r.chains.join(', ')) + ' · records no token</div></div><button class="close" id="dlg-close">Close</button></div>' +
      '<div class="dlg-body">' +
      '<h3>Implied launch value</h3><div class="big">' + money(r.implied_value_usd) + '</div>' +
      '<h3>How the model gets there</h3><table><tbody>' +
      '<tr><td>TVL</td><td>' + money(r.tvl_usd) + '</td></tr>' +
      '<tr><td>Category multiple (' + esc(r.category || 'Other') + ', ' + r.comparables + ' live comparables' + (comp ? ', median ' + comp.median_multiple + '×' : ', no live comparables at or above the floor — global median ' + D.global_multiple + '×') + ')</td><td>' + r.category_multiple.toFixed(2) + '×</td></tr>' +
      '<tr><td>Growth multiplier (' + pct(r.change_7d) + ' in 7 days, clamped)</td><td>' + r.growth_multiplier.toFixed(2) + '×</td></tr>' +
      '<tr><td>Maturity multiplier (' + age(r.age_days) + ' since listing)</td><td>' + r.maturity_multiplier.toFixed(2) + '×</td></tr>' +
      '<tr><td>Chains multiplier (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')</td><td>' + r.chains_multiplier.toFixed(2) + '×</td></tr>' +
      '<tr><td>Implied value</td><td>' + money(r.implied_value_usd) + '</td></tr>' +
      '</tbody></table><p style="color:var(--muted);font-size:12.5px">The factors above are rounded to 4 decimals; the implied value is the model\'s exact figure. The category multiple is the median market-cap-to-TVL ratio of live-token protocols in the same category with TVL at or above the snapshot\'s floor, each ratio capped at 2× and shrunk toward the global median with a prior of 8.</p>' +
      '<h3>Farm plan — 7 steps</h3><ol class="steps">' + steps + '</ol>' +
      '<p style="color:var(--muted);font-size:12.5px">This is the entry\'s estimate, not a price, and it is not make.fun\'s. The protocol records no token in the snapshot; it does not claim the protocol has none, or that a launch will happen. Verify on the protocol\'s own page, and never pay anyone to claim for you.</p>' +
      '</div>';
    $('dlg-close').onclick = function () { dlg.close(); };
    dlg.onclose = function () { state.p = ''; writeHash(); };
    dlg.showModal();
  }

  // ---- model panel + footer -------------------------------------------------------
  $('model').innerHTML = '<h2>How the ranking works</h2>' +
    '<p>Implied value = TVL × category multiple × growth multiplier × maturity multiplier × chains multiplier. The category multiple is the market\'s own pricing: the median market-cap-to-TVL ratio of live-token protocols in the same category with TVL at or above the snapshot\'s floor (shown below), each ratio capped at 2× and shrunk toward the global median of ' + D.global_multiple + '× with a prior of 8 when the category has few comparables, and the global median when it has none. A protocol smaller than the floor cannot price a launch. Growth is the 7-day TVL change clamped to −60%…+120% and weighted by 0.5. Maturity runs 0.6× for a new protocol to 1.0× after three years. Each extra chain adds 2%, up to 10%. No protocol name is ever special-cased.</p>' +
    '<table><thead><tr><th>Category</th><th class="num">Live comparables</th><th class="num">Median mcap / TVL</th><th class="num">Multiple used</th></tr></thead><tbody>' +
    D.comparables.map(function (c) { return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.comparables + '</td><td class="num">' + (c.median_multiple === null ? '—' : c.median_multiple.toFixed(2) + '×') + '</td><td class="num">' + c.multiple_used.toFixed(2) + '×</td></tr>'; }).join('') +
    '</tbody></table>';
  $('foot').innerHTML =
    '<p><b>Method.</b> The snapshot is every protocol DefiLlama tracks, as of ' + D.as_of + ', with a floor of ' + money(D.floor_usd) + ' TVL. The watchlist is the snapshot\'s own list of protocols at or above the floor that record no token; the early rows are pre-token protocols below the floor, taken by TVL. A protocol counts as pre-token only when its entry records no market cap, no CoinGecko id and no symbol. Wrapped, staked and bridged products of tokens that trade are excluded, as are versioned pools and exchanges.</p>' +
    '<p><b>Caveats.</b> "Records no token" is what the snapshot says, not a claim about the protocol. A protocol may have launched after the snapshot date, and an implied value is the entry\'s estimate of what a launch would be worth, not a price or a promise. The farm plans are generic steps derived from each protocol\'s category, chains, TVL and age; they are not the protocol\'s own instructions. Check the protocol\'s own page before you farm anything.</p>' +
    '<p>Built for the make.fun token-radar-01 bounty. Model ' + D.model_version + '. Data: DefiLlama snapshot, ' + D.as_of + '.</p>';

  function render() {
    $('tab-board').className = state.tab === 'board' ? 'on' : '';
    $('tab-live').className = state.tab === 'live' ? 'on' : '';
    if (state.tab === 'live') renderLive(); else renderBoard();
  }
  render();
  if (state.p) openDetail(state.p);
})();
