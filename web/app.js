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
      { letter: 'F', min: 0, points: 0 },
    ],
    us: [
      { letter: 'A', min: 90, points: 4 },
      { letter: 'B', min: 80, points: 3 },
      { letter: 'C', min: 70, points: 2 },
      { letter: 'D', min: 60, points: 1 },
      { letter: 'F', min: 0, points: 0 },
    ],
    us_plusminus: [
      { letter: 'A+', min: 97, points: 4.3 },
      { letter: 'A', min: 93, points: 4.0 },
      { letter: 'A-', min: 90, points: 3.7 },
      { letter: 'B+', min: 87, points: 3.3 },
      { letter: 'B', min: 83, points: 3.0 },
      { letter: 'B-', min: 80, points: 2.7 },
      { letter: 'C+', min: 77, points: 2.3 },
      { letter: 'C', min: 73, points: 2.0 },
      { letter: 'C-', min: 70, points: 1.7 },
      { letter: 'D', min: 60, points: 1.0 },
      { letter: 'F', min: 0, points: 0.0 },
    ],
    canada: [
      { letter: 'A', min: 85, points: 4 },
      { letter: 'B', min: 70, points: 3 },
      { letter: 'C', min: 60, points: 2 },
      { letter: 'D', min: 50, points: 1 },
      { letter: 'F', min: 0, points: 0 },
    ],
    uk: [
      { letter: 'First', min: 70, points: 4 },
      { letter: 'Upper Second', min: 60, points: 3 },
      { letter: 'Lower Second', min: 50, points: 2 },
      { letter: 'Third', min: 40, points: 1 },
      { letter: 'Fail', min: 0, points: 0 },
    ],
    australia: [
      { letter: 'HD', min: 85, points: 7 },
      { letter: 'D', min: 75, points: 6 },
      { letter: 'C', min: 65, points: 5 },
      { letter: 'P', min: 50, points: 4 },
      { letter: 'N', min: 0, points: 0 },
    ],
    india: [
      { letter: 'O', min: 90, points: 10 },
      { letter: 'A+', min: 80, points: 9 },
      { letter: 'A', min: 70, points: 8 },
      { letter: 'B+', min: 60, points: 7 },
      { letter: 'B', min: 55, points: 6 },
      { letter: 'C', min: 50, points: 5 },
      { letter: 'P', min: 40, points: 4 },
      { letter: 'F', min: 0, points: 0 },
    ],
    ghana: [
      { letter: 'A', min: 80, points: 4.0 },
      { letter: 'B+', min: 75, points: 3.5 },
      { letter: 'B', min: 70, points: 3.0 },
      { letter: 'C+', min: 65, points: 2.5 },
      { letter: 'C', min: 60, points: 2.0 },
      { letter: 'D+', min: 55, points: 1.5 },
      { letter: 'D', min: 50, points: 1.0 },
      { letter: 'F', min: 0, points: 0.0 },
    ]
  };

  // ---------------- Constants & state ----------------
  const API_BASE = '/api';
  const STORAGE_KEY = 'gpa_last_submission';   // for print page
  const LAST_SAVED_KEY = 'gpa_last_saved_fp';  // { fp, id } for dedupe
  let submitting = false; // guard against double-click

  const state = {
    studentName: '',
    country: 'nigeria',
    courses: [] // start empty; user adds courses
  };

  // ---------------- Elements ----------------
  const tbody = document.getElementById('tbody');
  const rowTpl = document.getElementById('row-template');
  const nameInput = document.getElementById('studentName');
  const countrySelect = document.getElementById('countrySelect');
  const scaleList = document.getElementById('scaleList');
  const statStudent = document.getElementById('statStudent');
  const statUnits = document.getElementById('statUnits');
  const statGpa = document.getElementById('statGpa');

  // Buttons
  document.getElementById('addBtn')?.addEventListener('click', addCourse);
  document.getElementById('resetBtn')?.addEventListener('click', resetAll);
  document.getElementById('printBtn')?.addEventListener('click', () => window.print());
  document.getElementById('submitBtn')?.addEventListener('click', onSubmit);

  // Inputs
  nameInput?.addEventListener('input', () => { state.studentName = nameInput.value; renderStats(); });
  countrySelect?.addEventListener('change', () => {
    state.country = countrySelect.value;
    renderScale(); renderTable(); renderStats();
  });

  // ---------------- Helpers ----------------
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function currentScale() { return SCALES[state.country]; }
  function maxPoints() { return Math.max(...currentScale().map(r => Number(r.points) || 0)); }

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

  // ----- Duplicate-detection helpers (client fingerprint matches server logic) -----
  function normalizePayload(p) {
    const clean = s => String(s || '').trim().toLowerCase();
    return {
      studentName: clean(p.studentName),
      country: clean(p.country),
      courses: (p.courses || [])
        .map(c => ({ title: clean(c.title), unit: Number(c.unit) || 0, score: Number(c.score) || 0 }))
        .sort((a,b) => {
          const t = a.title.localeCompare(b.title); if (t) return t;
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
    // Fallback DJB2 (non-crypto) – good enough for client dedupe UX
    let h = 5381;
    for (let i=0; i<str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
    return (h >>> 0).toString(16).padStart(8,'0');
  }

  async function makeClientFingerprint(payload) {
    return sha256Hex(JSON.stringify(normalizePayload(payload)));
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
      tr.innerHTML = `<td colspan="6" style="padding:16px; color:#9ca3af">
        No courses yet. Click <strong>Add course</strong> to begin.
      </td>`;
      tbody.appendChild(tr);
      return;
    }

    state.courses.forEach((c) => {
      const tr = rowTpl.content.firstElementChild.cloneNode(true);
      const titleEl  = tr.querySelector('.title');
      const unitEl   = tr.querySelector('.unit');
      const scoreEl  = tr.querySelector('.score');
      const letterEl = tr.querySelector('.letter');
      const pointsEl = tr.querySelector('.points');
      const removeBtn = tr.querySelector('.remove');

      titleEl.value = c.title || '';
      unitEl.value = c.unit ?? '';
      scoreEl.value = c.score ?? '';

      const { letter, points } = gradeFromScore(c.score);
      letterEl.textContent = letter;
      pointsEl.textContent = points;

      // inline invalid style
      if (!(Number(c.unit) > 0)) unitEl.classList.add('invalid'); else unitEl.classList.remove('invalid');
      if (!(Number(c.score) >= 0 && Number(c.score) <= 100)) scoreEl.classList.add('invalid'); else scoreEl.classList.remove('invalid');

      titleEl.addEventListener('input', (e) => { c.title = e.target.value; });
      unitEl.addEventListener('input', (e) => { c.unit = e.target.valueAsNumber; renderStats(); renderTable(); });
      scoreEl.addEventListener('input', (e) => { c.score = e.target.valueAsNumber; renderStats(); renderTable(); });
      removeBtn.addEventListener('click', () => removeCourse(c.id));

      tbody.appendChild(tr);
    });
  }

  function renderStats() {
    const totals = state.courses.reduce((acc, c) => {
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
    state.courses.push({ id: uid(), title: '', unit: 3, score: 0 });
    render();
  }

  function removeCourse(id) {
    state.courses = state.courses.filter(c => c.id !== id);
    render();
  }

  function resetAll() {
    state.studentName = '';
    if (nameInput) nameInput.value = '';
    state.country = 'nigeria';
    if (countrySelect) countrySelect.value = 'nigeria';
    state.courses = [];
    render();
  }

  function serializeState() {
    return {
      studentName: state.studentName || "",
      country: state.country || "nigeria",
      courses: state.courses.map(c => ({
        title: c.title || "",
        unit: Number(c.unit) || 0,
        score: Number(c.score) || 0
      })),
      scaleLegend: scaleSummaryText()
    };
  }

  function validate() {
    if (!state.studentName.trim()) { toast('Please enter student name'); return false; }
    if (!state.courses.length) { toast('Add at least one course'); return false; }

    // Disallow duplicate courses (title+unit+score)
    const seen = new Set();
    for (const c of state.courses) {
      const t = String(c.title || '').trim();
      if (!t) { toast('Every course needs a title'); return false; }
      if (!(Number(c.unit) > 0)) { toast('Units must be > 0'); return false; }
      if (!(Number(c.score) >= 0 && Number(c.score) <= 100)) { toast('Scores must be 0–100'); return false; }

      const key = `${t.toLowerCase()}|${Number(c.unit)||0}|${Number(c.score)||0}`;
      if (seen.has(key)) { toast(`Duplicate course: ${t}`); return false; }
      seen.add(key);
    }
    return true;
  }
async function onSubmit() {
  try {
    if (submitting) return;          // block double-clicks
    if (!validate()) return;

    submitting = true;
    const btn = document.getElementById('submitBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

    const payload = serializeState();
    const clientFp = await makeClientFingerprint(payload);

    // --- Pre-submit short-circuit: identical to last saved (SILENT redirect, no toast)
    let last = null;
    try { last = JSON.parse(localStorage.getItem(LAST_SAVED_KEY) || 'null'); } catch {}
    if (last && last.fp === clientFp && last.id) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id: last.id, payload }));
      window.location.href = `./print.html?id=${encodeURIComponent(last.id)}`;
      return;
    }

    // --- POST to backend
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

    // Build a fingerprint from the server response so we can tell "same data" vs new
    let serverFp = null;
    if (data && typeof data.studentName !== 'undefined' && Array.isArray(data.courses)) {
      serverFp = await makeClientFingerprint({
        studentName: data.studentName,
        country: data.country,
        courses: data.courses
      });
    }

    // Re-read last mapping in case it changed
    try { last = JSON.parse(localStorage.getItem(LAST_SAVED_KEY) || 'null'); } catch {}

    // --- Classify result (works even if server always returns 200)
    if (returnedId) {
      // If server data equals what we sent, it's a duplicate (either same id or an existing saved copy)
      if (serverFp && serverFp === clientFp) {
        if (!(last && last.fp === clientFp && last.id === returnedId)) {
          // Only show a toast if it's an existing copy we didn't already know about
          if (typeof toast === 'function') toast('Opening saved copy…', 1500);
        }
      }
      // Save mapping and go to print
      localStorage.setItem(LAST_SAVED_KEY, JSON.stringify({ fp: clientFp, id: returnedId }));
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id: returnedId, payload }));
      window.location.href = `./print.html?id=${encodeURIComponent(returnedId)}`;
      return;
    }

    // Fallback: if server sent 409 w/o id but we have last.id, open it
    if (status === 409 && last?.id) {
      if (typeof toast === 'function') toast('Opening saved copy…', 1500);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id: last.id, payload }));
      window.location.href = `./print.html?id=${encodeURIComponent(last.id)}`;
      return;
    }

    // Anything else → failure
    alert('Save failed: ' + (raw || status));
    resetSubmitBtn();
  } catch (e) {
    alert('Network error: ' + e.message);
    resetSubmitBtn();
  }
}

  // ---------------- Disclaimer (optional hide for session) ----------------
  (function initDisclaimer(){
    const box = document.getElementById('disclaimer');
    const btn = document.getElementById('dismissDisclaimer');
    if (box && btn) btn.addEventListener('click', () => { box.style.display = 'none'; });
  })();

  // ---------------- Init ----------------
  render();
})();
