'use strict';

// Show any JS errors on the page (helps debugging)
window.addEventListener('error', (e) => {
  console.error('JS error:', e.error || e.message);
  const t = document.getElementById('toast');
  if (t) { t.textContent = 'JavaScript error: ' + (e.message || 'see console'); t.style.display = 'block'; }
});

(function () {
  console.log('app.js loaded (multi-term)');

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
    universityName: '',
    universityLogoUrl: '',
    terms: [] // [{id, semester, academicYear, courses:[{...}]}]
  };

  // ---------- Elements ----------
  const termsContainer = document.getElementById('termsContainer');
  const termTpl = document.getElementById('term-template');
  const rowTpl = document.getElementById('row-template');

  const nameInput = document.getElementById('studentName');
  const countrySelect = document.getElementById('countrySelect');
  const uniInput  = document.getElementById('universityName');
  const logoInput = document.getElementById('universityLogo');
  const logoPreview = document.getElementById('logoPreview');

  const scaleList = document.getElementById('scaleList');
  const scaleSummary = document.getElementById('scaleSummary');
  const statStudent = document.getElementById('statStudent');
  const statUnits = document.getElementById('statUnits');
  const statGpa = document.getElementById('statGpa');
  const changeBox = document.getElementById('changeSummary');

  // ---------- Buttons wiring ----------
  document.getElementById('addTermBtn').addEventListener('click', () => addTerm());
  document.getElementById('resetBtn').addEventListener('click', resetAll);
  document.getElementById('printBtn').addEventListener('click', () => window.print());
  document.getElementById('submitBtn').addEventListener('click', (e) => { e.preventDefault(); onSubmit(); });

  // ---------- Input wiring ----------
  nameInput.addEventListener('input', () => { state.studentName = nameInput.value; renderStats(); });
  countrySelect.addEventListener('change', () => { state.country = countrySelect.value; renderScale(); renderTerms(); renderStats(); });
  uniInput.addEventListener('input', () => { state.universityName = uniInput.value; });
  logoInput.addEventListener('input', () => { state.universityLogoUrl = logoInput.value; updateLogoPreview(); });

  // ---------- Helpers ----------
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
  function defaultSemester() {
    const opts = SEMESTERS[state.country] || SEMESTERS.default;
    return opts[0];
  }
  function addTerm() {
    state.terms.push({
      id: uid(),
      semester: defaultSemester(),
      academicYear: String(new Date().getFullYear()),
      courses: []
    });
    renderTerms(); renderStats();
  }
  function removeTerm(id) {
    state.terms = state.terms.filter(t => t.id !== id);
    renderTerms(); renderStats();
  }
  function addCourse(term) {
    term.courses.push({ id: uid(), courseCode: '', title: '', unit: 0, score: null });
    renderTerms(); renderStats();
  }
  function removeCourse(term, courseId) {
    term.courses = term.courses.filter(c => c.id !== courseId);
    renderTerms(); renderStats();
  }

    // Reset everything to a fresh state
  function resetAll() {
    // clear top-level state
    state.studentName = '';
    state.country = 'nigeria';
    state.universityName = '';
    state.universityLogoUrl = '';

    // clear inputs
    if (nameInput) nameInput.value = '';
    if (countrySelect) countrySelect.value = 'nigeria';
    if (uniInput) uniInput.value = '';
    if (logoInput) logoInput.value = '';
    updateLogoPreview();

    // reset terms to a single empty term
    state.terms = [];
    addTerm(); // creates one new empty term with default semester/year

    // clear any UI notices
    const box = document.getElementById('changeSummary');
    if (box) { box.style.display = 'none'; box.textContent = ''; }

    // clear client-side dedupe caches
    try { localStorage.removeItem(LAST_SAVED_KEY); } catch {}
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}

    // re-render
    render();
  }

  // ---------- Rendering ----------
  function render() {
    if (state.terms.length === 0) addTerm();
    renderScale(); renderTerms(); renderStats(); updateLogoPreview();
  }
  function renderScale() {
    scaleList.innerHTML = '';
    scaleSummary.textContent = 'Scale: ' + scaleSummaryText();
    const ranges = [...currentScale()].sort((a,b) => b.min - a.min);
    ranges.forEach(r => {
      const row = document.createElement('div');
      row.innerHTML = `<span class="badge">${r.letter}</span> <span>min ${r.min}</span> <span class="muted">${Number(r.points)} pts</span>`;
      scaleList.appendChild(row);
    });
  }
  function renderTerms() {
    termsContainer.innerHTML = '';
    const semOpts = (SEMESTERS[state.country] || SEMESTERS.default).slice();

    state.terms.forEach((term) => {
      const termEl = termTpl.content.firstElementChild.cloneNode(true);
      termEl.dataset.termid = term.id;

      const semSelect = termEl.querySelector('.term-semester');
      semSelect.innerHTML = '';
      semOpts.forEach(s => {
        const o = document.createElement('option');
        o.value = o.textContent = s; semSelect.appendChild(o);
      });
      if (!term.semester || !semOpts.includes(term.semester)) term.semester = semOpts[0];
      semSelect.value = term.semester;
      semSelect.addEventListener('change', (e) => { term.semester = e.target.value; });

      const yearInput = termEl.querySelector('.term-year');
      yearInput.value = term.academicYear || '';
      yearInput.addEventListener('input', (e) => { term.academicYear = e.target.value; });

      // per-term GPA label
      const g = computeTermGPA(term);
      const gSpan = termEl.querySelector('.term-gpa');
      gSpan.textContent = `GPA: ${g.gpa.toFixed(2)} (Units ${g.units})`;

      // Buttons
      termEl.querySelector('.term-add-course')
        .addEventListener('click', () => addCourse(term));
      termEl.querySelector('.term-remove')
        .addEventListener('click', () => removeTerm(term.id));

      // tbody
      const tbody = termEl.querySelector('.term-tbody');
      tbody.innerHTML = '';
      if (term.courses.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="7" class="muted">No courses yet. Click <strong>Add course</strong> to begin.</td>`;
        tbody.appendChild(tr);
      } else {
        term.courses.forEach((c) => {
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
          scoreBtn.textContent = Number.isFinite(Number(c.score)) ? String(c.score) : 'Set';

          const { letter, points } = gradeFromScore(c.score);
          letterEl.textContent = letter;
          pointsEl.textContent = points;

          if (!(Number(c.unit) > 0)) unitEl.classList.add('invalid'); else unitEl.classList.remove('invalid');

          codeEl.addEventListener('input', e => { c.courseCode = e.target.value; });
          titleEl.addEventListener('input', e => { c.title = e.target.value; });
          unitEl.addEventListener('input', e => { c.unit = e.target.valueAsNumber; renderTerms(); renderStats(); });
          scoreBtn.addEventListener('click', () => openScoreModal(c));
          removeBtn.addEventListener('click', () => removeCourse(term, c.id));

          tbody.appendChild(tr);
        });
      }

      termsContainer.appendChild(termEl);
    });
  }

  function computeTermGPA(term) {
    return (term.courses || []).reduce((acc, c) => {
      const unit = Number(c.unit), score = Number(c.score);
      if (Number.isFinite(unit) && unit > 0 && Number.isFinite(score)) {
        const { points } = gradeFromScore(score);
        acc.units += unit; acc.quality += unit * points;
      }
      return acc;
    }, { units: 0, quality: 0, get gpa(){ return this.units>0 ? (this.quality/this.units) : 0; } });
  }

  function renderStats() {
    let totalUnits = 0, totalQuality = 0;
    state.terms.forEach(t => {
      const g = computeTermGPA(t);
      totalUnits += g.units; totalQuality += g.quality;
    });
    const gpa = totalUnits > 0 ? (totalQuality / totalUnits) : 0;
    statStudent.textContent = state.studentName?.trim() || '—';
    statUnits.textContent = String(totalUnits);
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
    closeScoreModal(); renderTerms(); renderStats();
  });
  modalCancel.addEventListener('click', closeScoreModal);

  // ---------- Validation & serialization ----------
  function serializeState() {
    return {
      studentName: state.studentName || "",
      country: state.country || "nigeria",
      universityName: state.universityName || "",
      universityLogoUrl: cleanLogoUrl(state.universityLogoUrl),
      scaleLegend: scaleSummaryText(),
      // NEW: terms array
      terms: state.terms.map(t => ({
        semester: t.semester || "",
        academicYear: (t.academicYear || "").slice(0, 16),
        courses: (t.courses || []).map(c => ({
          courseCode: c.courseCode || "",
          title: c.title || "",
          unit: Number(c.unit) || 0,
          score: Number(c.score) || 0
        }))
      }))
    };
  }
  function validate() {
    if (!state.studentName.trim()) { toast('Please enter student name'); return false; }
    if (!state.terms.length) { toast('Add at least one term'); return false; }

    let anyCourse = false;
    for (const t of state.terms) {
      const y = (t.academicYear || '').trim();
      if (y && !/^\d{4}([\/-]\d{2})?$/.test(y)) { toast('Year format: 2025 or 2024/25'); return false; }
      const seen = new Set();
      for (const c of (t.courses||[])) {
        anyCourse = true;
        const title = String(c.title || '').trim();
        const code = String(c.courseCode || '').trim();
        if (!title && !code) { toast('Course needs a title or code'); return false; }
        if (!(Number(c.unit) > 0)) { toast('Units must be > 0'); return false; }
        if (!(Number(c.score) >= 0 && Number(c.score) <= 100)) { toast('Scores must be 0–100'); return false; }
        const key = (code ? code.toLowerCase().replace(/[^a-z0-9]/g,'') : title.toLowerCase()) + '|' + (Number(c.unit)||0) + '|' + (Number(c.score)||0);
        if (seen.has(key)) { toast('Duplicate course within a term'); return false; }
        seen.add(key);
      }
    }
    if (!anyCourse) { toast('Add at least one course'); return false; }
    return true;
  }

  // ---------- Fingerprint for client dedupe ----------
  function normalizePayload(p) {
    const clean = s => String(s || '').trim().toLowerCase();
    return {
      studentName: clean(p.studentName),
      country: clean(p.country),
      terms: (p.terms||[]).map(t => ({
        semester: clean(t.semester),
        academicYear: clean(t.academicYear),
        courses: (t.courses||[]).map(c => ({
          title: clean(c.title),
          code: clean(c.courseCode).replace(/[^a-z0-9]/g,''),
          unit: Number(c.unit)||0,
          score: Number(c.score)||0
        })).sort((a,b)=>{
          const ka = a.code || a.title, kb=b.code||b.title;
          const t = ka.localeCompare(kb); if (t) return t;
          if (a.unit !== b.unit) return a.unit - b.unit;
          return a.score - b.score;
        })
      }))
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
  function goToPrint(id) {
    const url = new URL('/print.html', window.location.origin);
    if (id) url.searchParams.set('id', id);
    window.location.assign(url.toString());
  }

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', () => {
    // start with one empty term
    addTerm();
    render();
  });
})();
