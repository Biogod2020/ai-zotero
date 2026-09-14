/* AI Zotero — dependency-free, runtime-independent algorithms. MIT licensed. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AIZCore = api;
})(this, function () {
  'use strict';
  const SCHEMA = 1;
  const STOP = new Set('a an the of in on at to for and or with by from as is are was were be been this that these those we our their it its using use used study studies new based approach via into can not than et al paper results method'.split(' '));
  const ALIASES = [
    ['空间转录组', 'spatial transcriptomics spatial omics'], ['空间组学', 'spatial omics transcriptomics'],
    ['单细胞', 'single cell singlecell'], ['分割', 'segmentation segment'], ['细胞核', 'nuclei nucleus nuclear'],
    ['细胞', 'cell cellular'], ['病理', 'pathology histopathology histology'], ['扩散模型', 'diffusion generative'],
    ['生成模型', 'generative generation diffusion'], ['多模态', 'multimodal vision language'],
    ['多智能体', 'multiagent multi agent'], ['智能体', 'agent agentic'], ['强化学习', 'reinforcement learning'],
    ['推理', 'reasoning inference'], ['基准', 'benchmark evaluation'], ['机器人', 'robot robotics robotic'],
    ['超声', 'ultrasound ultrasonography'], ['医学影像', 'medical imaging radiology'], ['脑卒中', 'stroke'],
    ['阿尔茨海默', 'alzheimer dementia'], ['微胶质', 'microglia microglial'], ['基础模型', 'foundation model'],
    ['零样本', 'zero shot zeroshot'], ['少样本', 'few shot fewshot'], ['数据集', 'dataset data'],
    ['蒸馏', 'distillation distilled'], ['大模型', 'large language model llm'], ['评判', 'judge judging'],
    ['视觉语言', 'vision language vlm'], ['临床诊断', 'clinical diagnosis diagnostic']
  ];
  const DEFAULT_PROFILES = [
    { id: 'bio-vision', name: '生物医学视觉与生成模型', keywords: ['biomedical segmentation', 'histopathology', 'cell segmentation', 'diffusion', 'generative model', 'foundation model'], arxiv: '(all:"biomedical" OR all:"histopathology" OR all:"cell segmentation") AND (all:"diffusion" OR all:"foundation model" OR all:"generative")', epmc: '(biomedical OR histopathology OR "cell segmentation") AND (diffusion OR "foundation model" OR generative)' },
    { id: 'spatial', name: '空间组学与科学智能体', keywords: ['spatial transcriptomics', 'spatial omics', 'scientific agent', 'data curation', 'multimodal omics'], arxiv: 'all:"spatial transcriptomics" OR all:"spatial omics" OR all:"scientific agent"', epmc: '"spatial transcriptomics" OR "spatial omics" OR "scientific agent"' },
    { id: 'agents', name: '多智能体推理与 Agent RL', keywords: ['multi agent', 'multiagent', 'reasoning', 'llm judge', 'agentic', 'reinforcement learning'], arxiv: '(all:"multi-agent" OR all:"agentic" OR all:"LLM judge") AND (all:"reasoning" OR all:"reinforcement learning" OR all:"evaluation")', epmc: '("multi-agent" OR agentic OR "LLM judge") AND (reasoning OR "reinforcement learning" OR evaluation)' },
    { id: 'robotics', name: '医疗机器人与 VLM/VLA', keywords: ['robotic ultrasound', 'medical robotics', 'vision language action', 'vision language model', 'ultrasound simulation'], arxiv: 'all:"robotic ultrasound" OR all:"medical robotics" OR all:"vision language action"', epmc: '"robotic ultrasound" OR "medical robotics" OR "ultrasound simulation"' }
  ];
  const DEFAULTS = {
    schema: SCHEMA, baseURL: 'http://127.0.0.1:8000/v1', model: '', embeddingURL: '', embeddingModel: '',
    allowAI: false, allowRemoteHTTP: false, autoEnrich: false, autoOrganize: false,
    useEmbeddings: false, dailyLimit: 50, maxInputChars: 18000, timeoutSeconds: 90,
    radarEnabled: false, radarHours: 24, radarLookbackDays: 14, radarMaxPages: 3,
    radarSources: ['arxiv', 'epmc'], profiles: DEFAULT_PROFILES, openOnStartup: false, theme: 'light'
  };
  function normalize(s) {
    return String(s || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
  function tokens(s, limit = 18000) {
    const text = normalize(String(s || '').slice(0, limit));
    const out = [];
    for (const word of text.match(/[\p{Script=Han}]+|[\p{L}\p{N}]+/gu) || []) {
      if (/\p{Script=Han}/u.test(word)) {
        out.push(word);
        for (let i = 0; i < word.length - 1; i++) out.push(word.slice(i, i + 2));
      } else if (word.length > 1 && !STOP.has(word)) out.push(word);
    }
    return out;
  }
  function expandQuery(s) {
    let out = String(s || '');
    for (const [cn, en] of ALIASES) if (out.includes(cn)) out += ' ' + en;
    return out;
  }
  // A pair of independent 32-bit hashes for cache invalidation, NOT file integrity/security.
  function fingerprint(value) {
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    let a = 2166136261, b = 5381;
    for (let i = 0; i < s.length; i++) { a = Math.imul(a ^ s.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ s.charCodeAt(i); }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  }
  function doi(s) {
    s = String(s || '').trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi\s*:\s*)/i, '');
    try { s = decodeURIComponent(s); } catch (_) { /* Preserve malformed escapes, then validate. */ }
    s = s.toLowerCase().replace(/[\s.,;]+$/, '');
    return /^10\.\d{4,9}\/\S+$/.test(s) ? s : '';
  }
  function arxivID(s) {
    const m = String(s || '').match(/(?:arxiv\s*:\s*|arxiv\.org\/(?:abs|pdf)\/)((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7}))(?:v\d+)?/i);
    return m ? m[1].toLowerCase() : '';
  }
  function identity(doc) {
    const d = doi(doc.doi);
    if (d) return 'doi:' + d;
    if (doc.pmid) return 'pmid:' + doc.pmid;
    const a = arxivID(doc.url || doc.extra);
    if (a) return 'arxiv:' + a;
    return 'title:' + normalize(doc.title);
  }
  function cosine(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
    let dot = 0, aa = 0, bb = 0;
    for (let i = 0; i < a.length; i++) {
      if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return 0;
      dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2;
    }
    return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
  }
  function sparseCosine(a, b) {
    let dot = 0, aa = 0, bb = 0;
    for (const [k, v] of a) { aa += v * v; dot += v * (b.get(k) || 0); }
    for (const v of b.values()) bb += v * v;
    return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
  }
  function safeFilename(s, maxBytes = 170) {
    let name = String(s || 'untitled').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '-').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '');
    if (!name) name = 'untitled';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
    // UTF-8 byte count without requiring browser globals in the bootstrap sandbox.
    let result = '', size = 0;
    for (const ch of name) {
      const n = ch.codePointAt(0), bytes = n < 0x80 ? 1 : n < 0x800 ? 2 : n < 0x10000 ? 3 : 4;
      if (size + bytes > maxBytes) break;
      result += ch; size += bytes;
    }
    return result.replace(/[. ]+$/g, '') || 'untitled';
  }
  function attachmentName(doc, attachment) {
    const ext = String(attachment.filename || '').match(/\.([a-z0-9]{1,8})$/i)?.[1] || 'pdf';
    const prefix = safeFilename(`${doc.year || 'nd'} - ${doc.author || 'Unknown'} - ${doc.title}`, 135);
    return `${prefix} - ${safeFilename(attachment.key || String(attachment.id), 16)}.${ext.toLowerCase()}`;
  }
  function endpoint(base, route = 'chat/completions', allowHTTP = false) {
    let u; try { u = new URL(String(base || '').trim()); } catch (_) { throw new Error('API 地址无效，请填写完整的 http(s) URL。'); }
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash) throw new Error('API 地址必须是无密码、无查询参数的 http(s) URL。');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    if (u.protocol === 'http:' && !local && !allowHTTP) throw new Error('远程 HTTP 会明文传输密钥和论文。请使用 HTTPS，或显式允许远程 HTTP。');
    let path = u.pathname.replace(/\/+$/, '').replace(/\/(chat\/completions|embeddings)$/, '');
    if (!path) path = '/v1';
    u.pathname = path + '/' + route;
    return u.toString();
  }
  function providerScope(base, allowHTTP = false) {
    return endpoint(base, 'chat/completions', allowHTTP).replace(/\/chat\/completions$/, '');
  }
  function validateConfig(input) {
    const c = { ...DEFAULTS, ...input };
    endpoint(c.baseURL, 'chat/completions', c.allowRemoteHTTP);
    if (c.embeddingURL) endpoint(c.embeddingURL, 'embeddings', c.allowRemoteHTTP);
    for (const [key, lo, hi] of [['dailyLimit', 1, 10000], ['maxInputChars', 2000, 100000], ['timeoutSeconds', 10, 600], ['radarHours', 1, 168], ['radarLookbackDays', 1, 90], ['radarMaxPages', 1, 10]]) {
      c[key] = Number(c[key]);
      if (!Number.isInteger(c[key]) || c[key] < lo || c[key] > hi) throw new Error(`${key} 必须是 ${lo}–${hi} 之间的整数。`);
    }
    if (!Array.isArray(c.profiles) || c.profiles.length > 12) throw new Error('研究兴趣必须是最多 12 项的 JSON 数组。');
    const seen = new Set();
    c.profiles = c.profiles.map(p => {
      if (!p || !/^[a-z0-9-]{1,40}$/.test(p.id) || seen.has(p.id)) throw new Error('兴趣 id 必须唯一，仅含小写字母、数字和短横线。');
      seen.add(p.id);
      if (!String(p.name || '').trim() || !Array.isArray(p.keywords) || p.keywords.length > 40) throw new Error('每项兴趣需要 name 和 keywords 数组（最多 40 个）。');
      return { id: p.id, name: String(p.name).slice(0, 100), keywords: p.keywords.map(k => String(k).slice(0, 100)), arxiv: String(p.arxiv || '').slice(0, 2000), epmc: String(p.epmc || '').slice(0, 2000) };
    });
    c.radarSources = ['arxiv', 'epmc'].filter(s => (c.radarSources || []).includes(s));
    c.theme = c.theme === 'dark' ? 'dark' : 'light';
    for (const k of ['allowAI', 'allowRemoteHTTP', 'autoEnrich', 'autoOrganize', 'useEmbeddings', 'radarEnabled', 'openOnStartup']) c[k] = c[k] === true;
    c.model = String(c.model || '').trim().slice(0, 200);
    c.embeddingModel = String(c.embeddingModel || '').trim().slice(0, 200);
    delete c.apiKey; delete c.embeddingKey;
    return c;
  }
  function parseJSON(text) {
    let s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { return JSON.parse(s); } catch (_) {
      const start = s.indexOf('{'), end = s.lastIndexOf('}');
      if (start < 0 || end <= start) throw new Error('模型没有返回有效 JSON；未写入标签或分类。');
      return JSON.parse(s.slice(start, end + 1));
    }
  }
  function validateAnalysis(raw, profiles) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('AI 结果结构错误。');
    const string = (v, n = 1500) => typeof v === 'string' ? v.slice(0, n) : '';
    const list = (v, n = 12) => Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string').map(x => x.trim().slice(0, 100)).filter(Boolean))].slice(0, n) : [];
    const result = {
      summary: string(raw.summary), problem: string(raw.problem), method: string(raw.method), limitations: string(raw.limitations),
      tasks: list(raw.tasks), datasets: list(raw.datasets), tags: list(raw.tags, 8), aliases: list(raw.aliases, 24),
      topicIDs: list(raw.topicIDs, 5).filter(id => profiles.some(p => p.id === id))
    };
    if (!result.summary.trim()) throw new Error('模型没有提供 summary；未覆盖已有结果。');
    return result;
  }
  function classify(doc, profiles) {
    const text = ' ' + normalize([doc.title, doc.abstract, doc.ai?.summary, ...(doc.ai?.tags || [])].join(' ')) + ' ';
    return profiles.map(p => {
      const hits = p.keywords.filter(k => {
        const t = normalize(expandQuery(k));
        return t && (text.includes(' ' + t + ' ') || (tokens(t).length >= 2 && tokens(t).every(w => text.includes(' ' + w + ' '))));
      });
      return { id: p.id, name: p.name, hits, score: hits.length };
    }).filter(p => p.score > 0).sort((a, b) => b.score - a.score);
  }
  function parseQuery(raw) {
    const filters = {};
    const text = String(raw || '').replace(/\b(year|tag|topic):("[^"]+"|\S+)/gi, (_, k, v) => { filters[k.toLowerCase()] = normalize(v.replace(/^"|"$/g, '')); return ' '; });
    return { text: text.trim(), filters };
  }
  function matchesFilters(doc, f) {
    if (f.year && String(doc.year) !== f.year) return false;
    if (f.tag && !(doc.tags || []).concat(doc.ai?.tags || []).some(t => normalize(t).includes(f.tag))) return false;
    if (f.topic && !(doc.ai?.topicIDs || doc.topicIDs || []).some(t => normalize(t).includes(f.topic))) return false;
    return true;
  }
  function snippet(doc, words = []) {
    const text = [doc.abstract, doc.ai?.summary, doc.text].filter(Boolean).join('\n').replace(/\s+/g, ' ');
    const low = text.toLowerCase();
    let pos = -1;
    for (const w of words) { const p = low.indexOf(w.toLowerCase()); if (p >= 0 && (pos < 0 || p < pos)) pos = p; }
    const start = Math.max(0, pos - 80);
    return (start ? '…' : '') + text.slice(start, start + 320) + (text.length > start + 320 ? '…' : '');
  }
  class LocalIndex {
    constructor(docs = []) { this.docs = new Map(); this.terms = new Map(); this.postings = new Map(); this.totalLength = 0; docs.forEach(d => this.upsert(d)); }
    upsert(doc) {
      const id = String(doc.id); this.remove(id);
      const tf = new Map();
      for (const [text, weight] of [[doc.title, 5], [doc.author, 2], [doc.abstract, 2], [(doc.tags || []).join(' '), 4], [[...(doc.ai?.aliases || []), ...(doc.ai?.tags || [])].join(' '), 3], [doc.ai?.summary, 2], [doc.text, 0.35]]) {
        for (const token of tokens(text)) tf.set(token, (tf.get(token) || 0) + weight);
      }
      let length = 0;
      for (const [token, count] of tf) {
        length += count;
        if (!this.postings.has(token)) this.postings.set(token, new Map());
        this.postings.get(token).set(id, count);
      }
      this.docs.set(id, doc); this.terms.set(id, { tf, length }); this.totalLength += length;
    }
    remove(id) {
      id = String(id); const old = this.terms.get(id); if (!old) return;
      for (const t of old.tf.keys()) { const p = this.postings.get(t); p.delete(id); if (!p.size) this.postings.delete(t); }
      this.totalLength -= old.length; this.terms.delete(id); this.docs.delete(id);
    }
    search(query, { limit = 80, vector = null, vectorScope = '' } = {}) {
      const { text, filters } = parseQuery(query), words = [...new Set(tokens(expandQuery(text)))];
      const scores = new Map(), n = this.docs.size, avg = this.totalLength / Math.max(1, n);
      for (const w of words) {
        const posting = this.postings.get(w); if (!posting) continue;
        const idf = Math.log(1 + (n - posting.size + 0.5) / (posting.size + 0.5));
        for (const [id, tf] of posting) {
          if (!matchesFilters(this.docs.get(id), filters)) continue;
          const length = this.terms.get(id).length;
          scores.set(id, (scores.get(id) || 0) + idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * length / Math.max(1, avg))));
        }
      }
      if (!words.length) for (const [id, doc] of this.docs) if (matchesFilters(doc, filters)) scores.set(id, Number(doc.year) || 0);
      let ranked = [...scores].sort((a, b) => b[1] - a[1]);
      if (vector && vectorScope) {
        const semantic = [...this.docs].filter(([, d]) => d.vectorScope === vectorScope && matchesFilters(d, filters)).map(([id, d]) => [id, cosine(vector, d.vector)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
        const rrf = new Map();
        [ranked.slice(0, 500), semantic.slice(0, 500)].forEach(list => list.forEach(([id], i) => rrf.set(id, (rrf.get(id) || 0) + 1 / (60 + i + 1))));
        ranked = [...rrf].sort((a, b) => b[1] - a[1]);
      }
      return ranked.slice(0, limit).map(([id, score]) => ({ doc: this.docs.get(id), score, snippet: snippet(this.docs.get(id), words), matched: words.filter(w => this.terms.get(id).tf.has(w)).slice(0, 12) }));
    }
    nearest(doc, limit = 3, restrict = null) {
      const query = [doc.title, doc.abstract].join(' '), tf = new Map();
      for (const t of tokens(query, 7000)) tf.set(t, (tf.get(t) || 0) + 1);
      const candidates = (restrict ? [...restrict].map(id => ({ doc: this.docs.get(String(id)) })).filter(r => r.doc) : this.search(query, { limit: 60 })).filter(r => String(r.doc.id) !== String(doc.id));
      const weight = source => new Map([...source].map(([t, f]) => [t, (1 + Math.log(f)) * Math.log(1 + (this.docs.size + 1) / (1 + (this.postings.get(t)?.size || 0)))]));
      const q = weight(tf);
      return candidates.map(r => {
        const d = new Map(); for (const t of tokens([r.doc.title, r.doc.abstract].join(' '), 7000)) d.set(t, (d.get(t) || 0) + 1);
        return { doc: r.doc, similarity: sparseCosine(q, weight(d)) };
      }).filter(r => r.similarity > 0.05).sort((a, b) => b.similarity - a.similarity).slice(0, limit);
    }
  }
  function findDuplicates(docs) {
    const buckets = new Map(), pairs = new Map(), titlePostings = new Map();
    const add = (a, b, reason, confidence) => {
      if (String(a.id) === String(b.id) || a.libraryID !== b.libraryID) return;
      const key = [String(a.id), String(b.id)].sort().join('|');
      const conflicts = [];
      if (doi(a.doi) && doi(b.doi) && doi(a.doi) !== doi(b.doi)) conflicts.push('DOI 不同，可能是预印本/正式版或不同论文');
      if (a.pmid && b.pmid && a.pmid !== b.pmid) conflicts.push('PMID 不同');
      if (a.itemType && b.itemType && a.itemType !== b.itemType) conflicts.push('条目类型不同');
      const old = pairs.get(key);
      if (!old || confidence > old.confidence) pairs.set(key, { key, a: a.id, b: b.id, reason, confidence, conflicts, mergeEligible: reason === '相同 DOI' && !conflicts.length });
    };
    for (const doc of docs) {
      const identifiers = [doi(doc.doi) && ['doi', doi(doc.doi)], doc.pmid && ['pmid', doc.pmid], arxivID(doc.url) && ['arxiv', arxivID(doc.url)], normalize(doc.title).length > 20 && ['title', normalize(doc.title)]].filter(Boolean);
      for (const [kind, value] of identifiers) {
        const key = `${doc.libraryID}:${kind}:${value}`, prior = buckets.get(key) || [];
        for (const other of prior.slice(0, 1)) add(other, doc, { doi: '相同 DOI', pmid: '相同 PMID', arxiv: '相同 arXiv 编号', title: '相同规范化标题' }[kind], kind === 'title' ? 0.92 : 1);
        prior.push(doc); buckets.set(key, prior);
      }
      const words = [...new Set(tokens(doc.title))];
      for (const w of words) { if (!titlePostings.has(w)) titlePostings.set(w, []); titlePostings.get(w).push(doc); }
    }
    for (const a of docs) {
      const aw = new Set(tokens(a.title)); if (aw.size < 6) continue;
      const candidates = new Map();
      [...aw].sort((x, y) => titlePostings.get(x).length - titlePostings.get(y).length).slice(0, 3).forEach(w => {
        const p = titlePostings.get(w); if (p.length <= 150) p.forEach(b => candidates.set(String(b.id), b));
      });
      for (const b of candidates.values()) {
        if (String(a.id) >= String(b.id) || (a.year && b.year && Math.abs(Number(a.year) - Number(b.year)) > 2)) continue;
        const bw = new Set(tokens(b.title)), overlap = [...aw].filter(w => bw.has(w)).length;
        const similarity = overlap / (aw.size + bw.size - overlap);
        if (similarity >= 0.84) add(a, b, '近似标题（需人工核对）', similarity * 0.9);
      }
    }
    return [...pairs.values()].sort((a, b) => b.confidence - a.confidence);
  }
  function rankRadar(papers, profiles, index, seeds = [], now = Date.now()) {
    const seedSet = new Set(seeds.map(String));
    const saved = new Set([...index.docs.values()].map(identity));
    return papers.map(paper => {
      const topics = classify(paper, profiles), near = index.nearest(paper, 3), seedNear = seedSet.size ? index.nearest(paper, 1, seedSet) : [];
      const closeness = Math.max(near[0]?.similarity || 0, seedNear[0]?.similarity || 0);
      const age = Math.max(0, (now - Date.parse(paper.published || '')) / 86400000);
      const recency = Number.isFinite(age) ? Math.exp(-age / 14) : 0;
      const relevance = Math.min(1, topics.reduce((s, t) => s + t.score, 0) / 5);
      const score = 100 * (0.5 * relevance + 0.4 * closeness + 0.1 * recency);
      const reason = topics.length ? `命中：${topics.flatMap(t => t.hits).slice(0, 5).join('、')}` : '研究主题命中较弱，请核对';
      return { ...paper, score, topics, near: near.map(r => ({ id: r.doc.id, title: r.doc.title, similarity: r.similarity })), reason, label: closeness >= 0.42 ? '高度相近 · 待核对' : relevance >= 0.4 ? '值得参考' : '探索发现', inLibrary: saved.has(identity(paper)) };
    }).sort((a, b) => b.score - a.score);
  }
  function dateKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  function radarWindow(lastSuccess, lookback = 14, now = Date.now()) {
    const initial = now - lookback * 86400000, previous = Date.parse(lastSuccess || '');
    const since = Number.isFinite(previous) ? Math.max(now - 90 * 86400000, previous - 2 * 86400000) : initial;
    return { since: new Date(since).toISOString().slice(0, 10), until: new Date(now).toISOString().slice(0, 10) };
  }
  return { SCHEMA, DEFAULTS, DEFAULT_PROFILES, normalize, tokens, expandQuery, fingerprint, doi, arxivID, identity, cosine, safeFilename, attachmentName, endpoint, providerScope, validateConfig, parseJSON, validateAnalysis, classify, parseQuery, LocalIndex, findDuplicates, rankRadar, dateKey, radarWindow };
});
