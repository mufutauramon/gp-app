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

    // alias columns to camelCase the frontend expects
    const rSub = await pool.request()
      .input("Id", sql.UniqueIdentifier, id)
      .query(`
        select
          Id,
          StudentName as studentName,
          Country     as country,
          ScaleLegend as scaleLegend,
          CreatedAt
        from dbo.Submissions
        where Id=@Id
      `);

    if (rSub.recordset.length === 0) {
      context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "not found" } };
      return;
    }
    const sub = rSub.recordset[0];

    const rCourses = await pool.request()
      .input("SubmissionId", sql.UniqueIdentifier, id)
      .query(`
        select
          Title as title,
          Unit  as unit,
          Score as score
        from dbo.Courses
        where SubmissionId=@SubmissionId
        order by Id
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
