/* Spielarchiv — persönliche Videospiel-Bewertungen.
   Daten liegen als JSON im GitHub-Repo, Cover und Metadaten kommen von RAWG. */
(function(){
"use strict";

var CFG = window.SA_CONFIG || {};

/* ============ Konstanten ============ */
var STATUS = [
  {k:"gespielt",    l:"Gespielt"},
  {k:"spiele",      l:"Am Spielen"},
  {k:"backlog",     l:"Backlog"},
  {k:"abgebrochen", l:"Abgebrochen"}
];
var STATUS_L = {}; STATUS.forEach(function(s){ STATUS_L[s.k]=s.l; });

var BANDS = [
  {min:90, l:"Meisterwerk",  c:"top"},
  {min:80, l:"Herausragend", c:"top"},
  {min:70, l:"Stark",        c:"good"},
  {min:60, l:"Solide",       c:"good"},
  {min:45, l:"Mittelmaß",    c:"mid"},
  {min:30, l:"Schwach",      c:"low"},
  {min:0,  l:"Mies",         c:"low"}
];
function band(s){ for(var i=0;i<BANDS.length;i++){ if(s>=BANDS[i].min) return BANDS[i]; } return BANDS[BANDS.length-1]; }
function bandVar(s){ return "var(--band-"+band(s).c+")"; }

var PLAT_ORDER = ["PC","PlayStation 5","PlayStation 4","Xbox Series S/X","Xbox One","Nintendo Switch","macOS","Linux","iOS","Android"];
var PLAT_SHORT = {"PC":"PC","PlayStation 5":"PS5","PlayStation 4":"PS4","Xbox Series S/X":"Xbox Series",
  "Xbox One":"Xbox One","Nintendo Switch":"Switch","macOS":"Mac","Linux":"Linux","iOS":"iOS","Android":"Android"};

/* ============ State ============ */
var games = [], lists = [];
var sha = null, saveState = "idle", lastSaved = null, saveTimer = null, savingNow = false;
var view = "grid";
var filt = { q:"", status:"", plat:"", genre:"", list:"", min:1, sort:"score-desc" };

var $ = function(s){ return document.querySelector(s); };
function el(t,c,txt){ var n=document.createElement(t); if(c) n.className=c; if(txt!=null) n.textContent=txt; return n; }
function uid(){ return (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : "g"+Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function nz(v){ return (v==null||v==="") ? null : Number(v); }

var LS = {
  get:function(k,d){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } },
  set:function(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} },
  raw:function(k){ try{ return localStorage.getItem(k)||""; }catch(e){ return ""; } },
  put:function(k,v){ try{ if(v) localStorage.setItem(k,v); else localStorage.removeItem(k); }catch(e){} }
};

function token(){ return LS.raw("sa.token").trim(); }
function rawgKey(){ return LS.raw("sa.rawg").trim(); }

function toast(msg){
  var old=document.querySelector(".toast"); if(old) old.remove();
  var t=el("div","toast",msg); document.body.appendChild(t);
  setTimeout(function(){ if(t.parentNode) t.remove(); },3200);
}
function notice(msg, actions){
  var n=$("#notice"); n.innerHTML="";
  if(!msg){ n.hidden=true; return; }
  n.appendChild(el("span",null,msg));
  if(actions && actions.length){
    var box=el("div","notice-acts");
    actions.forEach(function(a){
      var b=el("button","btn btn-sm",a.label); b.type="button";
      b.addEventListener("click",a.onClick);
      box.appendChild(b);
    });
    n.appendChild(box);
  }
  n.hidden=false;
}

/* ============ GitHub ============ */
function apiUrl(sub){ return "https://api.github.com/repos/"+CFG.owner+"/"+CFG.repo+sub; }
function ghHeaders(withAuth){
  var h={ "Accept":"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28" };
  var t=token();
  if(t && withAuth!==false) h["Authorization"]="Bearer "+t;
  return h;
}
function encodeB64(str){
  var bytes=new TextEncoder().encode(str), bin="";
  for(var i=0;i<bytes.length;i+=0x8000) bin+=String.fromCharCode.apply(null, bytes.subarray(i,i+0x8000));
  return btoa(bin);
}
function decodeB64(b64){
  var bin=atob(String(b64).replace(/\s/g,"")), bytes=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function payload(){
  return { version:1, updatedAt:new Date().toISOString(), lists:lists, games:games };
}

async function ghLoad(){
  var url = apiUrl("/contents/"+encodeURI(CFG.path)+"?ref="+encodeURIComponent(CFG.branch));
  var r = await fetch(url, {headers:ghHeaders(), cache:"no-store"});
  if(r.status===404){
    var rr = await fetch(apiUrl(""), {headers:ghHeaders(), cache:"no-store"});
    if(rr.status===404){
      var e404=new Error(token()
        ? "GitHub findet "+CFG.owner+"/"+CFG.repo+" nicht. Meist hat der Token keinen Zugriff darauf — "+
          "bei „Repository access“ muss „"+CFG.repo+"“ ausgewaehlt und „Contents“ auf „Read and write“ stehen."
        : "GitHub findet "+CFG.owner+"/"+CFG.repo+" nicht. Stimmen owner und repo in js/config.js?");
      e404.auth=true; throw e404;
    }
    return { data:null, sha:null };
  }
  if(r.status===401 || r.status===403){
    var e=new Error(r.status===401 ? "Der Token wird nicht akzeptiert." : "Zugriff verweigert oder Limit erreicht.");
    e.auth=true; throw e;
  }
  if(!r.ok) throw new Error("GitHub antwortet mit "+r.status+".");
  var j = await r.json();
  var data;
  try{ data = JSON.parse(decodeB64(j.content)); }
  catch(e){ throw new Error("Die Datei im Repo ist kein gültiges JSON."); }
  return { data:data, sha:j.sha };
}

async function ghSave(){
  var body = {
    message: "Archiv aktualisiert ("+games.length+" Spiele)",
    content: encodeB64(JSON.stringify(payload(), null, 2)),
    branch: CFG.branch
  };
  if(sha) body.sha = sha;
  var r = await fetch(apiUrl("/contents/"+encodeURI(CFG.path)), {
    method:"PUT", headers:Object.assign({"Content-Type":"application/json"}, ghHeaders()), body:JSON.stringify(body)
  });
  if(r.status===409 || r.status===422){ var c=new Error("conflict"); c.conflict=true; throw c; }
  if(r.status===401 || r.status===403){ var a=new Error(r.status===401?"Der Token wird nicht akzeptiert.":"Der Token darf in dieses Repo nicht schreiben."); a.auth=true; throw a; }
  if(r.status===404){
    throw new Error("GitHub findet das Repository nicht. Fast immer heisst das: Der Token hat keinen "+
      "Zugriff darauf — bei „Repository access“ war „"+CFG.repo+"“ nicht ausgewaehlt.");
  }
  if(!r.ok){
    var txt=""; try{ txt=(await r.json()).message||""; }catch(e){}
    throw new Error("GitHub antwortet mit "+r.status+(txt?": "+txt:"")+".");
  }
  var j = await r.json();
  sha = j.content.sha;
}

function setSave(s, text){
  saveState=s;
  var chip=$("#savechip"); chip.setAttribute("data-s", s);
  $("#savetext").textContent = text;
}
function paintSave(){
  if(savingNow) return setSave("saving","speichert …");
  if(!token())  return setSave("idle","nur lokal");
  if(saveState==="error" && dirty) return setSave("error","nicht gespeichert");
  if(dirty)     return setSave("dirty","ungespeichert");
  setSave("saved", lastSaved ? "gespeichert "+lastSaved.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}) : "gespeichert");
}

var dirty=false;
function cacheNow(){ LS.set("sa.cache", {games:games, lists:lists, sha:sha, dirty:dirty, at:Date.now()}); }
function stashLocal(){
  if(!games.length) return;
  LS.set("sa.backup", {games:games, lists:lists, at:Date.now()});
}
function markDirty(){
  dirty=true;
  cacheNow();
  paintSave();
  if(!token()) return;
  clearTimeout(saveTimer);
  saveTimer=setTimeout(function(){ saveNow(); }, 3500);
}

async function saveNow(){
  if(savingNow) return;
  if(!token()){ openSettings("Zum Speichern auf GitHub fehlt noch der Token."); return; }
  clearTimeout(saveTimer);
  savingNow=true; paintSave();
  try{
    await ghSave();
    dirty=false; lastSaved=new Date(); savingNow=false;
    cacheNow();
    notice(null); paintSave();
  }catch(e){
    savingNow=false;
    if(e && e.conflict){
      setSave("error","Konflikt");
      notice("Im Repo liegt eine neuere Version — vermutlich hast du an einem anderen Gerät gespeichert.", [
        {label:"GitHub übernehmen", onClick:function(){ location.reload(); }},
        {label:"Meine Version durchsetzen", onClick:async function(){
          try{ var got=await ghLoad(); sha=got.sha; notice(null); saveNow(); }
          catch(err){ toast(err.message); }
        }}
      ]);
      return;
    }
    setSave("error","Fehler");
    notice("Nicht gespeichert: "+(e && e.message ? e.message : "unbekannter Fehler")+" Deine Änderungen liegen weiter in diesem Browser.", [
      {label:"Nochmal", onClick:function(){ saveNow(); }},
      {label:"Einstellungen", onClick:function(){ openSettings(); }}
    ]);
  }
}

/* ============ Datensätze ============ */
function putGame(g){
  g.updatedAt = Date.now();
  var i = games.findIndex(function(x){ return x.id===g.id; });
  if(i<0) games.push(g); else games[i]=g;
  markDirty(); render();
}
function dropGame(id){
  games = games.filter(function(x){ return x.id!==id; });
  markDirty(); render();
}
function putList(l){
  var i = lists.findIndex(function(x){ return x.id===l.id; });
  if(i<0) lists.push(l); else lists[i]=l;
  markDirty(); render();
}
function dropList(id){
  lists = lists.filter(function(x){ return x.id!==id; });
  games.forEach(function(g){
    if((g.listIds||[]).indexOf(id)>=0) g.listIds = g.listIds.filter(function(x){ return x!==id; });
  });
  if(filt.list===id) filt.list="";
  markDirty(); render();
}

/* ============ RAWG ============ */
function rimg(url,w){
  if(!url) return "";
  if(url.slice(0,5)==="data:") return url;
  return url.indexOf("/media/")>=0 ? url.replace("/media/","/media/resize/"+(w||420)+"/-/") : url;
}
function shortPlat(n){ return PLAT_SHORT[n] || n; }
function preferredPlatform(){
  var count={}, best="", top=0;
  games.forEach(function(g){
    if(!g.platform) return;
    count[g.platform]=(count[g.platform]||0)+1;
    if(count[g.platform]>top){ top=count[g.platform]; best=g.platform; }
  });
  return best;
}
function pickPlatform(names){
  var shorts=names.map(shortPlat);
  var pref=preferredPlatform();
  if(pref && shorts.indexOf(pref)>=0) return pref;
  for(var i=0;i<PLAT_ORDER.length;i++){ if(names.indexOf(PLAT_ORDER[i])>=0) return PLAT_SHORT[PLAT_ORDER[i]]; }
  return shorts[0] || "";
}
async function rawgSearch(q, signal){
  var key=rawgKey();
  if(!key){ var e=new Error("Kein RAWG-Key hinterlegt."); e.nokey=true; throw e; }
  var url="https://api.rawg.io/api/games?key="+encodeURIComponent(key)+
          "&search="+encodeURIComponent(q)+"&page_size=8&search_precise=true";
  var r=await fetch(url,{signal:signal});
  if(r.status===401){ var a=new Error("Der RAWG-Key wird nicht akzeptiert."); a.nokey=true; throw a; }
  if(r.status===429) throw new Error("RAWG-Limit erreicht. Später nochmal.");
  if(!r.ok) throw new Error("RAWG antwortet mit "+r.status+".");
  var j=await r.json();
  return (j.results||[]).map(function(g){
    var names=(g.platforms||[]).map(function(p){ return (p.platform&&p.platform.name)||""; }).filter(Boolean);
    var shorts=[];
    names.map(shortPlat).forEach(function(x){ if(shorts.indexOf(x)<0) shorts.push(x); });
    return {
      name: g.name || "",
      release: g.released || "",
      cover: g.background_image || "",
      platforms: shorts,
      playtime: Number(g.playtime) > 0 ? Math.round(Number(g.playtime)) : "",
      platform: pickPlatform(names),
      genres: (g.genres||[]).map(function(x){ return x.name; }).slice(0,3),
      metacritic: g.metacritic || null
    };
  });
}
function applyHit(target, hit, opts){
  opts = opts || {};
  if(hit.name) target.title = hit.name;
  if(hit.release && (!target.release || opts.force)) target.release = hit.release;
  if(hit.platform && (!target.platform || opts.force)) target.platform = hit.platform;
  if(hit.playtime && (!target.avgHours || opts.force)) target.avgHours = hit.playtime;
  if(hit.genres && hit.genres.length){
    target.genres = target.genres || [];
    hit.genres.forEach(function(x){ if(target.genres.indexOf(x)<0) target.genres.push(x); });
  }
  return hit.cover || "";
}

/* ============ Bild verkleinern ============ */
function fileToCover(file){
  return new Promise(function(res,rej){
    if(!file || !/^image\//.test(file.type)) return rej(new Error("Keine Bilddatei."));
    var fr=new FileReader();
    fr.onerror=function(){ rej(new Error("Datei nicht lesbar.")); };
    fr.onload=function(){
      var img=new Image();
      img.onerror=function(){ rej(new Error("Bild nicht lesbar.")); };
      img.onload=function(){
        var maxW=300, maxH=420;
        var s=Math.min(maxW/img.width, maxH/img.height, 1);
        var w=Math.max(1,Math.round(img.width*s)), h=Math.max(1,Math.round(img.height*s));
        var c=document.createElement("canvas"); c.width=w; c.height=h;
        var ctx=c.getContext("2d"); ctx.fillStyle="#fff"; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
        var out=c.toDataURL("image/jpeg",0.74);
        if(out.length>180000) out=c.toDataURL("image/jpeg",0.55);
        res(out);
      };
      img.src=fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ============ Formatierung ============ */
function fmtHours(h){
  var n=nz(h); if(n==null || !isFinite(n)) return null;
  return (Math.round(n*10)/10).toLocaleString("de-DE")+" h";
}
function fmtAvg(h){
  var n=nz(h);
  return (n==null || !isFinite(n) || n<=0) ? null : Math.round(n).toLocaleString("de-DE")+" h";
}
function parseDate(s){
  var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||"");
  return m ? new Date(+m[1], +m[2]-1, +m[3]) : null;
}
function fmtDate(s){ var d=parseDate(s); return d ? d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"}) : null; }
function fmtSpan(a,b){
  var A=fmtDate(a), B=fmtDate(b);
  if(A&&B) return A===B ? A : A+" – "+B;
  if(A) return "seit "+A;
  if(B) return "bis "+B;
  return null;
}
function releaseYear(g){ var m=/^(\d{4})/.exec(String(g.release||"")); return m?+m[1]:null; }
function releaseSort(g){
  var m=/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(g.release||""));
  return m ? (+m[1])*10000 + (m[2]?+m[2]:0)*100 + (m[3]?+m[3]:0) : -1;
}

/* ============ Ableitungen ============ */
function allPlatforms(){
  var s={}; games.forEach(function(g){ if(g.platform) s[g.platform]=1; });
  return Object.keys(s).sort(function(a,b){ return a.localeCompare(b,"de"); });
}
function allGenres(){
  var s={}; games.forEach(function(g){ (g.genres||[]).forEach(function(x){ s[x]=1; }); });
  return Object.keys(s).sort(function(a,b){ return a.localeCompare(b,"de"); });
}
function visible(){
  var q=filt.q.trim().toLowerCase();
  return games.filter(function(g){
    if(filt.status && g.status!==filt.status) return false;
    if(filt.plat && g.platform!==filt.plat) return false;
    if(filt.genre && (g.genres||[]).indexOf(filt.genre)<0) return false;
    if(filt.list && (g.listIds||[]).indexOf(filt.list)<0) return false;
    if(filt.min>1 && !(Number(g.score)>=filt.min)) return false;
    if(q){
      var hay=[g.title,g.platform,g.notes,(g.genres||[]).join(" "),STATUS_L[g.status]||""].join(" ").toLowerCase();
      if(hay.indexOf(q)<0) return false;
    }
    return true;
  }).sort(sorter(filt.sort));
}
function sorter(s){
  var byTitle=function(a,b){ return String(a.title||"").localeCompare(String(b.title||""),"de",{sensitivity:"base"}); };
  function numDesc(f){ return function(a,b){ var x=nz(f(a)), y=nz(f(b));
    if(x==null&&y==null) return byTitle(a,b); if(x==null) return 1; if(y==null) return -1; return y-x || byTitle(a,b); }; }
  function numAsc(f){ return function(a,b){ var x=nz(f(a)), y=nz(f(b));
    if(x==null&&y==null) return byTitle(a,b); if(x==null) return 1; if(y==null) return -1; return x-y || byTitle(a,b); }; }
  function strDesc(f){ return function(a,b){ var x=f(a)||"", y=f(b)||"";
    if(!x&&!y) return byTitle(a,b); if(!x) return 1; if(!y) return -1; return x<y?1:x>y?-1:byTitle(a,b); }; }
  switch(s){
    case "score-asc":       return numAsc(function(g){ return g.score; });
    case "title-asc":       return byTitle;
    case "hours-desc":      return numDesc(function(g){ return g.hours; });
    case "completion-desc": return numDesc(function(g){ return g.completion; });
    case "finished-desc":   return strDesc(function(g){ return g.finishedOn; });
    case "release-desc":    return function(a,b){ var x=releaseSort(a), y=releaseSort(b);
                              if(x<0&&y<0) return byTitle(a,b); if(x<0) return 1; if(y<0) return -1; return y-x || byTitle(a,b); };
    case "added-desc":      return numDesc(function(g){ return g.createdAt; });
    default:                return numDesc(function(g){ return g.score; });
  }
}

/* ============ Cover ============ */
function hueOf(s){
  s=String(s||"?"); var h=2166136261;
  for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=(h*16777619)>>>0; }
  return h%360;
}
function initials(t){
  var w=String(t||"?").trim().split(/[\s:._–—-]+/).filter(Boolean);
  if(!w.length) return "?";
  if(w.length===1) return w[0].slice(0,2).toUpperCase();
  return (w[0].charAt(0)+w[1].charAt(0)).toUpperCase();
}
function tileStyle(node,title){
  var h=hueOf(title);
  node.style.background="linear-gradient(155deg, hsl("+h+" 46% 55%), hsl("+((h+40)%360)+" 50% 32%))";
}
function coverNode(g,cls,w){
  var box=el("div",cls||"cover");
  if(g.cover){
    var im=el("img"); im.src=rimg(g.cover,w||420); im.alt=""; im.loading="lazy";
    im.addEventListener("error",function(){
      im.remove();
      tileStyle(box, g.title||g.id);
      box.appendChild(el("div","cover-ph",initials(g.title)));
    });
    box.appendChild(im);
  } else {
    tileStyle(box, g.title||g.id);
    box.appendChild(el("div","cover-ph",initials(g.title)));
  }
  return box;
}

/* ============ Render: Kennzahlen ============ */
function renderStats(){
  var rows=visible();
  var scored=rows.filter(function(g){ return nz(g.score)!=null; });
  var avg = scored.length ? scored.reduce(function(a,g){ return a+Number(g.score); },0)/scored.length : null;
  var hrs = rows.reduce(function(a,g){ return a+(nz(g.hours)||0); },0);
  var done = rows.filter(function(g){ return Number(g.completion)>=100 || g.status==="gespielt"; }).length;

  var buckets=new Array(10).fill(0);
  scored.forEach(function(g){ buckets[Math.min(9,Math.max(0,Math.floor((Number(g.score)-1)/10)))]++; });
  var peak=Math.max.apply(null,buckets.concat([1]));

  var s=$("#stats"); s.innerHTML="";
  function tile(k,v,sub){
    var d=el("div","stat");
    d.appendChild(el("span","stat-k",k));
    var b=el("div","stat-v"); b.textContent=v;
    if(sub) b.appendChild(el("small",null,sub));
    d.appendChild(b); return d;
  }
  s.appendChild(tile("Spiele", String(rows.length)));
  s.appendChild(tile("Ø Wertung", avg==null?"—":(Math.round(avg*10)/10).toLocaleString("de-DE"), avg==null?null:"/ 100"));
  s.appendChild(tile("Stunden", hrs?Math.round(hrs).toLocaleString("de-DE"):"—", hrs?"h gesamt":null));
  s.appendChild(tile("Abgeschlossen", String(done), rows.length?"von "+rows.length:null));

  var h=el("div","hist");
  h.appendChild(el("span","stat-k","Verteilung der Wertungen"));
  var bars=el("div","hist-bars");
  buckets.forEach(function(n,i){
    var b=el("i");
    b.style.height=(n ? Math.max(8,Math.round(n/peak*38)) : 2)+"px";
    if(n) b.setAttribute("data-band", band(i*10+5).c);
    b.title=(i*10+1)+"–"+(i*10+10)+": "+n+(n===1?" Spiel":" Spiele");
    bars.appendChild(b);
  });
  h.appendChild(bars);
  var ax=el("div","hist-axis");
  ["1","50","100"].forEach(function(x){ ax.appendChild(el("span",null,x)); });
  h.appendChild(ax);
  s.appendChild(h);
}

/* ============ Render: Rail ============ */
function renderRail(){
  var sw=$("#f-status");
  if(!sw.childElementCount){
    STATUS.forEach(function(st){
      var b=el("button","pill",st.l); b.type="button"; b.dataset.k=st.k;
      b.addEventListener("click",function(){ filt.status=(filt.status===st.k)?"":st.k; render(); });
      sw.appendChild(b);
    });
  }
  Array.prototype.forEach.call(sw.children,function(b){ b.setAttribute("aria-pressed", String(filt.status===b.dataset.k)); });

  function fillSelect(sel,items,all,cur){
    var focused=document.activeElement===sel;
    sel.innerHTML="";
    var o=el("option",null,all); o.value=""; sel.appendChild(o);
    items.forEach(function(x){ var oo=el("option",null,x); oo.value=x; sel.appendChild(oo); });
    sel.value = items.indexOf(cur)>=0 ? cur : "";
    if(focused) sel.focus();
  }
  fillSelect($("#f-plat"), allPlatforms(), "Alle Plattformen", filt.plat);
  fillSelect($("#f-genre"), allGenres(), "Alle Genres", filt.genre);
  $("#f-min").value=filt.min; $("#f-min-out").textContent=filt.min;
  if($("#f-q").value!==filt.q) $("#f-q").value=filt.q;
  $("#f-sort").value=filt.sort;

  var box=$("#lists"); box.innerHTML="";
  var allRow=el("button","listrow"); allRow.type="button";
  allRow.setAttribute("aria-current", String(!filt.list));
  allRow.appendChild(el("span","lr-name","Alle Spiele"));
  allRow.appendChild(el("span","lr-n",String(games.length)));
  allRow.addEventListener("click",function(){ filt.list=""; render(); });
  box.appendChild(allRow);

  if(!lists.length){
    var hint=el("p","hint","Noch keine Listen. Lege z. B. „Top 10 2025“ oder „Nochmal spielen“ an.");
    hint.style.marginTop="8px"; box.appendChild(hint);
  }
  lists.slice().sort(function(a,b){ return (a.createdAt||0)-(b.createdAt||0); }).forEach(function(l){
    var n=games.filter(function(g){ return (g.listIds||[]).indexOf(l.id)>=0; }).length;
    var r=el("button","listrow"); r.type="button";
    r.setAttribute("aria-current", String(filt.list===l.id));
    r.appendChild(el("span","lr-name",l.name));
    r.appendChild(el("span","lr-n",String(n)));
    var dl=el("button","lr-del","×"); dl.type="button"; dl.setAttribute("aria-label","Liste „"+l.name+"“ löschen");
    dl.addEventListener("click",function(ev){
      ev.stopPropagation();
      if(confirm("Liste „"+l.name+"“ löschen? Die Spiele bleiben erhalten.")) dropList(l.id);
    });
    r.appendChild(dl);
    r.addEventListener("click",function(){ filt.list=(filt.list===l.id)?"":l.id; render(); });
    box.appendChild(r);
  });
}

/* ============ Render: Karten & Tabelle ============ */
function factNode(k,v){ var f=el("span","fact"); f.appendChild(el("span",null,k)); f.appendChild(el("b",null,v)); return f; }

function cardNode(g, rank){
  var a=el("button","poster"); a.type="button";

  var art=coverNode(g,"poster-art",640);
  if(rank){ art.appendChild(el("span","poster-rank","#"+rank)); }

  var st=el("span","poster-status",STATUS_L[g.status]||"Backlog");
  art.appendChild(st);

  var sc=nz(g.score);
  var sb=el("div","poster-score");
  var num=el("b", null, sc==null ? "ohne Wertung" : String(sc));
  if(sc==null) num.className="none"; else num.style.color=bandVar(sc);
  sb.appendChild(num);
  if(sc!=null){ var bd=el("em",null,band(sc).l); bd.style.color=bandVar(sc); sb.appendChild(bd); }
  art.appendChild(sb);
  a.appendChild(art);

  var b=el("div","poster-body");
  b.appendChild(el("div","poster-title",g.title||"Ohne Titel"));
  var bits=[]; var ry=releaseYear(g); if(ry) bits.push(String(ry));
  if(g.platform) bits.push(g.platform);
  if(bits.length) b.appendChild(el("div","poster-meta",bits.join(" · ")));

  if(sc!=null){
    var m=el("div","meter"), fi=el("i");
    fi.style.width=Math.max(1,sc)+"%"; fi.style.background=bandVar(sc);
    m.appendChild(fi); b.appendChild(m);
  }

  var facts=el("div","facts");
  var fh=fmtHours(g.hours); if(fh) facts.appendChild(factNode("Zeit",fh));
  var fa=fmtAvg(g.avgHours); if(fa) facts.appendChild(factNode("Üblich",fa));
  var cp=nz(g.completion); if(cp!=null) facts.appendChild(factNode("Fortschritt",Math.round(cp)+" %"));
  var sp=fmtSpan(g.startedOn,g.finishedOn); if(sp) facts.appendChild(factNode("Gespielt",sp));
  if(facts.childElementCount) b.appendChild(facts);

  if((g.genres||[]).length){
    var tags=el("div","tags");
    g.genres.slice(0,3).forEach(function(x){ tags.appendChild(el("span","tag",x)); });
    b.appendChild(tags);
  }

  a.appendChild(b);
  a.addEventListener("click",function(){ openEditor(g.id); });
  return a;
}

function renderGrid(rows){
  var wrap=el("div","grid");
  var ranked = filt.sort==="score-desc";
  rows.forEach(function(g,i){ wrap.appendChild(cardNode(g, ranked && nz(g.score)!=null ? i+1 : 0)); });
  return wrap;
}

function renderTable(rows){
  var w=el("div","tablewrap"), t=el("table"), thead=el("thead"), hr=el("tr");
  ["#","","Titel","Wertung","Zeit","Fortschritt","Zeitraum","Status"].forEach(function(h,i){
    var th=el("th",null,h); if(i===0) th.style.textAlign="right"; hr.appendChild(th);
  });
  thead.appendChild(hr); t.appendChild(thead);
  var tb=el("tbody");
  rows.forEach(function(g,i){
    var tr=el("tr"); tr.tabIndex=0;
    tr.appendChild(el("td","t-rank",String(i+1)));
    var tdc=el("td","t-cover"); tdc.appendChild(coverNode(g,"cv",420)); tr.appendChild(tdc);

    var tdt=el("td");
    tdt.appendChild(el("div","t-title",g.title||"Ohne Titel"));
    var bits=[]; var ry=releaseYear(g); if(ry) bits.push(String(ry));
    if(g.platform) bits.push(g.platform);
    if((g.genres||[]).length) bits.push(g.genres.slice(0,3).join(", "));
    if(bits.length) tdt.appendChild(el("div","t-sub",bits.join(" · ")));
    tr.appendChild(tdt);

    var tds=el("td","t-score"), sc=nz(g.score);
    var n=el("div","t-score-n", sc==null?"—":String(sc));
    n.style.color = sc==null ? "var(--ink-3)" : bandVar(sc);
    tds.appendChild(n);
    if(sc!=null){ var m=el("div","meter"), fi=el("i"); fi.style.width=Math.max(1,sc)+"%"; fi.style.background=bandVar(sc); m.appendChild(fi); tds.appendChild(m); }
    tr.appendChild(tds);

    var fh=fmtHours(g.hours), fa2=fmtAvg(g.avgHours);
    var tdh=el("td","t-num"+(fh?"":" t-dim"));
    tdh.appendChild(el("div",null,fh||"—"));
    if(fa2) tdh.appendChild(el("div","t-sub","Ø "+fa2));
    tr.appendChild(tdh);
    var cp=nz(g.completion);    tr.appendChild(el("td","t-num"+(cp!=null?"":" t-dim"), cp!=null?Math.round(cp)+" %":"—"));
    var sp=fmtSpan(g.startedOn,g.finishedOn); tr.appendChild(el("td","t-num"+(sp?"":" t-dim"), sp||"—"));

    var tdst=el("td");
    var st=el("span","status",STATUS_L[g.status]||"Backlog"); st.setAttribute("data-s",g.status||"backlog");
    tdst.appendChild(st); tr.appendChild(tdst);

    tr.addEventListener("click",function(){ openEditor(g.id); });
    tr.addEventListener("keydown",function(ev){ if(ev.key==="Enter"||ev.key===" "){ ev.preventDefault(); openEditor(g.id); } });
    tb.appendChild(tr);
  });
  t.appendChild(tb); w.appendChild(t);
  return w;
}

function demoCard(){
  var c=cardNode({ id:"__demo", title:"Beispieleintrag", platform:"PS5", release:"2022-02-25", score:87,
    hours:63.5, avgHours:58, completion:92, startedOn:"2024-03-05", finishedOn:"2024-04-21", status:"gespielt",
    genres:["Action-RPG","Open World"], listIds:[] });
  c.classList.add("demo"); c.tabIndex=-1; c.setAttribute("aria-hidden","true");
  return c;
}

function renderEmpty(){
  var e=el("div","empty"), L=el("div");
  var filtered = games.length>0;
  L.appendChild(el("h2", null, filtered ? "Kein Spiel passt zu diesem Filter" : "Dein Archiv ist noch leer"));
  if(filtered){
    L.appendChild(el("p",null,"Setz die Filter zurück oder such nach etwas anderem."));
    var rb=el("button","btn","Filter zurücksetzen"); rb.type="button";
    rb.addEventListener("click",resetFilters);
    L.appendChild(rb);
  } else {
    L.appendChild(el("p",null,"Tipp den Titel ein, such das Spiel in der Datenbank und übernimm Cover, Release, Plattform und Genres mit einem Klick. Wertung, Stunden und Zeitraum trägst du selbst ein."));
    var ul=el("ul");
    ["Wertung von 1 bis 100, mit Skala und Prädikat",
     "Stunden, Fortschritt in Prozent und Zeitraum von–bis",
     "Cover und Metadaten automatisch aus der Spieledatenbank",
     "Eigene Listen wie „Top 10 2025“ neben dem Status"].forEach(function(x){ ul.appendChild(el("li",null,x)); });
    L.appendChild(ul);
    var row=el("div"); row.style.cssText="display:flex;gap:8px;flex-wrap:wrap";
    var b1=el("button","btn btn-accent","Erstes Spiel eintragen"); b1.type="button";
    b1.addEventListener("click",function(){ openEditor(null); });
    var b2=el("button","btn","Mehrere auf einmal"); b2.type="button";
    b2.addEventListener("click",openBulk);
    var b3=el("button","btn btn-quiet","JSON importieren"); b3.type="button";
    b3.addEventListener("click",function(){ $("#file-import").click(); });
    row.appendChild(b1); row.appendChild(b2); row.appendChild(b3);
    L.appendChild(row);
  }
  e.appendChild(L);

  var R=el("div");
  R.appendChild(el("span","demo-label","So sieht ein Eintrag aus"));
  R.appendChild(demoCard());
  e.appendChild(R);
  return e;
}

function renderActiveFilters(){
  var box=$("#activefilters");
  box.innerHTML="";
  var chips=[];
  if(filt.q)      chips.push({k:"Suche", v:"„"+filt.q+"“", off:function(){ filt.q=""; $("#f-q").value=""; }});
  if(filt.status) chips.push({k:"Status", v:STATUS_L[filt.status], off:function(){ filt.status=""; }});
  if(filt.plat)   chips.push({k:"Plattform", v:filt.plat, off:function(){ filt.plat=""; }});
  if(filt.genre)  chips.push({k:"Genre", v:filt.genre, off:function(){ filt.genre=""; }});
  if(filt.list){
    var l=lists.find(function(x){ return x.id===filt.list; });
    if(l) chips.push({k:"Liste", v:l.name, off:function(){ filt.list=""; }});
  }
  if(filt.min>1)  chips.push({k:"Wertung", v:"ab "+filt.min, off:function(){ filt.min=1; }});

  var ft=$("#btn-filters");
  if(ft) ft.textContent = chips.length ? "Filter · "+chips.length : "Filter";
  if(!chips.length){ box.hidden=true; return; }
  box.hidden=false;
  chips.forEach(function(c){
    var w=el("span","afchip");
    w.appendChild(el("span",null,c.k));
    w.appendChild(document.createTextNode(c.v));
    var x=el("button",null,"×"); x.type="button"; x.setAttribute("aria-label",c.k+" "+c.v+" entfernen");
    x.addEventListener("click",function(){ c.off(); render(); });
    w.appendChild(x);
    box.appendChild(w);
  });
  if(chips.length>1){
    var all=el("button","btn btn-quiet btn-sm","alle entfernen"); all.type="button";
    all.addEventListener("click",resetFilters);
    box.appendChild(all);
  }
}

/* ============ Render ============ */
function render(){
  renderStats();
  renderRail();
  var rows=visible(), c=$("#count");
  c.innerHTML="";
  c.appendChild(el("b",null,String(rows.length)));
  c.appendChild(document.createTextNode(" von "+games.length+(games.length===1?" Spiel":" Spielen")));
  renderActiveFilters();
  var res=$("#results"); res.innerHTML="";
  res.appendChild(rows.length ? (view==="grid" ? renderGrid(rows) : renderTable(rows)) : renderEmpty());
}
function resetFilters(){
  filt.q=""; filt.status=""; filt.plat=""; filt.genre=""; filt.list=""; filt.min=1;
  $("#f-q").value=""; render();
}

/* ============ Overlay ============ */
function closeOverlay(){
  $("#overlay").innerHTML="";
  document.body.style.overflow="";
  draft=null; draftCover=null;
}
function makeDrawer(title){
  var o=$("#overlay"); o.innerHTML="";
  document.body.style.overflow="hidden";
  var scrim=el("div","scrim");
  scrim.addEventListener("click",closeOverlay);
  o.appendChild(scrim);
  var d=el("aside","drawer");
  d.setAttribute("role","dialog"); d.setAttribute("aria-modal","true"); d.setAttribute("aria-label",title);
  var head=el("div","drawer-head");
  head.appendChild(el("h2",null,title));
  var x=el("button","icon-btn","×"); x.type="button"; x.setAttribute("aria-label","Schließen");
  x.addEventListener("click",closeOverlay);
  head.appendChild(x); d.appendChild(head);
  var body=el("div","drawer-body"); d.appendChild(body);
  var foot=el("div","drawer-foot"); d.appendChild(foot);
  o.appendChild(d);
  return {drawer:d, body:body, foot:foot};
}

/* ============ Editor ============ */
var draft=null, draftCover=null;

function openEditor(id){
  var existing = id ? games.find(function(g){ return g.id===id; }) : null;
  draft = existing ? JSON.parse(JSON.stringify(existing)) : {
    id:uid(), title:"", release:"", platform:"", genres:[], score:"", hours:"", completion:"",
    startedOn:"", finishedOn:"", status:"backlog", notes:"", cover:"", avgHours:"", listIds:[], createdAt:Date.now()
  };
  draftCover = draft.cover || "";
  paintEditor(!!existing);
}

function paintEditor(isEdit){
  var D=makeDrawer(isEdit ? "Spiel bearbeiten" : "Spiel hinzufügen");
  var body=D.body, foot=D.foot;

  /* Cover + Titel + Datenbanksuche */
  var cp=el("div","coverpick");
  var drop=el("div","coverdrop"); drop.tabIndex=0; drop.setAttribute("role","button"); drop.setAttribute("aria-label","Cover auswählen");
  function paintDrop(){
    drop.innerHTML=""; drop.style.background="";
    if(draftCover){
      var im=el("img"); im.src=rimg(draftCover,400); im.alt="Cover-Vorschau"; drop.appendChild(im);
    } else if((draft.title||"").trim()){
      tileStyle(drop, draft.title);
      drop.appendChild(el("div","cover-ph",initials(draft.title)));
    } else {
      drop.appendChild(el("span",null,"Cover\nwählen"));
    }
  }
  var fin=el("input"); fin.type="file"; fin.accept="image/*"; fin.hidden=true;
  function takeCover(f){
    fileToCover(f).then(function(url){ draftCover=url; paintDrop(); paintCoverActions(); })
      .catch(function(e){ toast(e.message||"Bild konnte nicht verarbeitet werden."); });
  }
  fin.addEventListener("change",function(){ if(fin.files && fin.files[0]) takeCover(fin.files[0]); fin.value=""; });
  drop.addEventListener("click",function(){ fin.click(); });
  drop.addEventListener("keydown",function(ev){ if(ev.key==="Enter"||ev.key===" "){ ev.preventDefault(); fin.click(); } });
  drop.addEventListener("dragover",function(ev){ ev.preventDefault(); drop.classList.add("drag"); });
  drop.addEventListener("dragleave",function(){ drop.classList.remove("drag"); });
  drop.addEventListener("drop",function(ev){
    ev.preventDefault(); drop.classList.remove("drag");
    if(ev.dataTransfer.files && ev.dataTransfer.files[0]) takeCover(ev.dataTransfer.files[0]);
  });
  cp.appendChild(drop);

  var right=el("div");
  var fTitle=el("div","field");
  var lt=el("label",null,"Titel"); lt.htmlFor="e-title"; fTitle.appendChild(lt);
  var it=el("input","inp"); it.id="e-title"; it.value=draft.title||""; it.placeholder="z. B. Elden Ring"; it.autocomplete="off";
  fTitle.appendChild(it); right.appendChild(fTitle);

  var srcRow=el("div","ai-row");
  var srcStatus=el("div","ai-status");
  var srcBtn=el("button","btn btn-sm","In der Datenbank suchen"); srcBtn.type="button";
  srcRow.appendChild(srcBtn); srcRow.appendChild(srcStatus);
  right.appendChild(srcRow);
  var resBox=el("div"); right.appendChild(resBox);

  var coverActs=el("div"); right.appendChild(coverActs);
  function paintCoverActions(){
    coverActs.innerHTML="";
    var h=el("p","hint", draftCover
      ? "Eigenes Bild? Einfach auf das Cover ziehen."
      : "Ohne Bild bekommt das Spiel eine eigene Farbkachel. Bild ziehen oder auf die Kachel klicken.");
    h.style.marginTop="9px";
    coverActs.appendChild(h);
    if(draftCover){
      var rm=el("button","btn btn-quiet btn-sm","Cover entfernen"); rm.type="button"; rm.style.marginTop="8px";
      rm.addEventListener("click",function(){ draftCover=""; paintDrop(); paintCoverActions(); });
      coverActs.appendChild(rm);
    }
  }
  cp.appendChild(right); cp.appendChild(fin);
  body.appendChild(cp);

  var searchCtl=null, searchTimer=null;
  function busy(node,txt){ node.className="ai-status"; node.innerHTML=""; node.appendChild(el("span","spin")); node.appendChild(document.createTextNode(txt)); }
  function fail(node,txt){ node.className="ai-status bad"; node.textContent=txt; }
  function info(node,txt){ node.className="ai-status"; node.textContent=txt; }

  function runSearch(){
    var q=(it.value||"").trim();
    resBox.innerHTML="";
    if(q.length<2){ fail(srcStatus,"Erst ein paar Buchstaben tippen."); return; }
    if(!rawgKey()){
      srcStatus.className="ai-status"; srcStatus.innerHTML="";
      srcStatus.appendChild(document.createTextNode("Dafür fehlt der RAWG-Key. "));
      var lnk=el("button","btn btn-quiet btn-sm","Jetzt eintragen"); lnk.type="button";
      lnk.addEventListener("click",function(){ openSettings(); });
      srcStatus.appendChild(lnk);
      return;
    }
    if(searchCtl) searchCtl.abort();
    searchCtl=new AbortController();
    busy(srcStatus,"sucht …");
    rawgSearch(q, searchCtl.signal).then(function(hits){
      if(!hits.length){ info(srcStatus,"Nichts gefunden. Trag die Daten von Hand ein."); return; }
      info(srcStatus, hits.length+" Treffer — wähl das richtige Spiel:");
      var box=el("div","sres");
      hits.forEach(function(h){
        var b=el("button"); b.type="button";
        var img=el("img","rimg"); img.alt=""; img.loading="lazy";
        if(h.cover){
          img.src = rimg(h.cover,420);
          img.addEventListener("error",function(){ img.style.visibility="hidden"; });
        } else img.style.visibility="hidden";
        b.appendChild(img);
        var meta=el("div");
        meta.appendChild(el("div","sres-n",h.name));
        var m=[]; if(h.release) m.push(String(h.release).slice(0,4));
        if(h.platform) m.push(h.platform);
        if(h.genres.length) m.push(h.genres.join(", "));
        meta.appendChild(el("div","sres-m", m.join(" · ") || "keine Angaben"));
        b.appendChild(meta);
        b.addEventListener("click",function(){
          var cover=applyHit(draft,h,{force:true});
          if(cover) draftCover=cover;
          it.value=draft.title;
          var ri=document.getElementById("e-release"); if(ri) ri.value=draft.release||"";
          var pi=document.getElementById("e-platform"); if(pi) pi.value=draft.platform||"";
          draft._platforms = h.platforms || [];
          paintTags(); paintDrop(); paintCoverActions(); paintPlatChips(); paintAvgHint();
          resBox.innerHTML="";
          info(srcStatus,"Übernommen — schau kurz drüber.");
        });
        box.appendChild(b);
      });
      resBox.appendChild(box);
    }).catch(function(e){
      if(e && e.name==="AbortError") return;
      fail(srcStatus, e && e.message ? e.message : "Suche fehlgeschlagen.");
    });
  }
  srcBtn.addEventListener("click",runSearch);
  it.addEventListener("input",function(){
    draft.title=it.value;
    if(!draftCover) paintDrop();
    clearTimeout(searchTimer);
    if(rawgKey() && it.value.trim().length>=3) searchTimer=setTimeout(runSearch,550);
  });
  it.addEventListener("keydown",function(ev){ if(ev.key==="Enter"){ ev.preventDefault(); clearTimeout(searchTimer); runSearch(); } });

  paintDrop(); paintCoverActions();

  /* Wertung */
  var sf=el("div","scorefield");
  var sfTop=el("div","scorefield-top"), sfL=el("div");
  sfL.appendChild(el("div","stat-k","Wertung"));
  var sv=el("div","sv"); sfL.appendChild(sv);
  var bandOut=el("div","band"); sfL.appendChild(bandOut);
  sfTop.appendChild(sfL);
  var sNum=el("input","inp"); sNum.type="number"; sNum.min="1"; sNum.max="100"; sNum.step="1"; sNum.placeholder="—";
  sNum.setAttribute("aria-label","Wertung von 1 bis 100");
  sfTop.appendChild(sNum); sf.appendChild(sfTop);
  var sRange=el("input","slider"); sRange.type="range"; sRange.min="0"; sRange.max="100"; sRange.step="1";
  sRange.setAttribute("aria-label","Wertung schieben"); sf.appendChild(sRange);
  var sMeter=el("div","meter"); sMeter.style.marginTop="9px";
  var sFill=el("i"); sMeter.appendChild(sFill); sf.appendChild(sMeter);
  var sClear=el("button","btn btn-quiet btn-sm","ohne Wertung"); sClear.type="button"; sClear.style.marginTop="9px";
  sf.appendChild(sClear);

  function paintScore(){
    var v=nz(draft.score);
    if(v==null){
      sv.textContent="—"; sv.style.color="var(--ink-3)";
      bandOut.textContent="noch nicht bewertet"; bandOut.style.color="var(--ink-3)";
      sNum.value=""; sRange.value=0; sFill.style.width="0%";
    } else {
      sv.textContent=String(v); sv.style.color=bandVar(v);
      bandOut.textContent=band(v).l; bandOut.style.color=bandVar(v);
      if(document.activeElement!==sNum) sNum.value=String(v);
      sRange.value=v; sFill.style.width=Math.max(1,v)+"%"; sFill.style.background=bandVar(v);
    }
  }
  function setScore(v){
    if(v===""||v==null) draft.score="";
    else { var n=Math.round(Number(v)); draft.score = isFinite(n) ? Math.min(100,Math.max(1,n)) : ""; }
    paintScore();
  }
  sNum.addEventListener("input",function(){ setScore(sNum.value===""?"":sNum.value); });
  sRange.addEventListener("input",function(){ setScore(sRange.value==="0"?"":sRange.value); });
  sClear.addEventListener("click",function(){ setScore(""); });
  paintScore();
  body.appendChild(sf);

  /* Zahlen und Daten */
  function textField(label,key,ph,type,attrs){
    var f=el("div","field"), id="e-"+key;
    var l=el("label",null,label); l.htmlFor=id; f.appendChild(l);
    var i=el("input","inp"); i.id=id; i.type=type||"text"; if(ph) i.placeholder=ph;
    if(attrs) for(var a in attrs) i.setAttribute(a,attrs[a]);
    i.value = draft[key]==null?"":String(draft[key]);
    i.addEventListener("input",function(){ draft[key]=i.value; });
    f.appendChild(i);
    return f;
  }

  var r1=el("div","row2");
  r1.appendChild(textField("Stunden gespielt","hours","z. B. 42.5","number",{min:"0",step:"0.5"}));
  r1.appendChild(textField("Fortschritt in %","completion","0–100","number",{min:"0",max:"100",step:"1"}));
  body.appendChild(r1);
  var avgHint=el("p","hint"); avgHint.style.margin="-6px 0 16px";
  function paintAvgHint(){
    var fa=fmtAvg(draft.avgHours);
    avgHint.textContent = fa ? "Für dieses Spiel werden im Schnitt rund "+fa+" gebraucht." : "";
    avgHint.hidden = !fa;
  }
  paintAvgHint();
  body.appendChild(avgHint);

  var r2=el("div","row2");
  r2.appendChild(textField("Gespielt von","startedOn",null,"date"));
  r2.appendChild(textField("bis","finishedOn",null,"date"));
  body.appendChild(r2);

  var r3=el("div","row2");
  r3.appendChild(textField("Erschienen","release","2022 oder 2022-02-25"));
  var fp=el("div","field");
  var lp=el("label",null,"Plattform"); lp.htmlFor="e-platform"; fp.appendChild(lp);
  var ip=el("input","inp"); ip.id="e-platform"; ip.value=draft.platform||""; ip.placeholder="PC, PS5, Switch …"; ip.setAttribute("list","dl-plat");
  ip.addEventListener("input",function(){ draft.platform=ip.value; });
  fp.appendChild(ip);
  var dlp=el("datalist"); dlp.id="dl-plat";
  var plats=allPlatforms();
  ["PC","PS5","PS4","Xbox Series","Switch","Steam Deck","Handy"].forEach(function(p){ if(plats.indexOf(p)<0) plats.push(p); });
  plats.forEach(function(p){ var oo=el("option"); oo.value=p; dlp.appendChild(oo); });
  fp.appendChild(dlp);
  var platChips=el("div","pills"); platChips.style.marginTop="7px"; fp.appendChild(platChips);
  r3.appendChild(fp);
  body.appendChild(r3);

  function paintPlatChips(){
    platChips.innerHTML="";
    var opts=draft._platforms||[];
    if(opts.length<2) return;
    var lab=el("div","hint","Auf welcher Plattform hast du es gespielt?");
    lab.style.cssText="flex:1 0 100%;margin-bottom:2px";
    platChips.appendChild(lab);
    opts.slice(0,10).forEach(function(pn){
      var b=el("button","pill",pn); b.type="button";
      b.setAttribute("aria-pressed", String(draft.platform===pn));
      b.addEventListener("click",function(){
        draft.platform=pn; ip.value=pn;
        Array.prototype.forEach.call(platChips.querySelectorAll(".pill"),function(o){
          o.setAttribute("aria-pressed", String(o===b));
        });
      });
      platChips.appendChild(b);
    });
  }

  /* Status */
  var fst=el("div","field");
  fst.appendChild(el("label",null,"Status"));
  var stw=el("div","pills");
  STATUS.forEach(function(st){
    var b=el("button","pill pill-accent",st.l); b.type="button";
    b.setAttribute("aria-pressed", String((draft.status||"backlog")===st.k));
    b.addEventListener("click",function(){
      draft.status=st.k;
      Array.prototype.forEach.call(stw.children,function(o){ o.setAttribute("aria-pressed", String(o===b)); });
    });
    stw.appendChild(b);
  });
  fst.appendChild(stw); body.appendChild(fst);

  /* Genres */
  var fg=el("div","field");
  fg.appendChild(el("label",null,"Genres / Tags"));
  var tw=el("div","tagedit");
  var tin=el("input"); tin.placeholder="Tag + Enter"; tin.autocomplete="off"; tin.setAttribute("aria-label","Genre oder Tag hinzufügen");
  function paintTags(){
    Array.prototype.slice.call(tw.querySelectorAll(".tagchip")).forEach(function(n){ n.remove(); });
    (draft.genres||[]).forEach(function(g,i){
      var c=el("span","tagchip"); c.appendChild(document.createTextNode(g));
      var b=el("button",null,"×"); b.type="button"; b.setAttribute("aria-label","„"+g+"“ entfernen");
      b.addEventListener("click",function(){ draft.genres.splice(i,1); paintTags(); });
      c.appendChild(b);
      tw.insertBefore(c,tin);
    });
  }
  function addTag(){
    var v=tin.value.trim().replace(/,+$/,"");
    if(!v) return;
    draft.genres = draft.genres||[];
    if(draft.genres.indexOf(v)<0) draft.genres.push(v);
    tin.value=""; paintTags();
  }
  tin.addEventListener("keydown",function(ev){
    if(ev.key==="Enter"||ev.key===","){ ev.preventDefault(); addTag(); }
    else if(ev.key==="Backspace" && !tin.value && (draft.genres||[]).length){ draft.genres.pop(); paintTags(); }
  });
  tin.addEventListener("blur",addTag);
  tw.appendChild(tin); paintTags();
  fg.appendChild(tw); body.appendChild(fg);

  /* Listen */
  var fl=el("div","field");
  fl.appendChild(el("label",null,"Listen"));
  var lw=el("div","pills");
  function paintLists(){
    lw.innerHTML="";
    lists.slice().sort(function(a,b){ return (a.createdAt||0)-(b.createdAt||0); }).forEach(function(l){
      var b=el("button","pill",l.name); b.type="button";
      b.setAttribute("aria-pressed", String((draft.listIds||[]).indexOf(l.id)>=0));
      b.addEventListener("click",function(){
        draft.listIds = draft.listIds||[];
        var i=draft.listIds.indexOf(l.id);
        if(i<0) draft.listIds.push(l.id); else draft.listIds.splice(i,1);
        b.setAttribute("aria-pressed", String(draft.listIds.indexOf(l.id)>=0));
      });
      lw.appendChild(b);
    });
    var nb=el("button","pill","+ neue Liste"); nb.type="button"; nb.style.borderStyle="dashed";
    nb.addEventListener("click",function(){ newList(function(l){ draft.listIds=(draft.listIds||[]).concat([l.id]); paintLists(); }); });
    lw.appendChild(nb);
  }
  paintLists();
  fl.appendChild(lw); body.appendChild(fl);

  /* Notizen */
  var fn=el("div","field");
  var ln=el("label",null,"Notizen / Mini-Review"); ln.htmlFor="e-notes"; fn.appendChild(ln);
  var tn=el("textarea","inp"); tn.id="e-notes"; tn.value=draft.notes||""; tn.placeholder="Was hängen geblieben ist.";
  tn.addEventListener("input",function(){ draft.notes=tn.value; });
  fn.appendChild(tn); body.appendChild(fn);

  var errBox=el("p","err"); errBox.hidden=true; body.appendChild(errBox);

  if(isEdit){
    var del=el("button","btn btn-sm btn-danger","Löschen"); del.type="button";
    del.addEventListener("click",function(){
      if(confirm("„"+(draft.title||"Dieses Spiel")+"“ endgültig löschen?")){
        var id=draft.id; closeOverlay(); dropGame(id); toast("Gelöscht.");
      }
    });
    foot.appendChild(del);
  }
  foot.appendChild(el("div","spacer"));
  var cancel=el("button","btn btn-sm","Abbrechen"); cancel.type="button";
  cancel.addEventListener("click",closeOverlay);
  var save=el("button","btn btn-accent","Speichern"); save.type="button";
  save.addEventListener("click",function(){ commit(errBox, isEdit); });
  foot.appendChild(cancel); foot.appendChild(save);

  D.drawer.addEventListener("keydown",function(ev){
    if(ev.key==="Escape"){ ev.preventDefault(); if(searchCtl) searchCtl.abort(); closeOverlay(); }
    if((ev.metaKey||ev.ctrlKey) && ev.key==="Enter"){ ev.preventDefault(); commit(errBox,isEdit); }
  });
  setTimeout(function(){ it.focus(); },30);
}

function commit(errBox, isEdit){
  errBox.hidden=true;
  var t=(draft.title||"").trim();
  if(!t){ errBox.textContent="Bitte einen Titel eintragen — alles andere ist optional."; errBox.hidden=false; return; }
  var g = {
    id: draft.id,
    title: t,
    release: (draft.release||"").trim(),
    platform: (draft.platform||"").trim(),
    genres: (draft.genres||[]).slice(),
    score: nz(draft.score)==null ? "" : Math.min(100,Math.max(1,Math.round(Number(draft.score)))),
    hours: nz(draft.hours)==null ? "" : Math.max(0,Number(draft.hours)),
    completion: nz(draft.completion)==null ? "" : Math.min(100,Math.max(0,Math.round(Number(draft.completion)))),
    startedOn: draft.startedOn||"",
    finishedOn: draft.finishedOn||"",
    status: draft.status||"backlog",
    notes: draft.notes||"",
    avgHours: nz(draft.avgHours)==null ? "" : Math.max(0,Math.round(Number(draft.avgHours))),
    cover: draftCover||"",
    listIds: (draft.listIds||[]).slice(),
    createdAt: draft.createdAt||Date.now()
  };
  ["score","hours","completion"].forEach(function(k){ if(g[k]!=="" && !isFinite(g[k])) g[k]=""; });
  closeOverlay();
  putGame(g);
  toast(isEdit ? "Gespeichert." : "„"+g.title+"“ ins Archiv aufgenommen.");
}

function newList(cb){
  var name=prompt("Name der neuen Liste:","");
  if(name==null) return;
  name=name.trim(); if(!name) return;
  var l={ id:uid(), name:name, createdAt:Date.now() };
  putList(l);
  if(cb) cb(l);
}

/* ============ Mehrere auf einmal ============ */
function parseBulk(text){
  return String(text||"").split("\n").map(function(l){ return l.trim(); }).filter(Boolean).map(function(l){
    var score="", i=Math.max(l.lastIndexOf("|"), l.lastIndexOf(";"));
    if(i>0){
      var tail=l.slice(i+1).trim();
      if(/^\d{1,3}$/.test(tail)){
        var v=Number(tail);
        if(v>=1 && v<=100){ score=Math.round(v); l=l.slice(0,i).trim(); }
      }
    }
    return { title:l, score:score };
  }).filter(function(r){ return r.title; });
}

function openBulk(){
  var D=makeDrawer("Mehrere Spiele eintragen");
  var body=D.body, foot=D.foot;

  var f=el("div","field");
  var lb=el("label",null,"Ein Spiel pro Zeile"); lb.htmlFor="b-ta"; f.appendChild(lb);
  var ta=el("textarea","inp bulk-ta"); ta.id="b-ta";
  ta.placeholder="Elden Ring | 95\nHollow Knight | 92\nOuter Wilds";
  f.appendChild(ta); body.appendChild(f);

  var eg=el("div","bulk-eg","Titel            → nur der Name\nTitel | 87       → mit Wertung");
  eg.style.marginBottom="14px"; body.appendChild(eg);

  var useDb=null;
  if(rawgKey()){
    var lab=el("label","check");
    useDb=el("input"); useDb.type="checkbox"; useDb.checked=true;
    lab.appendChild(useDb);
    lab.appendChild(el("span",null,"Cover, Release, Plattform und Genres für jedes Spiel aus der Datenbank holen. Nimmt jeweils den besten Treffer — bei Zweifelsfällen kannst du das später im Eintrag korrigieren."));
    body.appendChild(lab);
  } else {
    var p=el("p","hint","Ohne RAWG-Key werden die Spiele nur mit Titel angelegt. ");
    var lnk=el("button","btn btn-quiet btn-sm","Key eintragen"); lnk.type="button";
    lnk.addEventListener("click",function(){ openSettings(); });
    p.appendChild(lnk);
    body.appendChild(p);
  }

  var st=el("div","ai-status"); st.style.marginTop="12px"; body.appendChild(st);

  var count=el("span","count"); count.style.marginRight="auto"; foot.appendChild(count);
  var cancel=el("button","btn btn-sm","Abbrechen"); cancel.type="button";
  cancel.addEventListener("click",closeOverlay);
  var go=el("button","btn btn-accent","Eintragen"); go.type="button";
  foot.appendChild(cancel); foot.appendChild(go);

  function refreshCount(){
    var n=parseBulk(ta.value).length;
    count.textContent = n ? n+(n===1?" Zeile":" Zeilen") : "";
    go.disabled = !n;
  }
  ta.addEventListener("input",refreshCount);
  refreshCount();
  go.addEventListener("click",function(){ runBulk(parseBulk(ta.value), !!(useDb && useDb.checked), st, go, cancel); });
  D.drawer.addEventListener("keydown",function(ev){ if(ev.key==="Escape" && !go.disabled){ ev.preventDefault(); closeOverlay(); } });
  setTimeout(function(){ ta.focus(); },30);
}

async function runBulk(rows, wantDb, st, go, cancel){
  if(!rows.length) return;
  if(rows.length>250){ st.className="ai-status bad"; st.textContent="Maximal 250 Zeilen auf einmal."; return; }
  go.disabled=true; cancel.disabled=true;
  function busy(txt){ st.className="ai-status"; st.innerHTML=""; st.appendChild(el("span","spin")); st.appendChild(document.createTextNode(txt)); }

  var made=0, missed=0;
  for(var i=0;i<rows.length;i++){
    var r=rows[i];
    var g={ id:uid(), title:r.title, release:"", platform:"", genres:[], score:r.score, hours:"", completion:"",
      startedOn:"", finishedOn:"", status:"backlog", notes:"", cover:"", avgHours:"", listIds:[], createdAt:Date.now()+i };
    if(wantDb){
      busy("Datenbank: "+(i+1)+" von "+rows.length+" — "+r.title);
      try{
        var hits=await rawgSearch(r.title);
        if(hits.length) g.cover = applyHit(g, hits[0], {force:true});
        else missed++;
      }catch(e){
        if(e && e.nokey){ wantDb=false; }
        missed++;
      }
      await new Promise(function(res){ setTimeout(res,120); });
    }
    games.push(g);
    made++;
  }
  markDirty(); render();
  closeOverlay();
  toast(made+(made===1?" Spiel":" Spiele")+" eingetragen"+(missed?" — "+missed+" ohne Datenbanktreffer":"")+".");
}

/* ============ Einstellungen ============ */
function openSettings(msg){
  var D=makeDrawer("Einstellungen");
  var body=D.body, foot=D.foot;

  if(msg){
    var m=el("p","err",msg); m.style.marginBottom="14px"; body.appendChild(m);
  }

  /* Sicherung aus einem verworfenen lokalen Stand */
  var bk=LS.get("sa.backup",null);
  if(bk && Array.isArray(bk.games) && bk.games.length){
    var s0=el("div","sec");
    s0.appendChild(el("div","sec-h","Verworfener lokaler Stand"));
    var p0=el("p","sec-p");
    p0.textContent="Bei einem Abgleich wurde ein Stand aus diesem Browser durch die Version aus dem Repo ersetzt: "+
      bk.games.length+(bk.games.length===1?" Spiel":" Spiele")+" vom "+new Date(bk.at||Date.now()).toLocaleString("de-DE")+
      ". Beim Wiederherstellen wird ergänzt, nichts gelöscht.";
    s0.appendChild(p0);
    var rb=el("button","btn btn-sm","Diesen Stand wiederherstellen"); rb.type="button";
    rb.addEventListener("click",function(){
      var added=0;
      bk.games.forEach(function(g){ if(!games.some(function(x){ return x.id===g.id; })){ games.push(g); added++; } });
      (bk.lists||[]).forEach(function(l){ if(!lists.some(function(x){ return x.id===l.id; })) lists.push(l); });
      markDirty(); render(); closeOverlay();
      toast(added ? added+(added===1?" Spiel":" Spiele")+" zurückgeholt." : "Alles war schon vorhanden.");
    });
    s0.appendChild(rb);
    body.appendChild(s0);
  }

  /* GitHub */
  var s1=el("div","sec");
  s1.appendChild(el("div","sec-h","Speichern auf GitHub"));
  var p1=el("p","sec-p");
  p1.appendChild(document.createTextNode("Ohne Token liest die Seite dein Archiv nur, Änderungen bleiben in diesem Browser. Mit Token schreibt sie jede Änderung als Commit nach "));
  p1.appendChild(el("code",null,CFG.owner+"/"+CFG.repo));
  p1.appendChild(document.createTextNode(". Der Token bleibt in diesem Browser und geht ausschließlich an api.github.com."));
  s1.appendChild(p1);

  var ft=el("div","field");
  var lt=el("label",null,"Fine-grained Token"); lt.htmlFor="s-token"; ft.appendChild(lt);
  var itk=el("input","inp"); itk.id="s-token"; itk.type="password"; itk.placeholder="github_pat_…"; itk.autocomplete="off";
  itk.value = token();
  ft.appendChild(itk); s1.appendChild(ft);
  var tHint=el("p","sec-p");
  tHint.textContent = "Anlegen unter github.com/settings/personal-access-tokens: nur dieses eine Repository auswählen, Berechtigung „Contents: Read and write“. Mehr braucht die Seite nicht.";
  s1.appendChild(tHint);

  var stat=el("dl"); stat.style.margin="0";
  function kv(k,v,cls){
    var row=el("div","kv");
    row.appendChild(el("dt",null,k));
    row.appendChild(el("dd",cls||null,v));
    stat.appendChild(row);
  }
  s1.appendChild(stat);

  var checkBtn=el("button","btn btn-sm","Verbindung prüfen"); checkBtn.type="button"; checkBtn.style.marginTop="10px";
  var checkOut=el("div","ai-status"); checkOut.style.marginTop="8px";
  checkBtn.addEventListener("click",async function(){
    LS.put("sa.token", itk.value.trim());
    checkOut.className="ai-status"; checkOut.innerHTML="";
    checkOut.appendChild(el("span","spin")); checkOut.appendChild(document.createTextNode("prüft …"));
    try{
      var who="unbekannt";
      if(token()){
        var ur=await fetch("https://api.github.com/user",{headers:ghHeaders()});
        if(!ur.ok) throw new Error(ur.status===401 ? "Der Token wird nicht akzeptiert." : "GitHub antwortet mit "+ur.status+".");
        who="@"+(await ur.json()).login;
      }
      var got=await ghLoad();
      checkOut.className="ai-status";
      checkOut.textContent = "Angemeldet als "+who+". Datei "+(got.sha ? "gefunden ("+ (got.data && got.data.games ? got.data.games.length : 0) +" Spiele)." : "existiert noch nicht — sie wird beim ersten Speichern angelegt.");
      paintSave();
    }catch(e){
      checkOut.className="ai-status bad";
      checkOut.textContent = e && e.message ? e.message : "Prüfung fehlgeschlagen.";
    }
  });
  s1.appendChild(checkBtn); s1.appendChild(checkOut);
  body.appendChild(s1);

  kv("Repository", CFG.owner+"/"+CFG.repo);
  kv("Datei", CFG.path+" @ "+CFG.branch);
  kv("Token", token() ? "hinterlegt" : "nicht hinterlegt", token()?"ok":"bad");
  kv("Zuletzt gespeichert", lastSaved ? lastSaved.toLocaleString("de-DE") : "in dieser Sitzung noch nicht");

  /* RAWG */
  var s2=el("div","sec");
  s2.appendChild(el("div","sec-h","Spieledatenbank (RAWG)"));
  var p2=el("p","sec-p");
  p2.textContent = "Liefert Cover, Release, Plattform und Genres beim Eintragen. Kostenlosen Key holen unter rawg.io/apidocs — er bleibt wie der Token nur in diesem Browser und landet nicht im Repo.";
  s2.appendChild(p2);
  var fr2=el("div","field");
  var lr=el("label",null,"API-Key"); lr.htmlFor="s-rawg"; fr2.appendChild(lr);
  var irk=el("input","inp"); irk.id="s-rawg"; irk.type="password"; irk.placeholder="32-stelliger Key"; irk.autocomplete="off";
  irk.value = rawgKey();
  fr2.appendChild(irk); s2.appendChild(fr2);
  var rHint=el("p","sec-p");
  rHint.textContent = "Hinweis: RAWG liefert das Key-Art der Spiele, nicht die Box-Art von der Hülle. Wenn dir ein Bild nicht gefällt, zieh im Eintrag einfach dein eigenes drüber.";
  s2.appendChild(rHint);
  body.appendChild(s2);

  /* Daten */
  var s3=el("div","sec");
  s3.appendChild(el("div","sec-h","Sicherung"));
  var p3=el("p","sec-p"); p3.textContent="Dein Archiv liegt ohnehin versioniert im Repo. Für eine Kopie außerhalb von GitHub:";
  s3.appendChild(p3);
  var row=el("div"); row.style.cssText="display:flex;gap:8px;flex-wrap:wrap";
  var ex=el("button","btn btn-sm","Als JSON exportieren"); ex.type="button";
  ex.addEventListener("click",doExport);
  var im=el("button","btn btn-sm","JSON importieren"); im.type="button";
  im.addEventListener("click",function(){ $("#file-import").click(); });
  row.appendChild(ex); row.appendChild(im);
  s3.appendChild(row);
  body.appendChild(s3);

  foot.appendChild(el("div","spacer"));
  var close=el("button","btn btn-sm","Schließen"); close.type="button";
  close.addEventListener("click",closeOverlay);
  var apply=el("button","btn btn-accent","Übernehmen"); apply.type="button";
  apply.addEventListener("click",function(){
    LS.put("sa.token", itk.value.trim());
    LS.put("sa.rawg", irk.value.trim());
    closeOverlay(); paintSave();
    toast("Einstellungen gespeichert.");
    if(dirty && token()) saveNow();
  });
  foot.appendChild(close); foot.appendChild(apply);
  D.drawer.addEventListener("keydown",function(ev){ if(ev.key==="Escape"){ ev.preventDefault(); closeOverlay(); } });
}

/* ============ Export / Import ============ */
function doExport(){
  var json=JSON.stringify(payload(),null,2);
  var blob=new Blob([json],{type:"application/json"});
  var url=URL.createObjectURL(blob);
  var a=document.createElement("a");
  a.href=url; a.download="spielarchiv-"+new Date().toISOString().slice(0,10)+".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); },1000);
}

function doImport(file){
  var fr=new FileReader();
  fr.onload=function(){
    var data;
    try{ data=JSON.parse(fr.result); }catch(e){ toast("Die Datei ist kein gültiges JSON."); return; }
    var inGames = Array.isArray(data) ? data : (data.games||[]);
    var inLists = (data && data.lists) || [];
    if(!Array.isArray(inGames) || !inGames.length){ toast("Keine Spiele in der Datei gefunden."); return; }
    if(!confirm(inGames.length+" Spiel(e) importieren? Einträge mit gleicher ID werden überschrieben.")) return;

    inLists.forEach(function(l){
      if(l && l.name && !lists.some(function(x){ return x.id===l.id; }))
        lists.push({ id:l.id||uid(), name:String(l.name), createdAt:l.createdAt||Date.now() });
    });
    var n=0;
    inGames.forEach(function(s){
      if(!s || !s.title) return;
      var g={ id:s.id||uid(), title:String(s.title), release:s.release||"", platform:s.platform||"",
        genres:Array.isArray(s.genres)?s.genres:[], score:s.score==null?"":s.score, hours:s.hours==null?"":s.hours,
        completion:s.completion==null?"":s.completion, startedOn:s.startedOn||"", finishedOn:s.finishedOn||"",
        status:s.status||"backlog", notes:s.notes||"", cover:s.cover||"", avgHours:s.avgHours==null?"":s.avgHours,
        listIds:Array.isArray(s.listIds)?s.listIds:[], createdAt:s.createdAt||Date.now() };
      var i=games.findIndex(function(x){ return x.id===g.id; });
      if(i<0) games.push(g); else games[i]=g;
      n++;
    });
    markDirty(); render();
    toast(n+" Spiel(e) importiert.");
  };
  fr.onerror=function(){ toast("Datei konnte nicht gelesen werden."); };
  fr.readAsText(file);
}

/* ============ Events ============ */
$("#btn-add").addEventListener("click",function(){ openEditor(null); });
$("#btn-bulk").addEventListener("click",openBulk);
$("#btn-settings").addEventListener("click",function(){ openSettings(); });
$("#btn-newlist").addEventListener("click",function(){ newList(null); });
$("#btn-reset").addEventListener("click",resetFilters);
$("#btn-filters").addEventListener("click",function(){
  var rail=$("#rail"), open=rail.classList.toggle("is-hidden")===false;
  this.setAttribute("aria-expanded", String(open));
  if(open) rail.scrollIntoView({behavior:"smooth", block:"start"});
});
$("#savechip").addEventListener("click",function(){ if(token()) saveNow(); else openSettings(); });
$("#file-import").addEventListener("change",function(ev){
  if(ev.target.files && ev.target.files[0]) doImport(ev.target.files[0]);
  ev.target.value="";
});
var qt=null;
$("#f-q").addEventListener("input",function(ev){
  clearTimeout(qt); var v=ev.target.value;
  qt=setTimeout(function(){ filt.q=v; render(); },160);
});
$("#f-plat").addEventListener("change",function(ev){ filt.plat=ev.target.value; render(); });
$("#f-genre").addEventListener("change",function(ev){ filt.genre=ev.target.value; render(); });
$("#f-sort").addEventListener("change",function(ev){ filt.sort=ev.target.value; render(); });
$("#f-min").addEventListener("input",function(ev){
  filt.min=Number(ev.target.value); $("#f-min-out").textContent=filt.min;
  clearTimeout(qt); qt=setTimeout(render,90);
});
$("#viewseg").addEventListener("click",function(ev){
  var b=ev.target.closest("button[data-view]"); if(!b) return;
  view=b.dataset.view;
  Array.prototype.forEach.call(this.children,function(o){ o.setAttribute("aria-pressed", String(o===b)); });
  LS.put("sa.view", view);
  render();
});
document.addEventListener("keydown",function(ev){
  if(document.activeElement!==document.body) return;
  if(ev.key==="/"){ ev.preventDefault(); $("#f-q").focus(); }
  else if(ev.key==="n" && !ev.metaKey && !ev.ctrlKey && !ev.altKey){ ev.preventDefault(); openEditor(null); }
  else if((ev.metaKey||ev.ctrlKey) && ev.key==="s"){ ev.preventDefault(); saveNow(); }
});
window.addEventListener("beforeunload",function(ev){
  if(dirty && token()){ ev.preventDefault(); ev.returnValue=""; }
});

/* ============ Start ============ */
(function boot(){
  var v=LS.raw("sa.view");
  if(v==="table"||v==="grid"){
    view=v;
    Array.prototype.forEach.call($("#viewseg").children,function(o){ o.setAttribute("aria-pressed", String(o.dataset.view===v)); });
  }

  var cache=LS.get("sa.cache",null);
  if(cache && Array.isArray(cache.games)){
    games=cache.games; lists=cache.lists||[]; sha=cache.sha||null;
    dirty = cache.dirty===true;
  }
  render(); paintSave();

  ghLoad().then(function(got){
    if(!got.data){
      sha=got.sha;
      if(!games.length) notice("Im Repo liegt noch keine Archivdatei. Sie wird beim ersten Speichern angelegt.");
      paintSave();
      return;
    }
    var remoteGames = Array.isArray(got.data.games) ? got.data.games : [];
    var remoteLists = Array.isArray(got.data.lists) ? got.data.lists : [];
    var wouldVanish = games.length && !remoteGames.length;
    if(dirty || wouldVanish || (cache && cache.sha && got.sha!==cache.sha && games.length)){
      sha=got.sha;
      notice("In diesem Browser liegen "+games.length+(games.length===1?" Spiel":" Spiele")+
             ", im Repo "+remoteGames.length+". Welcher Stand soll gelten?", [
        {label:"Diesen Browser hochladen", onClick:function(){ notice(null); markDirty(); saveNow(); }},
        {label:"Stand aus dem Repo", onClick:function(){
          stashLocal();
          games=remoteGames; lists=remoteLists; dirty=false;
          cacheNow(); notice(null); render(); paintSave();
        }}
      ]);
      render(); paintSave();
      return;
    }
    games=remoteGames; lists=remoteLists; sha=got.sha; dirty=false;
    cacheNow();
    render(); paintSave();
  }).catch(function(e){
    notice("Das Archiv konnte nicht von GitHub geladen werden: "+(e && e.message ? e.message : "unbekannter Fehler")+" Es wird der Stand aus diesem Browser angezeigt.", [
      {label:"Einstellungen", onClick:function(){ openSettings(); }},
      {label:"Nochmal", onClick:function(){ location.reload(); }}
    ]);
    paintSave();
  });
})();

})();
