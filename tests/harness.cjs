'use strict';
const C = require('../addon/content/core.js');
const factory = require('../addon/content/service.js');
const path = require('node:path').posix;
function harness() {
  const files = new Map(), items = new Map(), collections = new Map(), logins = [], calls = [];
  let nextID = 1000, version = 1;
  const response = { status: 200, responseText: JSON.stringify({ choices: [{ message: { content: JSON.stringify({summary:'可测试的中文摘要', tags:['segmentation'], aliases:['细胞分割'], topicIDs:['bio-vision']}) } }], usage: { total_tokens: 12 } }) };
  class Item {
    constructor(type='journalArticle') { this.id=nextID++; this.key='KEY'+this.id; this.itemTypeID=type; this.libraryID=1; this.fields={}; this.creators=[]; this.tags=[]; this.collections=[]; this.children=[]; this.dateModified=String(version++); items.set(this.id,this); }
    getField(k) { return this.fields[k] || ''; }
    setField(k,v) { this.fields[k]=v; }
    setCreators(v) { this.creators=v; }
    getCreators() { return this.creators; }
    getAttachments() { return [...this.children]; }
    isRegularItem() { return this.itemTypeID !== 'attachment'; }
    isEditable() { return this.libraryID === 1; }
    getTags() { return this.tags.map(t=>({...t})); }
    hasTag(t) { return this.tags.some(x=>x.tag===t); }
    addTag(tag,type=0) { if(!this.hasTag(tag))this.tags.push({tag,type}); }
    removeTag(t) { this.tags=this.tags.filter(x=>x.tag!==t); }
    inCollection(id) { return this.collections.includes(id); }
    addToCollection(id) { if(!this.inCollection(id))this.collections.push(id); }
    removeFromCollection(id) { this.collections=this.collections.filter(v=>v!==id); }
    isLinkedFileAttachment() { return !!this.linked; }
    isStoredFileAttachment() { return this.itemTypeID==='attachment'&&!this.linked; }
    async getFilePathAsync() { return this.path; }
    async renameAttachmentFile(name,overwrite) { if(overwrite)throw Error('overwrite forbidden'); if(this.renameBlocked)return false; const data=files.get(this.path);files.delete(this.path);this.path=path.join(path.dirname(this.path),name);files.set(this.path,data);this.attachmentFilename=name;return true; }
    async saveTx() { this.dateModified=String(version++); return this.id; }
    toJSON() { return {key:this.key, fields:{...this.fields}}; }
  }
  class Collection {
    constructor() {this.id=nextID++;this.parentID=null;}
    async saveTx() {collections.set(this.id,this);return this.id;}
  }
  const IO={
    async exists(p){return files.has(p);}, async makeDirectory(){},
    async readUTF8(p){if(!files.has(p))throw Error('not found');return files.get(p);},
    async writeUTF8(p,s,options={}){if(IO.fail)throw Error('disk full');if(options.backupFile&&files.has(p))files.set(options.backupFile,files.get(p));files.set(p,s);},
    async getChildren(p){return [...files.keys()].filter(k=>path.dirname(k)===p);},
    async remove(p){files.delete(p);}, async stat(p){return {size:String(files.get(p)||'').length,lastModified:100};}
  };
  const Z={DataDirectory:{dir:'/zotero'},Libraries:{userLibraryID:1}, Item,Collection,ItemTypes:{getName:id=>id},
    Items:{async getAsync(id){return items.get(Number(id))||false;},async getAll(lib){return [...items.values()].filter(i=>i.libraryID===lib&&!i.deleted);},async merge(master,others){for(const other of others)other.deleted=true;}},
    Collections:{get:id=>collections.get(id),getByLibrary:lib=>[...collections.values()].filter(c=>c.libraryID===lib)},
    Notifier:{registerObserver(){return 1;},unregisterObserver(){}},HTTP:{async request(method,url,options){calls.push({method,url,options});return typeof Z.reply==='function'?Z.reply(method,url,options):{...response};}},
    Attachments:{async convertLinkedFileToStoredFile(item,{move}){if(move)throw Error('move forbidden');const replacement=new Item('attachment');replacement.path='/zotero/storage/'+item.attachmentFilename;replacement.attachmentFilename=item.attachmentFilename;replacement.parentID=item.parentID;files.set(replacement.path,files.get(item.path));item.deleted=true;return replacement;}},
    getActiveZoteroPane:()=>({getSelectedItems:()=>[],selectItems:async()=>{},viewAttachment:async()=>{}}), getMainWindow:()=>({focus(){}}),launchURL:u=>calls.push({opened:u})};
  const env={Zotero:Z,IOUtils:IO,PathUtils:{join:path.join,filename:path.basename},
    Services:{logins:{findLogins:(host,form,realm)=>logins.filter(l=>l.realm===realm),async addLoginAsync(l){logins.push(l);},modifyLogin(old,n){logins[logins.indexOf(old)]=n;},removeLogin(l){logins.splice(logins.indexOf(l),1);}}},
    makeLogin:(host,realm,username,password)=>({host,realm,username,password}),
    setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,2)),clearTimeout,setInterval:()=>1,clearInterval(){},saveText:async()=>true,
    domParser:()=>{throw Error('XML parsing requires browser fixture');}};
  const studio=factory(env,C);studio.ready=true;studio.paused=true;
  function item(title='Cell segmentation with a diffusion foundation model',extra={}) {const i=new Item();i.fields={title,abstractNote:'Biomedical generative model for cell segmentation.',date:'2026',DOI:'10.1234/'+i.id,...extra};i.creators=[{firstName:'A',lastName:'Researcher'}];return i;}
  async function index(i){const d=await studio.readItem(i);await studio.saveDoc(d);return d;}
  async function enabled(cfg={}){await studio.saveSettings({...studio.configSnapshot(),allowAI:true,model:'mock-model',...cfg});}
  return {C,studio,Z,IO,env,files,items,collections,logins,calls,item,index,enabled,Item};
}
module.exports={harness};
