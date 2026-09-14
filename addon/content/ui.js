/* Plain DOM UI: no remote scripts/fonts, no innerHTML, no executable model output. */
(function () {
  'use strict';
  const doc = document, NS = 'http://www.w3.org/1999/xhtml';
  let studio, C, app, main, viewNode, statusNode, statsNode, resultNode, conversation, imageNode, chatInput;
  let semanticActive = false, semanticQuery = '';
  let view = 'library', organizeTab = 'duplicates', query = '', pageSize = 50, selection = new Set();
  let assistantVisible = true, searchTimer, renderTimer, statusTimer, toastTimer, unsubscribe, sourceFilter = 'all', chatDraft = '';
  let chatBusy = false, images = [], messages = [], filePlans = [], fileSelection = new Set(), libraryHits = [];
  const labelMap = { library: ['文献库', '把时间留给研究，而不是整理。'], radar: ['文献雷达', '找到与你正在做的研究真正相关的新论文。'], organize: ['整理中心', '先看证据，再应用改变。'], settings: ['工作台设置', '你的模型、你的研究方向、你的数据边界。'] };
  function node(tag, attrs = {}, ...children) {
    const el = doc.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null) continue;
      if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), event => {
        try { const result = value(event); if (result?.catch) result.catch(error); } catch (e) { error(e); }
      });
      else if (key === 'class') el.className = value;
      else if (['value', 'checked', 'disabled', 'hidden'].includes(key)) el[key] = value;
      else el.setAttribute(key, String(value));
    }
    for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false) el.appendChild(typeof child === 'object' ? child : doc.createTextNode(String(child)));
    return el;
  }
  function button(text, onClick, cls = '') { return node('button', { type: 'button', class: cls, onClick }, text); }
  function hint(text) { return node('p', { class: 'hint' }, text); }
  function badge(text, cls = '') { return node('span', { class: 'tag ' + cls }, text); }
  function toast(text, isError = false) {
    doc.querySelector('.toast')?.remove(); clearTimeout(toastTimer);
    const t = node('div', { class: 'toast' + (isError ? ' error' : ''), role: isError ? 'alert' : 'status' }, text); doc.body.appendChild(t);
    toastTimer = setTimeout(() => t.remove(), isError ? 10000 : 5000);
  }
  function error(e) { toast(studio?.safeError ? studio.safeError(e) : String(e.message || e), true); }
  async function busy(el, fn) { const disabled = el.disabled; el.disabled = true; try { return await fn(); } finally { if (el.isConnected) el.disabled = disabled; } }
  function confirm(text) { return window.confirm(text); }
  function ids() { return [...selection].filter(id => studio.index.docs.has(String(id))); }
  function syncSelection() { selection = new Set(studio.selectedIDs()); renderLibraryResults(); }
  function empty(title, text) { return node('div', { class: 'empty' }, node('strong', {}, title), text); }
  function switchView(next) { view = next; pageSize = 50; buildShell(); }
  function toggleAssistant() {
    assistantVisible = !assistantVisible; const shell = doc.querySelector('.shell');
    shell.classList.toggle('no-assistant', !assistantVisible);
    if (assistantVisible) shell.appendChild(buildAssistant()); else doc.querySelector('.assistant')?.remove();
    const toggle = doc.getElementById('toggle-assistant'); if (toggle) toggle.textContent = assistantVisible ? '收起助手' : '打开助手';
  }
  function buildShell() {
    doc.documentElement.dataset.theme = studio.config.theme;
    const [title, subtitle] = labelMap[view];
    const nav = node('nav', { class: 'nav', 'aria-label': '工作台导航' },
      ...[['library', '▤', '文献库'], ['radar', '◎', '文献雷达'], ['organize', '▦', '整理中心'], ['settings', '⚙', '设置']].map(([key, symbol, text]) =>
        node('button', { type: 'button', class: view === key ? 'active' : '', 'aria-current': view === key ? 'page' : 'false', onClick: () => switchView(key) }, node('span', { class: 'nav-symbol', 'aria-hidden': 'true' }, symbol), text)));
    const sidebar = node('aside', { class: 'sidebar' },
      node('div', { class: 'brand' }, node('div', { class: 'brandmark', 'aria-hidden': 'true' }, 'a'), node('div', {}, node('strong', {}, 'AI Zotero'), node('div', { class: 'eyebrow' }, 'RESEARCH STUDIO'))),
      nav, node('div', { class: 'sidebar-note' }, node('div', { class: 'eyebrow' }, 'LOCAL FIRST'), '收录一次，持续受用。', node('br'), '普通检索不调用 API。', node('br'), '索引缓存在本机。'),
      node('div', { class: 'sidebar-bottom' }, node('span', { class: 'dot' }), 'Zotero 个人文献库', node('br'), 'Preview 0.1.0 · 本地优先', studio.demo ? node('div', { class: 'demo-label' }, '界面演示 · 非真实文献数据') : null));
    viewNode = node('section', { class: 'view', id: 'main-view', 'aria-label': title });
    statusNode = node('div', { class: 'statusbar', 'aria-live': 'polite' });
    main = node('main', { class: 'main' }, node('header', { class: 'topbar' },
      node('div', {}, node('div', { class: 'eyebrow' }, 'YOUR RESEARCH, CONNECTED'), node('h1', {}, title), node('div', { class: 'subtitle' }, subtitle)),
      node('div', { class: 'top-actions' }, node('button', { type: 'button', id: 'toggle-assistant', class: 'small', onClick: toggleAssistant }, assistantVisible ? '收起助手' : '打开助手'))), viewNode, statusNode);
    app.replaceChildren(node('div', { class: 'shell' + (assistantVisible ? '' : ' no-assistant') }, sidebar, main, assistantVisible ? buildAssistant() : null));
    if (view === 'library') buildLibrary();
    else if (view === 'radar') buildRadar();
    else if (view === 'organize') buildOrganize();
    else buildSettings();
    refreshStatus();
  }
  function refreshStatus() {
    if (!statusNode) return;
    const failed = Object.keys(studio.state.failed || {}).length;
    statusNode.replaceChildren(node('span', { class: 'status-text' }, studio.status + (failed ? ` · ${failed} 项待重试` : '')),
      node('div', { class: 'row' }, node('span', {}, `今日 AI API ${studio.state.usage.calls || 0}/${studio.config.dailyLimit}`),
        button(studio.paused ? '继续队列' : '暂停队列', () => { studio.paused = !studio.paused; if (!studio.paused) studio.startWorker(); studio.emit(); }, 'small')));
    if (statsNode) statsNode.replaceChildren(...stats());
  }
  function stats() {
    const docs = studio.docs;
    return [[docs.length.toLocaleString(), '篇文献 · 本地可搜索'], [docs.filter(d => d.ai).length.toLocaleString(), '篇已缓存 AI 索引'], [String(studio.state.seeds.length), '篇重点关注的种子文献']].map(([n, text]) => node('div', { class: 'stat' }, node('strong', {}, n), node('span', {}, text)));
  }
  function buildLibrary() {
    statsNode = node('div', { class: 'stats' }, ...stats());
    const input = node('input', { id: 'library-search', type: 'search', value: query, placeholder: '搜索概念、标题、摘要或 PDF 文本…', 'aria-label': '本地文献搜索', onInput: e => {
      query = e.target.value; semanticActive = false; pageSize = 50; clearTimeout(searchTimer); searchTimer = setTimeout(renderLibraryResults, 140);
    }, onKeydown: e => { if (e.key === 'Enter') { clearTimeout(searchTimer); renderLibraryResults(); } } });
    const semantic = button('语义检索', e => busy(e.currentTarget, async () => {
      const current = input.value.trim(); if (!current) return toast('先输入检索词。');
      const results = await studio.search(current, true, pageSize);
      if (input.value.trim() !== current) return; semanticActive = true; semanticQuery = query; libraryHits = results; showLibraryResults(results, true);
    }));
    const aiButton = button('AI 索引选中', () => {
      if (!ids().length) return toast('请先选中文献，或同步 Zotero 中的选择。');
      if (!studio.config.allowAI) return switchView('settings');
      studio.enqueue(ids(), { enrich: true }); toast(`已将 ${ids().length} 篇加入队列；已有有效缓存不会重复付费分析。`);
    }, 'primary small');
    const toolbar = node('div', { class: 'toolbar' }, node('div', { class: 'row' },
      button('同步 Zotero 选中', syncSelection, 'small'), aiButton,
      button('AI 索引全库', () => { if (!studio.config.allowAI) return switchView('settings'); const all = studio.docs.map(d => d.id); if (confirm(`将个人库已建立本地索引的 ${all.length} 篇加入 AI 队列？有效缓存会复用，新分析会调用你的 API，受每日请求上限约束。建议先选 20 篇试用。`)) { studio.enqueue(all, { enrich: true }); toast(`已加入 ${all.length} 篇；可随时暂停队列。`); } }, 'small'),
      button('分组预览', () => { organizeTab = 'groups'; switchView('organize'); }, 'small')),
      button('刷新本地索引', e => busy(e.currentTarget, async () => { const r = await studio.scanLibrary(true); toast(`已扫描 ${r.items} 篇；在本地增量更新，AI 结果按内容缓存。`); }), 'small'));
    resultNode = node('div', { id: 'library-results', 'aria-live': 'polite' });
    viewNode.append(statsNode);
    if (!studio.config.allowAI) viewNode.append(node('div', { class: 'banner' }, '本地索引已经可以使用。设置你的 API 后，可为文献一次性生成摘要、双语检索词和分类建议。默认不会向外部 AI 发送任何资料。 ', button('配置 API', () => switchView('settings'), 'small')));
    viewNode.append(node('div', { class: 'searchbar' }, input, semantic), node('div', { class: 'hint' }, '输入即本地检索；语义检索需点击按钮，同一查询缓存。支持 ', node('kbd', {}, 'year:2026'), ' ', node('kbd', {}, 'tag:segmentation'), ' ', node('kbd', {}, 'topic:spatial'), ' · ', node('kbd', {}, '⌘ / Ctrl K')),
      toolbar, resultNode);
    renderLibraryResults();
  }
  function renderLibraryResults() {
    if (view !== 'library' || !resultNode?.isConnected) return;
    if (semanticActive && semanticQuery === query) { showLibraryResults(libraryHits, true); return; }
    semanticActive = false; libraryHits = studio.index.search(query, { limit: pageSize }); showLibraryResults(libraryHits, false);
  }
  function showLibraryResults(results, semantic) {
    const counter = node('div', { class: 'section-label' },
      node('label', { class: 'row' }, node('input', { type: 'checkbox', checked: !!results.length && results.every(r => selection.has(r.doc.id)), 'aria-label': '选择当前显示文献', onChange: e => {
        results.forEach(r => e.target.checked ? selection.add(r.doc.id) : selection.delete(r.doc.id)); showLibraryResults(results, semantic);
      } }), `当前显示 ${results.length} 篇 · 已选 ${ids().length}`),
      node('div', { class: 'row' }, badge(semantic ? 'BM25 + 向量融合' : '本地 BM25 · 零 API', 'green'), button('清空选择', () => { selection.clear(); showLibraryResults(results, semantic); }, 'small ghost')));
    resultNode.replaceChildren(counter);
    if (!results.length) resultNode.append(empty(studio.ready ? '还没有匹配文献' : '正在准备工作台', studio.index.docs.size ? '换用关键词、英文术语，或先为文献建立 AI 双语索引。' : '首次使用会在本机读取个人库题录与 Zotero 可提取文本。也可以点击「刷新本地索引」。'));
    for (const result of results) resultNode.append(libraryCard(result));
    if (results.length >= pageSize) resultNode.append(button('显示更多', async () => { pageSize += 50; if (semanticActive) { libraryHits = await studio.search(query, true, pageSize); showLibraryResults(libraryHits, true); } else renderLibraryResults(); }, 'small'));
  }
  function libraryCard(result) {
    const d = result.doc;
    const checkbox = node('input', { type: 'checkbox', checked: selection.has(d.id), 'aria-label': '选择 ' + d.title, onChange: e => {
      e.target.checked ? selection.add(d.id) : selection.delete(d.id); showLibraryResults(libraryHits, semanticActive);
    } });
    return node('article', { class: 'card' + (selection.has(d.id) ? ' selected' : '') }, node('div', { class: 'card-head' }, checkbox,
      node('div', { class: 'card-body' }, buttonTitle(d.title, () => detail(d)),
        node('div', { class: 'meta' }, [d.author || d.authors?.[0], d.year, d.journal].filter(Boolean).join(' · ') || '题录信息待补充'),
        node('div', { class: 'abstract' }, result.snippet || d.ai?.summary || '尚无摘要或可提取正文。'),
        node('div', { class: 'tags' }, badge(d.ai ? 'AI 已缓存' : '本地已索引', d.ai ? 'green' : ''),
          d.vector ? badge('含向量') : null,
          studio.state.seeds.includes(d.id) ? badge('关注种子', 'green') : null,
          ...[...new Set([...(d.ai?.tags || []), ...(d.tags || []).filter(t => !t.startsWith('AI/'))])].slice(0, 4).map(t => badge(t))),
        node('div', { class: 'card-actions' }, button('打开 PDF', () => studio.openItem(d.id, true)), button('在 Zotero 中定位', () => studio.openItem(d.id)),
          button(studio.state.seeds.includes(d.id) ? '取消重点关注' : '设为关注种子', async () => { await studio.setSeed(d.id, !studio.state.seeds.includes(d.id)); renderLibraryResults(); })))));
  }
  function buttonTitle(text, onClick) { return button(text || 'Untitled', onClick, 'title-button'); }
  function detail(d) {
    const dialog = node('dialog', { 'aria-label': '文献详情' });
    dialog.append(node('header', {}, node('h2', {}, d.title), button('关闭', () => dialog.close(), 'small')),
      node('div', { class: 'meta' }, [d.author, d.year, d.journal, d.doi].filter(Boolean).join(' · ')),
      node('div', { class: 'row' }, button('打开 PDF', () => studio.openItem(d.id, true), 'primary small'), button('在 Zotero 定位', () => studio.openItem(d.id), 'small'),
        button('建立 / 更新 AI 索引', () => { if (!studio.config.allowAI) { dialog.close(); switchView('settings'); return; } studio.enqueue([d.id], { enrich: true }); toast('已排队；处理后重新打开文献卡片查看。'); }, 'small'),
        button('围绕这篇提问', () => { selection = new Set([d.id]); dialog.close(); assistantVisible = true; buildShell(); chatInput?.focus(); }, 'small')),
      node('div', { class: 'banner' }, d.textCoverage, d.textTruncated ? '。本地正文已截断；不是整篇全文覆盖。' : ''),
      detailSection('原始摘要', d.abstract || '没有摘要。'));
    if (d.ai) {
      dialog.append(detailSection('AI 速览 · 缓存结果，需核对原文', d.ai.summary), detailSection('研究问题', d.ai.problem), detailSection('方法', d.ai.method), detailSection('局限 / 缺失证据', d.ai.limitations),
        detailSection('任务与数据集', [...(d.ai.tasks || []), ...(d.ai.datasets || [])].join(' · ')),
        detailSection('双语检索词', (d.ai.aliases || []).join(' · ')));
    } else dialog.append(hint('尚未调用 AI 分析此篇。摘要、标签和本地提取文本仍可直接搜索。'));
    if (d.text) dialog.append(node('details', {}, node('summary', {}, '查看本地提取文本（预览前 12,000 字符）'), node('div', { class: 'detail-text' }, d.text.slice(0, 12000))));
    dialog.addEventListener('close', () => dialog.remove(), { once: true }); doc.body.appendChild(dialog); dialog.showModal();
  }
  function detailSection(title, text) { return node('section', { class: 'detail-section' }, node('h3', {}, title), node('div', { class: 'detail-text' }, text || '证据不足 / 未提供')); }
  function buildRadar() {
    statsNode = null;
    const sources = node('div', { class: 'source-status' });
    for (const source of studio.config.radarSources) {
      const s = studio.state.radar.sources[source] || {};
      sources.append(node('div', { class: 'card' }, node('strong', {}, source === 'arxiv' ? 'arXiv' : 'Europe PMC / PubMed'), node('br'),
        s.lastFetched ? `最近抓取：${new Date(s.lastFetched).toLocaleString()}` : '尚未抓取', node('br'),
        s.range ? `查询区间：${s.range.since} — ${s.range.until}` : '按兴趣增量检索，保留两天重叠窗口', node('br'),
        s.error ? node('span', { class: 'demo-label' }, s.error) : `最近返回 ${s.fetched || 0} / ${s.total || 0} 篇`,
        s.truncated ? node('div', { class: 'demo-label' }, '结果已截断，尚未完整覆盖；请缩窄兴趣或提高分页上限。') : null));
    }
    const refresh = button(studio.radarBusy ? '正在更新…' : '立即更新雷达', e => busy(e.currentTarget, async () => {
      if (!studio.config.radarEnabled) return switchView('settings'); await studio.refreshRadar(); buildShell();
    }), 'primary'); refresh.disabled = studio.radarBusy;
    const rows = studio.radar();
    let shown = rows.filter(p => sourceFilter === 'all' || sourceFilter === 'similar' && p.label.startsWith('高度') || sourceFilter === 'useful' && p.label === '值得参考' || sourceFilter === 'unsaved' && !p.inLibrary).slice(0, pageSize);
    viewNode.append(node('div', { class: 'toolbar' }, node('div', { class: 'row' }, refresh, button('编辑研究兴趣', () => switchView('settings'))), badge('本地排序 · 不等于相关概率', 'green')), sources,
      node('div', { class: 'banner' }, '雷达根据兴趣关键词、与库内文献的文本相似度以及时间排序。关注种子会额外参与匹配。「高度相近」不是已证实的竞争关系；逐篇 AI 解释可选且会缓存。Zotero 关闭时不运行。'),
      node('div', { class: 'tabbar' }, ...[['all', '全部'], ['similar', '高度相近'], ['useful', '值得参考'], ['unsaved', '尚未入库']].map(([value, label]) => button(label, () => { sourceFilter = value; pageSize = 50; buildShell(); }, sourceFilter === value ? 'active' : ''))),
      node('div', { class: 'section-label' }, `缓存 ${rows.length} 篇 · 当前显示 ${shown.length} 篇`));
    if (!shown.length) viewNode.append(empty('让值得读的论文主动出现', studio.config.radarEnabled ? '点击「立即更新雷达」，或等待 Zotero 运行期间的定时更新。也可能当前过滤条件下没有结果；请查看来源状态。' : '到设置中确认研究兴趣并启用雷达。查询将发送到公开文献源，不需要 AI API。'));
    for (const paper of shown) viewNode.append(radarCard(paper));
    if (shown.length >= pageSize) viewNode.append(button('显示更多', () => { pageSize += 50; buildShell(); }, 'small'));
  }
  function radarCard(p) {
    const details = button('展开摘要', () => {
      const dialog = node('dialog', { 'aria-label': '雷达文献详情' }, node('header', {}, node('h2', {}, p.title), button('关闭', e => e.currentTarget.closest('dialog').close(), 'small')),
        detailSection('原始摘要', p.abstract), detailSection('匹配依据', p.reason), p.ai ? detailSection('AI 解释（仅依据题录与摘要）', p.ai) : null);
      dialog.addEventListener('close', () => dialog.remove(), { once: true }); doc.body.appendChild(dialog); dialog.showModal();
    }, 'small');
    return node('article', { class: 'card' },
      node('div', { class: 'card-head' }, node('div', { class: 'card-body' }, node('div', { class: 'tags' }, badge(p.label, p.label.startsWith('高度') ? 'green' : ''), p.inLibrary ? badge('已在文献库') : null),
        buttonTitle(p.title, () => studio.openURL(p.url)), node('div', { class: 'meta' }, [p.published, p.journal || p.source, p.authors?.[0]].filter(Boolean).join(' · '))),
        node('div', { class: 'score', title: '本地启发式排序分，非概率' }, String(Math.round(p.score)), node('div', { class: 'tiny muted' }, '排序分'))),
      node('div', { class: 'abstract' }, p.abstract ? p.abstract.slice(0, 320) + (p.abstract.length > 320 ? '…' : '') : '来源未提供摘要；相关性证据较弱。'),
      node('div', { class: 'hint' }, p.reason),
      p.near.length ? node('div', { class: 'nearest' }, '与你的文献相近：', button(p.near[0].title, () => detail(studio.index.docs.get(String(p.near[0].id))), 'small ghost')) : null,
      p.ai ? node('div', { class: 'nearest' }, node('strong', {}, 'AI 解释 · 已缓存'), node('br'), p.ai) : null,
      node('div', { class: 'card-actions' }, button('查看来源', () => studio.openURL(p.url)), details,
        button(p.ai ? '读取缓存解释' : 'AI 解释相关性', e => busy(e.currentTarget, async () => { if (!studio.config.allowAI) return switchView('settings'); await studio.explainRadar([p.id]); buildShell(); })),
        button(p.inLibrary ? '定位已有条目' : '加入 Zotero', e => busy(e.currentTarget, async () => {
          if (!p.inLibrary && !confirm(`将以下题录与摘要加入 Zotero 个人库？不会自动下载 PDF。\n\n${p.title}`)) return;
          const result = await studio.importPaper(p.id); toast(result.existed ? '已存在，未重复导入。' : '已导入题录与摘要，正在建立本地索引。'); if (result.existed) await studio.openItem(result.id); buildShell();
        }))));
  }
  function buildOrganize() {
    statsNode = null;
    viewNode.append(node('div', { class: 'tabbar' }, ...[['duplicates', '重复文献'], ['groups', '分组建议'], ['files', '附件管理'], ['history', '操作记录']].map(([key, title]) => button(title, () => { organizeTab = key; buildShell(); }, organizeTab === key ? 'active' : ''))));
    if (organizeTab === 'duplicates') buildDuplicates();
    else if (organizeTab === 'groups') buildGroups();
    else if (organizeTab === 'files') buildFiles();
    else buildHistory();
  }
  function buildDuplicates() {
    const pairs = studio.getDuplicates();
    viewNode.append(node('div', { class: 'banner' }, '自动比对 DOI、PMID、arXiv 编号、规范化标题和近似标题。不同 DOI 的预印本/正式版只提示，不自动合并。合并会改变题录关系，先备份整个 Zotero 数据目录。'),
      node('div', { class: 'section-label' }, `发现 ${pairs.length} 组候选 · 以下并非自动判定为同一论文`));
    if (!pairs.length) viewNode.append(empty('没有发现重复候选', '新文献完成本地索引后，重复检测会同步更新。无需调用 AI。'));
    for (const pair of pairs.slice(0, 150)) {
      const a = studio.index.docs.get(String(pair.a)), b = studio.index.docs.get(String(pair.b)); if (!a || !b) continue;
      const select = node('select', { 'aria-label': '选择保留的主记录' }, node('option', { value: '' }, '请选择要保留的主记录'), node('option', { value: a.id }, '保留 A 的题录字段'), node('option', { value: b.id }, '保留 B 的题录字段'));
      const merge = button('确认合并', e => busy(e.currentTarget, async () => {
        const master = select.value; if (!master) return toast('先选择需要保留的主记录。');
        if (!confirm(`此操作不能通过插件恢复原始合并关系。\n\n${pair.reason}\n主记录字段采用 ${master === a.id ? 'A' : 'B'}，附件和关系由 Zotero 原生合并处理。请确认已经备份，并且确为同一论文。\n\n继续合并？`)) return;
        await studio.mergeExact(master, master === a.id ? b.id : a.id); buildShell();
      }), 'danger small');
      merge.disabled = !pair.mergeEligible;
      viewNode.append(node('article', { class: 'card' }, badge(pair.reason, pair.conflicts.length ? 'warning' : 'green'),
        node('div', { class: 'meta' }, `A · ${a.year || '无年份'} · ${a.attachments.length} 个附件 · ${a.doi || '无 DOI'}`), buttonTitle(a.title, () => detail(a)),
        node('div', { class: 'meta' }, `B · ${b.year || '无年份'} · ${b.attachments.length} 个附件 · ${b.doi || '无 DOI'}`), buttonTitle(b.title, () => detail(b)),
        pair.conflicts.length ? node('div', { class: 'banner warning' }, pair.conflicts.join('；')) : null,
        node('div', { class: 'card-actions' }, button('核对 A', () => studio.openItem(a.id)), button('核对 B', () => studio.openItem(b.id)), pair.mergeEligible ? select : hint('仅相同类型、相同 DOI 且无已知标识冲突的候选提供插件内合并。'), merge)));
    }
    if (pairs.length > 150) viewNode.append(hint('当前仅展示前 150 组；处理后会显示后续候选。'));
  }
  function buildGroups() {
    const chosen = ids(), scope = chosen.length ? chosen : studio.docs.map(d => d.id), plans = studio.organizationPlan(scope);
    viewNode.append(node('div', { class: 'banner' }, `预览范围：${chosen.length ? '已选中的 ' + chosen.length : '个人库全部 ' + scope.length} 篇。仅在 AI Zotero 集合下添加分类，以及添加 AI/ 前缀标签。已有人工标签与集合不会移除。`),
      node('div', { class: 'toolbar' }, node('span', { class: 'hint' }, `${plans.length} 篇有分组建议；无匹配的文献不强行分类。`),
        button(`应用 ${plans.length} 篇的建议`, e => busy(e.currentTarget, async () => {
          if (!plans.length) return;
          if (!confirm(`将为 ${plans.length} 篇文献添加预览中的标签和集合。不会移动、删除 PDF，也不会移除现有人工分类。继续？`)) return;
          const count = await studio.organize(plans.map(p => p.id)); toast(`已添加 ${count} 篇的标签/分组。操作记录中可逐条撤销。`); buildShell();
        }), 'primary')));
    if (!plans.length) viewNode.append(empty('暂无分组建议', '在设置中补充兴趣关键词，或为文献建立 AI 索引。优先选择一小批文献检查分类质量。'));
    for (const p of plans.slice(0, 150)) viewNode.append(node('article', { class: 'card' }, node('h3', {}, p.title),
      node('div', { class: 'tags' }, badge(p.source), ...p.topics.map(t => badge('AI Zotero / ' + t, 'green')), ...p.tags.map(t => badge(t)))));
    if (plans.length > 150) viewNode.append(hint(`展示前 150 条；应用按钮将处理预览范围中全部 ${plans.length} 条建议。`));
  }
  function buildFiles() {
    const list = node('div');
    const render = () => {
      const renames = filePlans.filter(p => p.action === 'rename'), missing = filePlans.filter(p => p.action === 'missing').length;
      list.replaceChildren(node('div', { class: 'section-label' }, `${filePlans.length} 个附件 · ${renames.length} 个建议改名 · ${missing} 个缺失 · 已选 ${fileSelection.size}`));
      if (!filePlans.length) list.append(empty('附件保持一个可信来源', '点击「扫描附件」检查路径、缺失文件与命名。不会先移动文件再补链接。'));
      for (const p of filePlans.slice(0, 150)) {
        const check = node('input', { type: 'checkbox', checked: fileSelection.has(p.id), disabled: p.action !== 'rename', 'aria-label': '选择重命名 ' + p.filename, onChange: e => { e.target.checked ? fileSelection.add(p.id) : fileSelection.delete(p.id); render(); } });
        list.append(node('article', { class: 'card file-row' }, node('div', { class: 'row' }, check,
          badge({ missing: '文件缺失', linked: '外链文件', rename: '可统一命名', ok: '已规范 / 无需更改' }[p.action], p.action === 'missing' ? 'warning' : ''), node('strong', {}, p.title)),
          node('div', { class: 'file-name' }, p.filename), p.action === 'rename' ? node('div', { class: 'file-name' }, '→ ' + p.after) : null,
          node('div', { class: 'tiny muted' }, p.path || '未找到文件路径'),
          p.action === 'linked' ? node('div', { class: 'card-actions' }, button('复制进 Zotero 管理存储', e => busy(e.currentTarget, async () => {
            if (!confirm(`将该外链附件转换为 Zotero 管理附件。磁盘原始文件保留，但原外链条目会由 Zotero 替换，附件 key 可能改变；插件不能撤销此转换。请先备份并核对批注。\n\n${p.filename}\n\n继续？`)) return;
            await studio.convertLinked(p.id); filePlans = []; toast('转换完成；原始磁盘文件保留。稍后重新扫描，检查附件和批注。'); render();
          }))) : null));
      }
      if (filePlans.length > 150) list.append(hint('列表仅显示前 150 个附件。导出清单包含全部附件；改名只执行已勾选的项目。'));
    };
    viewNode.append(node('div', { class: 'banner' }, '统一文件管理以 Zotero 管理存储为准，而不是将 PDF 平铺到额外目录。重命名保留附件身份并拒绝覆盖。扫描件不会自动 OCR；缺失附件不会伪装成已修复。'),
      node('div', { class: 'toolbar' }, node('div', { class: 'row' },
        button('扫描附件', e => busy(e.currentTarget, async () => { filePlans = await studio.filePlan(); fileSelection.clear(); render(); }), 'primary'),
        button('勾选当前显示的可改名附件', () => { filePlans.slice(0, 150).filter(p => p.action === 'rename').forEach(p => fileSelection.add(p.id)); render(); }, 'small')),
        node('div', { class: 'row' }, button('执行勾选重命名', e => busy(e.currentTarget, async () => {
          const plans = filePlans.filter(p => fileSelection.has(p.id)); if (!plans.length) return toast('先扫描并勾选要改名的附件。');
          if (!confirm(`执行已预览的 ${plans.length} 个附件重命名？不会覆盖同名目标，可在操作记录中逐个撤销。`)) return;
          const r = await studio.renameFiles(plans); toast(`${r.count} 个改名成功，${r.failures.length} 个未完成。`, !!r.failures.length);
          filePlans = await studio.filePlan(); fileSelection.clear(); render();
        }), 'small'), button('导出文件清单', async () => {
          if (!filePlans.length) return toast('先扫描附件。');
          const escape = value => { let s = String(value ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
          const rows = [['title', 'attachmentID', 'filename', 'path', 'exists', 'action', 'suggestedName'], ...filePlans.map(p => [p.title, p.id, p.filename, p.path, p.exists, p.action, p.after])];
          const saved = await studio.exportText('ai-zotero-files.csv', '\uFEFF' + rows.map(r => r.map(escape).join(',')).join('\r\n'), window); if (saved) toast('附件清单已导出（包含本地路径，请谨慎分享）。');
        }, 'small'))), list); render();
  }
  function buildHistory() {
    const rows = [...studio.state.journal].reverse().slice(0, 60);
    viewNode.append(node('div', { class: 'banner' }, '「撤销」仅覆盖本插件添加的标签/集合，以及未被其他操作改变的文件名；每次撤销一个条目/附件。手工后续添加的其他标签不会被覆盖。合并与外链转管理附件不支持插件撤销。'),
      node('div', { class: 'toolbar' }, button('撤销最近一次可逆操作', e => busy(e.currentTarget, async () => {
        if (!confirm('撤销最近一个条目或附件上的可逆操作？开启自动分组时，该条目会退出自动分组，避免立即被重新添加。')) return;
        await studio.undoLast(); buildShell();
      }), 'primary'), button('重试失败索引', () => { const failed = Object.keys(studio.state.failed); studio.enqueue(failed, { enrich: true }); toast(`已重新排队 ${failed.length} 篇。`); }, 'small')));
    for (const [id, info] of Object.entries(studio.state.failed || {})) viewNode.append(node('div', { class: 'banner warning' }, `条目 ${id}：${info.message}`));
    for (const warning of studio.warnings) viewNode.append(node('div', { class: 'banner warning' }, warning));
    if (!rows.length) viewNode.append(empty('暂无写入记录', '普通搜索和 AI 问答不会修改你的题录或文件。'));
    for (const r of rows) viewNode.append(node('article', { class: 'card' }, node('div', { class: 'row' }, badge({ organize: '标签 / 分组', rename: '重命名', convert: '转管理附件', merge: '合并文献' }[r.type] || r.type), badge({ done: '已完成', undone: '已撤销', prepared: '待核对：可能中断', failed: '失败 / 需核对' }[r.status] || r.status)),
      node('div', { class: 'meta' }, new Date(r.at).toLocaleString()), node('div', { class: 'hint' }, r.type === 'rename' ? `${r.payload.before} → ${r.payload.after}` : r.type === 'organize' ? `条目 ${r.payload.id} · 添加 ${(r.payload.tags || []).length} 个标签和 ${(r.payload.collections || []).length} 个集合` : '此操作不提供插件内撤销，请核对 Zotero 原始记录。')));
  }
  function buildSettings() {
    statsNode = null;
    const cfg = studio.configSnapshot(), fields = {};
    function field(key, label, help = '', type = 'text', wide = false) {
      const input = node('input', { type, value: cfg[key] ?? '', id: 'setting-' + key, autocomplete: type === 'password' ? 'new-password' : 'off' }); fields[key] = input;
      return node('label', { class: 'field' + (wide ? ' wide' : ''), for: input.id }, label, input, help ? node('small', {}, help) : null);
    }
    function check(key, label) {
      const input = node('input', { type: 'checkbox', checked: cfg[key] === true, id: 'setting-' + key }); fields[key] = input;
      return node('label', { class: 'check', for: input.id }, input, node('span', {}, label));
    }
    const mainAPI = node('section', { class: 'settings-section' }, node('h2', {}, '连接你自己的模型'),
      hint('采用 Chat Completions 的 OpenAI-compatible 接口。支持 localhost、任意端口、自定义路径和直接填写 /chat/completions 完整地址；没有硬编码模型名单。'),
      node('div', { class: 'form-grid' }, field('baseURL', 'API Base URL', '例：http://127.0.0.1:8000/v1 或 https://your-provider.example/api/v1', 'url', true),
        field('model', 'Chat / 多模态模型名', '填写服务实际支持的模型 ID。图像能力取决于所选模型。'), field('apiKey', 'API Key', '留空保留该端点已存密钥；切换端点不会复用其他端点的密钥。', 'password')),
      check('allowAI', '允许将题录、有限正文片段、研究兴趣和显式选择的图片发送到上述 AI 服务。默认关闭。'),
      check('allowRemoteHTTP', '允许非本机的明文 HTTP（不推荐；API 密钥及内容可能被截获）。'),
      node('div', { class: 'row' }, button('保存后测试连接', e => busy(e.currentTarget, async () => { if (await save()) toast('模型回复：' + (await studio.testConnection()).slice(0, 200)); }), 'small'),
        button('删除当前端点密钥', async () => { if (!confirm('删除已保存设置中的 Chat 端点密钥？尚未保存的新地址不受影响。')) return; await studio.setKey(studio.config.baseURL, ''); toast('该端点密钥已删除。'); }, 'small danger')));
    const embedding = node('section', { class: 'settings-section' }, node('h2', {}, '语义检索 · 可选'),
      check('useEmbeddings', '建立文献向量；每篇首次额外调用一次 embedding。普通检索仍在本地执行。'),
      node('div', { class: 'form-grid' }, field('embeddingURL', 'Embedding Base URL', '留空使用 Chat 地址；独立地址可有独立密钥。', 'url', true), field('embeddingModel', 'Embedding 模型名'), field('embeddingKey', 'Embedding API Key', '留空保留该端点的密钥；同一端点与 Chat 共享凭据。', 'password')),
      hint('点击「语义检索」时，仅对新查询调用一次 embedding；最近 200 条查询按模型和端点隔离缓存。更换向量模型后需要重新为文献建立索引，旧向量不会混用。'));
    const auto = node('section', { class: 'settings-section' }, node('h2', {}, '初次处理与成本控制'),
      check('autoEnrich', '新收录或内容变化时，自动生成摘要、任务/数据集标签和中英双语检索词。'),
      check('autoOrganize', '本地索引完成后自动添加建议分组和 AI/ 标签；从不自动合并文献、搬移或删除文件。'),
      node('div', { class: 'form-grid' }, field('dailyLimit', '每日 API 请求上限', '失败重试也计入上限；文献队列超额后延至后续日期。不是金额或 token 上限。', 'number'),
        field('maxInputChars', '单篇 AI 输入字符上限', '截断的输入不等于读完整篇论文。', 'number'), field('timeoutSeconds', '单次 API 超时（秒）', '', 'number')),
      hint('新文献先建立不付费的本地索引，AI 服务失败不会阻断本地搜索。缓存以正文内容、模型、端点、兴趣配置和提示版本共同判定是否失效。'));
    const profileArea = node('textarea', { class: 'code-input', id: 'setting-profiles', 'aria-label': '研究兴趣 JSON', spellcheck: 'false' }, JSON.stringify(cfg.profiles, null, 2));
    const sourceInputs = {};
    const radar = node('section', { class: 'settings-section' }, node('h2', {}, '个性化文献雷达'),
      check('radarEnabled', '启用定时雷达；研究兴趣检索式将发送到选中的公开文献源。无需 AI API。'),
      node('div', { class: 'row' }, ...[['arxiv', 'arXiv'], ['epmc', 'Europe PMC / PubMed']].map(([key, title]) => {
        const input = node('input', { type: 'checkbox', checked: cfg.radarSources.includes(key) }); sourceInputs[key] = input; return node('label', { class: 'check' }, input, title);
      })),
      node('div', { class: 'form-grid' }, field('radarHours', '更新间隔（小时）', '默认每日；最短 1 小时。仅 Zotero 运行时执行，重新打开后补查。', 'number'),
        field('radarLookbackDays', '首次检索回溯（天）', '后续按来源增量更新，含两天重叠窗口。', 'number'), field('radarMaxPages', '每来源每轮分页上限', '每页最多 100 篇。达到上限会明确提示，不声称完整覆盖。', 'number')),
      node('details', { open: 'open' }, node('summary', {}, '研究兴趣与检索式（可编辑 JSON）'),
        hint('已预置生物医学视觉、空间组学、多智能体和医疗机器人方向。keywords 用于本地排序；arxiv 与 epmc 分别使用各来源检索语法。可删除不关注的方向。'), profileArea,
        button('恢复研究方向预设', () => { if (confirm('用预设兴趣替换当前编辑框？保存前不会改变已存设置。')) profileArea.value = JSON.stringify(C.DEFAULT_PROFILES, null, 2); }, 'small')));
    const theme = node('select', { id: 'setting-theme', 'aria-label': '主题' }, node('option', { value: 'light' }, '浅色 · Sage'), node('option', { value: 'dark' }, '深色 · Forest')); theme.value = cfg.theme;
    const presentation = node('section', { class: 'settings-section' }, node('h2', {}, '工作台与数据'), node('label', { class: 'field' }, '界面主题', theme),
      check('openOnStartup', '启动 Zotero 后自动打开 AI 工作台；原生 Zotero 窗口和功能仍保留。'),
      hint('索引、雷达缓存与操作记录位于 Zotero 数据目录下的 ai-zotero 子目录，不写入 zotero.sqlite。密钥使用 Zotero/Mozilla 登录管理器，不写入配置 JSON。缓存不受 Zotero 附件同步保证；备份整个数据目录。'),
      hint('首版只处理个人库，不对共享群组库写入。图像通过助手显式上传；不会自动把每篇 PDF 渲染成图片并发送。AI 输出和相似度只供辅助判断。'));
    async function save() {
      if (!studio.ready) throw new Error('尚未初始化完成；请先解决状态栏中的索引错误，避免覆盖旧缓存。');
      const input = { ...cfg };
      for (const [key, field] of Object.entries(fields)) if (!['apiKey', 'embeddingKey'].includes(key)) input[key] = field.type === 'checkbox' ? field.checked : field.type === 'number' ? Number(field.value) : field.value.trim();
      try { input.profiles = JSON.parse(profileArea.value); } catch (_) { throw new Error('JSON 语法错误：请检查研究兴趣数组中的引号和逗号。'); }
      input.theme = theme.value; input.radarSources = Object.keys(sourceInputs).filter(s => sourceInputs[s].checked);
      const valid = C.validateConfig(input);
      if (valid.allowAI && (!cfg.allowAI || cfg.baseURL !== valid.baseURL) && !confirm(`确认允许向此 AI 端点发送所需题录、有限正文片段、兴趣与显式选择的图片？\n\n${valid.baseURL}\n\n请确认你信任该服务并有权处理相关论文。`)) return false;
      if (valid.autoOrganize && !cfg.autoOrganize && !confirm('开启自动分组后，新索引会在个人库中添加 AI 标签与集合。不会移除人工分类。建议先用少量文献验证建议质量。继续？')) return false;
      await studio.saveSettings(valid, { apiKey: fields.apiKey.value.trim(), embeddingKey: fields.embeddingKey.value.trim() });
      fields.apiKey.value = ''; fields.embeddingKey.value = ''; Object.assign(cfg, valid); doc.documentElement.dataset.theme = valid.theme;
      toast('设置已保存。可回到文献库选择少量文献建立 AI 索引。'); return true;
    }
    viewNode.append(mainAPI, embedding, auto, radar, presentation,
      node('div', { class: 'row' }, button('保存设置', e => busy(e.currentTarget, save), 'primary'), button('返回文献库', () => switchView('library'))));
  }
  function buildAssistant() {
    conversation = node('div', { class: 'conversation', 'aria-label': '助手对话', 'aria-live': 'polite' });
    imageNode = node('div', { class: 'images' });
    chatInput = node('textarea', { id: 'assistant-question', placeholder: '询问已选文献，或上传论文图像…', value: chatDraft, onInput: e => { chatDraft = e.target.value; }, 'aria-label': '助手问题', onKeydown: e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); sendMessage(); }
    }, onPaste: e => {
      const files = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile());
      if (files.length) { e.preventDefault(); addImages(files); }
    } });
    const picker = node('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: 'multiple', class: 'hidden', 'aria-label': '选择图片', onChange: async e => { await addImages([...e.target.files]); e.target.value = ''; } });
    const send = button(chatBusy ? '正在思考…' : '发送', sendMessage, 'primary'); send.id = 'assistant-send'; send.disabled = chatBusy;
    const panel = node('aside', { class: 'assistant', 'aria-label': '多模态文献助手', onDragover: e => e.preventDefault(), onDrop: async e => { e.preventDefault(); await addImages([...e.dataTransfer.files]); } },
      node('header', { class: 'assistant-head' }, node('div', { class: 'row' }, node('h2', {}, '研究助手'), button('×', toggleAssistant, 'small ghost')),
        node('div', { class: 'subtitle' }, '先检索你的资料，再回答你的问题。'), node('div', { class: 'row' }, badge('支持图像', 'green'), badge('回答不执行文件操作'))),
      conversation,
      node('div', { class: 'composer' }, imageNode, chatInput, picker,
        node('div', { class: 'composer-actions' }, button('＋ 添加图片', () => picker.click(), 'small'), send),
        node('div', { class: 'composer-info' }, '拖入或粘贴 PNG/JPEG/WebP · 最多 2 张，每张 8 MB', node('br'), '优先引用已选文献；最多检索 6 篇。⌘ / Ctrl Enter 发送。')));
    renderConversation(); renderImages(); return panel;
  }
  function renderConversation() {
    if (!conversation) return;
    conversation.replaceChildren();
    if (!messages.length) conversation.append(node('div', { class: 'assistant-welcome' }, node('h3', {}, '从理解一篇论文开始。'),
      '选择一篇或几篇文献，围绕研究问题、方法和可复用实验展开讨论。',
      button('这几篇论文的方法有什么关键差异？', () => { chatInput.value = '这几篇论文的方法有什么关键差异？请引用证据并指出信息缺口。'; chatInput.focus(); }, 'suggestion'),
      button('哪些工作最值得作为我的 baseline？', () => { chatInput.value = '根据已选文献，哪些工作最值得作为 baseline？请说明任务匹配、比较前提和未知信息。'; chatInput.focus(); }, 'suggestion'),
      node('p', { class: 'tiny' }, '模型只会看到所需题录、文本片段和本次图片，不会获得整个文献库的执行权限。')));
    for (const m of messages) conversation.append(node('div', { class: 'message ' + m.role }, node('div', { class: 'role' }, m.role === 'user' ? 'YOU' : 'RESEARCH ASSISTANT'),
      m.content, m.imageCount ? node('div', { class: 'tiny muted' }, `本条含 ${m.imageCount} 张图片`) : null,
      m.references?.length ? node('div', { class: 'refs' }, ...m.references.map(r => button(`[${r.ref}] ${r.title}`, () => studio.openItem(r.id), 'small'))) : null));
    if (chatBusy) conversation.append(node('div', { class: 'message', role: 'status' }, '正在检索已缓存材料并等待模型回复…'));
    conversation.scrollTop = conversation.scrollHeight;
  }
  async function addImages(files) {
    for (const file of files) {
      if (images.length >= 2) throw new Error('图片最多两张；请先移除已有图片。');
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('图片仅支持 PNG/JPEG/WebP，每张不超过 8 MB。');
      const url = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('图片读取失败。')); reader.readAsDataURL(file); });
      images.push({ url, name: file.name });
    }
    renderImages();
  }
  function renderImages() {
    imageNode?.replaceChildren(...images.map((image, i) => node('div', { class: 'image-preview' }, node('img', { src: image.url, alt: image.name || '待发送图片' }), button('×', () => { images.splice(i, 1); renderImages(); }, 'small'))));
  }
  async function sendMessage() {
    if (chatBusy || !chatInput) return;
    const question = chatInput.value.trim(); if (!question) return;
    if (!studio.config.allowAI) { toast('先设置 API 并确认允许发送所需材料。'); switchView('settings'); return; }
    const previous = messages.slice(-6), attached = images.map(i => i.url);
    messages.push({ role: 'user', content: question, imageCount: attached.length }); chatInput.value = ''; chatDraft = ''; images = []; renderImages();
    chatBusy = true; const send = doc.getElementById('assistant-send'); if (send) { send.disabled = true; send.textContent = '正在思考…'; } renderConversation();
    try {
      const result = await studio.assistant(question, { ids: ids(), images: attached, history: previous });
      messages.push({ role: 'assistant', content: result.answer, references: result.references }); messages = messages.slice(-30);
    } catch (e) { messages.push({ role: 'assistant', content: studio.safeError(e) + '\n本次图片不会自动重复发送；重试时请重新附加。' }); }
    finally { chatBusy = false; const current = doc.getElementById('assistant-send'); if (current) { current.disabled = false; current.textContent = '发送'; } renderConversation(); refreshStatus(); }
  }
  function init() {
    const args = window.arguments?.[0] || window.__AI_ZOTERO_DEMO__;
    app = doc.getElementById('app');
    if (!args?.studio || !args?.core) { app.replaceChildren(empty('请从 Zotero 中打开工作台', '使用工具菜单「AI Zotero · Research Studio」，或 Ctrl/Cmd + Alt + K。')); return; }
    studio = args.studio; C = args.core; selection = new Set(studio.selectedIDs());
    buildShell();
    unsubscribe = studio.subscribe(() => {
      if (!statusTimer) statusTimer = setTimeout(() => { statusTimer = null; refreshStatus(); }, 200);
      if (view === 'library') { clearTimeout(renderTimer); renderTimer = setTimeout(renderLibraryResults, 350); }
    });
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !e.altKey) {
        e.preventDefault(); if (view !== 'library') switchView('library'); doc.getElementById('library-search')?.focus();
      }
    });
    window.addEventListener('unload', () => { unsubscribe?.(); clearTimeout(searchTimer); clearTimeout(renderTimer); clearTimeout(toastTimer); clearTimeout(statusTimer); }, { once: true });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
