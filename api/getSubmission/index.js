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
      context.res = { status: 400, jsonBody: { error: "invalid id" } };
      return;
    }
    const pool = await getPool();

    const rSub = await pool.request()
      .input("Id", sql.UniqueIdentifier, id)
      .query(`select Id, StudentName, Country, ScaleLegend, CreatedAt from dbo.Submissions where Id=@Id`);

    if (rSub.recordset.length === 0) {
      context.res = { status: 404, jsonBody: { error: "not found" } };
      return;
    }
    const sub = rSub.recordset[0];

    const rCourses = await pool.request()
      .input("SubmissionId", sql.UniqueIdentifier, id)
      .query(`select Title, Unit, Score from dbo.Courses where SubmissionId=@SubmissionId order by Id`);

    context.res = {
      status: 200,
      jsonBody: {
        id: sub.Id,
        studentName: sub.StudentName,
        country: sub.Country,
        scaleLegend: sub.ScaleLegend,
        courses: rCourses.recordset
      }
    };
  } catch (err) {
    context.log.error("getSubmission error", err);
    const message = err?.originalError?.info?.message || err?.message || "server error";
    context.res = { status: 500, jsonBody: { error: message } };
  }
};
