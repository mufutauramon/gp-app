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
    const { studentName = "", country = "nigeria", scaleLegend = "", courses } = req.body || {};
    if (!Array.isArray(courses) || courses.length === 0) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "courses must be a non-empty array" } };
      return;
    }

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();

    try {
      const r1 = await new sql.Request(tx)
        .input("StudentName", sql.NVarChar(200), studentName)
        .input("Country", sql.NVarChar(50), country)
        .input("ScaleLegend", sql.NVarChar(400), scaleLegend)
        .query(`
          insert into dbo.Submissions (StudentName, Country, ScaleLegend)
          output inserted.Id
          values (@StudentName, @Country, @ScaleLegend);
        `);

      const id = r1.recordset[0].Id;

      for (const c of courses) {
        await new sql.Request(tx)
          .input("SubmissionId", sql.UniqueIdentifier, id)
          .input("Title", sql.NVarChar(200), String(c.title || ""))
          .input("Unit", sql.Int, Number(c.unit) || 0)
          .input("Score", sql.Int, Number(c.score) || 0)
          .query(`
            insert into dbo.Courses (SubmissionId, Title, Unit, Score)
            values (@SubmissionId, @Title, @Unit, @Score);
          `);
      }

      await tx.commit();
      context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { id } };
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  } catch (err) {
    context.log.error("submissions error", err);
    const message = err?.originalError?.info?.message || err?.message || "server error";
    const code = err?.code || err?.originalError?.info?.number || undefined;
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: message, code } };
  }
};
