import test from "node:test";
import assert from "node:assert/strict";
import {calc,waText,smsText,smsParts,upiLink,links,totals,monthMr,dueDateMr,cleanPhone,rentFor,callReplies,addMonths} from "./logic.js";

const cfg = {ownerName:"Ramesh Patil",upiId:"ramesh@okhdfcbank",countryCode:"91",defaultDueDay:5,r1:1,r2:5,r3:10,od:15,testDate:"2026-11-19"};
const jew  = {id:"a",name:"Suresh Kale",property:"Jewellery Shop",phone:"98 7654-3210",rent:6500,rentConfirmed:true};
const soma = {id:"b",name:"Soma",property:"Soma Mali Shop",phone:"",rent:2000,rentConfirmed:false};
const tail = {id:"c",name:"Tailor",property:"Tailor Shop",phone:"9000000001",rent:null,rentConfirmed:false};
const mk = (over={}) => ({cfg:{...cfg,...(over.cfg||{})},tenants:[jew,soma,tail],payments:over.payments||[],reminders:over.reminders||[]});

test("partial payment: balance 4500, PARTIALLY PAID, UPI link asks only 4500", () => {
  const S = mk({payments:[{tenantId:"a",month:"2026-11",amount:2000,verified:true}]});
  const c = calc(S,jew,"2026-11");
  assert.equal(c.balance,4500); assert.equal(c.status,"PARTIALLY PAID");
  assert.match(upiLink(S,jew,c,false),/^upi:\/\/pay\?pa=ramesh@okhdfcbank&pn=Ramesh%20Patil&am=4500&cu=INR$/);
});
test("full payment: PAID, reminders STOP, no message links", () => {
  const S = mk({payments:[{tenantId:"a",month:"2026-11",amount:2000,verified:true},{tenantId:"a",month:"2026-11",amount:4500,verified:true}]});
  const c = calc(S,jew,"2026-11");
  assert.equal(c.status,"PAID"); assert.equal(c.stage,"STOP (PAID)"); assert.equal(c.sendNow,false);
  const L = links(S,jew,c); assert.equal(L.wa,""); assert.equal(L.sms,"");
});
test("unverified payment does not reduce the balance", () => {
  const S = mk({payments:[{tenantId:"a",month:"2026-11",amount:6500,verified:false}]});
  const c = calc(S,jew,"2026-11");
  assert.equal(c.balance,6500); assert.equal(c.unverified,6500); assert.notEqual(c.status,"PAID");
});
test("unconfirmed or unknown rent: CONFIRM RENT, no links, nothing assumed", () => {
  const S = mk();
  assert.equal(calc(S,soma,"2026-11").status,"CONFIRM RENT");
  assert.equal(calc(S,soma,"2026-11").rent,0);
  assert.equal(calc(S,tail,"2026-11").status,"CONFIRM RENT");
  assert.deepEqual(links(S,tail,calc(S,tail,"2026-11")).wa,"");
});
test("month changes by itself and the Marathi month follows", () => {
  const S = mk({cfg:{testDate:"2026-12-03"}});
  const c = calc(S,jew,"2026-12");
  assert.equal(c.status,"PENDING"); assert.equal(c.stage,"REMINDER 1"); assert.equal(c.sendNow,true);
  assert.equal(monthMr("2026-11"),"नोव्हेंबर २०२६"); assert.equal(monthMr("2026-12"),"डिसेंबर २०२६");
  assert.match(waText(S,jew,c),/^नमस्कार Suresh Kale जी,\n\nडिसेंबर २०२६ महिन्याचे भाडे बाकी आहे\./);
});
test("reminder stages follow the configurable days", () => {
  const stage = d => calc(mk({cfg:{testDate:"2026-11-"+d}}),jew,"2026-11").stage;
  assert.equal(stage("01"),"REMINDER 1"); assert.equal(stage("04"),"REMINDER 1");
  assert.equal(stage("05"),"REMINDER 2"); assert.equal(stage("10"),"REMINDER 3"); assert.equal(stage("15"),"OVERDUE REMINDER");
  const custom = calc(mk({cfg:{testDate:"2026-11-04",r2:3}}),jew,"2026-11").stage;
  assert.equal(custom,"REMINDER 2");
});
test("a logged reminder marks the stage as done, next stage asks again", () => {
  const rem = [{tenantId:"a",month:"2026-11",channel:"WhatsApp",date:"2026-11-16"}];
  assert.equal(calc(mk({reminders:rem}),jew,"2026-11").sendNow,false);
  const later = mk({cfg:{testDate:"2026-12-05"},reminders:[{tenantId:"a",month:"2026-12",channel:"WhatsApp",date:"2026-12-01"}]});
  assert.equal(calc(later,jew,"2026-12").stage,"REMINDER 2"); assert.equal(calc(later,jew,"2026-12").sendNow,true);
});
test("a call does not count as a sent message reminder", () => {
  const S = mk({reminders:[{tenantId:"a",month:"2026-11",channel:"Call",date:"2026-11-16"}]});
  assert.equal(calc(S,jew,"2026-11").sendNow,true);
});
test("OVERDUE only after the due date and only when nothing is paid", () => {
  assert.equal(calc(mk({cfg:{testDate:"2026-11-05"}}),jew,"2026-11").status,"PENDING");
  assert.equal(calc(mk({cfg:{testDate:"2026-11-06"}}),jew,"2026-11").status,"OVERDUE");
});
test("due day 31 in February becomes the last day of the month", () => {
  const t = {...jew,dueDay:31};
  assert.equal(calc(mk({cfg:{testDate:"2027-02-10"}}),t,"2027-02").dueDate,"2027-02-28");
  assert.equal(dueDateMr("2027-02-28"),"२८ फेब्रुवारी २०२७");
});
test("a rent increase applies only from its month; history keeps the old rent", () => {
  const t = {...jew,rentChanges:[{from:"2027-01",rent:7000}]};
  assert.equal(rentFor(t,"2026-12"),6500); assert.equal(rentFor(t,"2027-01"),7000); assert.equal(rentFor(t,"2027-06"),7000);
});
test("payments are kept per month and never overwrite each other", () => {
  const S = mk({payments:["2026-07","2026-08","2026-09"].map(m=>({tenantId:"a",month:m,amount:6500,verified:true}))});
  for (const m of ["2026-07","2026-08","2026-09"]) assert.equal(calc(S,jew,m).status,"PAID");
  assert.equal(calc(S,jew,"2026-11").status,"OVERDUE");
});
test("setup issues are reported when phone, UPI ID or name is missing", () => {
  const S = mk({cfg:{upiId:"",ownerName:""}});
  const c = calc(S,{...jew,phone:"123"},"2026-11");
  assert.equal(c.issues.length,3); assert.equal(links(S,{...jew,phone:"123"},c).wa,"");
});
test("WhatsApp and SMS links are built for the right number with encoded Marathi text", () => {
  const S = mk(); const c = calc(S,jew,"2026-11"); const L = links(S,jew,c);
  assert.ok(L.wa.startsWith("https://wa.me/919876543210?text=")); assert.ok(L.sms.startsWith("sms:+919876543210?body="));
  assert.equal(L.tel,"tel:+919876543210");
  const text = decodeURIComponent(L.wa.split("?text=")[1]);
  assert.equal(text,waText(S,jew,c));
  assert.match(text,/₹6,500/); assert.match(text,/५ नोव्हेंबर २०२६/); assert.match(text,/upi:\/\/pay\?pa=ramesh@okhdfcbank/);
});
test("SMS part counter (Marathi uses 70/67 characters per part)", () => {
  assert.equal(smsParts("a".repeat(70)),1); assert.equal(smsParts("a".repeat(71)),2); assert.equal(smsParts("a".repeat(135)),3);
  assert.ok(smsParts(smsText(mk(),jew,calc(mk(),jew,"2026-11")))>=2);
});
test("phone cleaning accepts +91/spaces and rejects bad numbers", () => {
  assert.equal(cleanPhone("+91 98765 43210"),"9876543210"); assert.equal(cleanPhone("098765-43210"),"9876543210");
  assert.equal(cleanPhone("12345"),""); assert.equal(cleanPhone("5876543210"),"");
});
test("call script replies: amount comes from the balance, never claims receipt", () => {
  const S = mk({payments:[{tenantId:"a",month:"2026-11",amount:2000,verified:true}]});
  const r = callReplies(S,jew,calc(S,jew,"2026-11"));
  assert.equal(r.length,6); assert.match(r[2][1],/₹6,500/); assert.match(r[2][1],/₹2,000/); assert.match(r[2][1],/₹4,500/);
  assert.ok(!r[1][1].includes("मिळाले"));   // "received" is never claimed
});
test("dashboard totals and counts", () => {
  const S = mk({payments:[{tenantId:"a",month:"2026-11",amount:2000,verified:true},{tenantId:"b",month:"2026-11",amount:2000,verified:false}]});
  const T = totals(S,"2026-11");
  assert.equal(T.due,6500); assert.equal(T.col,2000); assert.equal(T.out,4500); assert.equal(T.unv,2000);
  assert.deepEqual(T.n,{"PAID":0,"PARTIALLY PAID":1,"PENDING":0,"OVERDUE":0,"CONFIRM RENT":2});
});
test("month arithmetic across year end", () => { assert.equal(addMonths("2026-12",1),"2027-01"); assert.equal(addMonths("2026-01",-1),"2025-12"); });
