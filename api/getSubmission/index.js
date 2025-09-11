const sql = require("mssql");
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

module.exports = async function (context, req) {
  try {
    const id = context.bindingData.id;
    if (!id || !/^[0-9a-fA-F-]{36}$/.test(id)) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "invalid id" } };
      return;
    }
    const pool = await getPool();

    // Get the submission (for student + country)
    const rSub = await pool.request()
      .input("Id", sql.UniqueIdentifier, id)
      .query(`
        SELECT Id,
               StudentName AS studentName,
               Country     AS country,
               ScaleLegend AS scaleLegend,
               CreatedAt
        FROM dbo.Submissions
        WHERE Id=@Id
      `);

    if (rSub.recordset.length === 0) {
      context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "not found" } };
      return;
    }
    const sub = rSub.recordset[0];

    // Consolidated courses for this student (no duplicates)
    const studentKey = (sub.studentName || '').trim().toLowerCase() + '|' + (sub.country || '').trim().toLowerCase();
    const rCourses = await pool.request()
      .input("StudentKey", sql.NVarChar(256), studentKey)
      .query(`
        SELECT Title AS title, Unit AS unit, Score AS score
        FROM dbo.Courses
        WHERE StudentKey=@StudentKey
        ORDER BY Title
      `);

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        id: sub.Id,
        studentName: sub.studentName,
        country: sub.country,
        scaleLegend: sub.scaleLegend,
        courses: rCourses.recordset
      }
    };
  } catch (err) {
    context.log.error("getSubmission error", err);
    const message = err?.originalError?.info?.message || err?.message || "server error";
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: message } };
  }
};
