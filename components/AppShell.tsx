"use client";

import styles from "./AppShell.module.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { COURSE, getLesson } from "@/lib/course";
import type { CourseLesson, ProgressData } from "@/lib/types";
import { Modal } from "@/components/Modal";

// ProgressData.plan può essere null: questo helper evita errori di type-level indexing
type PlanFocus = NonNullable<ProgressData["plan"]>["focus"]; 

const STORAGE_KEY = "n8n-course-progress-local-v1";
const KEY_STORAGE = "n8n-course-sync-key-v1";

function nowIso(){ return new Date().toISOString(); }

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

function defaultProgress(): ProgressData {
  return { completed: {}, notes: {}, plan: null, startedAt: nowIso(), updatedAt: nowIso() };
}

function generateKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return String(Math.random()).slice(2) + String(Date.now());
}

async function api(path: string, opts: RequestInit & { syncKey: string }) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "x-sync-key": opts.syncKey,
      ...(opts.headers || {}),
    },
  });
  const txt = await res.text();
  let json: any = null;
  try { json = txt ? JSON.parse(txt) : null; } catch {}
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

export function AppShell() {
  const [syncKey, setSyncKey] = useState<string>("");
  const [syncStatus, setSyncStatus] = useState<string>("—");
  const [kvConfigured, setKvConfigured] = useState<boolean | null>(null);

  const [progress, setProgress] = useState<ProgressData>(defaultProgress());
  const [selectedLessonId, setSelectedLessonId] = useState<string>(COURSE.lessons[0]?.id || "");
  const [search, setSearch] = useState("");
  const [filterIncomplete, setFilterIncomplete] = useState(false);
  const [filterMarketing, setFilterMarketing] = useState(false);
  const [filterAI, setFilterAI] = useState(false);
  const [filterAPI, setFilterAPI] = useState(false);

  const [modalSyncOpen, setModalSyncOpen] = useState(false);
  const [modalExportOpen, setModalExportOpen] = useState(false);
  const [modalImportOpen, setModalImportOpen] = useState(false);
  const [modalPlanOpen, setModalPlanOpen] = useState(false);

  const debounceRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);

  const lessonsById = useMemo(() => {
    const m = new Map<string, CourseLesson>();
    for (const l of COURSE.lessons) m.set(l.id, l);
    return m;
  }, []);

  const lesson = lessonsById.get(selectedLessonId);

  const doneCount = useMemo(() => Object.values(progress.completed || {}).filter(Boolean).length, [progress.completed]);
  const totalCount = COURSE.lessons.length;
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  function isDone(id: string){ return !!progress.completed?.[id]; }

  function persistLocal(p: ProgressData){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
  }

  function scheduleSync(next: ProgressData){
    setProgress(next);
    persistLocal(next);
    dirtyRef.current = true;

    setSyncStatus(kvConfigured === false ? "solo locale (KV non configurata)" : "in attesa…");
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => { syncNow(next).catch(()=>{}); }, 700);
  }

  async function syncNow(p?: ProgressData){
    if (!syncKey) return;
    if (kvConfigured === false) return; // no remote
    if (!dirtyRef.current && !p) return;

    try{
      await api("/api/progress", { method:"PUT", body: JSON.stringify({ progress: p || progress }), syncKey });
      dirtyRef.current = false;
      setSyncStatus("salvato");
    }catch(e:any){
      setSyncStatus("errore sync");
      console.error(e);
    }
  }

  async function loadRemoteOrLocal(k: string){
    // health
    try{
      const health = await fetch("/api/health").then(r => r.json());
      setKvConfigured(!!health?.kvConfigured);
    }catch{
      setKvConfigured(false);
    }

    const local = safeJsonParse<ProgressData>(typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null) || null;

    if (kvConfigured === false) {
      const p = local ? local : defaultProgress();
      setProgress(p);
      setSyncStatus("solo locale (KV non configurata)");
      return;
    }

    try{
      const res = await api("/api/progress", { method:"GET", syncKey: k });
      const remote = res?.progress as ProgressData | null;

      if (remote && typeof remote === "object") {
        setProgress(remote);
        persistLocal(remote);
        setSyncStatus("caricato");
      } else {
        // nothing remote: push local or init
        const p = local ? local : defaultProgress();
        setProgress(p);
        dirtyRef.current = true;
        await syncNow(p);
        setSyncStatus("inizializzato");
      }
    }catch(e:any){
      // likely KV not configured
      const msg = String(e?.message || "");
      if (msg.includes("KV not configured")) {
        setKvConfigured(false);
        const p = local ? local : defaultProgress();
        setProgress(p);
        setSyncStatus("solo locale (KV non configurata)");
        return;
      }
      const p = local ? local : defaultProgress();
      setProgress(p);
      setSyncStatus("solo locale (errore server)");
    }
  }

  // boot: set/get sync key and choose initial lesson from hash
  useEffect(() => {
    let key = "";
    try{
      key = localStorage.getItem(KEY_STORAGE) || "";
    }catch{}
    if(!key){
      key = generateKey();
      try{ localStorage.setItem(KEY_STORAGE, key); } catch {}
    }
    setSyncKey(key);

    // initial lesson from URL hash
    const hash = typeof window !== "undefined" ? window.location.hash.replace("#","") : "";
    const initial = lessonsById.has(hash) ? hash : (COURSE.lessons[0]?.id || "");
    setSelectedLessonId(initial);

    // load progress
    loadRemoteOrLocal(key).catch(()=>{});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // listen for hash changes
  useEffect(() => {
    const fn = () => {
      const id = window.location.hash.replace("#","");
      if (lessonsById.has(id)) setSelectedLessonId(id);
    };
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, [lessonsById]);

  const filteredLessons = useMemo(() => {
    const s = search.trim().toLowerCase();
    return COURSE.lessons.filter(l => {
      const text = (l.title + " " + (l.tags||[]).join(" ") + " " + l.contentHtml).toLowerCase();
      if (s && !text.includes(s)) return false;
      if (filterIncomplete && isDone(l.id)) return false;
      if (filterMarketing && !(l.tags||[]).some(t => ["marketing","lead-gen","workflow","reporting","productivity","content"].includes(t))) return false;
      if (filterAI && !(l.tags||[]).some(t => t.includes("ai") || ["rag","embeddings","ai-agent","agentic"].includes(t))) return false;
      if (filterAPI && !(l.tags||[]).some(t => ["api","http","google","whatsapp","telegram"].includes(t))) return false;
      return true;
    });
  }, [search, filterIncomplete, filterMarketing, filterAI, filterAPI, progress.completed]);

  const moduleLessonIds = useMemo(() => {
    const allowed = new Set(filteredLessons.map(l => l.id));
    const out = new Map<string, string[]>();
    for (const mod of COURSE.modules) {
      const ids = (mod.lessonIds || []).filter(id => allowed.has(id));
      if (ids.length) out.set(mod.id, ids);
    }
    return out;
  }, [filteredLessons]);

  function setHash(id: string){
    window.location.hash = id;
  }

  function markDone(done: boolean){
    if(!selectedLessonId) return;
    const next = structuredClone(progress);
    if (done) next.completed[selectedLessonId] = true;
    else delete next.completed[selectedLessonId];
    next.updatedAt = nowIso();
    scheduleSync(next);
  }

  function updateNotes(val: string){
    if(!selectedLessonId) return;
    const next = structuredClone(progress);
    next.notes[selectedLessonId] = val;
    next.updatedAt = nowIso();
    scheduleSync(next);
  }

  function exportProgress(){
    setModalExportOpen(true);
  }

  function importProgress(jsonStr: string){
    const parsed = safeJsonParse<ProgressData>(jsonStr);
    if (!parsed) throw new Error("JSON non valido");
    const next = { ...defaultProgress(), ...parsed, updatedAt: nowIso() };
    scheduleSync(next);
  }

  function buildPlan(hoursPerWeek: number, focus: PlanFocus){
    const minsPerWeek = Math.max(60, Math.round(hoursPerWeek * 60));
    const lessons = [...COURSE.lessons];

    const focusTagMap: Record<string, string[]> = {
      marketing: ["marketing","lead-gen","workflow","productivity"],
      ai: ["ai","ai-agent","rag","embeddings","agentic"],
      api: ["api","http","google","telegram","whatsapp"],
      balanced: []
    };
    const fav = focusTagMap[focus] || [];
    lessons.sort((a,b) => {
      const aScore = fav.length ? fav.filter(t => (a.tags||[]).includes(t) || (a.tags||[]).some(x => x.includes(t))).length : 0;
      const bScore = fav.length ? fav.filter(t => (b.tags||[]).includes(t) || (b.tags||[]).some(x => x.includes(t))).length : 0;
      if (bScore !== aScore) return bScore - aScore;
      return 0;
    });

    let week = 1;
    let remaining = minsPerWeek;
    const weeks: {week:number; minutes:number; lessonIds:string[]}[] = [{ week:1, minutes: minsPerWeek, lessonIds: [] }];

    for (const l of lessons){
      const est = l.estMin || 20;
      if (est > remaining && weeks[weeks.length-1].lessonIds.length){
        week += 1;
        remaining = minsPerWeek;
        weeks.push({ week, minutes: minsPerWeek, lessonIds: [] });
      }
      weeks[weeks.length-1].lessonIds.push(l.id);
      remaining -= est;
    }
    return { focus, hoursPerWeek, minsPerWeek, weeks, createdAt: nowIso() };
  }

  function setPlan(hoursPerWeek: number, focus: any){
    const next = structuredClone(progress);
    next.plan = buildPlan(hoursPerWeek, focus);
    next.updatedAt = nowIso();
    scheduleSync(next);
  }

  function resetKey(){
    const newK = generateKey();
    try{ localStorage.setItem(KEY_STORAGE, newK); } catch {}
    setSyncKey(newK);
    // start fresh locally and remotely
    const next = defaultProgress();
    setProgress(next);
    persistLocal(next);
    dirtyRef.current = true;
    loadRemoteOrLocal(newK).catch(()=>{});
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.logo}>n8n</div>
          <div>
            <div className={styles.title}>AI Automation con n8n — Zero to Hero</div>
            <div className={styles.subtitle}>Progressi sincronizzati — senza registrazione (Vercel)</div>
          </div>
        </div>

        <div className={styles.actions}>
          <button className="btn" onClick={() => setModalSyncOpen(true)}>Chiave Sync</button>
          <button className="btn" onClick={() => setModalPlanOpen(true)}>Piano di studio</button>
          <button className="btn" onClick={exportProgress}>Esporta</button>
          <button className="btn" onClick={() => setModalImportOpen(true)}>Importa</button>
          <button className={"btn " + "btnDanger"} onClick={() => {
            if(confirm("Generare una nuova chiave? Questo crea un nuovo profilo progressi (la vecchia chiave resta valida).")) resetKey();
          }}>Nuova chiave</button>
        </div>
      </header>

      <div className={styles.progressWrap}>
        <div className={styles.progressLabel}>
          <span>{pct}% completato</span>
          <span>{doneCount}/{totalCount} lezioni • Sync: {syncStatus}</span>
        </div>
        <div className={styles.track}>
          <div className={styles.fill} style={{ width: pct + "%" }} />
        </div>
      </div>

      <main className={styles.main}>
        <aside className={styles.sidebar}>
          <input className={styles.search} value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Cerca: webhook, set, RAG, agent, error..." />
          <div className={styles.filters}>
            <label className={styles.chip}><input type="checkbox" checked={filterIncomplete} onChange={(e)=>setFilterIncomplete(e.target.checked)} /> Solo non completate</label>
            <label className={styles.chip}><input type="checkbox" checked={filterMarketing} onChange={(e)=>setFilterMarketing(e.target.checked)} /> Focus marketing</label>
            <label className={styles.chip}><input type="checkbox" checked={filterAI} onChange={(e)=>setFilterAI(e.target.checked)} /> Focus AI</label>
            <label className={styles.chip}><input type="checkbox" checked={filterAPI} onChange={(e)=>setFilterAPI(e.target.checked)} /> Focus API</label>
          </div>

          {COURSE.modules.map(mod => {
            const ids = moduleLessonIds.get(mod.id) || [];
            if (!ids.length) return null;
            return (
              <div key={mod.id} className={styles.module}>
                <div className={styles.moduleTitle}>{mod.title}</div>
                <div>
                  {ids.map(id => {
                    const l = lessonsById.get(id);
                    if(!l) return null;
                    const active = id === selectedLessonId;
                    const done = isDone(id);
                    return (
                      <div
                        key={id}
                        className={`${styles.lessonLink} ${active ? styles.active : ""}`}
                        onClick={()=>{ setSelectedLessonId(id); setHash(id); }}
                        role="button"
                        tabIndex={0}
                      >
                        <div>
                          <div className={styles.name}>{l.title}</div>
                          <div className={styles.meta}>{l.estMin} min • {(l.tags||[]).slice(0,3).join(", ")}</div>
                        </div>
                        <div>
                          <span className={`${styles.badge} ${done ? styles.done : ""}`}>{done ? "Fatto" : "Da fare"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className={styles.sidebarFooter}>
            <div className="muted small">
              <div><strong>Multi-dispositivo</strong>: apri “Chiave Sync” e copia la chiave sul telefono/PC.</div>
              <div><strong>Deploy</strong>: su Vercel con KV (Upstash) per sync remoto.</div>
            </div>
          </div>
        </aside>

        <section className={styles.content}>
          {!lesson ? (
            <div className="muted">Lezione non trovata.</div>
          ) : (
            <>
              <div className={styles.lessonHeader}>
                <div>
                  <h2>{lesson.title}</h2>
                  <div className={styles.lessonMeta}>{lesson.moduleTitle} • {lesson.estMin} min • {isDone(lesson.id) ? "✅ Completata" : "⏳ Da completare"}</div>
                  <div className={styles.lessonMeta}>Obiettivi: {lesson.objectives.join(" • ")}</div>
                </div>
                <div><span className={`${styles.badge} ${isDone(lesson.id) ? styles.done : ""}`}>{isDone(lesson.id) ? "Fatto" : "Da fare"}</span></div>
              </div>

              <article className={styles.lessonBody} dangerouslySetInnerHTML={{ __html: lesson.contentHtml }} />

              <div className={styles.lessonActions}>
                <button className={"btn btnPrimary"} disabled={isDone(lesson.id)} onClick={()=>markDone(true)}>Segna come completata</button>
                <button className={"btn"} disabled={!isDone(lesson.id)} onClick={()=>markDone(false)}>Segna come non completata</button>
              </div>

              <div className={styles.notes}>
                <div className={styles.notesTitle}>Note personali</div>
                <textarea
                  className={styles.textarea}
                  value={progress.notes?.[lesson.id] || ""}
                  onChange={(e)=>updateNotes(e.target.value)}
                  placeholder="Scrivi qui le tue note (sync automatico)…"
                />
              </div>
            </>
          )}
        </section>
      </main>

      {/* Sync Modal */}
      <Modal open={modalSyncOpen} title="Chiave Sync (anonima, senza account)" onClose={()=>setModalSyncOpen(false)}>
        <div style={{ marginTop: 8 }}>
          <div>Questa chiave identifica i tuoi progressi sul server. Nessuna registrazione.</div>
          <div style={{ margin: "10px 0", padding: 10, border: "1px solid var(--border)", borderRadius: 12, background: "#0b1220" }}>
            <div className="small muted">Chiave corrente</div>
            <div style={{ fontWeight: 900, wordBreak: "break-all" }}>{syncKey}</div>
          </div>

          <div className="small muted">
            Su un altro dispositivo: apri l'app → incolla qui sotto → “Collega”.
          </div>

          <JoinKeyForm
            onJoin={async (k) => {
              try{
                localStorage.setItem(KEY_STORAGE, k);
                setSyncKey(k);
                await loadRemoteOrLocal(k);
                setModalSyncOpen(false);
              }catch(e:any){
                alert("Collegamento fallito: " + (e?.message || e));
              }
            }}
          />

          {kvConfigured === false && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(239,68,68,0.45)", background: "rgba(239,68,68,0.10)" }}>
              <strong>Sync remoto non attivo.</strong> Configura Vercel KV (Upstash) e le env vars KV_REST_API_URL / KV_REST_API_TOKEN.
            </div>
          )}
        </div>
      </Modal>

      {/* Export Modal */}
      <Modal open={modalExportOpen} title="Esporta progressi (backup JSON)" onClose={()=>setModalExportOpen(false)}>
        <textarea
          className={styles.textarea}
          readOnly
          value={JSON.stringify(progress, null, 2)}
        />
      </Modal>

      {/* Import Modal */}
      <Modal open={modalImportOpen} title="Importa progressi (sovrascrive)" onClose={()=>setModalImportOpen(false)}>
        <ImportBox onImport={(txt)=>{
          try{
            importProgress(txt);
            setModalImportOpen(false);
          }catch(e:any){
            alert("Import fallito: " + (e?.message || e));
          }
        }} />
      </Modal>

      {/* Plan Modal */}
      <Modal open={modalPlanOpen} title="Piano di studio (personalizzabile)" onClose={()=>setModalPlanOpen(false)}>
        <PlanBox
          existing={progress.plan}
          onSave={(hours, focus)=>{
            setPlan(hours, focus);
            setModalPlanOpen(false);
          }}
          onOpenLesson={(id)=>{
            setModalPlanOpen(false);
            setSelectedLessonId(id);
            setHash(id);
          }}
          isDone={isDone}
        />
      </Modal>
    </div>
  );
}

function JoinKeyForm({ onJoin }: { onJoin: (k: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
      <input
        value={val}
        onChange={(e)=>setVal(e.target.value)}
        placeholder="Incolla sync key"
        style={{
          flex: "1 1 320px",
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "#0b1220",
          color: "var(--text)"
        }}
      />
      <button className="btn btnPrimary" onClick={()=>{ const k = val.trim(); if(k) onJoin(k); }}>
        Collega
      </button>
    </div>
  );
}

function ImportBox({ onImport }: { onImport: (txt: string) => void }) {
  const [txt, setTxt] = useState("");
  return (
    <div style={{ marginTop: 8 }}>
      <div className="small muted">Incolla il JSON esportato.</div>
      <textarea className="card" style={{
        width:"100%", minHeight:220, padding:12, borderRadius:12, border:"1px solid var(--border)",
        background:"#0b1220", color:"var(--text)", marginTop:8
      }} value={txt} onChange={(e)=>setTxt(e.target.value)} />
      <div style={{ display:"flex", justifyContent:"flex-end", marginTop:10 }}>
        <button className="btn btnPrimary" onClick={()=>onImport(txt)}>Importa</button>
      </div>
    </div>
  );
}

function PlanBox({
  existing,
  onSave,
  onOpenLesson,
  isDone,
}: {
  existing: ProgressData["plan"];
  onSave: (hours: number, focus: "balanced"|"marketing"|"api"|"ai") => void;
  onOpenLesson: (id: string) => void;
  isDone: (id: string) => boolean;
}) {
  const [hours, setHours] = useState<number>(existing?.hoursPerWeek ?? 3);
  const [focus, setFocus] = useState<"balanced"|"marketing"|"api"|"ai">(existing?.focus ?? "balanced");

  const planPreview = useMemo(() => {
    const minsPerWeek = Math.max(60, Math.round(hours * 60));
    const lessons = [...COURSE.lessons];

    const focusTagMap: Record<string, string[]> = {
      marketing: ["marketing","lead-gen","workflow","productivity"],
      ai: ["ai","ai-agent","rag","embeddings","agentic"],
      api: ["api","http","google","telegram","whatsapp"],
      balanced: []
    };
    const fav = focusTagMap[focus] || [];
    lessons.sort((a,b) => {
      const aScore = fav.length ? fav.filter(t => (a.tags||[]).includes(t) || (a.tags||[]).some(x => x.includes(t))).length : 0;
      const bScore = fav.length ? fav.filter(t => (b.tags||[]).includes(t) || (b.tags||[]).some(x => x.includes(t))).length : 0;
      if (bScore !== aScore) return bScore - aScore;
      return 0;
    });

    let week = 1;
    let remaining = minsPerWeek;
    const weeks: {week:number; lessonIds:string[]}[] = [{ week:1, lessonIds: [] }];

    for (const l of lessons){
      const est = l.estMin || 20;
      if (est > remaining && weeks[weeks.length-1].lessonIds.length){
        week += 1;
        remaining = minsPerWeek;
        weeks.push({ week, lessonIds: [] });
      }
      weeks[weeks.length-1].lessonIds.push(l.id);
      remaining -= est;
    }
    return weeks.slice(0, 8);
  }, [hours, focus]);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display:"grid", gap:10 }}>
        <label>
          Ore a settimana
          <input type="number" min={1} max={20} step={0.5} value={hours}
            onChange={(e)=>setHours(parseFloat(e.target.value))}
            style={{ width:"100%", marginTop:6, padding:"10px 12px", borderRadius:12, border:"1px solid var(--border)", background:"#0b1220", color:"var(--text)" }}
          />
        </label>
        <label>
          Focus
          <select value={focus} onChange={(e)=>setFocus(e.target.value as any)}
            style={{ width:"100%", marginTop:6, padding:"10px 12px", borderRadius:12, border:"1px solid var(--border)", background:"#0b1220", color:"var(--text)" }}
          >
            <option value="balanced">Bilanciato</option>
            <option value="marketing">Marketing-first</option>
            <option value="api">API-first</option>
            <option value="ai">AI-first</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="small muted">Preview (prime 8 settimane). Clicca una lezione per aprirla.</div>
        <div style={{ marginTop: 8, maxHeight: "44vh", overflow:"auto", paddingRight: 6 }}>
          {planPreview.map(w => (
            <div key={w.week} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 900 }}>Settimana {w.week}</div>
              <ul style={{ marginTop: 6 }}>
                {w.lessonIds.slice(0, 6).map(id => {
                  const l = getLesson(id);
                  if(!l) return null;
                  return (
                    <li key={id}>
                      {isDone(id) ? "✅" : "⬜"}{" "}
                      <a href={"#" + id} onClick={(e)=>{ e.preventDefault(); onOpenLesson(id); }}>
                        {l.title}
                      </a>{" "}
                      <span className="muted small">({l.estMin} min)</span>
                    </li>
                  );
                })}
                {w.lessonIds.length > 6 && <li className="muted small">… +{w.lessonIds.length-6} lezioni</li>}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:"flex", justifyContent:"flex-end", marginTop: 12 }}>
        <button className="btn btnPrimary" onClick={()=>onSave(hours, focus)}>Salva piano</button>
      </div>
    </div>
  );
}
