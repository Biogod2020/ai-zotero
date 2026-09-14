/* Restartless Zotero bootstrap. Compatibility is a target, not a runtime certification. */
var AIStudio, AIStudioScope, AIStudioChrome, AIStudioWindow;
var AIStudioWindows = new Map();
function install() {}
function uninstall() {} // Never delete a user's cache, keys or library on uninstall.
async function startup({ rootURI }) {
  await Zotero.initializationPromise;
  let timers;
  try { timers = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs'); }
  catch (_) { timers = ChromeUtils.import('resource://gre/modules/Timer.jsm'); }
  const win = Zotero.getMainWindow();
  const io = typeof IOUtils !== 'undefined' ? IOUtils : win?.IOUtils;
  const paths = typeof PathUtils !== 'undefined' ? PathUtils : win?.PathUtils;
  if (!io || !paths) throw new Error('AI Zotero requires IOUtils and PathUtils in this Zotero runtime.');
  AIStudioChrome = Cc['@mozilla.org/addons/addon-manager-startup;1'].getService(Ci.amIAddonManagerStartup)
    .registerChrome(Services.io.newURI(rootURI + 'manifest.json'), [['content', 'ai-zotero', rootURI + 'content/']]);
  AIStudioScope = { URL: win.URL };
  Services.scriptloader.loadSubScript(rootURI + 'content/core.js', AIStudioScope);
  Services.scriptloader.loadSubScript(rootURI + 'content/service.js', AIStudioScope);
  let mergeItems;
  try { mergeItems = ChromeUtils.importESModule('chrome://zotero/content/mergeItems.mjs').mergeItems; }
  catch (_) { /* Zotero 7/8 compatibility uses Zotero.Items.merge. */ }
  AIStudio = AIStudioScope.AIZService({
    Zotero, IOUtils: io, PathUtils: paths, Services, ...timers, mergeItems,
    makeLogin(host, realm, username, password) {
      const login = Cc['@mozilla.org/login-manager/loginInfo;1'].createInstance(Ci.nsILoginInfo);
      login.init(host, null, realm, username, password, '', ''); return login;
    },
    domParser() {
      const w = Zotero.getMainWindow() || AIStudioWindow;
      if (!w) throw new Error('没有打开的窗口，暂时无法解析文献源。');
      return new w.DOMParser();
    },
    async saveText(name, text, owner) {
      const picker = Cc['@mozilla.org/filepicker;1'].createInstance(Ci.nsIFilePicker);
      try { picker.init(owner.browsingContext, '保存文件', Ci.nsIFilePicker.modeSave); }
      catch (_) { picker.init(owner, '保存文件', Ci.nsIFilePicker.modeSave); }
      picker.defaultString = name;
      const result = await new Promise(resolve => picker.open(resolve));
      if (result !== Ci.nsIFilePicker.returnOK && result !== Ci.nsIFilePicker.returnReplace) return false;
      await io.writeUTF8(picker.file.path, text, { tmpPath: picker.file.path + '.tmp' }); return true;
    }
  }, AIStudioScope.AIZCore);
  for (const w of Zotero.getMainWindows()) addToWindow(w);
  try {
    await AIStudio.init();
    if (AIStudio.config.openOnStartup) openStudio();
  } catch (e) {
    AIStudio.warn(AIStudio.safeError(e));
    Zotero.logError('AI Zotero initialization failed; open Research Studio for the status.');
  }
}
function openStudio(assistant = false) {
  if (!AIStudio) return;
  if (AIStudioWindow && !AIStudioWindow.closed) { AIStudioWindow.focus(); return; }
  const win = Zotero.getMainWindow(); if (!win) return;
  AIStudioWindow = win.openDialog('chrome://ai-zotero/content/workspace.xhtml', 'ai-zotero-studio',
    'chrome,centerscreen,resizable,dialog=no,width=1380,height=900',
    { studio: AIStudio, core: AIStudioScope.AIZCore, assistant });
}
function addToWindow(window) {
  if (AIStudioWindows.has(window)) return;
  const doc = window.document, nodes = [];
  const menu = doc.createXULElement('menuitem');
  menu.id = 'ai-zotero-open'; menu.setAttribute('label', 'AI Zotero · Research Studio');
  menu.setAttribute('tooltiptext', 'AI 工作台 · Ctrl/Cmd + Alt + K');
  menu.addEventListener('command', () => openStudio());
  const tools = doc.getElementById('menu_ToolsPopup');
  if (tools) { tools.appendChild(menu); nodes.push(menu); }
  const context = doc.getElementById('zotero-itemmenu');
  if (context) {
    const item = doc.createXULElement('menuitem'); item.id = 'ai-zotero-selected';
    item.setAttribute('label', '在 AI 工作台中阅读 / 整理');
    item.addEventListener('command', () => openStudio(true)); context.appendChild(item); nodes.push(item);
  }
  const listener = event => {
    if ((event.metaKey || event.ctrlKey) && event.altKey && event.key.toLowerCase() === 'k') { event.preventDefault(); openStudio(); }
  };
  window.addEventListener('keydown', listener); AIStudioWindows.set(window, { nodes, listener });
}
function onMainWindowLoad({ window }) { if (AIStudio) addToWindow(window); }
function onMainWindowUnload({ window }) { removeFromWindow(window); }
function removeFromWindow(window) {
  const entry = AIStudioWindows.get(window); if (!entry) return;
  entry.nodes.forEach(node => node.remove()); window.removeEventListener('keydown', entry.listener); AIStudioWindows.delete(window);
}
async function shutdown() {
  for (const window of AIStudioWindows.keys()) removeFromWindow(window);
  if (AIStudioWindow && !AIStudioWindow.closed) AIStudioWindow.close();
  if (AIStudio) await AIStudio.shutdown().catch(() => {});
  AIStudioChrome?.destruct(); AIStudioChrome = null;
  AIStudio = null; AIStudioScope = null; AIStudioWindow = null;
}
