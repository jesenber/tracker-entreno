/* Tracker Entreno + Menú (sin cuentas, gratis, todo en el navegador) */
const STORAGE_KEY = "jesus_tracker_v1";

let MENU_BASE = null;

const DAY_ORDER = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const DEFAULT_MEALS = ["Desayuno","Comida","Merienda","Cena"];

function nowISODate(){
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off*60000);
  return local.toISOString().slice(0,10);
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    const s = JSON.parse(raw);
    // merge with defaults for forward compat
    return {
      ...defaultState(),
      ...s,
      days: { ...defaultState().days, ...(s.days||{}) },
      logs: Array.isArray(s.logs) ? s.logs : []
    };
  }catch(e){
    console.warn("State load error", e);
    return defaultState();
  }
}
function formatMMSS(totalSec){
  const s = Math.max(0, Math.round(totalSec||0));
  const mm = String(Math.floor(s/60)).padStart(2,"0");
  const ss = String(s%60).padStart(2,"0");
  return `${mm}:${ss}`;
}

function parseRestToSeconds(raw){
  if(!raw) return 0;
  let s = String(raw)
    .toLowerCase()
    .replaceAll("’","'").replaceAll("´","'")
    .replaceAll("″","''").replaceAll("”","''").replaceAll("“","''")
    .replace(/\s+/g," ")
    .trim();

  // Rango: 60–90'', 60-90 s, 2–3'
  const r = s.match(/(\d+)\s*[-–]\s*(\d+)\s*('?|''|s|min|m)?/i);
  if(r){
    const a = Number(r[1]), b = Number(r[2]);
    const mid = Math.round((a+b)/2);
    const unit = (r[3]||"").toLowerCase();
    if(unit.includes("'") || unit.includes("min") || unit === "m") return mid*60;
    return mid; // por defecto segundos
  }
// === SERIES HINT (Objetivo de series/reps/peso/descanso) ===
function normalizeKey(s){
  return String(s||"")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")  // quita acentos
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}

function findLineForExercise(planText, exName){
  const target = normalizeKey(exName);
  if(!target) return "";
  const lines = String(planText||"").split("\n");

  for(const line of lines){
    const n = normalizeKey(line);
    if(!n) continue;
    if(n.includes(target)) return line.trim();
  }
  return "";
}

function parsePrescriptionFromLine(line){
  const out = { sets:null, reps:null, weight:null, rir:null, restSec:null };
  const l = String(line||"");

  // 4x5 / 4 x 5 / 4×5
  let m = l.match(/(\d+)\s*[x×]\s*(\d+(?:\s*-\s*\d+)?)/i);
  if(m){
    out.sets = Number(m[1]);
    out.reps = m[2].replace(/\s+/g,"");
  }

  // "3 series de 8"
  if(!out.sets || !out.reps){
    m = l.match(/(\d+)\s*(?:series|sets)\s*(?:de)?\s*(\d+(?:\s*-\s*\d+)?)/i);
    if(m){
      out.sets = Number(m[1]);
      out.reps = m[2].replace(/\s+/g,"");
    }
  }

  // "8-12 reps"
  if(!out.reps){
    m = l.match(/(\d+(?:\s*-\s*\d+)?)\s*(?:reps|rep|repeticiones)\b/i);
    if(m) out.reps = m[1].replace(/\s+/g,"");
  }

  // peso: 80kg / 80 kg
  m = l.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kgs|kilo|kilos)\b/i);
  if(m) out.weight = m[1].replace(",",".") + " kg";

  // RIR
  m = l.match(/\bRIR\s*([0-9]+(?:\s*-\s*[0-9]+)?)\b/i);
  if(m) out.rir = m[1].replace(/\s+/g,"");

  // descanso: "descanso 2'" / "rest 90s" / "(2')"
  m = l.match(/(?:descanso|rest)\s*[:\-]?\s*([0-9]+(?:\s*-\s*[0-9]+)?\s*(?:'|"|min|m|s|seg|segundos)?)\b/i);
  let restRaw = m ? m[1] : null;
  if(!restRaw){
    const p = l.match(/\(([^)]*(?:'|"|min|seg|s)[^)]*)\)/i);
    if(p) restRaw = p[1];
  }
  if(restRaw) out.restSec = parseRestToSeconds(restRaw);

  return out;
}

function buildSeriesHint(p){
  const parts = [];
  if(p.sets && p.reps) parts.push(`${p.sets}x${p.reps}`);
  else if(p.reps) parts.push(`${p.reps} reps`);
  if(p.weight) parts.push(p.weight);
  if(p.rir) parts.push(`RIR ${p.rir}`);
  if(p.restSec) parts.push(`descanso ${formatMMSS(p.restSec)}`);
  return parts.join(" • ");
}

function updateSeriesHint(){
  const hintEl = document.getElementById("logSeriesHint");
  if(!hintEl) return;

  const day = document.getElementById("logDay")?.value || "";
  const ex  = document.getElementById("logExercise")?.value || "";
  const plan = state?.days?.[day]?.planText || "";

  if(!day || !ex || !plan){
    hintEl.textContent = "";
    return;
  }

  const line = findLineForExercise(plan, ex);
  if(!line){
    hintEl.textContent = "";
    return;
  }

  const p = parsePrescriptionFromLine(line);
  const hint = buildSeriesHint(p);
  hintEl.textContent = hint ? `Objetivo: ${hint}` : "";
}

  // mm:ss
  const mmss = s.match(/(\d+)\s*:\s*(\d+)/);
  if(mmss) return Number(mmss[1])*60 + Number(mmss[2]);

  // 1'30'' / 2' / 90''
  const min = s.match(/(\d+)\s*'/);
  const sec = s.match(/(\d+)\s*(?:''|s)\b/);

  const m = min ? Number(min[1]) : 0;
  let seconds = sec ? Number(sec[1]) : 0;

  // Caso "1'30" sin '' explícito
  const loose = s.match(/(\d+)\s*'\s*(\d+)\b/);
  if(loose){
    seconds = Number(loose[2]);
  }

  if(m || seconds) return m*60 + seconds;

  // Si solo hay un número, asumimos segundos
  const only = s.match(/(\d+)/);
  return only ? Number(only[1]) : 0;
}
function extractRestMapFromPlan(planText){
  const exs = extractExercisesFromPlan(planText);

  const restMap = {};
  const freq = new Map();

  for(const ex of exs){
    if(ex.restSec && ex.restSec > 0){
      restMap[ex.name] = ex.restSec;
      freq.set(ex.restSec, (freq.get(ex.restSec)||0) + 1);
    }
  }

  // descanso por defecto = el descanso más repetido del día
  let dayDefaultRest = 0;
  if(freq.size){
    dayDefaultRest = [...freq.entries()].sort((a,b)=>b[1]-a[1])[0][0];
  }

  return { restMap, dayDefaultRest };
}

    }

    // Descanso entre rondas
    const m2 = raw.match(/descans[ae]\s*([0-9][^a-z]*)\s*entre\s*rondas/i);
    if(m2){
      const sec = parseRestToSeconds(m2[1]);
      if(sec) dayDefaultRest = sec;
    }
  }

  return { restMap, dayDefaultRest };
}
let restTimer = { total:0, left:0, t:null, running:false, source:"" };

function setRestUI(seconds, sourceText=""){
  const clock = document.getElementById("restClock");
  const src = document.getElementById("restSource");
  if(clock) clock.textContent = formatMMSS(seconds);
  if(src) src.textContent = sourceText ? `(${sourceText})` : "";
}

function stopTimer(){
  if(restTimer.t) clearInterval(restTimer.t);
  restTimer.t = null;
  restTimer.running = false;
}

function startTimer(seconds, sourceText=""){
  const sec = Math.max(0, Math.round(seconds||0));
  if(!sec) return;

  stopTimer();
  restTimer.total = sec;
  restTimer.left = sec;
  restTimer.running = true;
  restTimer.source = sourceText || restTimer.source || "";

  setRestUI(restTimer.left, restTimer.source);

  restTimer.t = setInterval(()=>{
    restTimer.left -= 1;
    setRestUI(restTimer.left, restTimer.source);

    if(restTimer.left <= 0){
      stopTimer();
      try{ navigator.vibrate?.([200,80,200]); }catch(e){}
      try{
        const ctx = new (window.AudioContext||window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 880;
        g.gain.value = 0.05;
        o.start();
        setTimeout(()=>{ o.stop(); ctx.close(); }, 250);
      }catch(e){}
      const src = document.getElementById("restSource");
      if(src) src.textContent = "(¡Descanso terminado!)";
    }
  }, 1000);
}

function cleanExerciseName(line){
  let name = line.split("→")[0].trim();
  name = name.replace(/\([^)]*\)/g, "").trim();
  name = name.replace(/^[•\-–—\s]+/,"").trim();
  name = name.replace(/\s{2,}/g," ");
  return name;
}

function normalizePlanText(t){
  return String(t||"")
    .replace(/\r/g,"")
    .replace(/[×]/g,"x")
    .replace(/[–—]/g,"-")
    .replace(/[’‘]/g,"'")
    .replace(/[“”]/g,'"');
}

function parseSchemeHint(s){
  if(!s) return null;
  const txt = String(s).trim();

  // 4x5 @ 75-80%  |  3x6 | 3x8/8 (moderado)
  const m = txt.match(/(\d+)\s*[x]\s*(\d+(?:\/\d+)?)\s*(.*)$/i);
  if(m){
    const sets = Number(m[1]);
    const reps = m[2].replace(/\s+/g,"");
    const tail = (m[3]||"").trim();
    const schemeHint = `${sets}x${reps}${tail ? " " + tail : ""}`.trim();
    const autoReps = reps.includes("/") ? null : Number(reps);
    return { schemeHint, autoReps: Number.isFinite(autoReps) ? autoReps : null };
  }

  // casos tipo: "10/10" o "30''/lado"
  const m2 = txt.match(/(\d+\s*\/\s*\d+|\d+\s*''(?:\/[a-záéíóúñ]+)?)/i);
  if(m2){
    return { schemeHint: m2[1].replace(/\s+/g,""), autoReps: null };
  }

  return null;
}

function extractExercisesFromPlan(planText){
  const text = normalizePlanText(planText);
  const lines = text.split("\n").map(l=>l.trim()).filter(Boolean);

  const out = [];
  const byKey = new Map();

  let mode = "main";      // warmup | main | core
  let lastEx = null;      // último ejercicio detectado (para asociar scheme/RPE/descanso)
  let coreBuffer = [];    // ejercicios core pendientes de "→ 3 rondas"

  function upsert(name, patch={}){
    if(!name) return;
    const key = name.toLowerCase();
    let ex = byKey.get(key);
    if(!ex){
      ex = { name, schemeHint:"", autoReps:null, restSec:0 };
      byKey.set(key, ex);
      out.push(ex);
    }
    Object.assign(ex, patch);
  }

  function isSkippableLine(l){
    const low = l.toLowerCase();

    // cabeceras / meta
    if(low.startsWith("🔹")) return true;
    if(low.startsWith("objetivo:")) return true;
    if(low.startsWith("warm up")) return true;
    if(low.startsWith("warmup")) return true;
    if(low.startsWith("⏱")) return true;
    if(low.startsWith("bloque")) return true;

    // cosas de lista tipo "2-3 rondas:" o "2–3 rondas:"
    if(/rondas\s*:\s*$/i.test(l)) return true;

    return false;
  }

  for(let i=0;i<lines.length;i++){
    const line = lines[i];
    const low = line.toLowerCase();

    // modo warmup/core/main
    if(low.startsWith("warm up") || low.startsWith("warmup")){
      mode = "warmup";
      lastEx = null;
      continue;
    }
    if(low.startsWith("bloque")){
      mode = "main";
      lastEx = null;
      continue;
    }
    if(low.startsWith("core")){
      mode = "core";
      coreBuffer = [];
      lastEx = null;
      continue;
    }

    // si estamos en warmup, ignoramos hasta que empiece un bloque
    if(mode === "warmup"){
      continue;
    }

    // línea "→ 3 rondas" aplica al core anterior
    const rondas = line.match(/^→\s*(\d+)\s*rondas?/i);
    if(rondas && mode === "core"){
      const n = Number(rondas[1]);
      for(const name of coreBuffer){
        const key = name.toLowerCase();
        const ex = byKey.get(key);
        if(ex){
          // si ya tenía reps, lo dejamos y añadimos rondas
          ex.schemeHint = ex.schemeHint
            ? `${ex.schemeHint} · ${n} rondas`
            : `${n} rondas`;
        }
      }
      continue;
    }

    if(isSkippableLine(line)) continue;

    // Descanso: 2'  |  Descanso: 1'30''
    if(low.startsWith("descanso")){
      const raw = line.split(":").slice(1).join(":").trim();
      const sec = parseRestToSeconds(raw);
      if(lastEx && sec>0){
        const key = lastEx.toLowerCase();
        const ex = byKey.get(key);
        if(ex) ex.restSec = sec;
      }
      continue;
    }

    // RPE 7-8
    if(low.startsWith("rpe")){
      if(lastEx){
        const key = lastEx.toLowerCase();
        const ex = byKey.get(key);
        if(ex){
          ex.schemeHint = ex.schemeHint
            ? `${ex.schemeHint} · ${line.trim()}`
            : `${line.trim()}`;
        }
      }
      continue;
    }

    // Caso con flecha: "Bulgarian Split Squat → 3x8/8 (moderado)"
    if(line.includes("→") || line.includes("->")){
      const parts = line.split(/→|->/);
      const left = parts[0].trim();
      const right = parts.slice(1).join(" ").trim();

      const name = cleanExerciseName(left);
      if(!name) continue;

      upsert(name);
      lastEx = name;

      const sch = parseSchemeHint(right);
      if(sch){
        const key = name.toLowerCase();
        const ex = byKey.get(key);
        if(ex){
          if(sch.schemeHint) ex.schemeHint = sch.schemeHint;
          if(sch.autoReps != null) ex.autoReps = sch.autoReps;
        }
      }
      if(mode === "core") coreBuffer.push(name);
      continue;
    }

    // Si la línea es un "scheme" y tenemos lastEx: 4x5 @...
    const schLine = parseSchemeHint(line);
    if(schLine && lastEx){
      const key = lastEx.toLowerCase();
      const ex = byKey.get(key);
      if(ex){
        ex.schemeHint = schLine.schemeHint || ex.schemeHint;
        if(schLine.autoReps != null) ex.autoReps = schLine.autoReps;
      }
      continue;
    }

    // Detectar "línea de ejercicio" (Back Squat, Peso Muerto Rumano, Dead Bug 10/10, etc.)
    // Evitamos cosas que empiezan por número (warmup tipo "8 Air Squat", "200 m Row suave")
    if(/^\d+/.test(line)) continue;

    const name = cleanExerciseName(line);
    if(!name) continue;

    // filtro extra para no meter frases raras
    if(name.length < 3) continue;

    upsert(name);
    lastEx = name;
    if(mode === "core") coreBuffer.push(name);
  }

  return out;
}

    // --- Rest dentro de la línea (si existe) ---
    let suggestedRestSec = 0;
    const restMatch = line.match(/\b(descanso|rest)\s*[:=]?\s*([0-9][0-9'":\s\-]*)/i);
    if (restMatch && typeof parseRestToSeconds === "function") {
      suggestedRestSec = parseRestToSeconds(restMatch[2]);
    }

    // --- Limpia nombre (quita sets/reps, kilos, rir/rpe, etc) ---
    let name = line
      .split("→")[0]
      .replace(/\([^)]*\)/g, " ")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\b\d+\s*x\s*\d+(?:\s*[-–]\s*\d+)?\b/ig, " ")
      .replace(/\b@?\s*(rir|rpe)\s*[:=]?\s*\d+(\.\d+)?\b/ig, " ")
      .replace(/\b(\d+([.,]\d+)?)\s*(kg|k)\b/ig, " ")
      .replace(/\b(descanso|rest)\b.*$/i, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ name, suggestedSets, suggestedReps, suggestedRestSec });
  }

  return out;
}

function renderDayExercises(){
  const daySel = document.getElementById("logDay");
  const label = document.getElementById("logDayLabel");
  const wrap = document.getElementById("dayExercises");
  if(!daySel || !wrap) return;

  const day = daySel.value;
  if(label) label.textContent = day || "";

  wrap.innerHTML = "";
  if(!day) return;

  const plan = state.days?.[day]?.planText || "";
  const exs = extractExercisesFromPlan(plan);

  if(!exs.length){
    wrap.innerHTML = `<span class="muted">No detecté ejercicios todavía. Pega/edita el entreno en “Semana”.</span>`;
    return;
  }

  for(const ex of exs){
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chipbtn";
    b.textContent = ex.name;
    b.addEventListener("click", ()=>{
      const exInput = document.getElementById("logExercise");
      const repsInput = document.getElementById("logReps");
      const wInput = document.getElementById("logWeight");

      if(exInput) exInput.value = ex.name;
      const hint = document.getElementById("logSeriesHint");
if(hint){
  const parts = [];
  if(ex.schemeHint) parts.push(`Plan: ${ex.schemeHint}`);
  if(ex.restSec && ex.restSec > 0) parts.push(`Descanso: ${formatMMSS(ex.restSec)}`);
  hint.textContent = parts.join(" · ");
}

      const day = document.getElementById("logDay")?.value;
const plan = state.days?.[day]?.planText || "";
const { restMap, dayDefaultRest } = extractRestMapFromPlan(plan);
const sec = (restMap && restMap[ex.name]) ? restMap[ex.name] : (dayDefaultRest || 0);

stopTimer();
restTimer.total = sec;
restTimer.left = sec;
restTimer.source = sec ? "del plan" : "";
setRestUI(sec, restTimer.source);

      if(ex.suggestedReps && repsInput && (repsInput.value === "" || repsInput.value == null)){
        repsInput.value = ex.suggestedReps;
      }
      if(wInput) wInput.focus();
    });
    wrap.appendChild(b);
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function defaultState(){
  const days = {};
  for(const d of DAY_ORDER){
    days[d] = {
      title: "",
      tipo: "",
      durationMin: "",
      planText: "",
      doneTraining: false,
      mealsDone: { Desayuno:false, Comida:false, Merienda:false, Cena:false },
      notes: "",
      menuChoice: { Desayuno:1, Comida:1, Merienda:1, Cena:1 }
    };
  }
  return {
    weekStartISO: "",
    days,
    logs: []
  };
}

let state = defaultState();

/** Views */
function setView(viewName){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  document.getElementById(`view-${viewName}`).classList.remove("hidden");
}

/** Import weekly text */
function normalizeDayName(raw){
  const x = raw.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"");
  if(x.startsWith("lunes")) return "Lunes";
  if(x.startsWith("martes")) return "Martes";
  if(x.startsWith("miercoles")) return "Miércoles";
  if(x.startsWith("jueves")) return "Jueves";
  if(x.startsWith("viernes")) return "Viernes";
  if(x.startsWith("sabado")) return "Sábado";
  if(x.startsWith("domingo")) return "Domingo";
  return null;
}

function detectTipo(text){
  const t = text.toLowerCase();
  if(t.includes("hyrox")) return "Hyrox";
  if(t.includes("conditioning") || t.includes("chipper") || t.includes("ergos") || t.includes("wall ball") || t.includes("sled")) return "Acondicionamiento";
  if(t.includes("tirada") || t.includes("run") || t.includes("z2") || t.includes("carrera")) return "Carrera";
  if(t.includes("fuerza") || t.includes("back squat") || t.includes("push press") || t.includes("deadlift") || t.includes("peso muerto")) return "Fuerza";
  return "";
}

function extractDuration(text){
  // examples: "55–60’", "60’ máx.", "55-60'"
  const m = text.match(/(\d{2})\s*[–-]\s*(\d{2})\s*[’']/);
  if(m) return `${m[1]}-${m[2]}`;
  const m2 = text.match(/(\d{2})\s*[’']/);
  if(m2) return m2[1];
  return "";
}

function parseWeek(text){
  const cleaned = text.replace(/\r/g,"").trim();
  if(!cleaned) return;

  // Strategy 1: split by "🔹 DAY"
  const re = /🔹\s*(LUNES|MARTES|MIÉRCOLES|MIERCOLES|JUEVES|VIERNES|SÁBADO|SABADO|DOMINGO)\s*(?:—|-)?\s*([^\n]*)\n/gi;
  const matches = [...cleaned.matchAll(re)];
  if(matches.length){
    for(let i=0;i<matches.length;i++){
      const dayRaw = matches[i][1];
      const day = normalizeDayName(dayRaw);
      if(!day) continue;
      const start = matches[i].index;
      const end = (i+1 < matches.length) ? matches[i+1].index : cleaned.length;
      const block = cleaned.slice(start, end).trim();
      const title = (matches[i][2]||"").trim();
      state.days[day].title = title;
      state.days[day].planText = block;
      state.days[day].durationMin = extractDuration(block);
      state.days[day].tipo = detectTipo(block) || state.days[day].tipo;
    }
    return;
  }

  // Strategy 2: headings without emoji
  const re2 = /^(LUNES|MARTES|MIÉRCOLES|MIERCOLES|JUEVES|VIERNES|SÁBADO|SABADO|DOMINGO)\b.*$/gmi;
  const m2 = [...cleaned.matchAll(re2)];
  if(m2.length){
    for(let i=0;i<m2.length;i++){
      const day = normalizeDayName(m2[i][1]);
      const start = m2[i].index;
      const end = (i+1 < m2.length) ? m2[i+1].index : cleaned.length;
      const block = cleaned.slice(start,end).trim();
      state.days[day].planText = block;
      state.days[day].durationMin = extractDuration(block);
      state.days[day].tipo = detectTipo(block) || state.days[day].tipo;
    }
  }
}

/** Menu helpers */
function getTypes(){
  return Object.keys(MENU_BASE || {}).sort();
}

function getMenu(tipo, momento, opcion=1){
  const list = (MENU_BASE?.[tipo]?.[momento]) || [];
  if(!list.length) return null;
  const found = list.find(x => Number(x.opcion) === Number(opcion)) || list[0];
  return found;
}

function ensureMenuChoice(day){
  const tipo = state.days[day].tipo;
  for(const meal of DEFAULT_MEALS){
    if(!state.days[day].menuChoice[meal]) state.days[day].menuChoice[meal] = 1;
    const options = (MENU_BASE?.[tipo]?.[meal]) || [];
    if(options.length){
      const ok = options.some(o => Number(o.opcion) === Number(state.days[day].menuChoice[meal]));
      if(!ok) state.days[day].menuChoice[meal] = options[0].opcion;
    }
  }
}

/** UI Rendering */
function renderWeek(){
  const grid = document.getElementById("weekGrid");
  grid.innerHTML = "";

  const types = getTypes();

  for(const day of DAY_ORDER){
    const d = state.days[day];
    ensureMenuChoice(day);

    const card = document.createElement("div");
    card.className = "card";

    const top = document.createElement("div");
    top.className = "dayTitle";
    top.innerHTML = `
      <div>
        <h3 style="margin:0">${day}${d.title ? ` — ${escapeHtml(d.title)}` : ""}</h3>
        <div class="muted">Duración: ${d.durationMin || "—"} · Tipo: ${escapeHtml(d.tipo || "—")}</div>
      </div>
      <div class="badge">${d.doneTraining ? "✅ Hecho" : "⏳ Pendiente"}</div>
    `;
    card.appendChild(top);

    // controls
    const kv = document.createElement("div");
    kv.className = "kv section";

    const tipoWrap = document.createElement("div");
    tipoWrap.innerHTML = `
      <div class="muted" style="margin-bottom:6px">Tipo de día</div>
      <select data-day="${day}" class="tipoSel">
        <option value="">—</option>
        ${types.map(t=>`<option value="${escapeAttr(t)}" ${t===d.tipo?"selected":""}>${escapeHtml(t)}</option>`).join("")}
      </select>
    `;

    const notesWrap = document.createElement("div");
    notesWrap.innerHTML = `
      <div class="muted" style="margin-bottom:6px">Notas (fatiga, dolor, etc.)</div>
      <input data-day="${day}" class="dayNotes" value="${escapeAttr(d.notes||"")}" placeholder="Ej: piernas cargadas, sueño 6h..." />
    `;

    kv.appendChild(tipoWrap);
    kv.appendChild(notesWrap);
    card.appendChild(kv);

    // plan text
    const plan = document.createElement("div");
    plan.className = "section";
    plan.innerHTML = `
  <div class="muted" style="margin-bottom:6px">Entrenamiento (pega aquí / edita)</div>
  <textarea data-day="${day}" class="planText" rows="6" placeholder="Entreno...">${escapeHtml(d.planText||"")}</textarea>

  <div class="row">
    <button type="button" class="primary btnRegisterDay" data-day="${day}">Registrar este día</button>
    <span class="muted">Abre modo gym con ejercicios detectados</span>
  </div>
`;

    card.appendChild(plan);

    // menu
    const menuSec = document.createElement("div");
    menuSec.className = "section";
    menuSec.innerHTML = `<div class="muted" style="margin-bottom:6px">Menú (se rellena según el tipo)</div>`;
    for(const meal of DEFAULT_MEALS){
      const item = getMenu(d.tipo, meal, d.menuChoice[meal]);
      const options = (MENU_BASE?.[d.tipo]?.[meal]) || [];
      const sel = options.length > 1 ? `
        <select data-day="${day}" data-meal="${meal}" class="mealChoice">
          ${options.map(o=>`<option value="${o.opcion}" ${Number(o.opcion)===Number(d.menuChoice[meal])?"selected":""}>Opción ${o.opcion}</option>`).join("")}
        </select>` : `<span class="muted">Opción ${options[0]?.opcion ?? 1}</span>`;
      const box = document.createElement("div");
      box.style.marginBottom = "10px";
      box.innerHTML = `
        <div class="row" style="margin-top:0">
          <div style="font-weight:800">${meal}</div>
          <div class="spacer"></div>
          ${sel}
        </div>
        <div class="mealBox">${item ? escapeHtml(item.texto) : "— (elige un tipo de día)"}</div>
      `;
      menuSec.appendChild(box);
    }
    card.appendChild(menuSec);

    // checks
    const chk = document.createElement("div");
    chk.className = "section checks";
    chk.innerHTML = `
      <label><input type="checkbox" class="chkTraining" data-day="${day}" ${d.doneTraining?"checked":""}/> Entreno hecho</label>
      ${DEFAULT_MEALS.map(meal=>`<label><input type="checkbox" class="chkMeal" data-day="${day}" data-meal="${meal}" ${d.mealsDone[meal]?"checked":""}/> ${meal} hecha</label>`).join("")}
    `;
    card.appendChild(chk);

    grid.appendChild(card);
  }

  // Bind events
  document.querySelectorAll(".tipoSel").forEach(el=>{
    el.addEventListener("change", (e)=>{
      const day = e.target.dataset.day;
      state.days[day].tipo = e.target.value;
      // reset meal choices to first option for that type
      for(const meal of DEFAULT_MEALS){
        const opts = (MENU_BASE?.[state.days[day].tipo]?.[meal]) || [];
        if(opts.length) state.days[day].menuChoice[meal] = opts[0].opcion;
      }
      saveState();
      renderWeek();
      renderLogDayOptions();
    });
  });

  document.querySelectorAll(".planText").forEach(el=>{
    el.addEventListener("input", (e)=>{
      const day = e.target.dataset.day;
      state.days[day].planText = e.target.value;
      state.days[day].durationMin = extractDuration(e.target.value);
      // auto-detect type only if empty
      if(!state.days[day].tipo){
        state.days[day].tipo = detectTipo(e.target.value);
      }
      saveState();
      // lightweight refresh of header via full render (simple)
      renderWeek();
      renderLogDayOptions();
    });
  });

  document.querySelectorAll(".dayNotes").forEach(el=>{
    el.addEventListener("input", (e)=>{
      const day = e.target.dataset.day;
      state.days[day].notes = e.target.value;
      saveState();
    });
  });

  document.querySelectorAll(".chkTraining").forEach(el=>{
    el.addEventListener("change", (e)=>{
      const day = e.target.dataset.day;
      state.days[day].doneTraining = e.target.checked;
      saveState();
      renderWeek();
    });
  });

  document.querySelectorAll(".chkMeal").forEach(el=>{
    el.addEventListener("change", (e)=>{
      const day = e.target.dataset.day;
      const meal = e.target.dataset.meal;
      state.days[day].mealsDone[meal] = e.target.checked;
      saveState();
    });
  });

  document.querySelectorAll(".mealChoice").forEach(el=>{
    el.addEventListener("change", (e)=>{
      const day = e.target.dataset.day;
      const meal = e.target.dataset.meal;
      state.days[day].menuChoice[meal] = Number(e.target.value);
      saveState();
      renderWeek();
    });
  });
}

function renderLogDayOptions(){
  const sel = document.getElementById("logDay");
  const prev = sel.value;
  sel.innerHTML = "";
  for(const d of DAY_ORDER){
    const opt = document.createElement("option");
    opt.value = d;
    const title = state.days[d].title ? ` — ${state.days[d].title}` : "";
    opt.textContent = `${d}${title}`;
    sel.appendChild(opt);
  }
  if(prev) sel.value = prev;
}

function renderLogs(){
  const day = document.getElementById("logDay").value;
  const list = document.getElementById("logsList");
  list.innerHTML = "";
  const logs = state.logs.filter(l => l.day === day);

  if(!logs.length){
    list.innerHTML = `<div class="muted">No hay registros para ${day} todavía.</div>`;
    return;
  }

  logs.slice().reverse().forEach((l, idxFromEnd)=>{
    const div = document.createElement("div");
    div.className = "item";
    const left = document.createElement("div");
    left.innerHTML = `
      <div><strong>${escapeHtml(l.exercise)}</strong></div>
      <small>${escapeHtml(l.reps ?? "")} reps · ${escapeHtml(l.weight ?? "")} kg ${l.rir!=="" && l.rir!=null ? `· RIR ${escapeHtml(String(l.rir))}` : ""}</small>
      ${l.notes ? `<div class="muted" style="margin-top:4px">${escapeHtml(l.notes)}</div>` : ""}
      <small>${new Date(l.ts).toLocaleString()}</small>
    `;
    const btn = document.createElement("button");
    btn.className = "danger";
    btn.textContent = "Eliminar";
    btn.addEventListener("click", ()=>{
      // remove by id
      state.logs = state.logs.filter(x => x.id !== l.id);
      saveState();
      renderLogs();
    });

    div.appendChild(left);
    div.appendChild(btn);
    list.appendChild(div);
  });
}

/** Summary */
function sumMacrosForDay(day){
  const d = state.days[day];
  const tipo = d.tipo;
  const totals = { kcal:0, prot:0, carb:0, grasa:0, has:false };
  for(const meal of DEFAULT_MEALS){
    const item = getMenu(tipo, meal, d.menuChoice[meal]);
    if(!item) continue;
    const nums = ["kcal","prot","carb","grasa"].map(k => Number(item[k]));
    const ok = nums.some(n => !Number.isNaN(n) && n>0);
    if(ok){
      totals.has = true;
      totals.kcal += Number(item.kcal)||0;
      totals.prot += Number(item.prot)||0;
      totals.carb += Number(item.carb)||0;
      totals.grasa += Number(item.grasa)||0;
    }
  }
  return totals;
}

function buildCoachSummary(){
  // Compliance stats
  const daysPlanned = DAY_ORDER.filter(d => (state.days[d].planText||"").trim().length > 0);
  const sessionsDone = daysPlanned.filter(d => state.days[d].doneTraining).length;
  const mealsPlanned = daysPlanned.length * DEFAULT_MEALS.length;
  const mealsDone = daysPlanned.reduce((acc,d)=>{
    return acc + DEFAULT_MEALS.filter(m => state.days[d].mealsDone[m]).length;
  }, 0);

  // Macro totals if provided
  let macroAny = false;
  let macroWeek = {kcal:0, prot:0, carb:0, grasa:0};
  for(const d of daysPlanned){
    const t = sumMacrosForDay(d);
    if(t.has){
      macroAny = true;
      macroWeek.kcal += t.kcal;
      macroWeek.prot += t.prot;
      macroWeek.carb += t.carb;
      macroWeek.grasa += t.grasa;
    }
  }

  // Training logs overview
  const totalLogs = state.logs.length;
  const logsByDay = {};
  for(const l of state.logs){
    logsByDay[l.day] = (logsByDay[l.day]||0) + 1;
  }

  // Notes
  const notes = daysPlanned
    .filter(d => (state.days[d].notes||"").trim())
    .map(d => `- ${d}: ${state.days[d].notes.trim()}`)
    .join("\n");

  const lines = [];
  lines.push("RESUMEN SEMANAL (para enviar al entrenador)");
  lines.push("----------------------------------------");
  lines.push(`Sesiones completadas: ${sessionsDone}/${daysPlanned.length || 0}`);
  lines.push(`Comidas cumplidas: ${mealsDone}/${mealsPlanned || 0}`);
  lines.push("");
  if(macroAny){
    lines.push("Totales estimados (solo si rellenaste macros en el menú base):");
    lines.push(`- Kcal: ${Math.round(macroWeek.kcal)}`);
    lines.push(`- Proteína: ${Math.round(macroWeek.prot)} g`);
    lines.push(`- Carbohidratos: ${Math.round(macroWeek.carb)} g`);
    lines.push(`- Grasa: ${Math.round(macroWeek.grasa)} g`);
    lines.push("");
  }else{
    lines.push("Macros/Kcal: (no calculado porque el menú base no tiene números todavía)");
    lines.push("");
  }
  lines.push("Detalle por día:");
  for(const d of DAY_ORDER){
    const dayData = state.days[d];
    if(!(dayData.planText||"").trim()) continue;
    const mealCount = DEFAULT_MEALS.filter(m => dayData.mealsDone[m]).length;
    lines.push(`- ${d}: ${dayData.doneTraining ? "Entreno ✅" : "Entreno ⏳"} · Comidas ${mealCount}/${DEFAULT_MEALS.length} · Tipo: ${dayData.tipo || "—"}`);
  }
  lines.push("");
  lines.push("Registros de gym (nº de entradas):");
  if(totalLogs === 0){
    lines.push("- (sin registros todavía)");
  }else{
    for(const d of DAY_ORDER){
      if(!logsByDay[d]) continue;
      lines.push(`- ${d}: ${logsByDay[d]}`);
    }
  }
  lines.push("");
  lines.push("Notas / sensaciones:");
  lines.push(notes || "- (sin notas)");
  lines.push("");
  lines.push("Petición / feedback:");
  lines.push("- (escribe aquí 2-3 frases: qué funcionó, qué falló, ajustes deseados)");
  return lines.join("\n");
}

/** Export helpers */
function downloadText(filename, text){
  const blob = new Blob([text], {type:"text/plain;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function toCSV(rows){
  return rows.map(r => r.map(x => {
    const s = String(x ?? "");
    const escaped = s.replace(/"/g,'""');
    return `"${escaped}"`;
  }).join(",")).join("\n");
}

/** Small utils */
function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[s]));
}
function escapeAttr(str){
  return String(str ?? "").replace(/"/g,"&quot;");
}

async function init(){
  // load menu base
  const res = await fetch("menu_base.json");
  MENU_BASE = await res.json();

  state = loadState();

  // Tabs
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=> setView(btn.dataset.view));
  });

  // Semana actions
  document.getElementById("btnImport").addEventListener("click", ()=>{
    const text = document.getElementById("weeklyText").value;
    parseWeek(text);
    saveState();
    renderWeek();
    renderLogDayOptions();
  });

  document.getElementById("btnResetWeek").addEventListener("click", ()=>{
    state = defaultState();
    saveState();
    renderWeek();
    renderLogDayOptions();
  });

  document.getElementById("btnCopyCoach").addEventListener("click", async ()=>{
    const txt = buildCoachSummary();
    await navigator.clipboard.writeText(txt);
    alert("Resumen copiado.");
  });

  // Registrar actions
 document.getElementById("logDay").addEventListener("change", ()=>{
  renderLogs();
  renderDayExercises();

  // --- REST: precarga desde el plan del día ---
  const day = document.getElementById("logDay").value;
  const plan = state.days?.[day]?.planText || "";
  const { restMap, dayDefaultRest } = extractRestMapFromPlan(plan);

  if(state.days?.[day]){
    state.days[day].restMap = restMap;
    state.days[day].dayDefaultRest = dayDefaultRest;
  }

  const ex = document.getElementById("logExercise")?.value || "";
  const sec = (restMap && restMap[ex]) ? restMap[ex] : (dayDefaultRest || 0);

  stopTimer();
  restTimer.total = sec;
  restTimer.left = sec;
  restTimer.source = sec ? "del plan" : "";
  setRestUI(sec, restTimer.source);

  saveState();
});
document.getElementById("logExercise").addEventListener("input", ()=>{
  const day = document.getElementById("logDay").value;
  if(!day) return;

  // si no tenemos restMap precalculado, lo calculamos desde el plan
  if(!state.days?.[day]?.restMap){
    const plan = state.days?.[day]?.planText || "";
    const { restMap, dayDefaultRest } = extractRestMapFromPlan(plan);
    state.days[day].restMap = restMap;
    state.days[day].dayDefaultRest = dayDefaultRest;
    saveState();
  }

  const ex = document.getElementById("logExercise").value.trim();
  const restMap = state.days?.[day]?.restMap || null;
  const dayDefaultRest = state.days?.[day]?.dayDefaultRest || 0;

  const sec = (restMap && restMap[ex]) ? restMap[ex] : (dayDefaultRest || 0);

  stopTimer();
  restTimer.total = sec;
  restTimer.left = sec;
  restTimer.source = sec ? "del plan" : "";

  setRestUI(sec, restTimer.source);
});

// Botón "Registrar este día" (desde la vista Semana)
document.addEventListener("click", (e)=>{
  const btn = e.target.closest(".btnRegisterDay");
  if(!btn) return;

  const day = btn.dataset.day;
  if(!day) return;

  setView("registrar");

  const logDay = document.getElementById("logDay");
  if(logDay) logDay.value = day;

  renderLogs();
  renderDayExercises();

  const wInput = document.getElementById("logWeight");
  if(wInput) wInput.focus();

  window.scrollTo({ top: 0, behavior: "smooth" });
});


  document.getElementById("btnAddLog").addEventListener("click", ()=>{
    const day = document.getElementById("logDay").value;
    const exercise = document.getElementById("logExercise").value.trim();
    const reps = document.getElementById("logReps").value;
    const weight = document.getElementById("logWeight").value;
    const rir = document.getElementById("logRir").value;
    const notes = document.getElementById("logNotes").value.trim();

    if(!exercise){
      alert("Pon al menos el ejercicio.");
      return;
    }
    const entry = {
      id: crypto.randomUUID(),
      day,
      exercise,
      reps: reps === "" ? "" : Number(reps),
      weight: weight === "" ? "" : Number(weight),
      rir: rir === "" ? "" : Number(rir),
      notes,
      ts: Date.now()
    };
    state.logs.push(entry);
    saveState();

    // keep exercise, clear numbers
    document.getElementById("logReps").value = "";
    document.getElementById("logWeight").value = "";
    document.getElementById("logRir").value = "";
    document.getElementById("logNotes").value = "";
    renderLogs();
    // --- REST: auto-start tras registrar una serie ---
const day2 = document.getElementById("logDay")?.value;
const ex2 = document.getElementById("logExercise")?.value || "";
const plan2 = state.days?.[day2]?.planText || "";
const { restMap: rm2, dayDefaultRest: ddr2 } = extractRestMapFromPlan(plan2);
const sec2 = (rm2 && rm2[ex2]) ? rm2[ex2] : (ddr2 || 0);

stopTimer();
restTimer.total = sec2;
restTimer.left = sec2;
restTimer.source = sec2 ? "auto (plan)" : "";
setRestUI(sec2, restTimer.source);

// si hay descanso, arráncalo
if(sec2 > 0){
  startTimer();
}

  });

  document.getElementById("btnClearLogs").addEventListener("click", ()=>{
    if(!confirm("¿Borrar todos los registros?")) return;
    state.logs = [];
    saveState();
    renderLogs();
    const auto = document.getElementById("restAuto");
if(auto && auto.checked && restTimer.total > 0){
  startTimer();
}

  });

  document.getElementById("btnExportLogs").addEventListener("click", ()=>{
    const rows = [["day","exercise","reps","weight","rir","notes","timestamp"]];
    for(const l of state.logs){
      rows.push([l.day, l.exercise, l.reps, l.weight, l.rir, l.notes, new Date(l.ts).toISOString()]);
    }
    downloadText("registros_entreno.csv", toCSV(rows));
  });

  // Resumen actions
  document.getElementById("btnRefreshSummary").addEventListener("click", ()=>{
    const txt = buildCoachSummary();
    document.getElementById("summaryText").value = txt;
  });
  document.getElementById("btnCopySummary").addEventListener("click", async ()=>{
    const txt = document.getElementById("summaryText").value || buildCoachSummary();
    await navigator.clipboard.writeText(txt);
    alert("Copiado.");
  });

  // Ajustes actions
  document.getElementById("btnExportBackup").addEventListener("click", ()=>{
    downloadText("backup_tracker.json", JSON.stringify(state, null, 2));
  });

  document.getElementById("fileImportBackup").addEventListener("change", async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    try{
      const raw = await file.text();
      const imported = JSON.parse(raw);
      state = {
        ...defaultState(),
        ...imported,
        days: { ...defaultState().days, ...(imported.days||{}) },
        logs: Array.isArray(imported.logs) ? imported.logs : []
      };
      saveState();
      renderWeek();
      renderLogDayOptions();
      renderLogs();
      alert("Backup importado.");
    }catch(err){
      alert("No pude importar ese archivo.");
    }finally{
      e.target.value = "";
    }
  });

  document.getElementById("btnWipeAll").addEventListener("click", ()=>{
    if(!confirm("¿Seguro que quieres borrar TODO?")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    saveState();
    renderWeek();
    renderLogDayOptions();
    renderLogs();
  });

  // Types list
  const ul = document.getElementById("typesList");
  ul.innerHTML = getTypes().map(t=>`<li>${escapeHtml(t)}</li>`).join("");

  // initial render
  renderWeek();
  renderLogDayOptions();
  renderLogs();
  document.getElementById("summaryText").value = buildCoachSummary();

  // PWA service worker (optional)
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  }
}
// --- REST TIMER UI ---
const autoToggle = document.getElementById("autoRestToggle");
const btnStart = document.getElementById("restStart");
const btnPause = document.getElementById("restPause");
const btnReset = document.getElementById("restReset");

if(!state.settings) state.settings = {};
if(state.settings.autoRest == null) state.settings.autoRest = true;

if(autoToggle){
  autoToggle.checked = !!state.settings.autoRest;
  autoToggle.addEventListener("change", ()=>{
    state.settings.autoRest = autoToggle.checked;
    saveState();
  });
}

if(btnStart){
  btnStart.addEventListener("click", ()=>{
    const txt = document.getElementById("restClock")?.textContent || "0:00";
    const sec = restTimer.total || parseRestToSeconds(txt);
    startTimer(sec, "manual");
  });
}

if(btnPause) btnPause.addEventListener("click", ()=> stopTimer());

if(btnReset) btnReset.addEventListener("click", ()=>{
  stopTimer();
  restTimer.left = restTimer.total || 0;
  setRestUI(restTimer.left, restTimer.source);
});

init();
