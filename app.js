/* Rent Desk - screens and actions. Logic lives in logic.js, data in storage.js. */
import {fmt,todayOf,monthEn,monthMr,addMonths,cleanPhone,rentFor,dueDateEn,STAGE_LABEL,calc,upiLink,waText,smsText,smsParts,callScript,callReplies,links,totals} from "./logic.js";
import {createStore,DEFAULT_CFG} from "./storage.js";
const STORE=createStore(window.localStorage);
const S={cfg:{...DEFAULT_CFG},tenants:[],payments:[],reminders:[],callstat:{},month:null,view:"home"};
let modal=null,pending=null,toastTimer=null,confirmYes=null;
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const STATUS_CLASS={"PAID":"paid","PARTIALLY PAID":"part","PENDING":"pend","OVERDUE":"over","CONFIRM RENT":"conf"};
const METHODS=["UPI","Cash","Bank Transfer","Cheque","Other"];
const CALLSTATUS=["Not called","Called - will pay","Called - already paid","No answer","Call later","Wrong number"];
function toast(m){const e=$("#toast");e.textContent=m;e.classList.remove("hide");clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.add("hide"),2800);}
function curMonth(){return todayOf(S.cfg).slice(0,7);}
function sync(){
  S.cfg=STORE.state.cfg;
  S.tenants=STORE.list("tenants").sort((x,y)=>(x.createdAt||"").localeCompare(y.createdAt||"")||String(x.name).localeCompare(String(y.name)));
  S.payments=STORE.list("payments");S.reminders=STORE.list("reminders");
  const o={};for(const [k,v] of Object.entries(STORE.state.callstat))o[k]=v.status;S.callstat=o;
}
async function save(path,data,okMsg){
  try{STORE.put(path,data);sync();if(okMsg)toast(okMsg);rerender();return true;}
  catch(e){toast("Could not save. Phone storage may be full or blocked.");return false;}
}
async function remove(path){
  try{STORE.del(path);sync();rerender();return true;}catch(e){toast("Could not delete.");return false;}
}
async function copyText(text,label){
  try{await navigator.clipboard.writeText(text);toast((label||"Text")+" copied");}
  catch(e){modal={type:"copy",text,label:label||"Text"};renderModal();setTimeout(()=>{const a=$("#copybox");if(a){a.focus();a.select();}},50);}
}

/* ---------- main render ---------- */
function allReady(){return true;}
function renderTop(){
  const td=todayOf(S.cfg);
  $("#today").textContent="Today "+dueDateEn(td)+(S.cfg.testDate?"  (test date)":"");
  $("#mname").innerHTML="<b>"+esc(monthEn(S.month))+"</b><span>"+esc(monthMr(S.month))+(S.month===curMonth()?"  ·  this month":"")+"</span>";
  const ms=$("#mswitch");ms.classList.toggle("hide",S.view==="settings"||S.view==="tenants");
  document.querySelectorAll(".nav button").forEach(b=>b.setAttribute("aria-current",b.dataset.view===S.view?"page":"false"));
}
function pill(status){return '<span class="pill s-'+STATUS_CLASS[status]+'">'+esc(status)+"</span>";}
function renderMain(){
  renderTop();
  const el=$("#main");
  if(S.view==="home")el.innerHTML=viewHome();
  else if(S.view==="tenants")el.innerHTML=viewTenants();
  else if(S.view==="payments")el.innerHTML=viewPayments();
  else el.innerHTML=viewSettings();
}
function viewHome(){
  const T=totals(S,S.month);
  if(!T.count)return '<div class="empty"><b>No tenants yet</b><p>Add your first tenant to start, or load made-up example data to look around.</p><button class="btn" data-act="tenant-new">Add tenant</button><button class="btn ghost" data-act="example-load">Load example data</button><button class="btn ghost" data-act="restore-open">Restore a backup</button></div>';
  const pct=T.due>0?Math.min(100,Math.round(T.col/T.due*100)):0;
  const chip=(k,l)=>T.n[k]?'<span class="chip s-'+STATUS_CLASS[k]+'">'+T.n[k]+" "+l+"</span>":"";
  let h='<section class="sect"><div class="tiles">'+
   '<div class="tile main" style="grid-column:1/-1"><div class="k">Collected of rent due</div><div class="v">₹'+fmt(T.col)+' <span style="font-size:1rem;font-weight:600">of ₹'+fmt(T.due)+'</span></div><div class="bar" role="img" aria-label="'+pct+' percent collected"><i style="width:'+pct+'%"></i></div></div>'+
   '<div class="tile"><div class="k">Outstanding</div><div class="v">₹'+fmt(T.out)+'</div></div>'+
   '<div class="tile"><div class="k">Tenants</div><div class="v">'+T.count+'</div></div></div>'+
   '<div class="chips">'+chip("PAID","paid")+chip("PARTIALLY PAID","partly paid")+chip("PENDING","pending")+chip("OVERDUE","overdue")+chip("CONFIRM RENT","need rent confirmed")+"</div>";
  if(T.unv>0)h+='<div class="banner">₹'+fmt(T.unv)+" claimed but not verified yet. Check your bank/UPI app, then mark it verified in Payments.</div>";
  const lb=STORE.state.meta.lastBackup;const days=lb?Math.floor((Date.now()-Date.parse(lb))/864e5):null;
  if(S.payments.length&&(days===null||days>30))h+='<div class="banner">'+(days===null?"You have not made a backup yet.":"Your last backup was "+days+" days ago.")+' <button class="btn sm" style="margin-top:8px" data-act="backup-download">Download backup now</button></div>';
  h+="</section>";
  const order={"OVERDUE":0,"PARTIALLY PAID":1,"PENDING":2,"CONFIRM RENT":3,"PAID":4};
  const rows=T.rows.slice().sort((a,b)=>order[a.c.status]-order[b.c.status]);
  h+='<section class="sect"><h2>Tenants <small>'+esc(monthEn(S.month))+"</small></h2>"+rows.map(r=>cardHtml(r.t,r.c)).join("")+"</section>";
  return h;
}
function cardHtml(t,c){
  const L=links(S,t,c);const cls=STATUS_CLASS[c.status];
  let stage="";
  if(c.stage==="STOP (PAID)")stage='<p class="stage">Paid. No more reminders this month.</p>';
  else if(c.stage==="NOT YET")stage='<p class="stage muted">No reminder needed yet.</p>';
  else if(c.stageDay!==null)stage='<p class="stage'+(c.sendNow?" now":"")+'">'+(c.sendNow?"Send now: ":"Done: ")+esc(STAGE_LABEL[c.stage])+(c.sendNow?" not sent yet":" already sent")+"</p>";
  const issue=c.issues.length?'<p class="issue">'+esc(c.issues.join(" "))+"</p>":"";
  const detail=c.ready?"of ₹"+fmt(c.rent)+" · paid ₹"+fmt(c.paid)+" · due "+esc(dueDateEn(c.dueDate)):"Rent not confirmed";
  const a=(href,txt,ch)=>href?'<a class="btn ghost" href="'+esc(href)+'" target="_blank" rel="noopener" data-log="'+ch+'" data-id="'+esc(t.id)+'">'+txt+"</a>":'<span class="btn ghost off">'+txt+"</span>";
  const ask=pending&&pending.id===t.id&&pending.month===S.month?'<div class="ask"><b>Did you send the '+esc(pending.channel)+" "+(pending.channel==="Call"?"call":"message")+" to "+esc(t.name)+'?</b><div class="r"><button class="btn sm" data-act="log-yes">Yes, log it</button><button class="btn sm ghost" data-act="log-no">No</button></div></div>':"";
  return '<article class="card b-'+cls+'"><header><div><h3>'+esc(t.name)+'</h3><p class="muted">'+esc(t.property||"")+"</p></div>"+pill(c.status)+"</header>"+
   '<div class="amt"><b>₹'+fmt(c.balance)+"</b><span>"+detail+(c.unverified?" · ₹"+fmt(c.unverified)+" unverified":"")+"</span></div>"+stage+issue+
   '<div class="actions">'+a(L.wa,"WhatsApp","WhatsApp")+a(L.sms,"SMS","SMS")+a(L.tel,"Call","Call")+"</div>"+ask+
   '<div class="actions2"><button class="btn" data-act="pay-new" data-id="'+esc(t.id)+'">Record payment</button><button class="btn ghost" data-act="detail" data-id="'+esc(t.id)+'">Messages and call script</button></div></article>';
}
function viewTenants(){
  let h='<section class="sect"><h2>Tenants <button class="btn sm" data-act="tenant-new">Add tenant</button></h2>';
  if(!S.tenants.length)h+='<div class="empty"><p>No tenants yet.</p></div>';
  h+='<div class="list">'+S.tenants.map(t=>{const c=calc(S,t,curMonth());return '<button class="item" data-act="tenant-edit" data-id="'+esc(t.id)+'"><span class="l"><b>'+esc(t.name)+'</b><span class="muted">'+esc(t.property||"")+" · "+(cleanPhone(t.phone)?"+"+esc(S.cfg.countryCode||"91")+" "+cleanPhone(t.phone):"no phone")+'</span></span><span class="r">'+(c.base?"₹"+fmt(c.base):"rent ?")+"<br>"+pill(c.status)+"</span></button>";}).join("")+"</div></section>";
  return h;
}
function viewPayments(){
  const fl=S.payFilter||"";
  const tn=id=>{const t=S.tenants.find(x=>x.id===id);return t?t.name:"(deleted tenant)";};
  let ps=S.payments.filter(p=>!fl||p.tenantId===fl).slice().sort((a,b)=>((b.month||"0")+(b.date||"")).localeCompare((a.month||"0")+(a.date||"")));
  let h='<section class="sect"><h2>Payments <button class="btn sm" data-act="pay-new" data-id="">Add payment</button></h2>'+
   '<label class="f" for="payfilter">Show<select id="payfilter"><option value="">All tenants</option>'+S.tenants.map(t=>'<option value="'+esc(t.id)+'"'+(fl===t.id?" selected":"")+">"+esc(t.name)+"</option>").join("")+"</select></label>";
  if(!ps.length)h+='<div class="empty"><p>No payments recorded.</p></div>';
  let last=null;
  h+='<div class="list">';
  ps.forEach(p=>{
    const g=p.month||"";
    if(g!==last){h+='<h3 style="margin-top:8px">'+(g?esc(monthEn(g)):"Month not set (edit to fix)")+"</h3>";last=g;}
    h+='<button class="item" data-act="pay-edit" data-id="'+esc(p.id)+'"><span class="l"><b>'+esc(tn(p.tenantId))+'</b><span class="muted">'+(p.date?esc(dueDateEn(p.date)):"date not set")+" · "+esc(p.method||"method not set")+(p.notes?" · "+esc(p.notes):"")+'</span></span><span class="r">₹'+fmt(p.amount)+"<br>"+(p.verified?'<span class="pill s-paid">VERIFIED</span>':'<span class="pill s-part">NOT VERIFIED</span>')+"</span></button>";
  });
  return h+"</div></section>";
}
function viewSettings(){
  const c=S.cfg;const f=(id,l,v,type,help)=>'<label class="f" for="'+id+'">'+l+'<input id="'+id+'" type="'+(type||"text")+'" value="'+esc(v)+'">'+(help?'<span class="help">'+help+"</span>":"")+"</label>";
  return '<section class="sect"><h2>Settings</h2>'+
   f("c_owner","Your name (shown on the UPI payment screen)",c.ownerName,"text","Type in English, for example Ramesh Patil")+
   f("c_upi","YOUR UPI ID (where rent money arrives)",c.upiId,"text","This is the account that receives rent, not the tenant's.")+
   f("c_cc","Country code",c.countryCode,"text","91 for India")+
   f("c_due","Default due day of the month (1-28)",c.defaultDueDay,"number","Starting value. A tenant can have their own day.")+
   '<div class="grid2">'+f("c_r1","Reminder 1 day",c.r1,"number")+f("c_r2","Reminder 2 day",c.r2,"number")+f("c_r3","Reminder 3 day",c.r3,"number")+f("c_od","Overdue reminder day",c.od,"number")+"</div>"+
   f("c_test","Test date (leave empty)",c.testDate,"date","Only for trying a different day. Clear it after testing.")+
   '<button class="btn block" data-act="cfg-save">Save settings</button>'+
   '<h2 style="margin-top:12px">Backup</h2><p class="note">Your records live only in the browser on this phone. If you clear the site data in Chrome, or uninstall Chrome, they are gone. Download a backup after each month and keep it in Google Drive or WhatsApp "Message yourself".</p>'+
   '<div class="actions2"><button class="btn" data-act="backup-download">Download backup</button><button class="btn ghost" data-act="backup-share">Share backup</button><button class="btn ghost" data-act="backup-copy">Copy backup text</button><button class="btn ghost" data-act="restore-open">Restore backup</button></div><p class="note">Last backup: '+(STORE.state.meta.lastBackup?esc(STORE.state.meta.lastBackup.slice(0,10)):"never")+'</p><button class="btn block warn" data-act="erase-all">Erase all data on this phone</button>'+
   '<h2 style="margin-top:12px">Safety</h2><p class="note">Never share this page link. This page never stores a UPI PIN, bank password or OTP. A payment counts only after you tick Verified.</p></section>';
}

/* ---------- modals ---------- */
function monthOptions(sel,allowBlank){
  const cur=curMonth();let o="";if(allowBlank)o+='<option value=""'+(!sel?" selected":"")+">(month not set)</option>";
  for(let n=3;n>=-24;n--){const k=addMonths(cur,n);o+='<option value="'+k+'"'+(k===sel?" selected":"")+">"+monthEn(k)+"</option>";}
  if(sel&&!o.includes('value="'+sel+'"'))o+='<option value="'+sel+'" selected>'+monthEn(sel)+"</option>";
  return o;
}
function renderModal(){
  const el=$("#modal");
  if(!modal){el.innerHTML="";el.classList.add("hide");document.body.style.overflow="";return;}
  el.classList.remove("hide");document.body.style.overflow="hidden";
  let h="";
  if(modal.type==="copy")h=sheet("Copy "+esc(modal.label),'<p class="note">Your phone blocked automatic copy. Press and hold the text, choose Select all, then Copy.</p><textarea id="copybox" readonly rows="10" style="width:100%;border-radius:10px;border:1px solid var(--line);padding:10px;background:var(--surface);color:var(--ink)">'+esc(modal.text)+"</textarea>");
  else if(modal.type==="confirm")h=sheet("Please confirm","<p>"+esc(modal.msg)+'</p><div class="actions2"><button class="btn warn" data-act="confirm-yes">Yes, do it</button><button class="btn ghost" data-act="close">Cancel</button></div>');
  else if(modal.type==="tenant")h=tenantForm();
  else if(modal.type==="pay")h=payForm();
  else if(modal.type==="detail")h=detailSheet();
  else if(modal.type==="restore")h=sheet("Restore backup",'<p class="note">Paste the backup text you copied earlier. This replaces records with the same ids.</p><input id="restorefile" type="file" accept="application/json,.json" style="margin-bottom:8px"><textarea id="restorebox" rows="6" style="width:100%;border-radius:10px;border:1px solid var(--line);padding:10px;background:var(--surface);color:var(--ink)"></textarea><button class="btn block" data-act="restore-go">Restore</button>');
  el.innerHTML=h;
}
function sheet(title,body){return '<div class="overlay" data-act="overlay"><div class="sheet" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><div class="hd"><h2>'+esc(title)+'</h2><button class="iconbtn" data-act="close" aria-label="Close">×</button></div>'+body+"</div></div>";}
function tenantForm(){
  const t=modal.id?S.tenants.find(x=>x.id===modal.id):null;const v=t||{};
  const rent=t?rentFor(t,curMonth()):"";
  const f=(id,l,val,type,help)=>'<label class="f" for="'+id+'">'+l+'<input id="'+id+'" type="'+(type||"text")+'" value="'+esc(val)+'"'+(type==="tel"?' inputmode="numeric"':"")+">"+(help?'<span class="help">'+help+"</span>":"")+"</label>";
  return sheet(t?"Edit tenant":"Add tenant",
   f("t_name","Tenant name",v.name||"","text")+f("t_prop","Property / shop",v.property||"","text")+
   f("t_phone","Phone number",v.phone||"","tel","10 digits. Spaces or +91 are fine.")+
   f("t_rent","Monthly rent (₹)",rent,"number")+
   '<label class="f hide" id="t_from_wrap" for="t_from">Apply the new rent from<select id="t_from">'+monthOptions(curMonth())+'</select><span class="help">Earlier months keep their old rent, so your history stays correct.</span></label>'+
   '<label class="tog" for="t_conf"><input id="t_conf" type="checkbox"'+(v.rentConfirmed?" checked":"")+'><span>Rent is confirmed. Reminders and payment links are created only after this is ticked.</span></label>'+
   f("t_dd","Due day (optional, 1-28)",v.dueDay||"","number","Leave empty to use the default in Settings.")+
   f("t_upi","UPI ID for this shop (optional)",v.upiId||"","text","Your receiving UPI ID. Leave empty to use the one in Settings.")+
   '<label class="f" for="t_notes">Notes<textarea id="t_notes">'+esc(v.notes||"")+"</textarea></label>"+
   '<button class="btn block" data-act="tenant-save">Save tenant</button>'+(t?'<button class="btn block warn" data-act="tenant-del">Delete tenant</button>':""));
}
function payForm(){
  const p=modal.payId?S.payments.find(x=>x.id===modal.payId):null;
  const tid=p?p.tenantId:modal.tenantId||"";
  const month=p?p.month:S.month;
  let defAmt=p?p.amount:"";
  if(!p&&tid){const t=S.tenants.find(x=>x.id===tid);if(t){const c=calc(S,t,month);if(c.balance>0)defAmt=c.balance;}}
  return sheet(p?"Edit payment":"Record payment",
   '<label class="f" for="p_t">Tenant<select id="p_t">'+(tid?"":'<option value="">Choose tenant</option>')+S.tenants.map(t=>'<option value="'+esc(t.id)+'"'+(t.id===tid?" selected":"")+">"+esc(t.name)+" · "+esc(t.property||"")+"</option>").join("")+"</select></label>"+
   '<label class="f" for="p_m">Rent month<select id="p_m">'+monthOptions(month,!!(p&&!p.month))+"</select></label>"+
   '<label class="f" for="p_a">Amount received (₹)<input id="p_a" type="number" inputmode="decimal" value="'+esc(defAmt)+'"></label>'+
   '<div class="grid2"><label class="f" for="p_d">Payment date<input id="p_d" type="date" value="'+esc(p?p.date||"":todayOf(S.cfg))+'"></label>'+
   '<label class="f" for="p_me">Method<select id="p_me"><option value="">(not set)</option>'+METHODS.map(m=>"<option"+(p&&p.method===m||(!p&&m==="UPI")?" selected":"")+">"+m+"</option>").join("")+"</select></label></div>"+
   '<label class="tog" for="p_v"><input id="p_v" type="checkbox"'+(p&&p.verified?" checked":"")+'><span>Verified. I saw this money in my own bank or UPI app. Only verified payments count as paid.</span></label>'+
   '<label class="f" for="p_n">Notes<input id="p_n" type="text" value="'+esc(p?p.notes||"":"")+'"></label>'+
   '<button class="btn block" data-act="pay-save">Save payment</button>'+(p?'<button class="btn block warn" data-act="pay-del">Delete payment</button>':""));
}
function detailSheet(){
  const t=S.tenants.find(x=>x.id===modal.id);if(!t)return "";
  const c=calc(S,t,S.month);const ok=c.ready&&!c.issues.length&&c.balance>0;
  const cs=S.callstat[t.id+"_"+S.month]||"Not called";
  let h="";
  if(!ok){
    h+='<p class="issue">'+(c.balance<=0&&c.ready?"Nothing is due for "+esc(monthEn(S.month))+".":esc(c.issues.join(" ")||"Rent is not confirmed."))+"</p>";
  }else{
    const wa=waText(S,t,c),sms=smsText(S,t,c);
    h+='<h3>WhatsApp message</h3><pre class="msg">'+esc(wa)+'</pre><button class="btn ghost block" data-act="copy" data-k="wa" data-id="'+esc(t.id)+'">Copy WhatsApp message</button>'+
     '<h3>SMS ('+smsParts(sms)+" part"+(smsParts(sms)>1?"s":"")+' on Marathi SMS)</h3><pre class="msg">'+esc(sms)+'</pre><button class="btn ghost block" data-act="copy" data-k="sms" data-id="'+esc(t.id)+'">Copy SMS</button>'+
     '<h3>UPI payment link</h3><pre class="msg">'+esc(upiLink(S,t,c,true))+'</pre><button class="btn ghost block" data-act="copy" data-k="upi" data-id="'+esc(t.id)+'">Copy UPI link</button>'+
     '<p class="note">Opening a UPI link never proves payment. Some apps also refuse links to personal UPI IDs. Test with ₹1 first.</p>'+
     '<h3>Call script (Marathi)</h3><pre class="msg">'+esc(callScript(S,t,c))+'</pre><button class="btn ghost block" data-act="copy" data-k="call" data-id="'+esc(t.id)+'">Copy call script</button>'+
     '<h3>If the tenant says...</h3>'+callReplies(S,t,c).map(r=>'<div class="reply"><b>'+esc(r[0])+"</b><span>"+esc(r[1])+"</span></div>").join("");
  }
  if(c.phone)h+='<p class="note">Phone: +'+esc(c.cc)+" "+esc(c.phone)+' <button class="btn sm ghost" data-act="copy" data-k="phone" data-id="'+esc(t.id)+'">Copy number</button></p>';
  h+='<label class="f" for="cs">Call status for '+esc(monthEn(S.month))+'<select id="cs" data-id="'+esc(t.id)+'">'+CALLSTATUS.map(x=>"<option"+(x===cs?" selected":"")+">"+x+"</option>").join("")+"</select></label>";
  const logs=S.reminders.filter(r=>r.tenantId===t.id&&r.month===S.month).sort((a,b)=>(b.at||"").localeCompare(a.at||""));
  h+="<h3>Reminders sent this month</h3>"+(logs.length?logs.map(r=>'<p class="note">'+esc(dueDateEn(r.date))+" · "+esc(r.channel)+" · "+esc(STAGE_LABEL[r.stage]||r.stage||"")+" · balance ₹"+fmt(r.balance)+"</p>").join(""):'<p class="note">None yet.</p>');
  return sheet(t.name+" · "+monthEn(S.month),h);
}

/* ---------- actions ---------- */
function val(id){const e=$("#"+id);return e?e.value.trim():"";}
async function act(a,el){
  const id=el&&el.dataset.id;
  switch(a){
    case "close":modal=null;renderModal();break;
    case "overlay":break;
    case "tenant-new":modal={type:"tenant"};renderModal();wireTenantForm();break;
    case "tenant-edit":modal={type:"tenant",id};renderModal();wireTenantForm();break;
    case "tenant-save":{
      const name=val("t_name");if(!name){toast("Type the tenant name.");return;}
      const old=modal.id?S.tenants.find(x=>x.id===modal.id):null;
      const newRent=Number(val("t_rent"))||0;
      const t=old?JSON.parse(JSON.stringify(old)):{id:uid("t_"),rent:newRent,rentChanges:[]};
      t.name=name;t.property=val("t_prop");t.phone=val("t_phone");t.upiId=val("t_upi");t.notes=val("t_notes");
      t.rentConfirmed=$("#t_conf").checked;t.dueDay=Number(val("t_dd"))||null;
      t.rentChanges=t.rentChanges||[];
      if(old){const curR=rentFor(old,curMonth());
        if(newRent!==curR){
          if(!t.rentChanges.length&&!Number(old.rent)){t.rent=newRent;}
          else{const from=val("t_from")||curMonth();t.rentChanges=t.rentChanges.filter(c=>c.from!==from);t.rentChanges.push({from,rent:newRent});}
        }}
      const {id:tid,...body}=t;
      if(await save("tenants/"+tid,body,"Tenant saved")){modal=null;renderModal();}
      break;}
    case "tenant-del":{
      const t=S.tenants.find(x=>x.id===modal.id);
      confirmYes=async()=>{if(await remove("tenants/"+t.id)){toast("Tenant deleted. Payments are kept.");}modal=null;renderModal();};
      modal={type:"confirm",msg:"Delete "+t.name+"? Their payment records stay in Payments."};renderModal();break;}
    case "pay-new":modal={type:"pay",tenantId:id||""};renderModal();break;
    case "pay-edit":modal={type:"pay",payId:id};renderModal();break;
    case "pay-save":{
      const tenantId=val("p_t");if(!tenantId){toast("Choose the tenant.");return;}
      const amount=Number(val("p_a"));if(!(amount>0)){toast("Type the amount received.");return;}
      const old=modal.payId?S.payments.find(x=>x.id===modal.payId):null;
      const pid=old?old.id:uid("p_");
      const body={tenantId,month:val("p_m"),amount,date:val("p_d"),method:val("p_me"),verified:$("#p_v").checked,notes:val("p_n"),createdAt:old&&old.createdAt||new Date().toISOString()};
      if(await save("payments/"+pid,body,body.verified?"Payment saved and verified":"Saved. Not counted until verified")){
        if(body.month&&S.view==="home")S.month=body.month;modal=null;renderModal();renderMain();}
      break;}
    case "pay-del":{
      const pid=modal.payId;
      confirmYes=async()=>{if(await remove("payments/"+pid))toast("Payment deleted");modal=null;renderModal();};
      modal={type:"confirm",msg:"Delete this payment record? This changes the balance."};renderModal();break;}
    case "confirm-yes":{const f=confirmYes;confirmYes=null;if(f)await f();break;}
    case "detail":modal={type:"detail",id};renderModal();break;
    case "copy":{
      const t=S.tenants.find(x=>x.id===id);const c=calc(S,t,S.month);const k=el.dataset.k;
      const map={wa:()=>waText(S,t,c),sms:()=>smsText(S,t,c),upi:()=>upiLink(S,t,c,true),call:()=>callScript(S,t,c),phone:()=>"+"+c.cc+c.phone};
      const lab={wa:"WhatsApp message",sms:"SMS",upi:"UPI link",call:"Call script",phone:"Number"}[k];
      copyText(map[k](),lab);break;}
    case "log-yes":{
      if(!pending)break;const t=S.tenants.find(x=>x.id===pending.id);const c=calc(S,t,pending.month);const p=pending;pending=null;renderMain();
      await save("reminders/"+uid("r_"),{tenantId:p.id,month:p.month,channel:p.channel,stage:c.stage,date:todayOf(S.cfg),at:new Date().toISOString(),balance:c.balance},"Reminder logged");break;}
    case "log-no":pending=null;renderMain();break;
    case "cfg-save":{
      const n=x=>Number(val(x));
      const cfg={ownerName:val("c_owner"),upiId:val("c_upi"),countryCode:val("c_cc")||"91",defaultDueDay:Math.min(28,Math.max(1,n("c_due")||5)),r1:n("c_r1")||1,r2:n("c_r2")||5,r3:n("c_r3")||10,od:n("c_od")||15,testDate:val("c_test")};
      if(await save("cfg/main",cfg,"Settings saved")){}break;}
    case "backup-copy":STORE.markBackup();copyText(JSON.stringify(STORE.exportData()),"Backup");break;
    case "backup-download":downloadBackup(false);break;
    case "backup-share":downloadBackup(true);break;
    case "example-load":STORE.importData(EXAMPLE);sync();rerender();toast("Example data loaded. Delete it from Tenants when done.");break;
    case "erase-all":
      confirmYes=async()=>{STORE.erase();sync();modal=null;renderModal();rerender();toast("All data erased");};
      modal={type:"confirm",msg:"Erase ALL tenants, payments and settings on this phone? This cannot be undone. Download a backup first."};renderModal();break;
    case "restore-open":modal={type:"restore"};renderModal();break;
    case "restore-go":{
      let d;try{d=JSON.parse($("#restorebox").value);STORE.importData(d);}catch(e){toast("That is not a valid Rent Desk backup.");return;}
      sync();toast("Backup restored");modal=null;renderModal();rerender();break;}
  }
}
function wireTenantForm(){
  const r=$("#t_rent");if(!r)return;
  const old=modal.id?S.tenants.find(x=>x.id===modal.id):null;if(!old)return;
  const base=rentFor(old,curMonth());
  const chk=()=>{const w=$("#t_from_wrap");if(w)w.classList.toggle("hide",!(Number(r.value)!==base&&(Number(old.rent)||(old.rentChanges||[]).length)));};
  r.addEventListener("input",chk);
}

/* ---------- events ---------- */
document.addEventListener("click",e=>{
  const lg=e.target.closest("[data-log]");
  if(lg){pending={id:lg.dataset.id,channel:lg.dataset.log,month:S.month};setTimeout(renderMain,400);return;}
  const el=e.target.closest("[data-act]");
  if(!el)return;
  if(el.dataset.act==="overlay"){if(e.target===el){modal=null;renderModal();}return;}
  act(el.dataset.act,el);
});
document.addEventListener("change",async e=>{
  if(e.target.id==="restorefile"&&e.target.files[0]){const r=new FileReader();r.onload=()=>{$("#restorebox").value=String(r.result);};r.readAsText(e.target.files[0]);}
  if(e.target.id==="payfilter"){S.payFilter=e.target.value;renderMain();}
  if(e.target.id==="cs"){const tid=e.target.dataset.id;await save("callstat/"+tid+"_"+S.month,{tenantId:tid,month:S.month,status:e.target.value},"Call status saved");}
});
document.querySelectorAll(".nav button").forEach(b=>b.addEventListener("click",()=>{S.view=b.dataset.view;pending=null;renderMain();window.scrollTo(0,0);}));
$("#prev").addEventListener("click",()=>{S.month=addMonths(S.month,-1);pending=null;renderMain();});
$("#next").addEventListener("click",()=>{S.month=addMonths(S.month,1);pending=null;renderMain();});

/* ---------- backup helpers ---------- */
async function downloadBackup(share){
  const text=JSON.stringify(STORE.exportData(),null,1);
  const name="rent-desk-backup-"+todayOf(S.cfg)+".json";
  const file=new File([text],name,{type:"application/json"});
  try{
    if(share&&navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:"Rent Desk backup"});STORE.markBackup();rerender();return;}
  }catch(e){if(e&&e.name==="AbortError")return;}
  const url=URL.createObjectURL(file);const el=document.createElement("a");el.href=url;el.download=name;document.body.appendChild(el);el.click();el.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
  STORE.markBackup();rerender();toast("Backup file saved to Downloads");
}
const EXAMPLE={v:1,cfg:{ownerName:"Your Name",upiId:"yourname@upi"},
 tenants:[{id:"ex_a",name:"Example Tenant A",property:"Shop A",phone:"9800000001",rent:6500,rentConfirmed:true,rentChanges:[],createdAt:"2000-01-01T00:00:00Z",notes:"Example only"},
          {id:"ex_b",name:"Example Tenant B",property:"Shop B",phone:"9800000002",rent:2000,rentConfirmed:true,rentChanges:[],createdAt:"2000-01-01T00:00:01Z",notes:"Example only"}],
 payments:[],reminders:[]};

/* ---------- start ---------- */
function rerender(){renderMain();if(modal&&modal.type==="detail")renderModal();}
sync();
S.month=curMonth();
if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
renderMain();
// act() is called from inline click handlers above, which run in module scope.
