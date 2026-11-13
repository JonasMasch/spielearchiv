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
  {k:"wunschliste", l:"Wunschliste"},
  {k:"abgebrochen", l:"Abgebrochen"}
];
var STATUS_L = {}; STATUS.forEach(function(s){ STATUS_L[s.k]=s.l; });

var BANDS = [
  {min:90, l:"Meisterwerk",  c:"elite"},
  {min:80, l:"Herausragend", c:"top"},
  {min:70, l:"Stark",        c:"good"},
  {min:60, l:"Solide",       c:"good"},
  {min:45, l:"Mittelmaß",    c:"mid"},
  {min:30, l:"Schwach",      c:"low"},
  {min:0,  l:"Mies",         c:"low"}
];
var PRIO = {1:"irgendwann", 2:"bei Gelegenheit", 3:"gerne bald", 4:"ziemlich bald", 5:"als Nächstes"};
function wantsPriority(status){ return status==="backlog" || status==="wunschliste"; }

/* ============ Medien ============
   Ein Medium steht vollstaendig in dieser Tabelle: Benennung, Zustaende,
   welche Felder es kennt, woher die Daten kommen, welches Zeichen es traegt.
   Ein weiteres Medium (Buecher etwa) braucht einen Eintrag hier, eine Farbe
   in der CSS-Datei und eine Quelle — am uebrigen Code aendert sich nichts.
   Die Zustandsschluessel sind bewusst in allen Medien gleich, nur ihre
   Beschriftung wechselt: so bleiben Filter, Sortierung und Listen gemeinsam. */
var MEDIA_ORDER = ["game","movie","tv"];
var MEDIA = {
  game: {
    k:"game", one:"Spiel", many:"Spiele", source:"rawg",
    icon:'<rect x="2.6" y="7.4" width="18.8" height="9.2" rx="4.6" fill="none" stroke="currentColor" stroke-width="1.8"/>'+
         '<path d="M7 10.6v2.8M5.6 12h2.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'+
         '<circle cx="16.2" cy="11" r="1.15"/><circle cx="18.4" cy="13.4" r="1.15"/>',
    status:{gespielt:"Gespielt", spiele:"Am Spielen", backlog:"Backlog", wunschliste:"Wunschliste", abgebrochen:"Abgebrochen"},
    lab:{time:"Zeit", span:"Gespielt", spanFrom:"Gespielt von", runs:"Durchgespielt", runsField:"Wie oft durchgespielt",
         progress:"Fortschritt", where:"Plattform", wherePh:"PC, PS5, Switch …", usual:"Üblich"},
    has:{hours:true, completion:true, usual:true, span:true, runtime:false, episodes:false}
  },
  movie: {
    k:"movie", one:"Film", many:"Filme", source:"tmdb", tmdb:"movie",
    icon:'<rect x="2.8" y="4.8" width="18.4" height="14.4" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/>'+
         '<path d="M2.8 9.3h18.4M7.4 4.8l-1.6 4.5M12.4 4.8l-1.6 4.5M17.4 4.8l-1.6 4.5" stroke="currentColor" stroke-width="1.6"/>',
    status:{gespielt:"Gesehen", spiele:"Schaue gerade", backlog:"Backlog", wunschliste:"Wunschliste", abgebrochen:"Abgebrochen"},
    lab:{time:"Zeit", span:"Gesehen", spanFrom:"Gesehen am", runs:"Gesehen", runsField:"Wie oft gesehen",
         progress:"Fortschritt", where:"Gesehen bei", wherePh:"Netflix, Kino, Disc …", usual:"Laufzeit"},
    has:{hours:false, completion:false, usual:false, span:"single", runtime:true, episodes:false}
  },
  tv: {
    k:"tv", one:"Serie", many:"Serien", source:"tmdb", tmdb:"tv",
    icon:'<rect x="2.8" y="7.6" width="18.4" height="11.6" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/>'+
         '<path d="M8.4 4.4l3.6 3.2 3.6-3.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    status:{gespielt:"Gesehen", spiele:"Schaue gerade", backlog:"Backlog", wunschliste:"Wunschliste", abgebrochen:"Abgebrochen"},
    lab:{time:"Zeit", span:"Gesehen", spanFrom:"Gesehen von", runs:"Gesehen", runsField:"Wie oft gesehen",
         progress:"Folgen", where:"Gesehen bei", wherePh:"Netflix, Prime, Disc …", usual:"Folgenlänge"},
    has:{hours:false, completion:"episodes", usual:false, span:true, runtime:true, episodes:true}
  }
};
function mediaKey(g){ var k=g && g.media; return MEDIA[k] ? k : "game"; }
function md(g){ return MEDIA[mediaKey(g)]; }
function mediaLabel(k, n){
  var m=MEDIA[k]; if(!m) return n===1 ? "Eintrag" : "Einträge";
  return n===1 ? m.one : m.many;
}
/* „von 77 Spielen“ — der Wemfall braucht eine eigene Form. */
function mediaLabelDat(k, n){
  var m=MEDIA[k];
  if(!m) return n===1 ? "Eintrag" : "Einträgen";
  if(n===1) return m.one;
  return m.many.slice(-1)==="n" ? m.many : m.many+"n";
}
function statusLabel(g){ return md(g).status[g&&g.status||"backlog"] || "Backlog"; }
function mediaIcon(k, cls){
  var m=MEDIA[k]; if(!m) return null;
  var svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox","0 0 24 24");
  svg.setAttribute("aria-hidden","true");
  if(cls) svg.setAttribute("class",cls);
  svg.innerHTML=m.icon;
  return svg;
}
/* Zeit und Fortschritt rechnen sich bei Film und Serie aus Laufzeit und
   Folgen — eintippen muss man dort nichts. */
function derivedHours(g){
  var k=mediaKey(g), rt=Number(g.runtime)||0, runs=Math.max(1, Number(g.playthroughs)||1);
  if(k==="movie") return rt ? Math.round(rt/60*runs*10)/10 : "";
  if(k==="tv"){
    var seen=Number(g.episodesSeen)||0;
    return (rt && seen) ? Math.round(rt*seen/60*runs*10)/10 : "";
  }
  return null;
}
function derivedCompletion(g){
  if(mediaKey(g)!=="tv") return null;
  var all=Number(g.episodes)||0, seen=Number(g.episodesSeen)||0;
  return all ? Math.min(100, Math.round(seen/all*100)) : "";
}

function band(s){ for(var i=0;i<BANDS.length;i++){ if(s>=BANDS[i].min) return BANDS[i]; } return BANDS[BANDS.length-1]; }
function bandVar(s){ return "var(--band-"+band(s).c+")"; }

var PLAT_ORDER = ["PC","PlayStation 5","PlayStation 4","Xbox Series S/X","Xbox One","Nintendo Switch","macOS","Linux","iOS","Android"];
var PLAT_SHORT = {"PC":"PC","PlayStation 5":"PS5","PlayStation 4":"PS4","Xbox Series S/X":"Xbox Series",
  "Xbox One":"Xbox One","Nintendo Switch":"Switch","macOS":"Mac","Linux":"Linux","iOS":"iOS","Android":"Android"};

/* ============ State ============ */
var games = [], lists = [];
var sha = null, saveState = "idle", lastSaved = null, saveTimer = null, savingNow = false;
var view = "grid";
var tab = "archiv";
var openListId = null;
var filt = { q:"", media:"", status:"", plat:"", genres:[], list:"", min:1, sort:"score-desc" };

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
function tmdbKey(){ return LS.raw("sa.tmdb").trim(); }

function scrollTop(){
  var sc=document.getElementById("scroll");
  if(sc) sc.scrollTop=0;
  if(window.pageYOffset) window.scrollTo(0,0);
}
function lockScroll(on){
  var sc=document.getElementById("scroll");
  if(sc) sc.style.overflowY = on ? "hidden" : "";
  document.body.style.overflow = on ? "hidden" : "";
}
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
/* RAWG mischt unter die Tags viele Steam-Eigenschaften, die ueber ein Spiel
   nichts aussagen. Die fliegen raus, Sprachvarianten ebenso. */
var TAG_NOISE = /steam|controller|remote play|captions|in-app|cloud|achievement|leaderboard|workshop|trading card|family sharing|anti-cheat|source sdk|level editor|commentary|downloadable content|game demo|profile features|hdr|timeline|collectibles|^stats$|^partial |^full |mmo$|includes/i;
function cleanTags(raw){
  var out=[], seen={};
  (raw||[]).forEach(function(t){
    var name=(t && t.name) || "";
    if(!name) return;
    if(t.language && t.language!=="eng") return;
    if(TAG_NOISE.test(name)) return;
    if(name.length>26) return;
    var key=name.toLowerCase();
    if(seen[key]) return;
    seen[key]=1; out.push(name);
  });
  return out.slice(0,10);
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
  return (j.results||[]).map(mapRawgGame);
}

function mapRawgGame(g){
  var names=(g.platforms||[]).map(function(p){ return (p.platform&&p.platform.name)||""; }).filter(Boolean);
  var shorts=[];
  names.map(shortPlat).forEach(function(x){ if(shorts.indexOf(x)<0) shorts.push(x); });
  return {
    media: "game",
    name: g.name || "",
    release: g.released || "",
    cover: g.background_image || "",
    platforms: shorts,
    tags: cleanTags(g.tags),
    playtime: Number(g.playtime) > 0 ? Math.round(Number(g.playtime)) : "",
    platform: pickPlatform(names),
    genres: (g.genres||[]).map(function(x){ return x.name; }).slice(0,3),
    metacritic: g.metacritic || null,
    rating: Number(g.rating) || 0
  };
}
/* ============ TMDB: Filme und Serien ============
   Derselbe Trefferaufbau wie bei RAWG, damit der Editor nicht wissen muss,
   woher ein Treffer stammt. */
var TMDB_IMG="https://image.tmdb.org/t/p/";
function tmdbImg(path,size){ return path ? TMDB_IMG+(size||"w780")+path : ""; }
function sourceName(k){ return (MEDIA[k] && MEDIA[k].source==="tmdb") ? "TMDB" : "RAWG"; }
function hasKey(k){ return (MEDIA[k] && MEDIA[k].source==="tmdb") ? !!tmdbKey() : !!rawgKey(); }
function searchMedia(k, q, signal){
  var m=MEDIA[k]||MEDIA.game;
  return m.source==="tmdb" ? tmdbSearch(m.tmdb, q, signal) : rawgSearch(q, signal);
}

async function tmdbFetch(path, params, signal){
  var key=tmdbKey();
  if(!key){ var e=new Error("Kein TMDB-Key hinterlegt."); e.nokey=true; throw e; }
  var qs=[];
  for(var k in (params||{})) qs.push(k+"="+encodeURIComponent(params[k]));
  var url="https://api.themoviedb.org/3"+path+"?api_key="+encodeURIComponent(key)+
          "&language=de-DE"+(qs.length?"&"+qs.join("&"):"");
  var r=await fetch(url,{signal:signal});
  if(r.status===401){ var a=new Error("Der TMDB-Key wird nicht akzeptiert."); a.nokey=true; throw a; }
  if(r.status===429) throw new Error("TMDB-Limit erreicht. Später nochmal.");
  if(!r.ok) throw new Error("TMDB antwortet mit "+r.status+".");
  return r.json();
}

/* Die Suche liefert nur Genre-Nummern. Die Liste dazu aendert sich praktisch
   nie, also wird sie einmal geholt und bleibt im Browser. */
var TMDB_GENRES={};
async function tmdbGenres(kind){
  if(TMDB_GENRES[kind]) return TMDB_GENRES[kind];
  var cached=LS.get("sa.tmdbgenres."+kind,null);
  if(cached){ TMDB_GENRES[kind]=cached; return cached; }
  try{
    var j=await tmdbFetch("/genre/"+kind+"/list",{});
    var map={}; (j.genres||[]).forEach(function(x){ map[x.id]=x.name; });
    TMDB_GENRES[kind]=map; LS.set("sa.tmdbgenres."+kind,map);
    return map;
  }catch(e){ return {}; }
}

/* episode_run_time ist bei neueren Serien oft leer. Dann steht die Laenge
   meist an der zuletzt oder als naechstes ausgestrahlten Folge. */
function tvRuntime(g){
  var rt=(g.episode_run_time && g.episode_run_time[0]) || 0;
  if(!rt && g.last_episode_to_air) rt=g.last_episode_to_air.runtime || 0;
  if(!rt && g.next_episode_to_air) rt=g.next_episode_to_air.runtime || 0;
  return rt || "";
}
function mapTmdb(kind, g, gmap){
  var isTv = kind==="tv";
  var genres = (g.genres||[]).map(function(x){ return x.name; });
  if(!genres.length && gmap) genres=(g.genre_ids||[]).map(function(id){ return gmap[id]; }).filter(Boolean);
  genres=genres.slice(0,4);
  return {
    media: isTv ? "tv" : "movie",
    tmdbId: g.id,
    name: (isTv ? (g.name||g.original_name) : (g.title||g.original_title)) || "",
    release: (isTv ? g.first_air_date : g.release_date) || "",
    cover: tmdbImg(g.backdrop_path,"w780") || tmdbImg(g.poster_path,"w500"),
    platforms: [],
    tags: genres.slice(),
    genres: genres,
    runtime: isTv ? tvRuntime(g) : (g.runtime || ""),
    episodes: isTv ? (g.number_of_episodes || "") : "",
    seasons: isTv ? (g.number_of_seasons || "") : "",
    playtime: "",
    platform: "",
    metacritic: null,
    rating: Number(g.vote_average) || 0
  };
}

async function tmdbSearch(kind, q, signal){
  var gmap=await tmdbGenres(kind);
  var j=await tmdbFetch("/search/"+kind, {query:q, include_adult:"false"}, signal);
  return (j.results||[]).slice(0,8).map(function(x){ return mapTmdb(kind,x,gmap); });
}

/* Laufzeit, Folgenzahl und die Anbieter stehen erst in den Einzeldaten. */
async function tmdbDetails(kind, id){
  var j=await tmdbFetch("/"+kind+"/"+id, {append_to_response:"watch/providers"});
  var hit=mapTmdb(kind, j, null);
  var wp=j["watch/providers"] && j["watch/providers"].results && j["watch/providers"].results.DE;
  if(wp){
    var names=[];
    ["flatrate","free","ads","rent","buy"].forEach(function(t){
      (wp[t]||[]).forEach(function(prov){
        if(prov.provider_name && names.indexOf(prov.provider_name)<0) names.push(prov.provider_name);
      });
    });
    hit.platforms=names.slice(0,8);
  }
  return hit;
}

function applyHit(target, hit, opts){
  opts = opts || {};
  if(hit.name) target.title = hit.name;
  if(hit.release && (!target.release || opts.force)) target.release = hit.release;
  if(hit.platform && (!target.platform || opts.force)) target.platform = hit.platform;
  if(hit.playtime && (!target.avgHours || opts.force)) target.avgHours = hit.playtime;
  if(hit.runtime && (!target.runtime || opts.force)) target.runtime = hit.runtime;
  if(hit.episodes && (!target.episodes || opts.force)) target.episodes = hit.episodes;
  if(hit.tags && hit.tags.length) target._suggest = hit.tags.slice();
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
function pad2(v){ return ("0"+String(v)).slice(-2); }
function isoToDE(v){
  v=String(v||"").trim();
  var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if(m) return m[3]+"."+m[2]+"."+m[1];
  var m2=/^(\d{4})-(\d{2})$/.exec(v);         if(m2) return m2[2]+"."+m2[1];
  return v;
}
function deToIso(v){
  v=String(v||"").trim().replace(/\s+/g,"");
  if(!v) return "";
  var m=/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
  if(m) return m[3]+"-"+pad2(m[2])+"-"+pad2(m[1]);
  var m2=/^(\d{1,2})\.(\d{4})$/.exec(v);
  if(m2) return m2[2]+"-"+pad2(m2[1]);
  if(/^\d{4}$/.test(v)) return v;
  return v;
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
function todayISO(){
  var d=new Date();
  return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());
}
function isUpcoming(g){
  var r=String(g.release||"");
  if(!/^\d{4}/.test(r)) return false;
  var full = /^\d{4}-\d{2}-\d{2}$/.test(r) ? r : (r.length===4 ? r+"-12-31" : r+"-28");
  return full > todayISO();
}
function releaseLabel(g){
  if(!g.release) return null;
  if(!isUpcoming(g)){ var y=releaseYear(g); return y?String(y):null; }
  return "erscheint "+(fmtDate(g.release) || isoToDE(g.release));
}
function releaseYear(g){ var m=/^(\d{4})/.exec(String(g.release||"")); return m?+m[1]:null; }
function releaseSort(g){
  var m=/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(g.release||""));
  return m ? (+m[1])*10000 + (m[2]?+m[2]:0)*100 + (m[3]?+m[3]:0) : -1;
}

/* ============ Ableitungen ============ */
/* Eine Liste gehoert zu genau einem Medium. Listen ohne Angabe sind
   Spielelisten — der Bestand musste dafuer nicht angefasst werden. */
function listMedia(l){ return (l && MEDIA[l.media]) ? l.media : "game"; }
function sortedLists(mediaK){
  return lists.filter(function(l){ return !mediaK || listMedia(l)===mediaK; })
    .sort(function(a,b){ return (a.createdAt||0)-(b.createdAt||0); });
}
function listById(id){ return lists.find(function(l){ return l.id===id; }) || null; }
function gamesOfList(id){
  var l=listById(id), mk=listMedia(l);
  return games.filter(function(g){ return (g.listIds||[]).indexOf(id)>=0 && mediaKey(g)===mk; });
}
/* Alles, was den Filter fuellt, bezieht sich auf das gewaehlte Medium —
   sonst stehen im Spielefilter die Streamingdienste. */
function mediaPool(){
  return filt.media ? games.filter(function(g){ return mediaKey(g)===filt.media; }) : games;
}
function allPlatforms(){
  var s={}; mediaPool().forEach(function(g){ if(g.platform) s[g.platform]=1; });
  return Object.keys(s).sort(function(a,b){ return a.localeCompare(b,"de"); });
}
function allGenres(){
  var c={};
  mediaPool().forEach(function(g){ (g.genres||[]).forEach(function(x){ c[x]=(c[x]||0)+1; }); });
  return Object.keys(c).map(function(k){ return {name:k, count:c[k]}; })
    .sort(function(a,b){ return b.count-a.count || a.name.localeCompare(b.name,"de"); });
}
function countBy(field){
  var c={}; mediaPool().forEach(function(g){ if(g[field]) c[g[field]]=(c[g[field]]||0)+1; });
  return c;
}
function visible(){
  var q=filt.q.trim().toLowerCase();
  return games.filter(function(g){
    if(filt.media && mediaKey(g)!==filt.media) return false;
    if(filt.status && g.status!==filt.status) return false;
    if(filt.plat && g.platform!==filt.plat) return false;
    if(filt.genres.length){
      var mine=g.genres||[];
      for(var gi=0; gi<filt.genres.length; gi++){ if(mine.indexOf(filt.genres[gi])<0) return false; }
    }
    if(filt.list && (g.listIds||[]).indexOf(filt.list)<0) return false;
    if(filt.min>1 && !(Number(g.score)>=filt.min)) return false;
    if(q){
      var hay=[g.title,g.platform,(g.genres||[]).join(" "),statusLabel(g),md(g).one].join(" ").toLowerCase();
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
    case "release-asc":     return function(a,b){ var x=releaseSort(a), y=releaseSort(b);
                              if(x<0&&y<0) return byTitle(a,b); if(x<0) return 1; if(y<0) return -1;
                              return x-y || byTitle(a,b); };
    case "release-desc":    return function(a,b){ var x=releaseSort(a), y=releaseSort(b);
                              if(x<0&&y<0) return byTitle(a,b); if(x<0) return 1; if(y<0) return -1; return y-x || byTitle(a,b); };
    case "priority-desc":   return numDesc(function(g){ return g.priority; });
    case "playthroughs-desc": return numDesc(function(g){ return g.playthroughs; });
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
/* Das Medium zaehlt hier bewusst nicht als Filter: es ist der Bereich, in
   dem man sich befindet, und die Kennzahlen gelten dann fuer diesen Bereich. */
function anyFilter(){
  return !!(filt.q || filt.status || filt.plat || filt.genres.length || filt.list || filt.min>1);
}
function fillStats(s, rows, countLabel){
  var scored=rows.filter(function(g){ return nz(g.score)!=null; });
  var avg = scored.length ? scored.reduce(function(a,g){ return a+Number(g.score); },0)/scored.length : null;
  var hrs = rows.reduce(function(a,g){ return a+(nz(g.hours)||0); },0);
  var done = rows.filter(function(g){ return Number(g.completion)>=100 || g.status==="gespielt"; }).length;

  var buckets=new Array(10).fill(0);
  scored.forEach(function(g){ buckets[Math.min(9,Math.max(0,Math.floor((Number(g.score)-1)/10)))]++; });
  var peak=Math.max.apply(null,buckets.concat([1]));

  s.innerHTML="";
  function tile(k,v,sub){
    var d=el("div","stat");
    d.appendChild(el("span","stat-k",k));
    var b=el("div","stat-v"); b.textContent=v;
    if(sub) b.appendChild(el("small",null,sub));
    d.appendChild(b); return d;
  }
  s.appendChild(tile(countLabel || "Einträge", String(rows.length)));
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
    b.title=(i*10+1)+"–"+(i*10+10)+": "+n+(n===1?" Eintrag":" Einträge");
    bars.appendChild(b);
  });
  h.appendChild(bars);
  var ax=el("div","hist-axis");
  ["1","50","100"].forEach(function(x){ ax.appendChild(el("span",null,x)); });
  h.appendChild(ax);
  s.appendChild(h);
}

function renderStats(){
  var filtered=anyFilter();
  var word = filt.media ? MEDIA[filt.media].many : "Einträge";
  fillStats($("#stats"), filtered ? visible() : mediaPool().slice(),
            filtered ? word+" (gefiltert)" : word);
}

/* ============ Render: Medienumschalter ============ */
function setMedia(k){
  if(filt.media===k) return;
  filt.media = k || "";
  /* Plattform und Genres gehoeren zum vorherigen Medium und ergeben hier
     keinen Sinn mehr. */
  filt.plat=""; filt.genres=[];
  document.body.setAttribute("data-medium", filt.media || "all");
  LS.put("sa.media", filt.media);
  render();
}
function renderMediaSeg(){
  var box=$("#mediaseg");
  if(!box) return;
  if(!box.childElementCount){
    var opts=[{k:"", l:"Alle"}].concat(MEDIA_ORDER.map(function(k){ return {k:k, l:MEDIA[k].many}; }));
    opts.forEach(function(o){
      var b=el("button",null); b.type="button"; b.dataset.m=o.k;
      if(o.k){ var ic=mediaIcon(o.k); if(ic) b.appendChild(ic); }
      b.appendChild(el("span",null,o.l));
      b.addEventListener("click",function(){ setMedia(o.k); });
      box.appendChild(b);
    });
  }
  Array.prototype.forEach.call(box.children,function(b){
    var on = (b.dataset.m||"")===filt.media;
    b.setAttribute("aria-pressed", String(on));
    var n = b.dataset.m ? games.filter(function(g){ return mediaKey(g)===b.dataset.m; }).length : games.length;
    b.title = n + " " + mediaLabel(b.dataset.m||null, n);
  });
}

/* ============ Render: Rail ============ */
function renderRail(){
  renderMediaSeg();
  var labs=(filt.media ? MEDIA[filt.media] : MEDIA.game).lab;
  var lp=$("#lab-plat"); if(lp) lp.textContent=labs.where;

  var sw=$("#f-status");
  if(!sw.childElementCount){
    STATUS.forEach(function(st){
      var b=el("button","pill"); b.type="button"; b.dataset.k=st.k;
      b.addEventListener("click",function(){ filt.status=(filt.status===st.k)?"":st.k; render(); });
      sw.appendChild(b);
    });
  }
  Array.prototype.forEach.call(sw.children,function(b){
    var k=b.dataset.k;
    /* Ohne Medienwahl gelten die Spielbegriffe, sonst die des Bereichs. */
    b.textContent = (filt.media ? MEDIA[filt.media] : MEDIA.game).status[k];
    b.setAttribute("aria-pressed", String(filt.status===k));
  });

  function fillSelect(sel,items,all,cur,label){
    var focused=document.activeElement===sel;
    sel.innerHTML="";
    var o=el("option",null,all); o.value=""; sel.appendChild(o);
    items.forEach(function(x){
      var oo=el("option",null, label ? label(x) : x); oo.value=x; sel.appendChild(oo);
    });
    sel.value = items.indexOf(cur)>=0 ? cur : "";
    if(focused) sel.focus();
  }
  var platCounts=countBy("platform");
  fillSelect($("#f-plat"), allPlatforms(), filt.media==="game"||!filt.media ? "Alle Plattformen" : "Überall", filt.plat, function(name){
    return name+" ("+(platCounts[name]||0)+")";
  });

  var gl=$("#f-genre"); gl.innerHTML="";
  var genres=allGenres();
  if(!genres.length) gl.appendChild(el("p","hint","Noch keine Genres."));
  genres.forEach(function(gobj){
    var b=el("button","pill"); b.type="button";
    b.appendChild(document.createTextNode(gobj.name));
    b.appendChild(el("i",null,String(gobj.count)));
    b.setAttribute("aria-pressed", String(filt.genres.indexOf(gobj.name)>=0));
    b.addEventListener("click",function(){
      var i=filt.genres.indexOf(gobj.name);
      if(i<0) filt.genres.push(gobj.name); else filt.genres.splice(i,1);
      render();
    });
    gl.appendChild(b);
  });
  $("#f-min").value=filt.min; $("#f-min-out").textContent=filt.min;
  if($("#f-q").value!==filt.q) $("#f-q").value=filt.q;
  $("#f-sort").value=filt.sort;

  var ls=$("#f-list"), lfocus=document.activeElement===ls;
  ls.innerHTML="";
  var o0=el("option",null,"Alle Listen"); o0.value=""; ls.appendChild(o0);
  sortedLists(filt.media||null).forEach(function(l){
    var pre = filt.media ? "" : MEDIA[listMedia(l)].one+": ";
    var oo=el("option",null, pre+l.name+" ("+gamesOfList(l.id).length+")"); oo.value=l.id; ls.appendChild(oo);
  });
  ls.value = lists.some(function(l){ return l.id===filt.list; }) ? filt.list : "";
  if(lfocus) ls.focus();
}

/* ============ Render: Karten & Tabelle ============ */
function pipsNode(v){
  var w=el("span","pips");
  w.setAttribute("role","img");
  w.setAttribute("aria-label", v+" von 5 — "+(PRIO[v]||""));
  for(var i=1;i<=5;i++){
    var p=el("i"); if(i<=v) p.className="on";
    w.appendChild(p);
  }
  return w;
}
function factWith(k,node){
  var f=el("span","fact"); f.appendChild(el("span",null,k)); f.appendChild(node); return f;
}
function factNode(k,v){ var f=el("span","fact"); f.appendChild(el("span",null,k)); f.appendChild(el("b",null,v)); return f; }

function fmtRuntime(min){
  var n=Number(min)||0; if(!n) return null;
  var h=Math.floor(n/60), r=n%60;
  return h ? (h+" h"+(r?" "+r+" min":"")) : (r+" min");
}
/* Welche Angaben ein Eintrag zeigt, haengt am Medium — Karte und
   Leseansicht holen sie beide hier, damit sie nicht auseinanderlaufen. */
function factList(g){
  var m=md(g), k=mediaKey(g), out=[];
  /* Bei einem einmal gesehenen Film waere die Zeit nur die Laufzeit
     noch einmal — die steht ohnehin darunter. */
  var showTime = !(k==="movie" && !(Number(g.playthroughs)>1));
  var fh=showTime ? fmtHours(g.hours) : null;
  if(fh) out.push([m.lab.time, fh]);
  if(k==="game"){
    var fa=fmtAvg(g.avgHours); if(fa) out.push([m.lab.usual, fa]);
    var cp=nz(g.completion); if(cp!=null) out.push([m.lab.progress, Math.round(cp)+" %"]);
  }
  if(k==="movie"){
    var rt=fmtRuntime(g.runtime); if(rt) out.push([m.lab.usual, rt]);
  }
  if(k==="tv"){
    var all=Number(g.episodes)||0, seen=Number(g.episodesSeen)||0;
    if(all||seen) out.push([m.lab.progress, seen+(all ? " von "+all : "")]);
    else { var cq=nz(g.completion); if(cq!=null) out.push(["Fortschritt", Math.round(cq)+" %"]); }
    var er=fmtRuntime(g.runtime); if(er) out.push([m.lab.usual, er]);
  }
  var pt=nz(g.playthroughs); if(pt) out.push([m.lab.runs, pt+"\u00D7"]);
  var sp = (k==="movie") ? fmtDate(g.finishedOn) : fmtSpan(g.startedOn,g.finishedOn);
  if(sp) out.push([m.lab.span, sp]);
  return out;
}

function cardNode(g, rank){
  var a=el("button","poster"); a.type="button";

  var art=coverNode(g,"poster-art",640);
  if(rank){ art.appendChild(el("span","poster-rank","#"+rank)); }

  var mk=mediaKey(g);
  var mb=el("span","poster-media");
  mb.setAttribute("data-m",mk);
  mb.title=md(g).one;
  var mi=mediaIcon(mk); if(mi) mb.appendChild(mi);
  mb.appendChild(el("span","sr",md(g).one));
  art.appendChild(mb);

  var st=el("span","poster-status",statusLabel(g));
  art.appendChild(st);

  var sc=nz(g.score);
  var sb=el("div","poster-score");
  var num=el("b", null, sc==null ? "ohne Wertung" : String(sc));
  if(sc==null) num.className="none";
  sb.appendChild(num);
  if(sc!=null){ sb.appendChild(el("em",null,band(sc).l)); }
  art.appendChild(sb);
  a.appendChild(art);

  var b=el("div","poster-body");
  b.appendChild(el("div","poster-title",g.title||"Ohne Titel"));
  var bits=[]; var rl=releaseLabel(g); if(rl) bits.push(rl);
  if(g.platform) bits.push(g.platform);
  if(bits.length) b.appendChild(el("div","poster-meta",bits.join(" · ")));

  if(sc!=null){
    var m=el("div","meter"), fi=el("i");
    fi.style.width=Math.max(1,sc)+"%"; fi.style.background=bandVar(sc);
    m.appendChild(fi); b.appendChild(m);
  }

  var facts=el("div","facts");
  factList(g).forEach(function(f){ facts.appendChild(factNode(f[0], f[1])); });
  var pr=nz(g.priority);
  if(pr && wantsPriority(g.status)) facts.appendChild(factWith("Vorfreude", pipsNode(pr)));
  if(facts.childElementCount) b.appendChild(facts);

  if((g.genres||[]).length){
    var tags=el("div","tags");
    g.genres.slice(0,3).forEach(function(x){ tags.appendChild(el("span","tag",x)); });
    b.appendChild(tags);
  }

  a.appendChild(b);
  a.addEventListener("click",function(){ openDetail(g.id); });
  return a;
}

function renderGrid(rows, sortKey){
  var wrap=el("div","grid");
  var ranked = (sortKey || filt.sort)==="score-desc";
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
    var bits=[]; var rl=releaseLabel(g); if(rl) bits.push(rl);
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
    var cp=nz(g.completion), ptc=nz(g.playthroughs);
    var tdc2=el("td","t-num"+(cp!=null?"":" t-dim"));
    /* Bei Serien sagt die Folgenzahl mehr als die Prozentangabe. */
    if(mediaKey(g)==="tv" && (Number(g.episodes)||Number(g.episodesSeen)))
      tdc2.appendChild(el("div",null,(Number(g.episodesSeen)||0)+(Number(g.episodes)?" / "+g.episodes:"")));
    else tdc2.appendChild(el("div",null, cp!=null?Math.round(cp)+" %":"—"));
    if(ptc) tdc2.appendChild(el("div","t-sub", ptc+"\u00D7 "+(mediaKey(g)==="game"?"durch":"gesehen")));
    tr.appendChild(tdc2);
    var sp = mediaKey(g)==="movie" ? fmtDate(g.finishedOn) : fmtSpan(g.startedOn,g.finishedOn);
    tr.appendChild(el("td","t-num"+(sp?"":" t-dim"), sp||"—"));

    var tdst=el("td");
    var st=el("span","status",statusLabel(g)); st.setAttribute("data-s",g.status||"backlog");
    tdst.appendChild(st);
    var prt=nz(g.priority);
    if(prt && wantsPriority(g.status)){
      var pw=el("div"); pw.style.marginTop="5px"; pw.appendChild(pipsNode(prt));
      tdst.appendChild(pw);
    }
    tr.appendChild(tdst);

    tr.addEventListener("click",function(){ openDetail(g.id); });
    tr.addEventListener("keydown",function(ev){ if(ev.key==="Enter"||ev.key===" "){ ev.preventDefault(); openDetail(g.id); } });
    tb.appendChild(tr);
  });
  t.appendChild(tb); w.appendChild(t);
  return w;
}

function demoCard(){
  var c=cardNode({ id:"__demo", title:"Beispieleintrag", platform:"PS5", release:"2022-02-25", score:87,
    hours:63.5, avgHours:58, completion:92, playthroughs:2, startedOn:"2024-03-05", finishedOn:"2024-04-21", status:"gespielt",
    genres:["Action-RPG","Open World"], listIds:[] });
  c.classList.add("demo"); c.tabIndex=-1; c.setAttribute("aria-hidden","true");
  return c;
}

function renderEmpty(){
  var e=el("div","empty"), L=el("div");
  var pool=mediaPool();
  /* Ein leerer Bereich ist etwas anderes als ein leeres Archiv und etwas
     anderes als ein Filter, der nichts uebrig laesst. */
  if(filt.media && !pool.length && games.length){
    var M=MEDIA[filt.media];
    L.appendChild(el("h2", null, "Noch "+(filt.media==="tv"?"keine Serien":filt.media==="movie"?"keine Filme":"keine Spiele")+" im Archiv"));
    L.appendChild(el("p",null,"Such den Titel in der Datenbank — Cover, Erscheinungsjahr, "+
      (filt.media==="tv" ? "Folgenzahl und Folgenlänge" : filt.media==="movie" ? "Laufzeit" : "Plattform")+
      ", Genres und die Anbieter kommen mit. Wertung und Zeitraum trägst du selbst ein."));
    var ba=el("button","btn btn-accent","Ersten Eintrag anlegen"); ba.type="button";
    ba.addEventListener("click",function(){ setAddMedia(filt.media); setTab("add"); });
    L.appendChild(ba);
    e.appendChild(L);
    return e;
  }
  var filtered = games.length>0;
  L.appendChild(el("h2", null, filtered ? "Nichts passt zu diesem Filter" : "Dein Archiv ist noch leer"));
  if(filtered){
    L.appendChild(el("p",null,"Setz die Filter zurück oder such nach etwas anderem."));
    var rb=el("button","btn","Filter zurücksetzen"); rb.type="button";
    rb.addEventListener("click",resetFilters);
    L.appendChild(rb);
  } else {
    L.appendChild(el("p",null,"Tipp den Titel ein, such ihn in der Datenbank und übernimm Cover, Erscheinungsdatum, Genres und die übrigen Angaben mit einem Klick. Wertung und Zeitraum trägst du selbst ein."));
    var ul=el("ul");
    ["Wertung von 1 bis 100, mit Skala und Prädikat",
     "Spiele, Filme und Serien auf derselben Skala",
     "Cover und Angaben automatisch aus den Datenbanken",
     "Eigene Listen wie „Top 10 2025“ neben dem Status"].forEach(function(x){ ul.appendChild(el("li",null,x)); });
    L.appendChild(ul);
    var row=el("div"); row.style.cssText="display:flex;gap:8px;flex-wrap:wrap";
    var b1=el("button","btn btn-accent","Ersten Eintrag anlegen"); b1.type="button";
    b1.addEventListener("click",function(){ setTab("add"); });
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
  var labs=(filt.media ? MEDIA[filt.media] : MEDIA.game);
  if(filt.status) chips.push({k:"Status", v:labs.status[filt.status], off:function(){ filt.status=""; }});
  if(filt.plat)   chips.push({k:labs.lab.where, v:filt.plat, off:function(){ filt.plat=""; }});
  filt.genres.forEach(function(gname){
    chips.push({k:"Genre", v:gname, off:function(){
      filt.genres = filt.genres.filter(function(x){ return x!==gname; });
    }});
  });
  if(filt.list){
    var l=lists.find(function(x){ return x.id===filt.list; });
    if(l) chips.push({k:"Liste", v:l.name, off:function(){ filt.list=""; }});
  }
  if(filt.min>1)  chips.push({k:"Wertung", v:"ab "+filt.min, off:function(){ filt.min=1; }});

  var badge=$("#tab-badge");
  if(badge){ badge.textContent=String(chips.length); badge.hidden = !chips.length; }
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

/* ============ Seite: Hinzufügen ============ */
var addCtl=null, addTimer=null;

var addMedia = "game";
function setAddMedia(k){
  addMedia = MEDIA[k] ? k : "game";
  LS.put("sa.addmedia", addMedia);
  $("#add-results").innerHTML="";
  $("#add-status").textContent="";
  renderAddPage();
}
function renderAddPage(){
  var st=$("#add-status"), box=$("#add-results");
  var M=MEDIA[addMedia]||MEDIA.game;

  var seg=$("#add-media");
  if(seg){
    if(!seg.childElementCount){
      MEDIA_ORDER.forEach(function(k){
        var b=el("button",null); b.type="button"; b.dataset.m=k;
        var ic=mediaIcon(k); if(ic) b.appendChild(ic);
        b.appendChild(el("span",null,MEDIA[k].one));
        b.addEventListener("click",function(){ setAddMedia(k); });
        seg.appendChild(b);
      });
    }
    Array.prototype.forEach.call(seg.children,function(b){
      b.setAttribute("aria-pressed", String(b.dataset.m===addMedia));
    });
    seg.setAttribute("data-m", addMedia);
  }

  var h=$("#add-head"), ph=$("#add-sub"), q=$("#add-q");
  if(h) h.textContent = M.one+" hinzufügen";
  if(q) q.placeholder = M.one+" suchen …";
  if(ph) ph.textContent = addMedia==="game"
    ? "Titel eingeben, das richtige Spiel wählen — Cover, Release, Plattform, Genres und die übliche Spieldauer kommen mit."
    : (addMedia==="movie"
      ? "Titel eingeben, den richtigen Film wählen — Cover, Erscheinungsjahr, Laufzeit, Genres und die Anbieter kommen mit."
      : "Titel eingeben, die richtige Serie wählen — Cover, Startjahr, Folgenzahl, Folgenlänge, Genres und die Anbieter kommen mit.");

  var man=$("#add-manual"); if(man) man.textContent = "Ohne Datenbank eintragen";
  var blk=$("#add-bulk"); if(blk) blk.hidden = addMedia!=="game";

  if(!hasKey(addMedia)){
    box.innerHTML="";
    st.className="ai-status"; st.innerHTML="";
    st.appendChild(document.createTextNode("Für die Suche fehlt der "+sourceName(addMedia)+"-Key dieses Geräts. "));
    var lnk=el("button","btn btn-quiet btn-sm","Jetzt eintragen"); lnk.type="button";
    lnk.addEventListener("click",function(){ openSettings(); });
    st.appendChild(lnk);
  }
}

function runAddSearch(){
  var q=($("#add-q").value||"").trim();
  var st=$("#add-status"), box=$("#add-results");
  box.innerHTML="";
  if(q.length<2){ st.className="ai-status bad"; st.textContent="Erst ein paar Buchstaben tippen."; return; }
  if(!hasKey(addMedia)){ renderAddPage(); return; }
  var M=MEDIA[addMedia]||MEDIA.game;
  if(addCtl) addCtl.abort();
  addCtl=new AbortController();
  st.className="ai-status"; st.innerHTML="";
  st.appendChild(el("span","spin")); st.appendChild(document.createTextNode("sucht …"));
  searchMedia(addMedia, q, addCtl.signal).then(function(hits){
    if(!hits.length){
      st.className="ai-status";
      st.textContent="Nichts gefunden. Du kannst den Eintrag trotzdem von Hand anlegen.";
      return;
    }
    st.className="ai-status";
    st.textContent=hits.length+" Treffer — wähl "+(addMedia==="tv"?"die richtige Serie":addMedia==="movie"?"den richtigen Film":"das richtige Spiel")+" aus:";
    var grid=el("div","hits");
    hits.forEach(function(hit){
      var b=el("button","hit"); b.type="button";
      var art=el("div","hit-art");
      if(hit.cover){
        var im=el("img"); im.src=rimg(hit.cover,420); im.alt=""; im.loading="lazy";
        im.addEventListener("error",function(){
          im.remove(); tileStyle(art,hit.name); art.appendChild(el("div","cover-ph",initials(hit.name)));
        });
        art.appendChild(im);
      } else { tileStyle(art,hit.name); art.appendChild(el("div","cover-ph",initials(hit.name))); }
      b.appendChild(art);
      var bd=el("div","hit-body");
      bd.appendChild(el("div","hit-n",hit.name));
      var m=[]; if(hit.release) m.push(String(hit.release).slice(0,4));
      if(hit.platforms && hit.platforms.length) m.push(hit.platforms.slice(0,3).join(", "));
      if(hit.playtime) m.push("ca. "+hit.playtime+" h");
      if(hit.genres && hit.genres.length) m.push(hit.genres.slice(0,2).join(", "));
      bd.appendChild(el("div","hit-m", m.join(" · ") || "keine Angaben"));
      b.appendChild(bd);
      b.addEventListener("click",function(){
        if(M.source==="tmdb" && hit.tmdbId){
          st.className="ai-status"; st.innerHTML="";
          st.appendChild(el("span","spin")); st.appendChild(document.createTextNode("holt Einzelheiten …"));
          tmdbDetails(M.tmdb, hit.tmdbId).then(function(full){ openEditor(null, full||hit); })
            .catch(function(){ openEditor(null, hit); });
        } else openEditor(null, hit);
      });
      grid.appendChild(b);
    });
    box.appendChild(grid);
  }).catch(function(e){
    if(e && e.name==="AbortError") return;
    st.className="ai-status bad";
    st.textContent = e && e.message ? e.message : "Suche fehlgeschlagen.";
  });
}

/* ============ Spiele einer Liste auswählen ============ */
function openListPicker(l){
  var LM=listMedia(l), LMM=MEDIA[LM];
  var D=makeDrawer(LMM.many+" in „"+l.name+"“");
  var body=D.body, foot=D.foot;
  D.drawer.setAttribute("data-m", LM);

  var chosen={};
  games.forEach(function(g){ if((g.listIds||[]).indexOf(l.id)>=0) chosen[g.id]=true; });

  var f=el("div","field");
  var lb=el("label",null,"Suche"); lb.htmlFor="pick-q"; f.appendChild(lb);
  var q=el("input","inp"); q.id="pick-q"; q.type="search"; q.placeholder="Titel, Plattform, Genre …"; q.autocomplete="off";
  f.appendChild(q); body.appendChild(f);

  var hint=el("p","hint","Angehaktes steht in der Liste, ein Tipp hakt an oder ab. Diese Liste führt "+LMM.many+".");
  body.appendChild(hint);

  var box=el("div","pick"); body.appendChild(box);
  var apply=el("button","btn btn-accent","Übernehmen"); apply.type="button";

  function countChosen(){ return Object.keys(chosen).filter(function(k){ return chosen[k]; }).length; }
  function refreshFoot(){
    var c=countChosen();
    apply.textContent = c===1 ? "Übernehmen (1 Eintrag)" : "Übernehmen ("+c+" Einträge)";
  }
  function paint(){
    var term=q.value.trim().toLowerCase();
    box.innerHTML="";
    var rows=games.filter(function(g){
      if(mediaKey(g)!==LM) return false;
      if(!term) return true;
      return [g.title,g.platform,(g.genres||[]).join(" ")].join(" ").toLowerCase().indexOf(term)>=0;
    }).sort(function(a,b){
      var ai=chosen[a.id]?0:1, bi=chosen[b.id]?0:1;
      if(ai!==bi) return ai-bi;
      return String(a.title||"").localeCompare(String(b.title||""),"de",{sensitivity:"base"});
    });
    if(!rows.length){ box.appendChild(el("p","hint", term ? "Nichts passt zur Suche." : "Noch keine "+LMM.many+" im Archiv.")); return; }
    rows.forEach(function(g){
      var r=el("button","pickrow"); r.type="button";
      r.setAttribute("aria-pressed", String(!!chosen[g.id]));
      r.appendChild(coverNode(g,"cv",200));
      var mid=el("div");
      mid.appendChild(el("b",null,g.title||"Ohne Titel"));
      var bits=[]; var ry=releaseYear(g); if(ry) bits.push(String(ry));
      if(g.platform) bits.push(g.platform);
      mid.appendChild(el("span",null,bits.join(" · ")));
      r.appendChild(mid);
      r.appendChild(el("span","pickbox","\u2713"));
      r.addEventListener("click",function(){
        chosen[g.id] = !chosen[g.id];
        r.setAttribute("aria-pressed", String(!!chosen[g.id]));
        refreshFoot();
      });
      box.appendChild(r);
    });
  }
  var pt=null;
  q.addEventListener("input",function(){ clearTimeout(pt); pt=setTimeout(paint,140); });
  paint(); refreshFoot();

  foot.appendChild(el("div","spacer"));
  var cancel=el("button","btn btn-sm","Abbrechen"); cancel.type="button";
  cancel.addEventListener("click",closeOverlay);
  apply.addEventListener("click",function(){
    var touched=0;
    games.forEach(function(g){
      var was=(g.listIds||[]).indexOf(l.id)>=0, now=!!chosen[g.id];
      if(was===now) return;
      g.listIds = g.listIds||[];
      if(now) g.listIds.push(l.id);
      else g.listIds = g.listIds.filter(function(x){ return x!==l.id; });
      g.updatedAt = Date.now();
      touched++;
    });
    closeOverlay();
    if(touched){ markDirty(); render(); toast(touched===1 ? "1 Eintrag geändert." : touched+" Einträge geändert."); }
  });
  foot.appendChild(cancel); foot.appendChild(apply);
  D.drawer.addEventListener("keydown",function(ev){ if(ev.key==="Escape"){ ev.preventDefault(); closeOverlay(); } });
  setTimeout(function(){ q.focus(); },30);
}

/* ============ Seite: Empfehlungen ============ */
var TIPS = { loaded:false, loading:false, items:null, profile:null, error:"", note:"" };
var GENRE_SLUGS = null;

function normTitle(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,""); }
function slugify(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); }

/* Die Empfehlungen laufen ueber die Spieledatenbank, also zaehlen hier
   auch nur Spiele. Filme und Serien bekommen spaeter ihren eigenen Weg
   ueber die Empfehlungen von TMDB. */
function likedGames(){
  return games.filter(function(g){
    if(mediaKey(g)!=="game") return false;
    var s=nz(g.score); return s!=null && s>=80;
  });
}

function tasteProfile(){
  var liked=likedGames(), gw={}, pw={};
  liked.forEach(function(g){
    var w=Number(g.score)-79;           /* 80 zaehlt einfach, 100 zwanzigfach */
    (g.genres||[]).forEach(function(t){ gw[t]=(gw[t]||0)+w; });
    if(g.platform) pw[g.platform]=(pw[g.platform]||0)+w;
  });
  function rank(o){
    return Object.keys(o).map(function(k){ return {name:k, w:o[k]}; })
      .sort(function(a,b){ return b.w-a.w || a.name.localeCompare(b.name,"de"); });
  }
  return { count:liked.length, genres:rank(gw), platforms:rank(pw) };
}

/* Die RAWG-Dokumentation war beim Bauen nicht erreichbar. Deshalb probiert die
   Suche die genaueste Abfrage zuerst und faellt auf einfachere zurueck, wenn ein
   Parameter abgelehnt wird oder nichts zurueckkommt. */
async function rawgList(query){
  var key=rawgKey();
  if(!key){ var e=new Error("Kein RAWG-Key hinterlegt."); e.nokey=true; throw e; }
  var r=await fetch("https://api.rawg.io/api/games?key="+encodeURIComponent(key)+query);
  if(r.status===401){ var a=new Error("Der RAWG-Key wird nicht akzeptiert."); a.nokey=true; throw a; }
  if(r.status===429) throw new Error("RAWG-Limit erreicht. Später nochmal versuchen.");
  if(!r.ok) return null;
  var jj=await r.json();
  var res=(jj.results||[]).map(mapRawgGame);
  return res.length ? res : null;
}

async function discoverByGenre(name, slug){
  var g=encodeURIComponent(slug);
  var variants=[
    "&genres="+g+"&ordering=-metacritic&page_size=40&exclude_additions=true",
    "&genres="+g+"&ordering=-metacritic&page_size=40",
    "&genres="+g+"&page_size=40",
    "&search="+encodeURIComponent(name)+"&page_size=40"
  ];
  for(var i=0;i<variants.length;i++){
    var res=await rawgList(variants[i]);
    if(res) return res;
  }
  return [];
}

async function genreSlugs(){
  if(GENRE_SLUGS) return GENRE_SLUGS;
  GENRE_SLUGS={};
  try{
    var r=await fetch("https://api.rawg.io/api/genres?key="+encodeURIComponent(rawgKey())+"&page_size=40");
    if(r.ok){
      var jj=await r.json();
      (jj.results||[]).forEach(function(x){
        if(x && x.name && x.slug) GENRE_SLUGS[String(x.name).toLowerCase()]=x.slug;
      });
    }
  }catch(e){}
  return GENRE_SLUGS;
}

function scoreTip(hit, profile){
  var gw={}; profile.genres.forEach(function(t){ gw[String(t.name).toLowerCase()]=t.w; });
  var top = profile.genres.length ? profile.genres[0].w : 1;
  var fit=0, why=[];
  (hit.genres||[]).concat(hit.tags||[]).forEach(function(t){
    var w=gw[String(t).toLowerCase()];
    if(w){ fit+=w; if(why.indexOf(t)<0) why.push(t); }
  });
  var quality = hit.metacritic ? (hit.metacritic-55)/45
              : (hit.rating ? (hit.rating-2.8)/2.2 : 0.15);
  if(quality<0) quality=0;
  var onPlat = profile.platforms.some(function(p){ return (hit.platforms||[]).indexOf(p.name)>=0; });
  return { total: (fit/(top*2.2)) + quality*0.9 + (onPlat?0.18:0), why: why.slice(0,3) };
}

async function buildTips(){
  if(TIPS.loading) return;
  TIPS.loading=true; TIPS.error=""; TIPS.note="";
  renderTips();
  try{
    var profile=tasteProfile();
    TIPS.profile=profile;
    if(!rawgKey()){ var k=new Error("Kein RAWG-Key hinterlegt."); k.nokey=true; throw k; }
    if(profile.count<5){ var f=new Error("few"); f.few=true; throw f; }

    var map=await genreSlugs();
    var picks=profile.genres.slice(0,3);
    var pool=[], seen={};
    for(var i=0;i<picks.length;i++){
      var slug = map[String(picks[i].name).toLowerCase()] || slugify(picks[i].name);
      var res = await discoverByGenre(picks[i].name, slug);
      res.forEach(function(hit){
        var key=normTitle(hit.name);
        if(!key || seen[key]) return;
        seen[key]=1; pool.push(hit);
      });
      await new Promise(function(done){ setTimeout(done,140); });
    }

    var owned={};
    games.forEach(function(g){ owned[normTitle(g.title)]=1; });

    var out=pool.filter(function(hit){ return !owned[normTitle(hit.name)]; })
      .map(function(hit){
        var s=scoreTip(hit, profile);
        hit._fit=s.total; hit._why=s.why;
        return hit;
      })
      .filter(function(hit){ return hit._why.length; })
      .sort(function(a,b){ return b._fit-a._fit; })
      .slice(0,24);

    TIPS.items=out; TIPS.loaded=true;
    if(!out.length) TIPS.note="Nichts gefunden, was nicht schon bei dir steht.";
  }catch(e){
    TIPS.items=null; TIPS.loaded=false;
    if(e && e.few) TIPS.error="few";
    else if(e && e.nokey) TIPS.error="nokey";
    else TIPS.error=(e && e.message) ? e.message : "Hat nicht geklappt.";
  }
  TIPS.loading=false;
  renderTips();
}

function addFromTip(hit){
  var g={ id:uid(), title:hit.name, release:"", platform:"", genres:[], score:"", hours:"", completion:"",
    startedOn:"", finishedOn:"", status:"wunschliste", cover:"", avgHours:"",
    playthroughs:"", priority:"", listIds:[], createdAt:Date.now() };
  g.cover = applyHit(g, hit, {force:true});
  delete g._suggest;
  if(TIPS.items) TIPS.items = TIPS.items.filter(function(x){ return x!==hit; });
  putGame(g);
  toast("„"+g.title+"“ steht jetzt auf der Wunschliste.");
}

function renderTips(){
  var prof=$("#tips-profile"), st=$("#tips-status"), box=$("#tips-results");
  if(!prof || !st || !box) return;
  var profile = TIPS.profile || tasteProfile();

  prof.innerHTML="";
  var card=el("div","taste");
  card.appendChild(el("span","taste-k",
    "Deine Vorlieben — aus "+profile.count+(profile.count===1?" Spiel":" Spielen")+" ab 80"));
  if(profile.genres.length){
    var bars=el("div","taste-bars");
    var top=profile.genres[0].w || 1;
    profile.genres.slice(0,6).forEach(function(t){
      var row=el("div","taste-row");
      row.appendChild(el("span",null,t.name));
      var bar=el("div","bar"), fi=el("i");
      fi.style.width=Math.max(4,Math.round(t.w/top*100))+"%";
      bar.appendChild(fi); row.appendChild(bar);
      row.appendChild(el("b",null,String(t.w)));
      bars.appendChild(row);
    });
    card.appendChild(bars);
  }
  var foot=el("div","taste-foot");
  foot.appendChild(el("p","hint","Je höher deine Wertung, desto stärker zählt ein Spiel."));
  var rb=el("button","btn btn-sm", TIPS.loading ? "sucht …" : "Neu berechnen"); rb.type="button";
  rb.disabled=TIPS.loading;
  rb.addEventListener("click",function(){ TIPS.loaded=false; buildTips(); });
  foot.appendChild(rb);
  card.appendChild(foot);
  prof.appendChild(card);

  st.className="ai-status"; st.innerHTML=""; box.innerHTML="";

  if(TIPS.loading){
    st.appendChild(el("span","spin"));
    st.appendChild(document.createTextNode("durchsucht die Datenbank nach deinem Geschmack …"));
    return;
  }
  if(TIPS.error==="nokey"){
    st.appendChild(document.createTextNode("Dafür fehlt der RAWG-Key dieses Geräts. "));
    var lnk=el("button","btn btn-quiet btn-sm","Jetzt eintragen"); lnk.type="button";
    lnk.addEventListener("click",function(){ openSettings(); });
    st.appendChild(lnk);
    return;
  }
  if(TIPS.error==="few"){
    st.textContent="Noch zu wenig Grundlage: Es braucht mindestens fünf Spiele mit einer Wertung ab 80.";
    return;
  }
  if(TIPS.error){
    st.className="ai-status bad"; st.textContent=TIPS.error;
    return;
  }
  if(!TIPS.items){
    st.textContent="Noch nichts berechnet.";
    var go=el("button","btn btn-accent","Empfehlungen holen"); go.type="button";
    go.style.marginTop="12px";
    go.addEventListener("click",function(){ buildTips(); });
    box.appendChild(go);
    return;
  }
  if(TIPS.note){ st.textContent=TIPS.note; return; }

  st.textContent=TIPS.items.length+" Vorschläge, beste Übereinstimmung zuerst.";
  var grid=el("div","hits");
  TIPS.items.forEach(function(hit){
    var cardEl=el("div","hit");
    var art=el("div","hit-art");
    if(hit.cover){
      var im=el("img"); im.src=rimg(hit.cover,420); im.alt=""; im.loading="lazy";
      im.addEventListener("error",function(){
        im.remove(); tileStyle(art,hit.name); art.appendChild(el("div","cover-ph",initials(hit.name)));
      });
      art.appendChild(im);
    } else { tileStyle(art,hit.name); art.appendChild(el("div","cover-ph",initials(hit.name))); }
    if(hit.metacritic){
      var mc=el("span","hit-score",String(hit.metacritic));
      mc.title="Metacritic";
      art.appendChild(mc);
    }
    cardEl.appendChild(art);

    var bd=el("div","hit-body");
    bd.appendChild(el("div","hit-n",hit.name));
    var m=[]; if(hit.release) m.push(String(hit.release).slice(0,4));
    if(hit.platforms && hit.platforms.length) m.push(hit.platforms.slice(0,3).join(", "));
    bd.appendChild(el("div","hit-m", m.join(" · ") || "keine Angaben"));

    var why=el("div","tip-why");
    why.appendChild(document.createTextNode("passt zu"));
    hit._why.forEach(function(t){ why.appendChild(el("b",null,t)); });
    bd.appendChild(why);

    var acts=el("div","hit-acts");
    var wish=el("button","btn btn-accent","Wunschliste"); wish.type="button";
    wish.addEventListener("click",function(){ addFromTip(hit); });
    var open=el("button","btn","Eintragen"); open.type="button";
    open.addEventListener("click",function(){ openEditor(null, hit); });
    acts.appendChild(wish); acts.appendChild(open);
    bd.appendChild(acts);

    cardEl.appendChild(bd);
    grid.appendChild(cardEl);
  });
  box.appendChild(grid);
}

/* ============ Seite: Listen ============ */
function renderListsPage(){
  var box=$("#lists-view"); box.innerHTML="";
  var current = openListId ? lists.find(function(l){ return l.id===openListId; }) : null;
  if(current) box.appendChild(renderListDetail(current));
  else box.appendChild(renderListOverview());
}

function miniStrip(rows){
  var strip=el("div","listcard-strip");
  var shown=rows.slice(0,4);
  for(var i=0;i<4;i++){
    if(shown[i]) strip.appendChild(coverNode(shown[i],"",420));
    else { var e=el("div"); e.style.background="var(--surface-2)"; strip.appendChild(e); }
  }
  return strip;
}

function listCard(l){
  var rows=gamesOfList(l.id).sort(sorter(l.sort||"score-desc"));
  var c=el("button","listcard"); c.type="button";
  c.appendChild(miniStrip(rows));
  var bd=el("div","listcard-body");
  bd.appendChild(el("div","listcard-n",l.name));
  bd.appendChild(el("div","listcard-c", rows.length+" "+mediaLabel(listMedia(l), rows.length)));
  c.appendChild(bd);
  c.addEventListener("click",function(){ openListId=l.id; render(); scrollTop(); });
  return c;
}
function newListCard(presetMedia){
  var nb=el("button","listcard is-new"); nb.type="button";
  var nbi=el("div"); nbi.style.cssText="display:flex;flex-direction:column;align-items:center;gap:6px;padding:18px";
  nbi.appendChild(el("div",null,"+"));
  nbi.appendChild(el("div","listcard-n","Neue Liste"));
  nb.appendChild(nbi);
  nb.addEventListener("click",function(){ newList(function(l){ openListId=l.id; render(); }, presetMedia); });
  return nb;
}

function renderListOverview(){
  var wrap=el("div");
  var head=el("div","page-head");
  head.appendChild(el("h2",null,"Listen"));
  head.appendChild(el("p",null,"Eigene Zusammenstellungen neben dem Status. Jede Liste gehört zu einem Medium und behält ihre eigene Reihenfolge und Ansicht."));
  wrap.appendChild(head);

  /* Im Archiv ein Medium gewaehlt? Dann zeigt die Liste nur dessen Listen.
     Sonst nach Medium gruppiert, und leere Gruppen bleiben weg. */
  if(filt.media){
    var grid=el("div","listgrid");
    sortedLists(filt.media).forEach(function(l){ grid.appendChild(listCard(l)); });
    grid.appendChild(newListCard(filt.media));
    wrap.appendChild(grid);
    return wrap;
  }

  var any=false;
  MEDIA_ORDER.forEach(function(k){
    var ls=sortedLists(k);
    if(!ls.length) return;
    any=true;
    var h=el("div","listgroup-h");
    var ic=mediaIcon(k); if(ic) h.appendChild(ic);
    h.appendChild(el("span",null,MEDIA[k].many));
    h.appendChild(el("b",null,String(ls.length)));
    h.setAttribute("data-m",k);
    wrap.appendChild(h);
    var g=el("div","listgrid");
    ls.forEach(function(l){ g.appendChild(listCard(l)); });
    wrap.appendChild(g);
  });
  var g0=el("div", any ? "listgrid listgrid-add" : "listgrid");
  g0.appendChild(newListCard(null));
  wrap.appendChild(g0);
  return wrap;
}

function renderListDetail(l){
  var wrap=el("div");
  var LM=listMedia(l), LMM=MEDIA[LM];
  var rows=gamesOfList(l.id).sort(sorter(l.sort||"score-desc"));

  var back=el("button","btn btn-quiet btn-sm","← Alle Listen"); back.type="button";
  back.style.marginBottom="12px";
  back.addEventListener("click",function(){ openListId=null; render(); scrollTop(); });
  wrap.appendChild(back);

  var head=el("div","listhead");
  var left=el("div");
  var h2=el("h2",null,l.name);
  left.appendChild(h2);
  var sub=el("div","sub");
  var si=mediaIcon(LM,"sub-icon"); if(si) sub.appendChild(si);
  sub.appendChild(document.createTextNode(rows.length+" "+mediaLabel(LM, rows.length)));
  left.appendChild(sub);
  head.appendChild(left);

  var acts=el("div","listhead-acts");
  var sortSel=el("select","inp"); sortSel.style.width="auto";
  sortSel.setAttribute("aria-label","Reihenfolge dieser Liste");
  [["score-desc","Wertung — hoch zu niedrig"],["score-asc","Wertung — niedrig zu hoch"],
   ["title-asc","Titel A–Z"],["hours-desc","Stunden — meiste zuerst"],
   ["completion-desc","Fortschritt — höchster zuerst"],["finished-desc","Zuletzt beendet"],
   ["release-desc","Erschienen — neueste zuerst"],["release-asc","Erschienen — früheste zuerst"],
   ["priority-desc","Vorfreude — höchste zuerst"],
   ["playthroughs-desc", LM==="game" ? "Am häufigsten durchgespielt" : "Am häufigsten gesehen"],
   ["added-desc","Zuletzt hinzugefügt"]].forEach(function(o){
    var oo=el("option",null,o[1]); oo.value=o[0]; sortSel.appendChild(oo);
  });
  sortSel.value = l.sort || "score-desc";
  sortSel.addEventListener("change",function(){ l.sort=sortSel.value; putList(l); });
  acts.appendChild(sortSel);

  var seg=el("div","seg");
  [["grid","Raster"],["table","Tabelle"]].forEach(function(v){
    var b=el("button",null,v[1]); b.type="button";
    b.setAttribute("aria-pressed", String((l.view||"grid")===v[0]));
    b.addEventListener("click",function(){ l.view=v[0]; putList(l); });
    seg.appendChild(b);
  });
  acts.appendChild(seg);

  var pickBtn=el("button","btn btn-sm",LMM.many+" auswählen"); pickBtn.type="button";
  pickBtn.addEventListener("click",function(){ openListPicker(l); });
  acts.appendChild(pickBtn);

  var ren=el("button","btn btn-sm","Umbenennen"); ren.type="button";
  ren.addEventListener("click",function(){
    var name=prompt("Neuer Name:", l.name);
    if(name==null) return;
    name=name.trim(); if(!name) return;
    l.name=name; putList(l);
  });
  var del=el("button","btn btn-sm btn-danger","Löschen"); del.type="button";
  del.addEventListener("click",function(){
    if(!confirm("Liste „"+l.name+"“ löschen? Die "+LMM.many+" bleiben erhalten.")) return;
    openListId=null; dropList(l.id);
  });
  acts.appendChild(ren); acts.appendChild(del);
  head.appendChild(acts);
  wrap.appendChild(head);

  if(rows.length){
    var st=el("section","stats"); st.style.marginBottom="20px";
    fillStats(st, rows, LMM.many+" in dieser Liste");
    wrap.appendChild(st);
  }

  if(!rows.length){
    var e=el("div","empty");
    var L=el("div");
    L.appendChild(el("h2",null,"Diese Liste ist noch leer"));
    L.appendChild(el("p",null,"Wähl "+LMM.many+" aus deinem Archiv aus — ein Eintrag kann in beliebig vielen Listen stehen."));
    var row2=el("div"); row2.style.cssText="display:flex;gap:8px;flex-wrap:wrap";
    var pb=el("button","btn btn-accent",LMM.many+" auswählen"); pb.type="button";
    pb.addEventListener("click",function(){ openListPicker(l); });
    var gb=el("button","btn","Zum Archiv"); gb.type="button";
    gb.addEventListener("click",function(){ setMedia(LM); setTab("archiv"); });
    row2.appendChild(pb); row2.appendChild(gb);
    L.appendChild(row2);
    e.appendChild(L);
    var R=el("div");
    R.appendChild(el("span","demo-label","So sieht ein Eintrag aus"));
    R.appendChild(demoCard());
    e.appendChild(R);
    wrap.appendChild(e);
    return wrap;
  }

  wrap.appendChild((l.view||"grid")==="grid" ? renderGrid(rows, l.sort||"score-desc") : renderTable(rows));
  return wrap;
}

/* ============ Render ============ */
function render(){
  renderStats();
  renderRail();
  var rows=visible(), c=$("#count"), pool=mediaPool();
  c.innerHTML="";
  c.appendChild(el("b",null,String(rows.length)));
  c.appendChild(document.createTextNode(" von "+pool.length+" "+mediaLabelDat(filt.media||null, pool.length)));
  renderActiveFilters();
  var done=$("#btn-filters-done");
  if(done) done.textContent = "Fertig · "+rows.length+" "+mediaLabel(filt.media||null, rows.length);
  var res=$("#results"); res.innerHTML="";
  res.appendChild(rows.length ? (view==="grid" ? renderGrid(rows) : renderTable(rows)) : renderEmpty());
  renderListsPage();
  renderAddPage();
  renderTips();
}
function resetFilters(){
  filt.q=""; filt.status=""; filt.plat=""; filt.genres=[]; filt.list=""; filt.min=1;
  $("#f-q").value=""; render();
}

/* ============ Overlay ============ */
function closeOverlay(){
  $("#overlay").innerHTML="";
  lockScroll(false);
  draft=null; draftCover=null;
}
function makeDrawer(title){
  var o=$("#overlay"); o.innerHTML="";
  lockScroll(true);
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

/* ============ Leseansicht ============ */
function openDetail(id){
  var g = games.find(function(x){ return x.id===id; });
  if(!g) return;
  var D=makeDrawer(g.title||"Ohne Titel");
  var body=D.body, foot=D.foot;
  D.drawer.setAttribute("data-m", mediaKey(g));

  body.appendChild(coverNode(g,"detail-art",640));

  var sc=nz(g.score);
  var sr=el("div","detail-score");
  var num=el("b", null, sc==null ? "noch nicht bewertet" : String(sc));
  if(sc==null) num.className="none"; else num.style.color=bandVar(sc);
  sr.appendChild(num);
  if(sc!=null){
    var bd=el("em",null,band(sc).l); bd.style.color=bandVar(sc); sr.appendChild(bd);
  }
  body.appendChild(sr);

  if(sc!=null){
    var m=el("div","meter"); m.style.marginTop="10px";
    var fi=el("i"); fi.style.width=Math.max(1,sc)+"%"; fi.style.background=bandVar(sc);
    m.appendChild(fi); body.appendChild(m);
  }

  var meta=[md(g).one]; var rl=releaseLabel(g); if(rl) meta.push(rl);
  if(g.platform) meta.push(g.platform);
  body.appendChild(el("div","detail-meta", meta.join("  ·  ")));

  var stRow=el("div");
  var stc=el("span","status",statusLabel(g)); stc.setAttribute("data-s",g.status||"backlog");
  stRow.appendChild(stc);
  var pr=nz(g.priority);
  if(pr && wantsPriority(g.status)){
    var pw=el("span"); pw.style.cssText="margin-left:10px;display:inline-flex;align-items:center;gap:7px";
    pw.appendChild(el("span","stat-k","Vorfreude"));
    pw.appendChild(pipsNode(pr));
    stRow.appendChild(pw);
  }
  body.appendChild(stRow);

  var kv=el("dl"); kv.style.margin="16px 0 0";
  function row(k,v){
    if(v==null || v==="") return;
    var r=el("div","kv");
    r.appendChild(el("dt",null,k));
    r.appendChild(el("dd",null,v));
    kv.appendChild(r);
  }
  factList(g).forEach(function(f){ row(f[0], f[1]); });
  if(kv.childElementCount) body.appendChild(kv);

  if((g.genres||[]).length){
    var s1=el("div","detail-sec");
    s1.appendChild(el("span","stat-k","Genres"));
    var tw=el("div","tags");
    g.genres.forEach(function(x){ tw.appendChild(el("span","tag",x)); });
    s1.appendChild(tw); body.appendChild(s1);
  }

  var mine=lists.filter(function(l){ return (g.listIds||[]).indexOf(l.id)>=0; });
  if(mine.length){
    var s2=el("div","detail-sec");
    s2.appendChild(el("span","stat-k","Listen"));
    var lw2=el("div","tags");
    mine.forEach(function(l){
      var b=el("button","tag",l.name); b.type="button"; b.style.cursor="pointer";
      b.addEventListener("click",function(){
        closeOverlay(); openListId=l.id; setTab("lists"); render();
      });
      lw2.appendChild(b);
    });
    s2.appendChild(lw2); body.appendChild(s2);
  }

  foot.appendChild(el("div","spacer"));
  var close=el("button","btn btn-sm","Schließen"); close.type="button";
  close.addEventListener("click",closeOverlay);
  var edit=el("button","btn btn-accent","Bearbeiten"); edit.type="button";
  edit.addEventListener("click",function(){ openEditor(id); });
  foot.appendChild(close); foot.appendChild(edit);

  D.drawer.addEventListener("keydown",function(ev){
    if(ev.key==="Escape"){ ev.preventDefault(); closeOverlay(); }
    if(ev.key==="e" || ev.key==="E"){ ev.preventDefault(); openEditor(id); }
  });
  setTimeout(function(){ edit.focus(); },30);
}

/* ============ Editor ============ */
var draft=null, draftCover=null;

function openEditor(id, prefill){
  var existing = id ? games.find(function(g){ return g.id===id; }) : null;
  draft = existing ? JSON.parse(JSON.stringify(existing)) : {
    id:uid(), media:(prefill && prefill.media) || filt.media || "game",
    title:"", release:"", platform:"", genres:[], score:"", hours:"", completion:"",
    startedOn:"", finishedOn:"", status:"backlog", cover:"", avgHours:"",
    runtime:"", episodes:"", episodesSeen:"",
    playthroughs:"", priority:"", listIds:[], createdAt:Date.now()
  };
  draftCover = draft.cover || "";
  if(!existing && prefill){
    var c = applyHit(draft, prefill, {force:true});
    if(c) draftCover = c;
    draft._platforms = prefill.platforms || [];
  }
  if(!existing && openListId && lists.some(function(l){ return l.id===openListId; })) draft.listIds=[openListId];
  paintEditor(!!existing);
}

function paintEditor(isEdit){
  var MK=mediaKey(draft), M=MEDIA[MK];
  var D=makeDrawer(M.one+(isEdit ? " bearbeiten" : " hinzufügen"));
  var body=D.body, foot=D.foot;
  D.drawer.setAttribute("data-m", MK);

  /* Art des Eintrags — bestimmt Felder, Begriffe und Datenbank. */
  var fm=el("div","field");
  fm.appendChild(el("label",null,"Art"));
  var mw=el("div","pills");
  MEDIA_ORDER.forEach(function(k){
    var b=el("button","pill pill-media"); b.type="button"; b.setAttribute("data-m",k);
    var ic=mediaIcon(k); if(ic) b.appendChild(ic);
    b.appendChild(el("span",null,MEDIA[k].one));
    b.setAttribute("aria-pressed", String(k===MK));
    b.addEventListener("click",function(){
      if(k===MK) return;
      /* Listen gehoeren zu einem Medium. Beim Wechsel verliert der Eintrag
         seine bisherigen — das sagen wir vorher, statt es still zu tun. */
      var verliert=(draft.listIds||[]).filter(function(id){
        var l=listById(id); return l && listMedia(l)!==k;
      });
      if(verliert.length){
        var namen=verliert.map(function(id){ return "„"+(listById(id)||{}).name+"“"; }).join(", ");
        if(!confirm("Als "+MEDIA[k].one+" kann der Eintrag nicht in "+namen+" bleiben, weil "+
                    (verliert.length===1?"diese Liste":"diese Listen")+" zu "+MEDIA[MK].many+" "+
                    (verliert.length===1?"gehört":"gehören")+". Trotzdem wechseln?")) return;
      }
      draft.media=k; draft._platforms=[]; draft._suggest=null;
      paintEditor(isEdit);
    });
    mw.appendChild(b);
  });
  fm.appendChild(mw); body.appendChild(fm);

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
  var resBox=el("div");

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
  body.appendChild(resBox);

  var searchCtl=null, searchTimer=null;
  function busy(node,txt){ node.className="ai-status"; node.innerHTML=""; node.appendChild(el("span","spin")); node.appendChild(document.createTextNode(txt)); }
  function fail(node,txt){ node.className="ai-status bad"; node.textContent=txt; }
  function info(node,txt){ node.className="ai-status"; node.textContent=txt; }

  function runSearch(){
    var q=(it.value||"").trim();
    resBox.innerHTML="";
    if(q.length<2){ fail(srcStatus,"Erst ein paar Buchstaben tippen."); return; }
    if(!hasKey(MK)){
      srcStatus.className="ai-status"; srcStatus.innerHTML="";
      srcStatus.appendChild(document.createTextNode("Dafür fehlt der "+sourceName(MK)+"-Key. "));
      var lnk=el("button","btn btn-quiet btn-sm","Jetzt eintragen"); lnk.type="button";
      lnk.addEventListener("click",function(){ openSettings(); });
      srcStatus.appendChild(lnk);
      return;
    }
    if(searchCtl) searchCtl.abort();
    searchCtl=new AbortController();
    busy(srcStatus,"sucht …");
    searchMedia(MK, q, searchCtl.signal).then(function(hits){
      if(!hits.length){ info(srcStatus,"Nichts gefunden. Trag die Daten von Hand ein."); return; }
      info(srcStatus, hits.length+" Treffer — wähl "+(MK==="tv"?"die richtige Serie":MK==="movie"?"den richtigen Film":"das richtige Spiel")+":");
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
          /* Bei Film und Serie fehlen Laufzeit, Folgen und Genres im
             Suchergebnis — die stehen erst in den Einzeldaten. */
          var finish=function(hit){
            var cover=applyHit(draft,hit,{force:true});
            if(cover) draftCover=cover;
            it.value=draft.title;
            var ri=document.getElementById("e-release"); if(ri) ri.value=isoToDE(draft.release||"");
            var pi=document.getElementById("e-platform"); if(pi) pi.value=draft.platform||"";
            draft._platforms = hit.platforms || [];
            paintTags(); paintSuggest(); paintDrop(); paintCoverActions(); paintPlatChips(); paintAvgHint();
            paintNumbers();
            resBox.innerHTML="";
            info(srcStatus,"Übernommen — schau kurz drüber.");
          };
          if(M.source==="tmdb" && h.tmdbId){
            busy(srcStatus,"holt Einzelheiten …");
            tmdbDetails(M.tmdb, h.tmdbId).then(function(full){ finish(full||h); })
              .catch(function(){ finish(h); });
          } else finish(h);
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
    if(hasKey(MK) && it.value.trim().length>=3) searchTimer=setTimeout(runSearch,550);
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

  /* Zahlen und Daten — welche Felder hier stehen, bestimmt das Medium. */
  function textField(label,key,ph,type,attrs,onInput){
    var f=el("div","field"), id="e-"+key;
    var l=el("label",null,label); l.htmlFor=id; f.appendChild(l);
    var i=el("input","inp"); i.id=id; i.type=type||"text"; if(ph) i.placeholder=ph;
    if(attrs) for(var a in attrs) i.setAttribute(a,attrs[a]);
    i.value = draft[key]==null?"":String(draft[key]);
    i.addEventListener("input",function(){ draft[key]=i.value; if(onInput) onInput(); });
    f.appendChild(i);
    return f;
  }
  function hintP(txt){
    var h=el("p","hint",txt||""); h.style.margin="-6px 0 16px"; h.hidden=!txt; return h;
  }

  var prioBox=el("div","field");
  function paintPriority(){
    prioBox.innerHTML="";
    if(!wantsPriority(draft.status||"backlog")){ prioBox.hidden=true; return; }
    prioBox.hidden=false;
    prioBox.appendChild(el("label",null,"Vorfreude"));
    var row=el("div","prio");
    for(var i=1;i<=5;i++){
      (function(v){
        var b=el("button","prio-dot"); b.type="button";
        b.setAttribute("aria-label", v+" — "+PRIO[v]);
        b.setAttribute("aria-pressed", String(nz(draft.priority)!=null && v<=Number(draft.priority)));
        b.addEventListener("click",function(){
          draft.priority = (Number(draft.priority)===v) ? "" : v;
          paintPriority();
        });
        row.appendChild(b);
      })(i);
    }
    prioBox.appendChild(row);
    var cur=nz(draft.priority);
    var lab=el("p","hint", cur ? cur+" von 5 — "+PRIO[cur] : "1 irgendwann bis 5 als Nächstes");
    lab.style.marginTop="6px";
    prioBox.appendChild(lab);
  }

  /* Bei Film und Serie wird die Zeit gerechnet, nicht getippt. */
  var hoursHint=hintP("");
  function paintHoursHint(){
    if(MK==="game"){
      var fa=fmtAvg(draft.avgHours);
      hoursHint.textContent = fa ? "Dafür werden im Schnitt rund "+fa+" gebraucht." : "";
    } else {
      var h=derivedHours(draft);
      if(!h){
        hoursHint.textContent = MK==="movie"
          ? "Mit der Laufzeit rechnet die App die Zeit selbst aus."
          : "Mit Folgenlänge und gesehenen Folgen rechnet die App die Zeit selbst aus.";
      } else {
        hoursHint.textContent = "Macht rund "+fmtHours(h)+" — die Zeit wird daraus gerechnet.";
      }
    }
    hoursHint.hidden = !hoursHint.textContent;
  }
  function paintAvgHint(){ paintHoursHint(); }

  var numBox=el("div"); body.appendChild(numBox);
  function paintNumbers(){
    numBox.innerHTML="";
    if(MK==="game"){
      var r1=el("div","row2");
      r1.appendChild(textField("Stunden gespielt","hours","z. B. 42.5","number",{min:"0",step:"0.5"}));
      r1.appendChild(textField("Fortschritt in %","completion","0–100","number",{min:"0",max:"100",step:"1"}));
      numBox.appendChild(r1);
      numBox.appendChild(hoursHint);
      var r1b=el("div","row2");
      r1b.appendChild(textField("Wie oft durchgespielt","playthroughs","0","number",{min:"0",step:"1"}));
      r1b.appendChild(prioBox);
      numBox.appendChild(r1b);
      var r2=el("div","row2");
      r2.appendChild(textField("Gespielt von","startedOn",null,"date"));
      r2.appendChild(textField("bis","finishedOn",null,"date"));
      numBox.appendChild(r2);
    } else if(MK==="movie"){
      var m1=el("div","row2");
      m1.appendChild(textField("Laufzeit in Minuten","runtime","z. B. 139","number",{min:"0",step:"1"},paintHoursHint));
      m1.appendChild(textField("Wie oft gesehen","playthroughs","1","number",{min:"0",step:"1"},paintHoursHint));
      numBox.appendChild(m1);
      numBox.appendChild(hoursHint);
      var m2=el("div","row2");
      m2.appendChild(textField("Gesehen am","finishedOn",null,"date"));
      m2.appendChild(prioBox);
      numBox.appendChild(m2);
    } else {
      var t1=el("div","row2");
      t1.appendChild(textField("Folgen gesehen","episodesSeen","0","number",{min:"0",step:"1"},paintHoursHint));
      t1.appendChild(textField("Folgen gesamt","episodes","0","number",{min:"0",step:"1"},paintHoursHint));
      numBox.appendChild(t1);
      var t2=el("div","row2");
      t2.appendChild(textField("Minuten pro Folge","runtime","z. B. 45","number",{min:"0",step:"1"},paintHoursHint));
      t2.appendChild(textField("Wie oft gesehen","playthroughs","1","number",{min:"0",step:"1"},paintHoursHint));
      numBox.appendChild(t2);
      numBox.appendChild(hoursHint);
      var t3=el("div","row2");
      t3.appendChild(textField("Gesehen von","startedOn",null,"date"));
      t3.appendChild(textField("bis","finishedOn",null,"date"));
      numBox.appendChild(t3);
      numBox.appendChild(prioBox);
    }
    paintHoursHint();
    paintPriority();
  }
  paintNumbers();

  var r3=el("div","row2");
  var frel=el("div","field");
  var lrel=el("label",null,"Erschienen"); lrel.htmlFor="e-release"; frel.appendChild(lrel);
  var irel=el("input","inp"); irel.id="e-release"; irel.autocomplete="off";
  irel.placeholder="25.02.2022 oder 2022";
  irel.value=isoToDE(draft.release||"");
  irel.addEventListener("input",function(){ draft.release=deToIso(irel.value); });
  irel.addEventListener("blur",function(){ irel.value=isoToDE(draft.release||""); });
  frel.appendChild(irel);
  var hrel=el("p","hint","Tag.Monat.Jahr — nur das Jahr reicht auch.");
  hrel.style.marginTop="5px"; frel.appendChild(hrel);
  r3.appendChild(frel);
  var fp=el("div","field");
  var lp=el("label",null,M.lab.where); lp.htmlFor="e-platform"; fp.appendChild(lp);
  var ip=el("input","inp"); ip.id="e-platform"; ip.value=draft.platform||""; ip.placeholder=M.lab.wherePh; ip.setAttribute("list","dl-plat");
  ip.addEventListener("input",function(){ draft.platform=ip.value; });
  fp.appendChild(ip);
  var dlp=el("datalist"); dlp.id="dl-plat";
  var plats=games.filter(function(g){ return mediaKey(g)===MK && g.platform; }).map(function(g){ return g.platform; })
    .filter(function(v,i,a){ return a.indexOf(v)===i; }).sort(function(a,b){ return a.localeCompare(b,"de"); });
  var platSuggest = MK==="game"
    ? ["PC","PS5","PS4","Xbox Series","Switch","Steam Deck","Handy"]
    : ["Netflix","Prime Video","Disney+","WOW","Apple TV+","Mediathek","Kino","Blu-ray","DVD"];
  platSuggest.forEach(function(p){ if(plats.indexOf(p)<0) plats.push(p); });
  plats.forEach(function(p){ var oo=el("option"); oo.value=p; dlp.appendChild(oo); });
  fp.appendChild(dlp);
  var platChips=el("div","pills"); platChips.style.marginTop="7px"; fp.appendChild(platChips);
  r3.appendChild(fp);
  body.appendChild(r3);

  function paintPlatChips(){
    platChips.innerHTML="";
    var opts=draft._platforms||[];
    if(!opts.length) return;
    var lab=el("div","hint", MK==="game" ? "Auf welcher Plattform hast du es gespielt?" : "Wo hast du es gesehen?");
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
  /* Beim Weg ueber die Suchseite stehen die Vorschlaege schon im Entwurf —
     ohne diesen Aufruf blieben sie unsichtbar. */
  paintPlatChips();

  /* Status */
  var fst=el("div","field");
  fst.appendChild(el("label",null,"Status"));
  var stw=el("div","pills");
  STATUS.forEach(function(st){
    var b=el("button","pill pill-accent",M.status[st.k]); b.type="button";
    b.setAttribute("aria-pressed", String((draft.status||"backlog")===st.k));
    b.addEventListener("click",function(){
      draft.status=st.k;
      Array.prototype.forEach.call(stw.children,function(o){ o.setAttribute("aria-pressed", String(o===b)); });
      paintPriority();
    });
    stw.appendChild(b);
  });
  fst.appendChild(stw); body.appendChild(fst);
  paintPriority();

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
  fg.appendChild(tw);

  var sugWrap=el("div");
  var sugStatus=el("div","ai-status");
  var sugBtn=el("button","btn btn-quiet btn-sm","Tags vorschlagen"); sugBtn.type="button";
  function paintSuggest(){
    sugWrap.innerHTML="";
    var open=(draft._suggest||[]).filter(function(t){ return (draft.genres||[]).indexOf(t)<0; });
    if(open.length){
      var row=el("div","suggest");
      open.forEach(function(t){
        var b=el("button","tag","+ "+t); b.type="button";
        b.addEventListener("click",function(){
          draft.genres=draft.genres||[];
          if(draft.genres.indexOf(t)<0) draft.genres.push(t);
          paintTags(); paintSuggest();
        });
        row.appendChild(b);
      });
      sugWrap.appendChild(row);
    }
    var bar=el("div");
    bar.style.cssText="display:flex;align-items:center;gap:10px;margin-top:9px;flex-wrap:wrap";
    bar.appendChild(sugBtn); bar.appendChild(sugStatus);
    sugWrap.appendChild(bar);
  }
  sugBtn.addEventListener("click",function(){
    var t=(draft.title||"").trim();
    if(!t){ sugStatus.className="ai-status bad"; sugStatus.textContent="Erst den Titel eintragen."; return; }
    if(!hasKey(MK)){
      sugStatus.className="ai-status bad";
      sugStatus.textContent="Dafür fehlt der "+sourceName(MK)+"-Key dieses Geräts.";
      return;
    }
    sugBtn.disabled=true;
    sugStatus.className="ai-status"; sugStatus.innerHTML="";
    sugStatus.appendChild(el("span","spin"));
    sugStatus.appendChild(document.createTextNode("sucht Tags zu „"+t+"“ …"));
    searchMedia(MK, t).then(function(hits){
      if(!hits.length || !(hits[0].tags||[]).length){
        sugStatus.className="ai-status";
        sugStatus.textContent="Keine brauchbaren Tags gefunden.";
      } else {
        draft._suggest=hits[0].tags.slice();
        sugStatus.className="ai-status";
        sugStatus.textContent="Tipp an, was für dich passt.";
      }
      paintSuggest();
    }).catch(function(e){
      sugStatus.className="ai-status bad";
      sugStatus.textContent = (e && e.message) ? e.message : "Hat nicht geklappt.";
    }).then(function(){ sugBtn.disabled=false; });
  });
  paintSuggest();
  fg.appendChild(sugWrap);
  body.appendChild(fg);

  /* Listen */
  var fl=el("div","field");
  fl.appendChild(el("label",null,"Listen"));
  var lw=el("div","pills");
  function paintLists(){
    lw.innerHTML="";
    var mine=sortedLists(MK);
    if(!mine.length) lw.appendChild(el("p","hint","Für "+M.many+" gibt es noch keine Liste."));
    mine.forEach(function(l){
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
    nb.addEventListener("click",function(){
      /* Der Editor wird beim Anlegen zugedeckt und danach neu gezeichnet,
         damit der Entwurf nicht verlorengeht. */
      var keep=JSON.parse(JSON.stringify(draft)), keepCover=draftCover;
      newList(function(l){
        draft=keep; draftCover=keepCover;
        draft.listIds=(draft.listIds||[]).concat([l.id]);
        paintEditor(isEdit);
      }, MK);
    });
    lw.appendChild(nb);
  }
  paintLists();
  fl.appendChild(lw); body.appendChild(fl);

  var errBox=el("p","err"); errBox.hidden=true; body.appendChild(errBox);

  if(isEdit){
    var del=el("button","btn btn-sm btn-danger","Löschen"); del.type="button";
    del.addEventListener("click",function(){
      if(confirm("„"+(draft.title||"Dieser Eintrag")+"“ endgültig löschen?")){
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
  var mk = mediaKey(draft);
  var g = {
    id: draft.id,
    media: mk,
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
    playthroughs: nz(draft.playthroughs)==null ? "" : Math.max(0,Math.round(Number(draft.playthroughs))),
    priority: (wantsPriority(draft.status||"backlog") && nz(draft.priority)!=null)
              ? Math.min(5,Math.max(1,Math.round(Number(draft.priority)))) : "",
    avgHours: nz(draft.avgHours)==null ? "" : Math.max(0,Math.round(Number(draft.avgHours))),
    runtime: nz(draft.runtime)==null ? "" : Math.max(0,Math.round(Number(draft.runtime))),
    episodes: nz(draft.episodes)==null ? "" : Math.max(0,Math.round(Number(draft.episodes))),
    episodesSeen: nz(draft.episodesSeen)==null ? "" : Math.max(0,Math.round(Number(draft.episodesSeen))),
    cover: draftCover||"",
    /* Wechselt ein Eintrag das Medium, passen seine bisherigen Listen
       nicht mehr zu ihm. */
    listIds: (draft.listIds||[]).filter(function(id){
      var l=listById(id); return l ? listMedia(l)===mk : false;
    }),
    createdAt: draft.createdAt||Date.now()
  };
  ["score","hours","completion"].forEach(function(k){ if(g[k]!=="" && !isFinite(g[k])) g[k]=""; });
  /* Zeit und Fortschritt sind bei Film und Serie gerechnete Werte. Sie
     werden trotzdem gespeichert, damit Statistik und Sortierung ueber alle
     Medien mit denselben Feldern arbeiten. */
  if(mk!=="game"){
    var dh=derivedHours(g); g.hours = dh===""||dh==null ? "" : dh;
    var dc=derivedCompletion(g);
    if(dc!=null) g.completion = dc===""?"":dc;
    else if(mk==="movie") g.completion="";
    if(mk==="movie"){ g.avgHours=""; g.startedOn=""; }
  }
  closeOverlay();
  putGame(g);
  toast(isEdit ? "Gespeichert." : "„"+g.title+"“ ins Archiv aufgenommen.");
}

/* presetMedia kommt aus dem Editor: dort muss die Liste zum Eintrag
   passen, sonst koennte er ihr gar nicht beitreten. */
function newList(cb, presetMedia){
  var locked = !!MEDIA[presetMedia];
  var mk = locked ? presetMedia : (filt.media || "game");
  var D=makeDrawer("Neue Liste");
  var body=D.body, foot=D.foot;
  D.drawer.setAttribute("data-m", mk);

  var f=el("div","field");
  var lb=el("label",null,"Name"); lb.htmlFor="nl-name"; f.appendChild(lb);
  var inp=el("input","inp"); inp.id="nl-name"; inp.placeholder="z. B. Beste 2026"; inp.autocomplete="off";
  f.appendChild(inp); body.appendChild(f);

  var err=el("p","err"); err.hidden=true;

  if(locked){
    body.appendChild(el("p","hint","Eine Liste für "+MEDIA[mk].many+". Listen mischen die Medien nicht."));
  } else {
    var fm=el("div","field");
    fm.appendChild(el("label",null,"Wofür"));
    var mw=el("div","pills");
    MEDIA_ORDER.forEach(function(k){
      var b=el("button","pill pill-media"); b.type="button"; b.setAttribute("data-m",k);
      var ic=mediaIcon(k); if(ic) b.appendChild(ic);
      b.appendChild(el("span",null,MEDIA[k].many));
      b.setAttribute("aria-pressed", String(k===mk));
      b.addEventListener("click",function(){
        mk=k; D.drawer.setAttribute("data-m",k);
        Array.prototype.forEach.call(mw.children,function(o){ o.setAttribute("aria-pressed", String(o===b)); });
      });
      mw.appendChild(b);
    });
    fm.appendChild(mw); body.appendChild(fm);
    body.appendChild(el("p","hint","Listen mischen die Medien nicht: eine Liste führt entweder Spiele, Filme oder Serien."));
  }
  body.appendChild(err);

  function save(){
    var name=(inp.value||"").trim();
    if(!name){ err.textContent="Bitte einen Namen eintragen."; err.hidden=false; inp.focus(); return; }
    var l={ id:uid(), name:name, media:mk, createdAt:Date.now() };
    closeOverlay(); putList(l);
    if(cb) cb(l);
  }
  inp.addEventListener("keydown",function(ev){ if(ev.key==="Enter"){ ev.preventDefault(); save(); } });

  foot.appendChild(el("div","spacer"));
  var cancel=el("button","btn btn-sm","Abbrechen"); cancel.type="button";
  cancel.addEventListener("click",closeOverlay);
  var ok=el("button","btn btn-accent","Anlegen"); ok.type="button";
  ok.addEventListener("click",save);
  foot.appendChild(cancel); foot.appendChild(ok);
  D.drawer.addEventListener("keydown",function(ev){ if(ev.key==="Escape"){ ev.preventDefault(); closeOverlay(); } });
  setTimeout(function(){ inp.focus(); },30);
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
      startedOn:"", finishedOn:"", status:"backlog", cover:"", avgHours:"",
      playthroughs:"", priority:"", listIds:[], createdAt:Date.now()+i };
    if(wantDb){
      busy("Datenbank: "+(i+1)+" von "+rows.length+" — "+r.title);
      try{
        var hits=await rawgSearch(r.title);
        if(hits.length){ g.cover = applyHit(g, hits[0], {force:true}); delete g._suggest; }
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
      bk.games.length+(bk.games.length===1?" Eintrag":" Einträge")+" vom "+new Date(bk.at||Date.now()).toLocaleString("de-DE")+
      ". Beim Wiederherstellen wird ergänzt, nichts gelöscht.";
    s0.appendChild(p0);
    var rb=el("button","btn btn-sm","Diesen Stand wiederherstellen"); rb.type="button";
    rb.addEventListener("click",function(){
      var added=0;
      bk.games.forEach(function(g){ if(!games.some(function(x){ return x.id===g.id; })){ games.push(g); added++; } });
      (bk.lists||[]).forEach(function(l){ if(!lists.some(function(x){ return x.id===l.id; })) lists.push(l); });
      markDirty(); render(); closeOverlay();
      toast(added ? added+(added===1?" Eintrag":" Einträge")+" zurückgeholt." : "Alles war schon vorhanden.");
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
  kv("RAWG-Key", rawgKey() ? "hinterlegt" : "nicht hinterlegt", rawgKey()?"ok":"bad");
  kv("TMDB-Key", tmdbKey() ? "hinterlegt" : "nicht hinterlegt", tmdbKey()?"ok":"bad");
  kv("Zuletzt gespeichert", lastSaved ? lastSaved.toLocaleString("de-DE") : "in dieser Sitzung noch nicht");

  /* RAWG */
  var s2=el("div","sec");
  s2.appendChild(el("div","sec-h","Spieledatenbank (RAWG)"));
  var p2=el("p","sec-p");
  p2.textContent = "Liefert Cover, Release, Plattform und Genres beim Eintragen. Kostenlosen Key holen unter rawg.io/apidocs. Wichtig: Token und Key gelten nur in diesem Browser — auf Handy, Tablet und jedem weiteren Rechner musst du sie einmal neu eintragen.";
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

  /* TMDB */
  var s2b=el("div","sec");
  s2b.appendChild(el("div","sec-h","Film- und Seriendatenbank (TMDB)"));
  var p2b=el("p","sec-p");
  p2b.textContent = "Liefert Cover, Erscheinungsdatum, Laufzeit, Folgenzahl, Genres und die Anbieter — auf Deutsch. Kostenlosen Key holen unter themoviedb.org: Konto anlegen, in den Kontoeinstellungen auf „API“, Bedingungen zustimmen. Die Anmeldeseite funktioniert nur am Rechner, nicht am Telefon.";
  s2b.appendChild(p2b);
  var fr3=el("div","field");
  var lt3=el("label",null,"API-Key (v3 auth)"); lt3.htmlFor="s-tmdb"; fr3.appendChild(lt3);
  var itm=el("input","inp"); itm.id="s-tmdb"; itm.type="password"; itm.placeholder="32-stelliger Key"; itm.autocomplete="off";
  itm.value = tmdbKey();
  fr3.appendChild(itm); s2b.appendChild(fr3);
  var tmHint=el("p","sec-p");
  tmHint.textContent = "TMDB verlangt den Hinweis, dass die Daten von dort stammen und dass TMDB diese Seite nicht geprüft hat — er steht unten auf jeder Seite.";
  s2b.appendChild(tmHint);
  body.appendChild(s2b);

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
    LS.put("sa.tmdb", itm.value.trim());
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
    if(!confirm(inGames.length+" Eintrag/Einträge importieren? Einträge mit gleicher ID werden überschrieben.")) return;

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
        status:s.status||"backlog", cover:s.cover||"", avgHours:s.avgHours==null?"":s.avgHours,
        playthroughs:s.playthroughs==null?"":s.playthroughs, priority:s.priority==null?"":s.priority,
        listIds:Array.isArray(s.listIds)?s.listIds:[], createdAt:s.createdAt||Date.now() };
      var i=games.findIndex(function(x){ return x.id===g.id; });
      if(i<0) games.push(g); else games[i]=g;
      n++;
    });
    markDirty(); render();
    toast(n+" Eintrag/Einträge importiert.");
  };
  fr.onerror=function(){ toast("Datei konnte nicht gelesen werden."); };
  fr.readAsText(file);
}

/* ============ Bereiche ============ */
function setTab(name){
  tab=name;
  document.body.classList.remove("filters-open");
  document.body.setAttribute("data-tab", name);
  Array.prototype.forEach.call($("#tabnav").children, function(b){
    b.setAttribute("aria-selected", String(b.dataset.tab===name));
  });
  Array.prototype.forEach.call(document.querySelectorAll(".tabpage"), function(pg){
    pg.classList.toggle("is-active", pg.id==="page-"+name);
  });
  scrollTop();
  if(name==="add") setTimeout(function(){ var q=$("#add-q"); if(q) q.focus(); },40);
  if(name==="tips" && !TIPS.loaded && !TIPS.loading && !TIPS.error) buildTips();
}

/* ============ Events ============ */
$("#tabnav").addEventListener("click",function(ev){
  var b=ev.target.closest("button[data-tab]"); if(!b) return;
  if(b.dataset.tab==="lists" && tab==="lists") openListId=null;
  setTab(b.dataset.tab);
  if(b.dataset.tab==="lists") render();
});

$("#add-go").addEventListener("click",runAddSearch);
$("#add-q").addEventListener("keydown",function(ev){
  if(ev.key==="Enter"){ ev.preventDefault(); clearTimeout(addTimer); runAddSearch(); }
});
$("#add-q").addEventListener("input",function(){
  clearTimeout(addTimer);
  if(rawgKey() && this.value.trim().length>=3) addTimer=setTimeout(runAddSearch,550);
});
/* Auf der Suchseite gilt die dort gewaehlte Art, nicht der Archivbereich. */
$("#add-manual").addEventListener("click",function(){ openEditor(null, {media:addMedia}); });
$("#add-bulk").addEventListener("click",openBulk);

$("#m-settings").addEventListener("click",function(){ openSettings(); });
$("#m-bulk").addEventListener("click",openBulk);
$("#m-export").addEventListener("click",doExport);
$("#m-import").addEventListener("click",function(){ $("#file-import").click(); });

$("#btn-reset").addEventListener("click",resetFilters);
function setFilters(open){
  document.body.classList.toggle("filters-open", !!open);
  $("#btn-filters").setAttribute("aria-expanded", String(!!open));
  /* Nur am Rechner ins Suchfeld springen: auf dem Telefon faehrt sonst die
     Tastatur hoch, verkleinert die sichtbare Flaeche und verschiebt das
     Fenster. */
  if(open && window.innerWidth>760) setTimeout(function(){ $("#f-q").focus(); },60);
}
$("#btn-filters").addEventListener("click",function(){
  setFilters(!document.body.classList.contains("filters-open"));
});
$("#sheet-scrim").addEventListener("click",function(){ setFilters(false); });
$("#btn-filters-close").addEventListener("click",function(){ setFilters(false); });
$("#btn-filters-done").addEventListener("click",function(){ setFilters(false); });
$("#btn-reset2").addEventListener("click",resetFilters);
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
$("#f-list").addEventListener("change",function(ev){ filt.list=ev.target.value; render(); });
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
  if(ev.key==="Escape" && document.body.classList.contains("filters-open")){
    ev.preventDefault(); setFilters(false); return;
  }
  if(document.activeElement!==document.body) return;
  if(ev.key==="/"){ ev.preventDefault(); setTab("archiv"); $("#f-q").focus(); }
  else if(ev.key==="n" && !ev.metaKey && !ev.ctrlKey && !ev.altKey){ ev.preventDefault(); setTab("add"); }
  else if((ev.metaKey||ev.ctrlKey) && ev.key==="s"){ ev.preventDefault(); saveNow(); }
});
window.addEventListener("beforeunload",function(ev){
  if(dirty && token()){ ev.preventDefault(); ev.returnValue=""; }
});

/* ============ Start ============ */
setTab("archiv");

(function boot(){
  var m0=LS.raw("sa.media");
  if(MEDIA[m0]) filt.media=m0;
  document.body.setAttribute("data-medium", filt.media || "all");
  var am=LS.raw("sa.addmedia");
  if(MEDIA[am]) addMedia=am;

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
      notice("In diesem Browser liegen "+games.length+(games.length===1?" Eintrag":" Einträge")+
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
