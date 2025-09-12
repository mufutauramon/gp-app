'use strict';

// Simple global error hook so you can see errors quickly
window.addEventListener('error', (e) => {
  console.error('JS error:', e.error || e.message);
  const t = document.getElementById('toast');
  if (t) { t.textContent = 'JavaScript error: ' + (e.message || 'see console'); t.style.display = 'block'; }
});

(function () {
  console.log('app.js loaded');

  // ---------- Config ----------
  const API_BASE = '/api';
  const STORAGE_KEY = 'gpa_last_submission';
  const LAST_SAVED_KEY = 'gpa_last_saved_fp';
  let submitting = false;

  // ---------- Scales & semesters ----------
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
  const SEMESTERS = {
    nigeria: ['First Semester', 'Second Semester'],
    us: ['Fall', 'Spring', 'Winter'],
    us_plusminus: ['Fall', 'Spring', 'Winter'],
    default: ['Term 1', 'Term 2']
  };

  // ---------- State ----------
  const state = {
    studentName: '',
    country: 'nigeria',
    semester: '',
    academicYear: '',
    universityName: '',
    universityLogoUrl: '',
    courses: [] // user adds rows
  };

  // ---------- Elements ----------
  const tbody = document.getElementById('tbody');
  const rowTpl = document.getElementById('row-template');
  const nameInput = document.getElementById('studentName');
  const countrySelect = document.getElementById('countrySelect');
  const semesterSelect = document.getElementById('semesterSelect');
  const yearInput = document.getElementById('yearInput');
  const uniInput  = document.getElementById('universityName');
  const logoInput = document.getElementById('universityLogo');
  const logoPreview = document.getElementById('logoPreview');
  const scaleList = document.getElementById('scaleList');
  const scaleSummary = document.getElementById('scaleSummary');
  const statStudent = document.getElementById('statStudent');
  const statUnits = document.getElementById('statUnits');
  const statGpa = document.getElementById('statGpa');
  const changeBox = document.getElementById('changeSummary');

  // Buttons
  document.getElementById('addBtn').addEventListener('click', addCourse);
  document.getElementById('resetBtn').addEventListener('click', resetAll);
  document.getElementById('printBtn').addEventListener('click', () => window.print());
  document.getElementById('submitBtn').addEventListener('click', (e) => { e.preventDefault(); onSubmit(); });

  // Inputs
  nameInput.addEventListener('input', () => { state.studentName = nameInput.value; renderStats(); });
  countrySelect.addEventListener('change', () => { state.country = countrySelect.value; refreshSemesterOptions(); renderScale(); renderTable(); renderStats(); });
  semesterSelect.addEventListener('change', () => { state.semester = semesterSelect.value; });
  yearInput.addEventListener('input', () => { state.academicYear = yearInput.value; });
  uniInput.addEventListener('input', () => { state.universityName = uniInput.value; });
  logoInput.addEventListener('input', () => { state.universityLogoUrl = logoInput.value; updateLogoPreview(); });

  // ---------- Helpers ----------
  function goToPrint(id) {
    const url = new URL('/print.html', window.location.origin);
    if (id) url.searchParams.set('id', id);
    console.log('Redirecting to', url.toString());
    window.location.assign(url.toString());
  }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function currentScale() { return SCALES[state.country] || SCALES.nigeria; }
  function maxPoints() { return Math.max(...currentScale().map(r => Number(r.points) || 0)); }
  function gradeFromScore(score) {
    const n = Number(score);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { letter: '—', points: 0 };
    const band = [...currentScale()].sort((a,b) => b.min - a.min).find(r => n >= r.min);
    return band ? { letter: band.letter, points: Number(band.points) } : { letter: '—', points: 0 };
  }
  function scaleSummaryText() {
    return [...currentScale()].sort((a,b)=>b.min-a.min).map(r => `${r.letter}≥${r.min}→${r.points}`).join(', ');
  }
  function toast(msg, ms=2200) {
    const t = document.getElementById('toast'); if (!t) { alert(msg); return; }
    t.textContent = msg; t.style.display = 'block'; setTimeout(()=> t.style.display='none', ms);
  }
  function cleanLogoUrl(u) {
    const s = String(u || '').trim(); if (!s) return '';
    try { const url = new URL(s); if (!/^https?:$/.test(url.protocol)) return ''; if (s.length > 1000) return ''; return s; }
    catch { return ''; }
  }
  function updateLogoPreview() {
    const url = cleanLogoUrl(logoInput.value);
    if (!url) { logoPreview.style.display='none'; logoPreview.removeAttribute('src'); return; }
    logoPreview.onload = () => { logoPreview.style.display='inline-block'; };
    logoPreview.onerror = () => { logoPreview.style.display='none'; logoPreview.removeAttribute('src'); };
    logoPreview.src = url;
  }
  function refreshSemesterOptions() {
    const opts = SEMESTERS[state.country] || SEMESTERS.default;
    semesterSelect.innerHTML = '';
    opts.forEach(v => {
      const o = document.createElement('option');
      o.value = o.textContent = v; semesterSelect.appendChild(o);
    });
    if (!state.semester || !opts.includes(state.semester)) state.semester = opts[0];
    semesterSelect.value = state.semester;
  }

  // ---------- Rendering ----------
  function render() { refreshSemesterOptions(); renderScale(); renderTable(); renderStats(); updateLogoPreview(); }
  function renderScale() {
    scaleList.innerHTML = '';
    countrySelect.value = state.country;
    scaleSummary.textContent = 'Scale: ' + scaleSummaryText();
    const ranges = [...currentScale()].sort((a,b) => b.min - a.min);
    ranges.forEach(r => {
      const row = document.createElement('div');
      row.innerHTML = `<span class="badge">${r.letter}</span> <span>min ${r.min}</span> <span class="muted">${Number(r.points)} pts</span>`;
      scaleList.appendChild(row);
    });
  }
  function renderTable() {
    tbody.innerHTML = '';
    if (state.courses.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7" class="muted">No courses yet. Click <strong>Add course</strong> to begin.</td>`;
      tbody.appendChild(tr);
      return;
    }
    state.courses.forEach(c => {
      const tr = rowTpl.content.firstElementChild.cloneNode(true);
      const codeEl = tr.querySelector('.code');
      const titleEl = tr.querySelector('.title');
      const unitEl = tr.querySelector('.unit');
      const scoreBtn = tr.querySelector('.score-btn');
      const letterEl = tr.querySelector('.letter');
      const pointsEl = tr.querySelector('.points');
      const removeBtn = tr.querySelector('.remove');

      codeEl.value = c.courseCode || '';
      titleEl.value = c.title || '';
      unitEl.value = c.unit ?? 0;

      const { letter, points } = gradeFromScore(c.score);
      letterEl.textContent = letter;
      pointsEl.textContent = points;
      scoreBtn.textContent = Number.isFinite(Number(c.score)) ? String(c.score) : 'Set';

      if (!(Number(c.unit) > 0)) unitEl.classList.add('invalid'); else unitEl.classList.remove('invalid');

      codeEl.addEventListener('input', e => { c.courseCode = e.target.value; });
      titleEl.addEventListener('input', e => { c.title = e.target.value; });
      unitEl.addEventListener('input', e => { c.unit = e.target.valueAsNumber; renderStats(); renderTable(); });
      scoreBtn.addEventListener('click', () => openScoreModal(c));
      removeBtn.addEventListener('click', () => { state.courses = state.courses.filter(x => x !== c); render(); });

      tbody.appendChild(tr);
    });
  }
  function renderStats() {
    const totals = state.courses.reduce((acc, c) => {
      const unit = Number(c.unit), score = Number(c.score);
      if (Number.isFinite(unit) && unit > 0 && Number.isFinite(score)) {
        const { points } = gradeFromScore(score);
        acc.units += unit; acc.quality += unit * points;
      }
      return acc;
    }, { units: 0, quality: 0 });
    const gpa = totals.units > 0 ? (totals.quality / totals.units) : 0;
    statStudent.textContent = state.studentName?.trim() || '—';
    statUnits.textContent = String(totals.units);
    statGpa.textContent = `${gpa.toFixed(2)} / ${maxPoints().toFixed(2)}`;
  }

  // ---------- Modal (score) ----------
  const modalBackdrop = document.getElementById('scoreModalBackdrop');
  const modalInput = document.getElementById('scoreModalInput');
  const modalOk = document.getElementById('scoreOk');
  const modalCancel = document.getElementById('scoreCancel');
  let modalCourseRef = null;

  function openScoreModal(courseObj){
    modalCourseRef = courseObj;
    modalInput.value = Number(courseObj.score ?? 0);
    modalBackdrop.style.display = 'flex';
    setTimeout(()=> modalInput.focus(), 0);
  }
  function closeScoreModal(){ modalCourseRef = null; modalBackdrop.style.display = 'none'; }
  modalOk.addEventListener('click', () => {
    const v = Number(modalInput.value);
    if (!Number.isFinite(v) || v < 0 || v > 100) { toast('Enter a score 0–100'); return; }
    if (modalCourseRef) modalCourseRef.score = v;
    closeScoreModal(); renderTable(); renderStats();
  });
  modalCancel.addEventListener('click', closeScoreModal);

  // ---------- Validation & serialization ----------
  function serializeState() {
    return {
      studentName: state.studentName || "",
      country: state.country || "nigeria",
      semester: state.semester || "",
      academicYear: (state.academicYear || "").slice(0, 16),
      universityName: state.universityName || "",
      universityLogoUrl: cleanLogoUrl(state.universityLogoUrl),
      courses: state.courses.map(c => ({
        courseCode: c.courseCode || "",
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
    const y = (state.academicYear || '').trim();
    if (y && !/^\d{4}([\/-]\d{2})?$/.test(y)) { toast('Year format: 2025 or 2024/25'); return false; }

    const seen = new Set();
    for (const c of state.courses) {
      const t = String(c.title || '').trim();
      const code = String(c.courseCode || '').trim();
      if (!t && !code) { toast('Course needs a title or code'); return false; }
      if (!(Number(c.unit) > 0)) { toast('Units must be > 0'); return false; }
      if (!(Number(c.score) >= 0 && Number(c.score) <= 100)) { toast('Scores must be 0–100'); return false; }
      const key = (code ? code.toLowerCase().replace(/[^a-z0-9]/g,'') : t.toLowerCase()) + '|' + (Number(c.unit)||0) + '|' + (Number(c.score)||0);
      if (seen.has(key)) { toast('Duplicate course in this list'); return false; }
      seen.add(key);
    }
    return true;
  }

  // ---------- Fingerprint for client dedupe ----------
  function normalizePayload(p) {
    const clean = s => String(s || '').trim().toLowerCase();
    return {
      studentName: clean(p.studentName),
      country: clean(p.country),
      semester: clean(p.semester),
      academicYear: clean(p.academicYear),
      courses: (p.courses || [])
        .map(c => ({
          title: clean(c.title),
          code: clean(c.courseCode).replace(/[^a-z0-9]/g,''),
          unit: Number(c.unit) || 0,
          score: Number(c.score) || 0
        }))
        .sort((a,b) => {
          const ka = a.code || a.title, kb = b.code || b.title;
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
    let h = 5381; for (let i=0;i<str.length;i++) h=((h<<5)+h)+str.charCodeAt(i);
    return (h>>>0).toString(16).padStart(8,'0');
  }
  async function makeClientFingerprint(payload) {
    return sha256Hex(JSON.stringify(normalizePayload(payload)));
  }

  // ---------- Submit ----------
  async function onSubmit() {
    try {
      if (submitting) return;
      if (!validate()) return;

      submitting = true;
      const btn = document.getElementById('submitBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

      const payload = serializeState();
      const clientFp = await makeClientFingerprint(payload);

      let last = null;
      try { last = JSON.parse(localStorage.getItem(LAST_SAVED_KEY) || 'null'); } catch {}
      if (last && last.fp === clientFp && last.id) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id: last.id, payload }));
        goToPrint(last.id);
        return;
      }

      const res = await fetch(`${API_BASE}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify(payload)
      });

      const status = res.status;
      const raw = await res.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch {}

      if (!(status === 200 || status === 201) || !data?.id) {
        alert('Save failed: ' + (raw || status));
        resetSubmitBtn();
        return;
      }

      if (changeBox && (Array.isArray(data.added) || Array.isArray(data.updated))) {
        const lines = [];
        (data.added || []).forEach(x => lines.push(`Added ${x.courseCode ? x.courseCode+' ' : ''}${x.title || ''} (${x.score})`));
        (data.updated || []).forEach(x => lines.push(`Updated ${x.courseCode ? x.courseCode+' ' : ''}${x.title || ''}`));
        if (lines.length) {
          changeBox.innerHTML = lines.map(l => `• ${l}`).join('<br>');
          changeBox.style.display = 'block';
          setTimeout(()=> { changeBox.style.display='none'; }, 2000);
        }
      }

      localStorage.setItem(LAST_SAVED_KEY, JSON.stringify({ fp: clientFp, id: data.id }));
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id: data.id, payload }));
      goToPrint(data.id);
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

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', () => {
    const y = new Date().getFullYear();
    state.academicYear = String(y);
    yearInput.value = state.academicYear;
    render();
  });
})();
