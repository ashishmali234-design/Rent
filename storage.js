/*
 * Rent Desk - storage layer.
 * Keeps ALL data in this browser (localStorage) under one key. Nothing is sent to any server.
 * The same "path" style is used everywhere: "cfg/main", "tenants/<id>", "payments/<id>",
 * "reminders/<id>", "callstat/<tenantId>_<month>".
 * storage can be injected, so the file can be tested in Node.
 */
export const KEY = "rentdesk.v1";
export const DEFAULT_CFG = {ownerName:"",upiId:"",countryCode:"91",defaultDueDay:5,r1:1,r2:5,r3:10,od:15,testDate:""};
const COLS = ["tenants","payments","reminders","callstat"];

const fresh = () => ({v:1,cfg:{...DEFAULT_CFG},tenants:{},payments:{},reminders:{},callstat:{},meta:{lastBackup:null}});

export function createStore(storage){
  let state = fresh();
  try{
    const raw = storage.getItem(KEY);
    if(raw){const d=JSON.parse(raw);state={...fresh(),...d,cfg:{...DEFAULT_CFG,...(d.cfg||{})},meta:{lastBackup:null,...(d.meta||{})}};}
  }catch(e){state = fresh();}
  const persist = () => storage.setItem(KEY, JSON.stringify(state));   // throws if storage is full/blocked
  const split = path => { const i=path.indexOf("/"); return [path.slice(0,i), path.slice(i+1)]; };

  return {
    get state(){ return state; },
    put(path, data){
      const [c,id] = split(path);
      if(c==="cfg") state.cfg = {...DEFAULT_CFG,...data};
      else if(COLS.includes(c)) state[c][id] = JSON.parse(JSON.stringify(data));
      else throw new Error("Unknown collection: "+c);
      persist();
    },
    del(path){
      const [c,id] = split(path);
      if(COLS.includes(c)) delete state[c][id];
      persist();
    },
    list(c){ return Object.entries(state[c]).map(([id,v])=>({id,...v})); },
    /* Backup format (also accepted from the older claude.ai version of Rent Desk). */
    exportData(){
      const callstat = {};
      for(const [id,v] of Object.entries(state.callstat)) callstat[id] = v.status;
      return {v:1,exportedAt:new Date().toISOString(),cfg:state.cfg,tenants:this.list("tenants"),payments:this.list("payments"),reminders:this.list("reminders"),callstat};
    },
    importData(d){
      if(!d||typeof d!=="object") throw new Error("Not a backup");
      if(!Array.isArray(d.tenants)||!Array.isArray(d.payments)) throw new Error("Not a Rent Desk backup");
      const next = JSON.parse(JSON.stringify(state));
      if(d.cfg) next.cfg = {...DEFAULT_CFG,...d.cfg};
      for(const c of ["tenants","payments","reminders"]){
        for(const item of (d[c]||[])){ const {id,...b}=item; if(!id) continue; next[c][id]=b; }
      }
      const cs = d.callstat||{};
      for(const key of Object.keys(cs)){            // key = "<tenantId>_<YYYY-MM>"
        const m = key.slice(-7), tid = key.slice(0,-8);
        if(/^\d{4}-\d{2}$/.test(m)&&tid) next.callstat[key]={tenantId:tid,month:m,status:cs[key]};
      }
      state = next; persist();
    },
    markBackup(){ state.meta.lastBackup = new Date().toISOString(); persist(); },
    erase(){ state = fresh(); persist(); }
  };
}
