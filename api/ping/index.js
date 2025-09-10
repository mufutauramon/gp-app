let sql;
module.exports = async function (context, req) {
  try {
    try { sql = sql || require("mssql"); }
    catch (e) {
      context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "mssql module not installed", detail: String(e) } };
      return;
    }

    if (!process.env.SQL_CONNECTION) {
      context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "SQL_CONNECTION not set on Static Web App" } };
      return;
    }

    context._pool = context._pool || await new sql.ConnectionPool(process.env.SQL_CONNECTION).connect();
    const r = await context._pool.request().query("select cast(1 as int) as ok");
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { ok: r.recordset[0].ok } };
  } catch (e) {
    context.log.error(e);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: String(e) } };
  }
};
