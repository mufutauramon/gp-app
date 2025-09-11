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

function norm(s) { return String(s || '').trim().toLowerCase(); }
function normCode(s) {
  // letters+digits only for the key (BIO 101 -> bio101, CS-201 -> cs201)
  return norm(s).replace(/[^a-z0-9]/g, '');
}

function makeFingerprint({ studentName = "", country = "nigeria", courses = [] }) {
  const normed = {
    studentName: norm(studentName),
    country: norm(country),
    courses: (courses || []).map(c => ({
      title: norm(c.title),
      code: normCode(c.courseCode),
      unit: Number(c.unit) || 0,
      score: Number(c.score) || 0
    })).sort((a,b)=>{
      // stable order by (code||title), then unit, score
      const ka = a.code || a.title, kb = b.code || b.title;
      const t = ka.localeCompare(kb); if (t) return t;
      if (a.unit !== b.unit) return a.unit - b.unit;
      return a.score - b.score;
    })
  };
  return crypto.createHash("sha256").update(JSON.stringify(normed)).digest("hex");
}

async function aliasToCanonical(pool, aliasKey) {
  if (!aliasKey) return null;
  const r = await pool.request()
    .input("AliasKey", sql.NVarChar(256), aliasKey)
    .query("SELECT TOP 1 CanonicalKey, CanonicalCode, CanonicalTitle FROM dbo.CourseAliases WHERE AliasKey=@AliasKey");
  return r.recordset.length ? r.recordset[0] : null;
}

module.exports = async function (context, req) {
  try {
    const { studentName = "", country = "nigeria", scaleLegend = "", universityName = "", universityLogoUrl = "", courses } = req.body || {};

    // Basic validation
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
      if (!String(c?.title || "").trim() && !String(c?.courseCode || "").trim()) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "each course needs a title or code" } };
        return;
      }
      if (!(Number(c.unit) > 0)) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "unit must be > 0" } }; return; }
      if (!(Number(c.score) >= 0 && Number(c.score) <= 100)) { context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "score must be 0–100" } }; return; }
      const key = `${normCode(c.courseCode) || norm(c.title)}|${Number(c.unit)||0}|${Number(c.score)||0}`;
      if (dupeCheck.has(key)) { context.res = { status: 409, headers:{'Content-Type':'application/json'}, body:{ error:'duplicate courses in request' } }; return; }
      dupeCheck.add(key);
    }

    const pool = await getPool();

    // Whole submission dedupe (same student+country+exact same set)
    const fingerprint = makeFingerprint({ studentName, country, courses });
    const r0 = await pool.request()
      .input("Fingerprint", sql.NVarChar(64), fingerprint)
      .query("SELECT TOP 1 Id FROM dbo.Submissions WHERE Fingerprint=@Fingerprint");
    if (r0.recordset.length) {
      const existingId = r0.recordset[0].Id;
      const studentKey = norm(studentName) + '|' + norm(country);
      const rAgg = await pool.request()
        .input("StudentKey", sql.NVarChar(256), studentKey)
        .query(`SELECT Title as title, CourseCode as courseCode, Unit as unit, Score as score
                FROM dbo.Courses WHERE StudentKey=@StudentKey ORDER BY Title`);
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {
          id: existingId, studentName, country, scaleLegend,
          universityName, universityLogoUrl,
          courses: rAgg.recordset,
          added: [], updated: []
        }
      };
      return;
    }

    // Insert submission + UPSERT courses per student by DedupKey (CodeKey preferred)
    const tx = new sql.Transaction(pool);
    await tx.begin();
    const added = [];
    const updated = [];
    try {
      const r1 = await new sql.Request(tx)
        .input("StudentName", sql.NVarChar(200), studentName)
        .input("Country", sql.NVarChar(50), country)
        .input("ScaleLegend", sql.NVarChar(400), scaleLegend)
        .input("UniversityName", sql.NVarChar(200), universityName || null)
        .input("UniversityLogoUrl", sql.NVarChar(512), universityLogoUrl || null)
        .input("Fingerprint", sql.NVarChar(64), fingerprint)
        .query(`
          INSERT INTO dbo.Submissions (StudentName, Country, ScaleLegend, UniversityName, UniversityLogoUrl, Fingerprint)
          OUTPUT inserted.Id
          VALUES (@StudentName, @Country, @ScaleLegend, @UniversityName, @UniversityLogoUrl, @Fingerprint);
        `);

      const submissionId = r1.recordset[0].Id;
      const studentKey = norm(studentName) + '|' + norm(country);

      for (const c of courses) {
        const titleRaw = String(c.title || '');
        const codeRaw  = String(c.courseCode || '');
        const unit  = Number(c.unit) || 0;
        const score = Number(c.score) || 0;

        const titleKey0 = norm(titleRaw);
        const codeKey   = normCode(codeRaw);

        // Alias mapping: prefer alias on title, fall back to codeKey
        let titleKey = titleKey0;
        if (titleKey0) {
          const ali = await aliasToCanonical(pool, titleKey0);
          if (ali && ali.CanonicalKey) {
            titleKey = ali.CanonicalKey; // fold to canonical
          }
        }
        const dedupKey = codeKey || titleKey;

        // Was there an existing row for this student+course?
        const rOld = await new sql.Request(tx)
          .input("StudentKey", sql.NVarChar(256), studentKey)
          .input("DedupKey", sql.NVarChar(256), dedupKey)
          .query(`SELECT TOP 1 Id, Title, CourseCode, Unit, Score
                  FROM dbo.Courses
                  WHERE StudentKey=@StudentKey AND DedupKey=@DedupKey`);

        if (rOld.recordset.length) {
          const row = rOld.recordset[0];
          const changed = (row.Unit !== unit) || (row.Score !== score) || (row.Title !== titleRaw) || (row.CourseCode !== codeRaw);
          await new sql.Request(tx)
            .input("StudentKey", sql.NVarChar(256), studentKey)
            .input("DedupKey", sql.NVarChar(256), dedupKey)
            .input("SubmissionId", sql.UniqueIdentifier, submissionId)
            .input("Title", sql.NVarChar(200), titleRaw || row.Title)
            .input("CourseCode", sql.NVarChar(100), codeRaw || row.CourseCode)
            .input("Unit", sql.Int, unit)
            .input("Score", sql.Int, score)
            .input("TitleKey", sql.NVarChar(256), titleKey || row.TitleKey)
            .input("CodeKey", sql.NVarChar(256), codeKey || row.CodeKey)
            .query(`
              UPDATE dbo.Courses
                 SET Title=@Title, CourseCode=@CourseCode, Unit=@Unit, Score=@Score,
                     SubmissionId=@SubmissionId, TitleKey=@TitleKey, CodeKey=@CodeKey
               WHERE StudentKey=@StudentKey AND DedupKey=@DedupKey;
            `);
          if (changed) {
            updated.push({
              title: row.Title, courseCode: row.CourseCode,
              oldUnit: row.Unit, oldScore: row.Score,
              newTitle: titleRaw, newCode: codeRaw,
              newUnit: unit, newScore: score
            });
          }
        } else {
          await new sql.Request(tx)
            .input("SubmissionId", sql.UniqueIdentifier, submissionId)
            .input("Title", sql.NVarChar(200), titleRaw)
            .input("CourseCode", sql.NVarChar(100), codeRaw || null)
            .input("Unit", sql.Int, unit)
            .input("Score", sql.Int, score)
            .input("StudentKey", sql.NVarChar(256), studentKey)
            .input("TitleKey", sql.NVarChar(256), titleKey || null)
            .input("CodeKey", sql.NVarChar(256), codeKey || null)
            .query(`
              INSERT INTO dbo.Courses (SubmissionId, Title, CourseCode, Unit, Score, StudentKey, TitleKey, CodeKey)
              VALUES (@SubmissionId, @Title, @CourseCode, @Unit, @Score, @StudentKey, @TitleKey, @CodeKey);
            `);
          added.push({ title: titleRaw, courseCode: codeRaw, unit, score });
        }
      }

      await tx.commit();

      // Return consolidated courses for the student + change summary
      const rAgg = await pool.request()
        .input("StudentKey", sql.NVarChar(256), studentKey)
        .query(`SELECT Title as title, CourseCode as courseCode, Unit as unit, Score as score
                FROM dbo.Courses WHERE StudentKey=@StudentKey ORDER BY Title`);

      context.res = {
        status: 201,
        headers: { "Content-Type": "application/json" },
        body: {
          id: submissionId, studentName, country, scaleLegend,
          universityName, universityLogoUrl,
          courses: rAgg.recordset,
          added, updated
        }
      };
    } catch (err) {
      await tx.rollback();
      // If fingerprint uniqueness raced, return existing record
      if (err && (err.number === 2627 || err.number === 2601)) {
        const r = await pool.request()
          .input("Fingerprint", sql.NVarChar(64), fingerprint)
          .query("SELECT TOP 1 Id FROM dbo.Submissions WHERE Fingerprint=@Fingerprint");
        if (r.recordset.length) {
          const existingId = r.recordset[0].Id;
          const studentKey = norm(studentName) + '|' + norm(country);
          const rAgg = await pool.request()
            .input("StudentKey", sql.NVarChar(256), studentKey)
            .query(`SELECT Title as title, CourseCode as courseCode, Unit as unit, Score as score
                    FROM dbo.Courses WHERE StudentKey=@StudentKey ORDER BY Title`);
          context.res = {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: {
              id: existingId, studentName, country, scaleLegend,
              universityName, universityLogoUrl,
              courses: rAgg.recordset,
              added: [], updated: []
            }
          };
          return;
        }
      }
      throw err;
    }
  } catch (err) {
    context.log.error("submissions error", err);
    const message = err?.originalError?.info?.message || err?.message || "server error";
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: message } };
  }
};
