/*
 * Rent Desk - pure rent logic. No browser or storage code in this file, so it can be unit-tested with Node.
 * Month keys are strings like "2026-11". Dates are "YYYY-MM-DD" (India time).
 *
 * Rules implemented here:
 *  - Rent counts only when the tenant's rent is CONFIRMED and greater than 0.
 *  - Only VERIFIED payments reduce the balance. Unverified ones are shown as "to verify".
 *  - Status: PAID / PARTIALLY PAID / PENDING / OVERDUE (after the due date) / CONFIRM RENT.
 *  - Reminder stage comes from today's day of month and the Settings days; it stops when PAID.
 *  - "sendNow" is true when the current stage has no logged reminder yet.
 *  - Rent changes keep history: rentChanges = [{from:"2027-01", rent:7000}].
 */
const MR_MONTHS=["जानेवारी","फेब्रुवारी","मार्च","एप्रिल","मे","जून","जुलै","ऑगस्ट","सप्टेंबर","ऑक्टोबर","नोव्हेंबर","डिसेंबर"];
const EN_MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
const mrD=s=>String(s).replace(/[0-9]/g,d=>"०१२३४५६७८९"[d]);
const pad=n=>String(n).padStart(2,"0");
const fmt=n=>Number(n||0).toLocaleString("en-IN");
const ymKey=(y,m)=>y+"-"+pad(m);
function istToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function todayOf(cfg){return cfg&&/^\d{4}-\d{2}-\d{2}$/.test(cfg.testDate||"")?cfg.testDate:istToday();}
function monthEn(k){const p=k.split("-");return EN_MONTHS[p[1]-1]+" "+p[0];}
function monthMr(k){const p=k.split("-");return MR_MONTHS[p[1]-1]+" "+mrD(p[0]);}
function daysIn(k){const p=k.split("-").map(Number);return new Date(p[0],p[1],0).getDate();}
function addMonths(k,n){const p=k.split("-").map(Number);const d=new Date(p[0],p[1]-1+n,1);return ymKey(d.getFullYear(),d.getMonth()+1);}
function cleanPhone(v){let s=String(v||"").replace(/[\s+\-()]/g,"");if(!/^\d+$/.test(s)||s.length<10)return "";s=s.slice(-10);return Number(s[0])>=6?s:"";}
function rentFor(t,month){let r=Number(t.rent)||0;const ch=(t.rentChanges||[]).slice().sort((a,b)=>a.from<b.from?-1:1);for(const c of ch){if(c.from<=month)r=Number(c.rent)||0;}return r;}
function dueDateMr(dueDate){const p=dueDate.split("-");return mrD(Number(p[2]))+" "+MR_MONTHS[p[1]-1]+" "+mrD(p[0]);}
function dueDateEn(dueDate){const p=dueDate.split("-");return Number(p[2])+" "+EN_MONTHS[p[1]-1].slice(0,3)+" "+p[0];}
const STAGE_LABEL={"REMINDER 1":"Reminder 1","REMINDER 2":"Reminder 2","REMINDER 3":"Reminder 3","OVERDUE REMINDER":"Overdue reminder"};

function calc(S,t,month){
  const cfg=S.cfg||{};const td=todayOf(cfg);const curM=td.slice(0,7);
  const base=rentFor(t,month);const ready=!!t.rentConfirmed&&base>0;const rent=ready?base:0;
  const pays=S.payments.filter(p=>p.tenantId===t.id&&p.month===month);
  const sum=a=>a.reduce((x,p)=>x+(Number(p.amount)||0),0);
  const paid=sum(pays.filter(p=>p.verified));const unverified=sum(pays.filter(p=>!p.verified));
  const balance=Math.max(0,rent-paid);
  const dd=Math.min(Number(t.dueDay)||Number(cfg.defaultDueDay)||5,daysIn(month));
  const dueDate=month+"-"+pad(dd);
  let status;
  if(!ready)status="CONFIRM RENT";else if(balance<=0)status="PAID";else if(paid>0)status="PARTIALLY PAID";else status=td>dueDate?"OVERDUE":"PENDING";
  let stage="NOT YET",stageDay=null;
  if(!ready)stage="CONFIRM RENT";
  else if(balance<=0)stage="STOP (PAID)";
  else if(month>curM)stage="NOT YET";
  else if(month<curM){stage="OVERDUE REMINDER";stageDay=Number(cfg.od)||15;}
  else{const d=Number(td.slice(8));const r1=Number(cfg.r1)||1,r2=Number(cfg.r2)||5,r3=Number(cfg.r3)||10,od=Number(cfg.od)||15;
    if(d>=od){stage="OVERDUE REMINDER";stageDay=od;}else if(d>=r3){stage="REMINDER 3";stageDay=r3;}else if(d>=r2){stage="REMINDER 2";stageDay=r2;}else if(d>=r1){stage="REMINDER 1";stageDay=r1;}}
  let sendNow=false,stageStart=null;
  if(stageDay!==null){stageStart=month+"-"+pad(Math.min(stageDay,daysIn(month)));
    sendNow=!S.reminders.some(r=>r.tenantId===t.id&&r.month===month&&r.channel!=="Call"&&(r.date||"")>=stageStart);}
  const phone=cleanPhone(t.phone);const upi=String(t.upiId||"").trim()||String(cfg.upiId||"").trim();
  const issues=[];
  if(!phone)issues.push("Add a valid phone number.");
  if(!(base>0))issues.push("Add the monthly rent.");else if(!t.rentConfirmed)issues.push("Confirm the rent (switch on 'Rent confirmed').");
  if(!upi)issues.push("Add your UPI ID in Settings.");
  if(!String(cfg.ownerName||"").trim())issues.push("Add your name in Settings.");
  return {rent,base,ready,paid,unverified,balance,dueDate,status,stage,stageDay,stageStart,sendNow,phone,upi,issues,month,cc:String(cfg.countryCode||"91")};
}
function upiLink(S,t,c,withNote){
  const amt=String(Math.round(c.balance*100)/100);
  let u="upi://pay?pa="+c.upi+"&pn="+encodeURIComponent(String(S.cfg.ownerName||"").trim())+"&am="+amt+"&cu=INR";
  if(withNote)u+="&tn="+encodeURIComponent("Rent "+monthEn(c.month)+" - "+(t.property||""));
  return u;
}
function waText(S,t,c){
  const b=fmt(c.balance);
  return "नमस्कार "+t.name+" जी,\n\n"+monthMr(c.month)+" महिन्याचे भाडे बाकी आहे.\n\n💰 भाडे: ₹"+b+"\n📅 देय तारीख: "+dueDateMr(c.dueDate)+
   "\n\nकृपया खालील UPI लिंकवरून भाड्याची रक्कम जमा करा:\n\n💳 भाडे भरा:\n"+upiLink(S,t,c,true)+"\n\n(लिंक चालत नसल्यास UPI ID "+c.upi+" वर ₹"+b+" पाठवा.)\n\nपेमेंट केल्यानंतर कृपया पेमेंटचा स्क्रीनशॉट किंवा कन्फर्मेशन पाठवा.\n\nधन्यवाद! 🙏";
}
function smsText(S,t,c){
  return "नमस्कार "+t.name+", "+monthMr(c.month)+" महिन्याचे ₹"+fmt(c.balance)+" भाडे बाकी आहे. कृपया UPI द्वारे पेमेंट करा: "+upiLink(S,t,c,false)+" पेमेंटनंतर कन्फर्म करा. धन्यवाद.";
}
function smsParts(text){const n=[...text].length;return n<=70?1:Math.ceil(n/67);}
function callScript(S,t,c){
  return "नमस्कार "+t.name+" जी,\nमी भाडे भरण्याची आठवण करून देण्यासाठी कॉल करत आहे.\nआपल्या "+monthMr(c.month)+" महिन्याचे ₹"+fmt(c.balance)+" भाडे बाकी आहे.\nकृपया आपल्या सोयीने भाडे जमा करा.\nजर आपण आधीच पेमेंट केले असेल तर कृपया हा संदेश दुर्लक्षित करा.\nधन्यवाद.";
}
function callReplies(S,t,c){
  const m=monthMr(c.month);
  return [
   ["मी आज पेमेंट करतो.","धन्यवाद! खूप छान. मी आत्ताच WhatsApp वर UPI लिंक पाठवत आहे. पेमेंट झाल्यावर कृपया स्क्रीनशॉट पाठवा. धन्यवाद."],
   ["मी आधीच पेमेंट केले आहे.","ठीक आहे, धन्यवाद. कृपया पेमेंटचा स्क्रीनशॉट किंवा UTR / ट्रान्झॅक्शन नंबर WhatsApp वर पाठवा, म्हणजे मी तपासून नोंद करत आहे. काही गोंधळ झाला असल्यास क्षमस्व."],
   ["किती भाडे आहे?","आपल्या "+m+" महिन्याचे एकूण भाडे ₹"+fmt(c.rent)+" आहे"+(c.paid>0?", त्यापैकी ₹"+fmt(c.paid)+" जमा आहेत":"")+". बाकी भाडे ₹"+fmt(c.balance)+" आहे. धन्यवाद."],
   ["उद्या देतो.","ठीक आहे, धन्यवाद. कृपया उद्या भाडे जमा करा. मी WhatsApp वर UPI लिंक पाठवत आहे. पेमेंट झाल्यावर स्क्रीनशॉट पाठवा. धन्यवाद."],
   ["मला WhatsApp वर पाठवा.","नक्कीच, मी आत्ताच WhatsApp वर संदेश आणि UPI लिंक पाठवत आहे. कृपया तपासा. धन्यवाद."],
   ["आत्ता बोलू शकत नाही.","ठीक आहे, काहीच हरकत नाही. मी WhatsApp वर संदेश पाठवत आहे, आपल्या सोयीने पहा. धन्यवाद."]
  ];
}
function links(S,t,c){
  if(!c.ready||c.issues.length)return {wa:"",sms:"",tel:c.phone?"tel:+"+c.cc+c.phone:""};
  const can=c.balance>0;
  return {wa:can?"https://wa.me/"+c.cc+c.phone+"?text="+encodeURIComponent(waText(S,t,c)):"",
          sms:can?"sms:+"+c.cc+c.phone+"?body="+encodeURIComponent(smsText(S,t,c)):"",
          tel:"tel:+"+c.cc+c.phone};
}
function totals(S,month){
  const act=S.tenants;let due=0,col=0,out=0,unv=0;const n={"PAID":0,"PARTIALLY PAID":0,"PENDING":0,"OVERDUE":0,"CONFIRM RENT":0};
  const rows=act.map(t=>{const c=calc(S,t,month);due+=c.rent;col+=c.paid;out+=c.balance;unv+=c.unverified;n[c.status]++;return {t,c};});
  return {due,col,out,unv,n,rows,count:act.length};
}


export {MR_MONTHS,EN_MONTHS,mrD,pad,fmt,ymKey,istToday,todayOf,monthEn,monthMr,daysIn,addMonths,cleanPhone,rentFor,dueDateMr,dueDateEn,STAGE_LABEL,calc,upiLink,waText,smsText,smsParts,callScript,callReplies,links,totals};
