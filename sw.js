/* מדמון – עבודה גם בקליטה חלשה: מעטפת האפליקציה נשמרת במכשיר */
const V="madmon-v2";
const SHELL=["./","index.html","sb-store.js","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET")return;
  if(u.hostname.endsWith("supabase.co"))return; // נתונים – תמיד מהשרת
  const same=u.origin===self.location.origin;
  const cdn=/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(u.hostname);
  if(!same&&!cdn)return;
  // רשת קודם (כדי לקבל עדכונים מיד), ובלי קליטה – מהמטמון
  e.respondWith(fetch(e.request).then(r=>{if(r&&r.ok){const cp=r.clone();caches.open(V).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.match(e.request).then(m=>m||caches.match("index.html"))));
});
