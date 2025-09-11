const sql = require("mssql");
const crypto = require("crypto");

let poolPromise;
function getPool() {
  if (!process.env.SQL_CONNECTION) throw new Error("SQL_CONNECTION env var not set on Static Web App");
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(process.env.SQL_CONNECTION)
      .connect()
      .catch(err => { poolPromise = null; throw err; });
  }
  return poolPromise;
}

// fingerprint to avoid exact whole-submission duplicates (optional but kept)
function makeFingerprint({ studentName = "", country = "nigeria", courses = [] }) {
  const clean = (s) => String(s || "").trim().toLowerCase();
  const norm = {
    studentName: clean(studentName),
    country: clean(country),
    courses: (courses || [])
      .map(c => ({
        title: clean(c.title),
        unit: Number(c.unit) || 0,
        score: Number(c.score) || 0
      }))
      .sort((a,b) => {
        const ta = a.title.localeCompare(b.title);
        if (ta) return ta;
        if (a.unit !== b.unit) return a.unit - b.unit;
        return a.score - b.score;
      })
  };
  return crypto.createHash("sha256").update(JSON.stringify(norm)).digest("hex");
}

module.exports = async function (context, req) {
  try {
    const { studentName = "", country = "nigeria", scaleLegend = "", courses } = req.body || {};

    // Validate
    if (!studentName.trim()) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "studentName required" } };
      return;
    }
    if (!Array.isArray(courses) || courses.length === 0) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "courses must be a non-empty array" } };
      return;
    }
    const dupeCheck = new Set();
    for (const c of courses) {
      if (!String(c?.title || "").trim()) { context.res = { status: 400, headers:{'Content-Type':'application/json'}, body:{ error:'title required' } }; return; }
      if (!(Number(c.unit) > 0))       { context.res = { status: 400, headers:{'Content-Type':'application/json'}, body:{ error:'unit must be > 0' } }; return; }
      if (!(Number(c.score) >= 0 && Number(c.score) <= 100)) {
        context.res = { status: 400, headers:{'Content-Type':'application/json'}, body:{ error:'score must be 0–100' } }; return;
      }
      const key = `${String(c.title).trim().toLowerCase()}|${Number(c.unit)||0}|${Number(c.score)||0}`;
      if (dupeCheck.has(key)) { context.res = { status: 409, headers:{'Content-Type':'application/json'}, body:{ error:'duplicate courses in request' } }; return; }
      dupeCheck.add(key);
    }

    const pool = await getPool();

    // Dedup whole submission by fingerprint (optional)
    const fingerprint = makeFingerprint({ studentName, country, courses });
    const r0 = await pool.request()
      .input("Fingerprint", sql.NVarChar(64), fingerprint)
      .query("SELECT TOP 1 Id FROM dbo.Submissions WHERE Fingerprint=@Fingerprint");
    if (r0.recordset.length) {
      const existingId = r0.recordset[0].Id;
      // Return consolidated courses for the student
      const studentKey = (studentName || '').trim().toLowerCase() + '|' + (country || '').trim().toLowerCase();
      const rAgg = await pool.request()
        .input("StudentKey", sql.NVarChar(256), studentKey)
        .query(`SELECT Title as title, Unit as unit, Score as score
                FROM dbo.Courses WHERE StudentKey=@StudentKey ORDER BY Title`);
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: { id: existingId, studentName, country, scaleLegend, courses: rAgg.recordset }
      };
      return;
    }

    // Insert submission + UPSERT courses per student
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const r1 = await new sql.Request(tx)
        .input("StudentName", sql.NVarChar(200), studentName)
        .input("Country", sql.NVarChar(50), country)
        .input("ScaleLegend", sql.NVarChar(400), scaleLegend)
        .input("Fingerprint", sql.NVarChar(64), fingerprint)
        .query(`
          INSERT INTO dbo.Submissions (StudentName, Country, ScaleLegend, Fingerprint)
          OUTPUT inserted.Id
          VALUES (@StudentName, @Country, @ScaleLegend, @Fingerprint);
        `);

      const submissionId = r1.recordset[0].Id;
      const studentKey = (studentName || '').trim().toLowerCase() + '|' + (country || '').trim().toLowerCase();

      for (const c of courses) {
        const title = String(c.title || "").trim();
        const unit  = Number(c.unit) || 0;
        const score = Number(c.score) || 0;
        const titleKey = title.toLowerCase();

        // UPSERT: update if exists for this student+title; else insert new
        await new sql.Request(tx)
          .input("StudentKey", sql.NVarChar(256), studentKey)
          .input("TitleKey", sql.NVarChar(256), titleKey)
          .input("SubmissionId", sql.UniqueIdentifier, submissionId)
          .input("Title", sql.NVarChar(200), title)
          .input("Unit", sql.Int, unit)
          .input("Score", sql.Int, score)
          .query(`
            UPDATE dbo.Courses
               SET Unit=@Unit, Score=@Score, SubmissionId=@SubmissionId
             WHERE StudentKey=@StudentKey AND TitleKey=@TitleKey;

            IF @@ROWCOUNT = 0
            BEGIN
              INSERT INTO dbo.Courses (SubmissionId, Title, Unit, Score, StudentKey, TitleKey)
              VALUES (@SubmissionId, @Title, @Unit, @Score, @StudentKey, @TitleKey);
            END
          `);
      }

      await tx.commit();

      // Return consolidated courses for the student
      const rAgg = await pool.request()
        .input("StudentKey", sql.NVarChar(256), studentKey)
        .query(`SELECT Title as title, Unit as unit, Score as score
                FROM dbo.Courses WHERE StudentKey=@StudentKey ORDER BY Title`);

      context.res = {
        status: 201,
        headers: { "Content-Type": "application/json" },
        body: { id: submissionId, studentName, country, scaleLegend, courses: rAgg.recordset }
      };
    } catch (err) {
      await tx.rollback();
      // If we hit the unique index on Fingerprint concurrently, return existing
      if (err && (err.number === 2627 || err.number === 2601)) {
        const r = await pool.request()
          .input("Fingerprint", sql.NVarChar(64), fingerprint)
          .query("SELECT TOP 1 Id FROM dbo.Submissions WHERE Fingerprint=@Fingerprint");
        if (r.recordset.length) {
          const existingId = r.recordset[0].Id;
          const studentKey = (studentName || '').trim().toLowerCase() + '|' + (country || '').trim().toLowerCase();
          const rAgg = await pool.request()
            .input("StudentKey", sql.NVarChar(256), studentKey)
            .query(`SELECT Title as title, Unit as unit, Score as score
                    FROM dbo.Courses WHERE StudentKey=@StudentKey ORDER BY Title`);
          context.res = {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: { id: existingId, studentName, country, scaleLegend, courses: rAgg.recordset }
          };
          return;
        }
      }
      throw err;
    }
  } catch (err) {
    context.log.error("submissions error", err);
    const message = err?.originalError?.info?.message || err?.message || "server error";
    const code = err?.code || err?.originalError?.info?.number || undefined;
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: message, code } };
  }
};
