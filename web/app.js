'use strict';

(function () {
  // -------- Grading scales --------
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

  const API_BASE = '/api';
  const STORAGE_KEY = 'gpa_last_submission';

  const state = {
    studentName: '',
    country: 'nigeria',
    courses: [
      { id: uid(), title: 'Introduction to Data Engineering', unit: 3, score: 75 },
      { id: uid(), title: 'Design of Pipelines', unit: 3, score: 62 },
      { id: uid(), title: 'Introduction to Power BI', unit: 2, score: 58 },
    ]
  };

  // elements
  const tbody = document.getElementById('tbody');
  const rowTpl = document.getElementById('row-template');
  const nameInput = document.getElementById('studentName');
  const countrySelect = document.getElementById('countrySelect');
  const scaleSummary = document.getElementById('scaleSummary');
  const statStudent = document.getElementById('statStudent');
  const statUnits = document.getElementById('statUnits');
  const statGpa = document.getElementById('statGpa');

  // helpers
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function currentScale() { return SCALES[state.country]; }
  function maxPoints() { return Math.max(...currentScale().map(r => Number(r.points) || 0)); }

  function gradeFromScore(score) {
    const n = Number(score);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { letter: '—', points: 0 };
    const ranges = [...currentScale()].sort((a, b) => b.min - a.min);
    const band = ranges.find(r => n >= r.min);
    return band ? { letter: band.letter, points: band.points } : { letter: '—', points: 0 };
  }

  function scaleSummaryText() {
    return [...currentScale()].sort((a, b) => b.min - a.min)
      .map(r => `${r.letter}≥${r.min}→${r.points}`).join(', ');
  }

  function toast(msg, ms = 2200) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', ms);
  }

  // rendering
  function render() { renderScale(); renderTable(); renderStats(); }
  function renderScale() { scaleSummary.textContent = 'Scale: ' + scaleSummaryText(); countrySelect.value = state.country; }

  function renderTable() {
    tbody.innerHTML = '';
    state.courses.forEach((c) => {
      const tr = rowTpl.content.firstElementChild.cloneNode(true);
      const titleEl = tr.querySelector('.title');
      const unitEl = tr.querySelector('.unit');
      const scoreEl = tr.querySelector('.score');
      const letterEl = tr.querySelector('.letter');
      const pointsEl = tr.querySelector('.points');
      const removeBtn = tr.querySelector('.remove');

      titleEl.value = c.title || '';
      unitEl.value = c.unit ?? '';
      scoreEl.value = c.score ?? '';

      const { letter, points } = gradeFromScore(c.score);
      letterEl.textContent = letter;
      pointsEl.textContent = points;

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

  // actions
  function addCourse() { state.courses.push({ id: uid(), title: '', unit: 3, score: 0 }); render(); }
  function removeCourse(id) { state.courses = state.courses.filter(c => c.id !== id); render(); }
  function resetAll() {
    state.studentName = ''; nameInput.value = '';
    state.country = 'nigeria'; countrySelect.value = 'nigeria';
    state.courses = [{ id: uid(), title: '', unit: 3, score: 0 }];
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
    for (const c of state.courses) {
      if (!c.title?.trim()) { toast('Every course needs a title'); return false; }
      if (!(Number(c.unit) > 0)) { toast('Units must be > 0'); return false; }
      if (!(Number(c.score) >= 0 && Number(c.score) <= 100)) { toast('Scores must be 0–100'); return false; }
    }
    return true;
  }

  async function onSubmit() {
    try {
      if (!validate()) return;
      const btn = document.getElementById('submitBtn');
      btn.disabled = true; btn.textContent = 'Submitting...';

      const payload = serializeState();
      const res = await fetch(`${API_BASE}/submissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const txt = await res.text();
        alert('Save failed: ' + txt);
        btn.disabled = false; btn.textContent = 'Submit';
        return;
      }

      const { id } = await res.json();
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id, payload }));
      window.location.href = `./print.html?id=${encodeURIComponent(id)}`;
    } catch (e) {
      alert('Network error: ' + e.message);
      const btn = document.getElementById('submitBtn');
      if (btn) { btn.disabled = false; btn.textContent = 'Submit'; }
    }
  }

  // wire + init
  document.getElementById('addBtn').addEventListener('click', addCourse);
  document.getElementById('resetBtn').addEventListener('click', resetAll);
  document.getElementById('printBtn').addEventListener('click', () => window.print());
  document.getElementById('submitBtn').addEventListener('click', onSubmit);
  document.getElementById('studentName').addEventListener('input', (e)=>{ state.studentName = e.target.value; renderStats(); });
  document.getElementById('countrySelect').addEventListener('change', (e)=>{ state.country = e.target.value; render(); });

  // --- Floating disclaimer (show once, hide for 30 days when dismissed) ---
function initDisclaimer(){
  const box = document.getElementById('disclaimer');
  const btn = document.getElementById('dismissDisclaimer');
  if (!box || !btn) return;

  // Show unless dismissed in the last 30 days
  try {
    const last = Number(localStorage.getItem('disclaimerDismissedAt') || 0);
    // const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
    // if (!last || (Date.now() - last) > THIRTY_DAYS) {
    //   box.style.display = 'block';
    // }
  } catch { box.style.display = 'block'; }

  btn.addEventListener('click', () => {
    box.style.display = 'none';
    try { localStorage.setItem('disclaimerDismissedAt', String(Date.now())); } catch {}
  });
}
// Call it once on load
initDisclaimer();

  render();
})();
