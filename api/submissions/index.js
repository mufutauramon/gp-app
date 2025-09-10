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
        // deterministic order: title, then unit, then score
        const ta = a.title.localeCompare(b.title);
        if (ta) return ta;
        if (a.unit !== b.unit) return a.unit - b.unit;
        return a.score - b.score;
      })
  };
  const json = JSON.stringify(norm);
  return crypto.createHash("sha256").update(json).digest("hex");
}

module.exports = async function (context, req) {
  try {
    const { studentName = "", country = "nigeria", scaleLegend = "", courses } = req.body || {};

    // Basic validation
    if (!Array.isArray(courses) || courses.length === 0) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "courses must be a non-empty array" } };
      return;
    }
    for (const c of courses) {
      if (!String(c?.title || "").trim()) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "title required" } };
        return;
      }
      if (!(Number(c.unit) > 0)) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "unit must be > 0" } };
        return;
      }
      if (!(Number(c.score) >= 0 && Number(c.score) <= 100)) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "score must be 0–100" } };
        return;
      }
    }

    const fingerprint = makeFingerprint({ studentName, country, courses });
    const pool = await getPool();

    // If fingerprint already exists, return existing id (no duplicate)
    const r0 = await pool.request()
      .input("Fingerprint", sql.NVarChar(64), fingerprint)
      .query("SELECT TOP 1 Id FROM dbo.Submissions WHERE Fingerprint=@Fingerprint");
    if (r0.recordset.length) {
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { id: r0.recordset[0].Id, duplicate: true } };
      return;
    }

    // Insert new within a transaction
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

      const id = r1.recordset[0].Id;

      for (const c of courses) {
        await new sql.Request(tx)
          .input("SubmissionId", sql.UniqueIdentifier, id)
          .input("Title", sql.NVarChar(200), String(c.title || ""))
          .input("Unit", sql.Int, Number(c.unit) || 0)
          .input("Score", sql.Int, Number(c.score) || 0)
          .query(`
            INSERT INTO dbo.Courses (SubmissionId, Title, Unit, Score)
            VALUES (@SubmissionId, @Title, @Unit, @Score);
          `);
      }

      await tx.commit();
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { id, duplicate: false } };
    } catch (err) {
      await tx.rollback();
      // Handle race: unique index collision -> return existing id
      if (err && (err.number === 2627 || err.number === 2601)) {
        const r = await pool.request()
          .input("Fingerprint", sql.NVarChar(64), fingerprint)
          .query("SELECT TOP 1 Id FROM dbo.Submissions WHERE Fingerprint=@Fingerprint");
        if (r.recordset.length) {
          context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { id: r.recordset[0].Id, duplicate: true } };
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
