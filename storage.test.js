import test from "node:test";
import assert from "node:assert/strict";
import {createStore,KEY} from "./storage.js";
const mem = () => { const m = new Map(); return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),m}; };

test("data survives a reload (new store on the same storage)", () => {
  const st = mem(); const a = createStore(st);
  a.put("tenants/t1",{name:"A",rent:100}); a.put("payments/p1",{tenantId:"t1",month:"2026-11",amount:50,verified:true});
  const b = createStore(st);
  assert.equal(b.list("tenants")[0].name,"A"); assert.equal(b.list("payments").length,1);
});
test("delete removes only that record", () => {
  const a = createStore(mem()); a.put("tenants/t1",{name:"A"}); a.put("tenants/t2",{name:"B"}); a.del("tenants/t1");
  assert.deepEqual(a.list("tenants").map(t=>t.id),["t2"]);
});
test("export then import into an empty store gives the same records", () => {
  const a = createStore(mem());
  a.put("cfg/main",{ownerName:"X",upiId:"x@upi"}); a.put("tenants/t1",{name:"A"}); a.put("payments/p1",{tenantId:"t1",month:"2026-11",amount:5,verified:true});
  a.put("callstat/t_1_2026-11",{tenantId:"t_1",month:"2026-11",status:"Call later"});
  const backup = JSON.parse(JSON.stringify(a.exportData()));
  const b = createStore(mem()); b.importData(backup);
  assert.equal(b.state.cfg.upiId,"x@upi"); assert.equal(b.list("tenants").length,1); assert.equal(b.list("payments")[0].amount,5);
  assert.equal(b.state.callstat["t_1_2026-11"].status,"Call later");
});
test("a bad backup is rejected and changes nothing", () => {
  const a = createStore(mem()); a.put("tenants/t1",{name:"A"});
  assert.throws(()=>a.importData({foo:1})); assert.throws(()=>a.importData(null));
  assert.equal(a.list("tenants").length,1);
});
test("restoring the backup does not delete newer records (merge)", () => {
  const a = createStore(mem()); a.put("tenants/t1",{name:"A"}); const backup = a.exportData();
  a.put("tenants/t2",{name:"B"}); a.importData(backup);
  assert.equal(a.list("tenants").length,2);
});
test("erase clears everything; corrupt storage falls back to empty", () => {
  const st = mem(); const a = createStore(st); a.put("tenants/t1",{name:"A"}); a.erase();
  assert.equal(a.list("tenants").length,0);
  st.setItem(KEY,"{not json"); assert.equal(createStore(st).list("tenants").length,0);
});
test("storage errors surface (full phone storage must not be silent)", () => {
  const bad = {getItem:()=>null,setItem:()=>{throw new Error("QuotaExceeded");}};
  assert.throws(()=>createStore(bad).put("tenants/t1",{name:"A"}));
});
test("unknown collection is refused", () => { assert.throws(()=>createStore(mem()).put("hack/x",{})); });
