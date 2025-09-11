'use strict';

(function () {
  // ---------------- Grading scales ----------------
  const SCALES = {
    nigeria: [
      { letter: 'A', min: 70, points: 5 },
      { letter: 'B', min: 60, points: 4 },
      { letter: 'C', min: 50, points: 3 },
      { letter: 'D', min: 45, points: 2 },
      { letter: 'E', min: 40, points: 1 },
      { letter: 'F', min: 0,  points: 0 },
    ],
    us: [
      { letter: 'A', min: 90, points: 4 },
      { letter: 'B', min: 80, points: 3 },
      { letter: 'C', min: 70, points: 2 },
      { letter: 'D', min: 60, points: 1 },
      { letter: 'F', min: 0,  points: 0 },
    ],
    us_plusminus: [
      { letter: 'A+', min: 97, points: 4.3 },
      { letter: 'A',  min: 93, points: 4.0 },
      { letter: 'A-', min: 90, points: 3.7 },
      { letter: 'B+', min: 87, points: 3.3 },
      { letter: 'B',  min: 83, points: 3.0 },
      { letter: 'B-', min: 80, points: 2.7 },
      { letter: 'C+', min: 77, points: 2.3 },
      { letter: 'C',  min: 73, points: 2.0 },
      { letter: 'C-', min: 70, points: 1.7 },
      { letter: 'D',  min: 60, points: 1.0 },
      { letter: 'F',  min: 0,  points: 0.0 },
    ],
    canada: [
      { letter: 'A', min: 85, points: 4 },
      { letter: 'B', min: 70, points: 3 },
      { letter: 'C', min: 60, points: 2 },
      { letter: 'D', min: 50, points: 1 },
      { letter: 'F', min: 0,  points: 0 },
    ],
    uk: [
      { letter: 'First',        min: 70, points: 4 },
      { letter: 'Upper Second', min: 60, points: 3 },
      { letter: 'Lower Second', min: 50, points: 2 },
      { letter: 'Third',        min: 40, points: 1 },
      { letter: 'Fail',         min: 0,  points: 0 },
    ],
    australia: [
      { letter: 'HD', min: 85, points: 7 },
      { letter: 'D',  min: 75, points: 6 },
      { letter: 'C',  min: 65, points: 5 },
      { letter: 'P',  min: 50, points: 4 },
      { letter: 'N',  min: 0,  points: 0 },
    ],
    india: [
      { letter: 'O',  min: 90, points: 10 },
      { letter: 'A+', min: 80, points: 9 },
      { letter: 'A',  min: 70, points: 8 },
      { letter: 'B+', min: 60, points: 7 },
      { letter: 'B',  min: 55, points: 6 },
      { letter: 'C',  min: 50, points: 5 },
      { letter: 'P',  min: 40, points: 4 },
      { letter: 'F',  min: 0,  points: 0 },
    ],
    ghana: [
      { letter: 'A',  min: 80, points: 4.0 },
      { letter: 'B+', min: 75, points: 3.5 },
      { letter: 'B',  min: 70, points: 3.0 },
      { letter: 'C+', min: 65, points: 2.5 },
      { letter: 'C',  min: 60, points: 2.0 },
      { letter: 'D+', min: 55, points: 1.5 },
      { letter: 'D',  min: 50, points: 1.0 },
      { letter: 'F',  min: 0,  points: 0.0 },
    ]
  };

  // ---------------- Simple alias map (client-side normalization) ----------------
  // Extend as you like: keys are normalized (lowercase, spaces/punct removed for codes)
  const ALIASES = {
    // Biology 101
    'intro to bio':     { code: 'BIO101', title: 'Biology 101', canonical: 'bio101' },
    'biology 101':      { code: 'BIO101', title: 'Biology 101', canonical: 'bio101' },
    'bio 101':          { code: 'BIO101', title: 'Biology 101', canonical: 'bio101' },
    'bio101':           { code: 'BIO101', title: 'Biology 101', canonical: 'bio101' },

    // Chemistry 101
    'chemistry 101':    { code: 'CHEM101', title: 'Chemistry 101', canonical: 'chem101' },
    'chem 101':         { code: 'CHEM101', title: 'Chemistry 101', canonical: 'chem101' },
    'chem101':          { code: 'CHEM101', title: 'Chemistry 101', canonical: 'chem101' },

    // Intro to Data Engineering
    'introduction to data engineering': { code: 'DE101', title: 'Introduction to Data Engineering', canonical: 'de101' },
    'data engineering 101':             { code: 'DE101', title: 'Introduction to Data Engineering', canonical: 'de101' },
    'de101':                            { code: 'DE101', title: 'Introduction to Data Engineering', canonical: 'de101' },
  };

  // ---------------- Constants & state ----------------
  const API_BASE = '/api';
  const STORAGE_KEY = 'gpa_last_submission';        // for print page
  const LAST_SAVED_KEY = 'gpa_last_saved_fp';       // { fp, id } mapping
  const LAST_COURSES_PREFIX = 'gpa_courses_';       // per-student consolidated courses
  let submitting = false;

  const state = {
    studentName: '',
    country: 'nigeria',
    universityName: '',
    universityLogoUrl: '',
    courses: [] // start empty; user adds courses
  };

  // ---------------- Elements ----------------
  const tbody = document.getElementById('tbody');
  const rowTpl = document.getElementById('row-template');
  const nameInput = document.getElementById('studentName');
  const uniInput  = document.getElementById('universityName');
  const logoInput = document.getElementById('universityLogo');
  const countrySelect = document.getElementById('countrySelect');
  const scaleList = document.getElementById('scaleList');
  const statStudent = document.getElementById('statStudent');
  const statUnits = document.getElementById('statUnits');
  const statGpa = document.getElementById('statGpa');
  const changeBox = document.getElementById('changeSummary');

  // Buttons
  document.getElementById('addBtn')?.addEventListener('click', addCourse);
  document.getElementById('resetBtn')?.addEventListener('click', resetAll);
  document.getElementById('printBtn')?.addEventListener('click', () => window.print());
  document.getElementById('submitBtn')?.addEventListener('click', onSubmit);

  // Inputs
  nameInput?.addEventListener('input', () => { state.studentName = nameInput.value; renderStats(); });
  uniInput?.addEventListener('input', () => { state.universityName = uniInput.value; });
  logoInput?.addEventListener('input', () => { state.universityLogoUrl = logoInput.value; });
  countrySelect?.addEventListener('change', () => {
    state.country = countrySelect.value;
    renderScale(); renderTable(); renderStats();
  });

  // ---------------- Helpers ----------------
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function currentScale() { return SCALES[state.country]; }
  function maxPoints() { return Math.max(...currentScale().map(r => Number(r.points) || 0)); }

  function norm(s) { return String(s || '').trim().toLowerCase(); }
  function normCode(s) { return norm(s).replace(/[^a-z0-9]/g, ''); }
  function cleanLogoUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  try {
    const url = new URL(s);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (s.length > 1000) return ''; // keep in sync with API limit
    return s;
  } catch { return ''; }
    }

  function canonicalizeCourse(c) {
    const t = norm(c.title);
    const codeKey = normCode(c.courseCode);
    let canonical = null;

    if (codeKey && ALIASES[codeKey]) {
      canonical = ALIASES[codeKey];
    } else if (t && ALIASES[t]) {
      canonical = ALIASES[t];
    }

    const dedupKey = (canonical?.canonical) || codeKey || t; // preference: canonical → code → title
    const titleOut = canonical?.title || c.title || '';
    const codeOut  = canonical?.code  || c.courseCode || '';

    return {
      dedupKey,
      title: titleOut,
      courseCode: codeOut,
      unit: Number(c.unit) || 0,
      score: Number(c.score) || 0
    };
  }

  function gradeFromScore(score) {
    const n = Number(score);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { letter: '—', points: 0 };
    const band = [...currentScale()].sort((a,b) => b.min - a.min).find(r => n >= r.min);
    return band ? { letter: band.letter, points: Number(band.points) } : { letter: '—', points: 0 };
  }

  function scaleSummaryText() {
    return [...currentScale()]
      .sort((a,b)=>b.min-a.min)
      .map(r => `${r.letter}≥${r.min}→${r.points}`)
      .join(', ');
  }

  function toast(msg, ms=2200) {
    const t = document.getElementById('toast');
    if (!t) { alert(msg); return; }
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(()=> t.style.display='none', ms);
  }

  // Fingerprint helpers (client-side)
  function normalizePayload(p) {
    const clean = s => String(s || '').trim().toLowerCase();
    // use canonicalized, de-duplicated courses for fingerprint
    const merged = dedupeCourses(p.courses || []);
    return {
      studentName: clean(p.studentName),
      country: clean(p.country),
      courses: merged.map(x => ({
        title: clean(x.title),
        courseCode: clean(x.courseCode),
        unit: Number(x.unit) || 0,
        score: Number(x.score) || 0
      })).sort((a,b)=>{
        const ka = a.courseCode || a.title, kb = b.courseCode || b.title;
        const t = ka.localeCompare(kb); if (t) return t;
        if (a.unit !== b.unit) return a.unit - b.unit;
        return a.score - b.score;
      })
    };
  }

  async function sha256Hex(str) {
    if (window.crypto?.subtle) {
      const enc = new TextEncoder().encode(str);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    }
    // Fallback DJB2
    let h = 5381;
    for (let i=0; i<str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
    return (h >>> 0).toString(16).padStart(8,'0');
  }
  async function makeClientFingerprint(payload) {
    return sha256Hex(JSON.stringify(normalizePayload(payload)));
  }

  function studentKey() { return `${norm(state.studentName)}|${norm(state.country)}`; }
  function coursesKeyForStudent() { return `${LAST_COURSES_PREFIX}${studentKey()}`; }

  // Merge duplicates in an array of raw courses using canonical dedupKey
  function dedupeCourses(rawCourses) {
    const map = new Map();
    for (const c of rawCourses) {
      const canon = canonicalizeCourse(c);
      if (!canon.title && !canon.courseCode) continue;
      const k = canon.dedupKey;
      // last one wins (so user’s latest edit in the list takes precedence)
      map.set(k, canon);
    }
    return Array.from(map.values());
  }

  // ---------------- Rendering ----------------
  function render() { renderScale(); renderTable(); renderStats(); }

  function renderScale() {
    if (!scaleList) return;
    scaleList.innerHTML = '';
    countrySelect.value = state.country;
    const ranges = [...currentScale()].sort((a,b) => b.min - a.min);
    ranges.forEach(r => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="badge">${r.letter}</span>
        <span>min ${r.min}</span>
        <span>${Number(r.points)} pts</span>
      `;
      scaleList.appendChild(li);
    });
  }

  function renderTable() {
    if (!tbody || !rowTpl) return;
    tbody.innerHTML = '';

    if (state.courses.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7" style="padding:16px; color:#9ca3af">
        No courses yet. Click <strong>Add course</strong> to begin.
      </td>`;
      tbody.appendChild(tr);
      return;
    }

    state.courses.forEach((c) => {
      const tr = rowTpl.content.firstElementChild.cloneNode(true);
      const codeEl  = tr.querySelector('.code');
      const titleEl = tr.querySelector('.title');
      const unitEl  = tr.querySelector('.unit');
      const scoreEl = tr.querySelector('.score');
      const letterEl = tr.querySelector('.letter');
      const pointsEl = tr.querySelector('.points');
      const removeBtn = tr.querySelector('.remove');

      codeEl.value  = c.courseCode || '';
      titleEl.value = c.title || '';
      unitEl.value  = c.unit ?? '';
      scoreEl.value = c.score ?? '';

      const { letter, points } = gradeFromScore(c.score);
      letterEl.textContent = letter;
      pointsEl.textContent = points;

      if (!(Number(c.unit) > 0)) unitEl.classList.add('invalid'); else unitEl.classList.remove('invalid');
      if (!(Number(c.score) >= 0 && Number(c.score) <= 100)) scoreEl.classList.add('invalid'); else scoreEl.classList.remove('invalid');

      codeEl.addEventListener('input', (e) => { c.courseCode = e.target.value; });
      titleEl.addEventListener('input', (e) => { c.title = e.target.value; });
      unitEl.addEventListener('input', (e) => { c.unit = e.target.valueAsNumber; renderStats(); renderTable(); });
      scoreEl.addEventListener('input', (e) => { c.score = e.target.valueAsNumber; renderStats(); renderTable(); });
      removeBtn.addEventListener('click', () => removeCourse(c.id));

      tbody.appendChild(tr);
    });
  }

  function renderStats() {
    const merged = dedupeCourses(state.courses);
    const totals = merged.reduce((acc, c) => {
      const unit = Number(c.unit);
      const score = Number(c.score);
      if (Number.isFinite(unit) && unit > 0 && Number.isFinite(score)) {
        const { points } = gradeFromScore(score);
        acc.units += unit;
        acc.quality += unit * points;
      }
      return acc;
    }, { units: 0, quality: 0 });

    const gpa = totals.units > 0 ? (totals.quality / totals.units) : 0;
    statStudent.textContent = state.studentName?.trim() || '—';
    statUnits.textContent = String(totals.units);
    statGpa.textContent = `${gpa.toFixed(2)} / ${maxPoints().toFixed(2)}`;
  }

  // ---------------- Actions ----------------
  function addCourse() {
    state.courses.push({ id: uid(), courseCode: '', title: '', unit: 3, score: 0 });
    render();
  }

  function removeCourse(id) {
    state.courses = state.courses.filter(c => c.id !== id);
    render();
  }

  function resetAll() {
    state.studentName = '';
    if (nameInput) nameInput.value = '';
    state.universityName = '';
    if (uniInput) uniInput.value = '';
    state.universityLogoUrl = '';
    if (logoInput) logoInput.value = '';
    state.country = 'nigeria';
    if (countrySelect) countrySelect.value = 'nigeria';
    state.courses = [];
    changeBox && (changeBox.style.display = 'none');
    render();
  }

//   function serializeState() {
//     // send canonicalized, de-duplicated courses (prevents dup on backend too)
//     const merged = dedupeCourses(state.courses);
//     return {
//       studentName: state.studentName || "",
//       country: state.country || "nigeria",
//       universityName: state.universityName || "",
//       universityLogoUrl: state.universityLogoUrl || "",
//       courses: merged.map(c => ({
//         title: c.title || "",
//         courseCode: c.courseCode || "",
//         unit: Number(c.unit) || 0,
//         score: Number(c.score) || 0
//       })),
//       scaleLegend: scaleSummaryText()
//     };
//   }

 function serializeState() {
  return {
    studentName: state.studentName || "",
    country: state.country || "nigeria",
    universityName: state.universityName || "",
    universityLogoUrl: cleanLogoUrl(state.universityLogoUrl),  // <— here
    courses: state.courses.map(c => ({
      title: c.title || "",
      courseCode: c.courseCode || "",
      unit: Number(c.unit) || 0,
      score: Number(c.score) || 0
    })),
    scaleLegend: scaleSummaryText()
  };
}

  function validate() {
    if (!state.studentName.trim()) { toast('Please enter student name'); return false; }
    if (!state.courses.length) { toast('Add at least one course'); return false; }

    // Validate inputs + catch *same-course* duplicates by canonical key
    const seen = new Set();
    for (const raw of state.courses) {
      const t = String(raw.title || '').trim();
      const code = String(raw.courseCode || '').trim();
      if (!t && !code) { toast('Each course needs a title or a code'); return false; }
      if (!(Number(raw.unit) > 0)) { toast('Units must be > 0'); return false; }
      if (!(Number(raw.score) >= 0 && Number(raw.score) <= 100)) { toast('Scores must be 0–100'); return false; }

      const canon = canonicalizeCourse(raw);
      const key = canon.dedupKey;
      if (seen.has(key)) {
        toast(`Duplicate course detected: ${canon.courseCode || canon.title}`);
        return false;
      }
      seen.add(key);
    }
    return true;
  }

  // Local "what changed" summary vs last consolidated set
  function diffAgainstLast(currentMerged) {
    try {
      const last = JSON.parse(localStorage.getItem(coursesKeyForStudent()) || '[]');
      const mapLast = new Map(last.map(c => {
        const k = (normCode(c.courseCode) || norm(c.title));
        return [k, c];
      }));
      const added = [];
      const updated = [];
      for (const c of currentMerged) {
        const k = (normCode(c.courseCode) || norm(c.title));
        const prev = mapLast.get(k);
        if (!prev) {
          added.push({ title: c.title, courseCode: c.courseCode, unit: c.unit, score: c.score });
        } else {
          if (prev.unit !== c.unit || prev.score !== c.score || prev.title !== c.title || prev.courseCode !== c.courseCode) {
            updated.push({
              title: prev.title, courseCode: prev.courseCode,
              oldUnit: prev.unit, oldScore: prev.score,
              newTitle: c.title, newCode: c.courseCode, newUnit: c.unit, newScore: c.score
            });
          }
        }
      }
      return { added, updated };
    } catch { return { added: [], updated: [] }; }
  }

  function showChangeSummary(added, updated) {
    if (!changeBox) return;
    const lines = [];
    (added || []).forEach(x => {
      lines.push(`Added ${x.courseCode ? x.courseCode + ' ' : ''}${x.title || ''} (${x.score})`);
    });
    (updated || []).forEach(x => {
      lines.push(`Updated ${x.courseCode ? x.courseCode + ' ' : ''}${x.title || ''}: ${x.oldScore}→${x.newScore}`);
    });
    if (lines.length) {
      changeBox.innerHTML = lines.map(l => `• ${l}`).join('<br>');
      changeBox.style.display = 'block';
    } else {
      changeBox.style.display = 'none';
    }
  }

  // ---------------- Submit (duplicate-proof) ----------------
  async function onSubmit() {
    try {
      if (submitting) return;          // block double-clicks
      if (!validate()) return;

      submitting = true;
      const btn = document.getElementById('submitBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

      // Build canonical, de-duplicated payload
      const payload = serializeState();
      const clientFp = await makeClientFingerprint(payload);

      // diff vs last local consolidated (to show after save)
      const { added, updated } = diffAgainstLast(payload.courses);
      showChangeSummary(added, updated);

      // Pre-submit short-circuit (silent)
      let lastMap = null;
      try { lastMap = JSON.parse(localStorage.getItem(LAST_SAVED_KEY) || 'null'); } catch {}
      if (lastMap && lastMap.fp === clientFp && lastMap.id) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id: lastMap.id, payload }));
        window.location.href = `./print.html?id=${encodeURIComponent(lastMap.id)}`;
        return;
      }

      // POST to backend
      const res = await fetch(`${API_BASE}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify(payload)
      });

      const status = res.status;
      const raw = await res.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch {}

      const returnedId = data?.id || null;

      if ((status === 200 || status === 201) && returnedId) {
        // update local caches
        localStorage.setItem(LAST_SAVED_KEY, JSON.stringify({ fp: clientFp, id: returnedId }));
        localStorage.setItem(coursesKeyForStudent(), JSON.stringify(payload.courses));
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id: returnedId, payload }));
        window.location.href = `./print.html?id=${encodeURIComponent(returnedId)}`;
        return;
      }

      // Fallback for 409 with known last id
      if (status === 409 && lastMap?.id) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id: lastMap.id, payload }));
        window.location.href = `./print.html?id=${encodeURIComponent(lastMap.id)}`;
        return;
      }

      alert('Save failed: ' + (raw || status));
      resetSubmitBtn();
    } catch (e) {
      alert('Network error: ' + e.message);
      resetSubmitBtn();
    }
  }

  function resetSubmitBtn() {
    submitting = false;
    const btn = document.getElementById('submitBtn');
    if (btn) { btn.disabled = false; btn.textContent = 'Submit'; }
  }

  // ---------------- Init ----------------
  render();
})();
