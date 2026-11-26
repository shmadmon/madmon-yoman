/* מדמון – שכבת נתונים מעל Supabase, באותו ממשק שהיומן השתמש בו קודם */
(function(){
"use strict";
const SB_URL="https://yhhngntlqvlpoirbfypc.supabase.co";
const SB_KEY="sb_publishable_rMnYOSpcmVNoDboeATqB0Q_Ux-inM_V";
const sb=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,storageKey:"madmon-auth"}});
window.sbClient=sb;

/* ---------- store ---------- */
function makeDb(){
  const cols=new Map();
  async function loadAll(c){
    const out=new Map();let from=0;
    for(;;){
      const {data,error}=await sb.from("docs").select("id,data").eq("collection",c).order("id").range(from,from+999);
      if(error)throw error;
      data.forEach(r=>out.set(r.id,r.data));
      if(data.length<1000)break;from+=1000;
    }
    return out;
  }
  function col(c){
    let o=cols.get(c);
    if(!o){
      o={map:new Map(),listeners:new Set(),loaded:false,err:null};cols.set(c,o);
      loadAll(c).then(m=>{o.map=m;o.loaded=true;emit(c)}).catch(e=>{o.err=e;o.listeners.forEach(l=>l.fail(e))});
    }
    return o;
  }
  function emit(c){const o=cols.get(c);if(o&&o.loaded)o.listeners.forEach(l=>l.fire())}
  sb.channel("docs-all").on("postgres_changes",{event:"*",schema:"public",table:"docs"},p=>{
    const r=(p.new&&p.new.collection)?p.new:p.old;if(!r||!r.collection)return;
    const o=cols.get(r.collection);if(!o)return;
    if(p.eventType==="DELETE")o.map.delete(r.id);else o.map.set(r.id,p.new.data);
    emit(r.collection);
  }).subscribe();
  function split(path){const i=path.indexOf("/");return [path.slice(0,i),path.slice(i+1)]}
  function query(c,filters){
    return {
      where(f,op,v){return query(c,filters.concat([[f,op,v]]))},
      onSnapshot(cb,err){
        const o=col(c);
        const l={fire(){
          const docs=[];
          for(const [id,d] of o.map){
            if(filters.every(([f,,v])=>d&&d[f]===v))docs.push({id,data:()=>d});
          }
          try{cb({docs,metadata:{fromCache:false}})}catch(e){console.error(e)}
        },fail(e){if(err)err(e)}};
        o.listeners.add(l);if(o.loaded)l.fire();else if(o.err)l.fail(o.err);
        return ()=>o.listeners.delete(l);
      }
    };
  }
  return {
    loadAll,
    collection(c){return query(c,[])},
    doc(path){
      const [c,id]=split(path);
      return {
        async set(data){
          const o=col(c);o.map.set(id,data);emit(c);
          const {error}=await sb.from("docs").upsert({collection:c,id,data});
          if(error){toastErr(error);throw error}
        },
        async delete(){
          const o=col(c);o.map.delete(id);emit(c);
          const {error}=await sb.from("docs").delete().eq("collection",c).eq("id",id);
          if(error){toastErr(error);throw error}
        },
        onSnapshot(cb,err){
          const o=col(c);
          const l={fire(){const d=o.map.get(id);try{cb({exists:d!==undefined,data:()=>d})}catch(e){console.error(e)}},fail(e){if(err)err(e)}};
          o.listeners.add(l);if(o.loaded)l.fire();else if(o.err)l.fail(o.err);
          return ()=>o.listeners.delete(l);
        }
      };
    }
  };
}
function toastErr(e){console.error(e);const b=document.getElementById("banner");if(b){b.textContent="השמירה נכשלה – בדקו את החיבור לאינטרנט ונסו שוב.";b.style.display="block"}}

/* ---------- login ---------- */
let resolveDb;const dbReady=new Promise(r=>resolveDb=r);
window.madmonDb=()=>dbReady;
window.madmonUser=null;

async function isMember(){
  const {data,error}=await sb.from("members").select("email").limit(1);
  return !error&&data&&data.length>0;
}
function showLogin(msg){
  const el=document.getElementById("login");el.style.display="flex";
  document.getElementById("lgMsg").textContent=msg||"";
}
async function afterSignIn(user){
  if(!(await isMember())){
    await sb.auth.signOut();
    showLogin("המייל "+user.email+" עדיין לא מורשה ביומן. בקשו מבעל היומן להוסיף אותו.");
    return;
  }
  window.madmonUser=user;
  document.getElementById("login").style.display="none";
  resolveDb(makeDb());
}
async function start(){
  const {data:{session}}=await sb.auth.getSession();
  if(session&&session.user)await afterSignIn(session.user);else showLogin("");
}
document.addEventListener("DOMContentLoaded",()=>{
  const f=document.getElementById("lgForm");
  const btn=(on)=>{f.querySelectorAll("button").forEach(b=>b.disabled=on)};
  let mode="in";
  document.getElementById("lgNew").addEventListener("click",()=>{mode="new"});
  document.getElementById("lgIn").addEventListener("click",()=>{mode="in"});
  f.addEventListener("submit",async e=>{
    const isNew=(e.submitter&&e.submitter.id==="lgNew")||(!e.submitter&&mode==="new");
    e.preventDefault();btn(true);document.getElementById("lgMsg").textContent="מתחבר…";
    const email=document.getElementById("lgEmail").value.trim().toLowerCase();
    const password=document.getElementById("lgPass").value;
    let {data,error}=await sb.auth.signInWithPassword({email,password});
    if(error&&isNew){
      const r=await sb.rpc("register_member",{p_email:email,p_password:password});
      const st=r.error?"error":r.data;
      if(st==="not_member"){btn(false);showLogin("המייל "+email+" לא ברשימת המורשים. בקשו מבעל היומן להוסיף אותו.");return}
      if(st==="exists"){btn(false);showLogin("כבר נרשמתם עם המייל הזה, אבל הסיסמה שגויה. נסו שוב, או בקשו מבעל היומן לאפס אותה.");return}
      if(st==="short_password"){btn(false);showLogin("הסיסמה צריכה להיות לפחות 6 תווים.");return}
      if(st!=="ok"){btn(false);showLogin(heErr(r.error||{message:String(st)}));return}
      ({data,error}=await sb.auth.signInWithPassword({email,password}));
    }
    btn(false);
    if(error){showLogin(heErr(error));return}
    await afterSignIn(data.user);
  });
  start();
});
function heErr(e){
  const m=(e&&e.message)||"";
  if(/Invalid login/i.test(m))return "מייל או סיסמה שגויים. משתמש חדש? מלאו מייל וסיסמה ולחצו \"כניסה ראשונה\".";
  if(/Password should be/i.test(m))return "הסיסמה צריכה להיות לפחות 6 תווים.";
  if(/already registered/i.test(m))return "המייל כבר רשום – לחצו \"כניסה\" עם הסיסמה שלכם.";
  if(/not confirmed/i.test(m))return "המייל עדיין לא אושר. בקשו מבעל היומן לאשר אותו.";
  if(/rate limit/i.test(m))return "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.";
  return "שגיאה: "+m;
}
document.addEventListener("click",async e=>{
  if(e.target&&e.target.id==="btnLogout"){await sb.auth.signOut();location.reload()}
});

/* ---------- service worker ---------- */
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
})();
