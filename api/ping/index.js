const sql = require("mssql");

let poolPromise;
function getPool() {
  const cs = process.env.SQL_CONNECTION;
  if (!cs) throw new Error("SQL_CONNECTION env var not set on Static Web App");
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(cs).connect().catch(err => { poolPromise = null; throw err; });
  }
  return poolPromise;
}

module.exports = async function (context, req) {
  try {
    const pool = await getPool();
    const r = await pool.request().query("SELECT DB_NAME() AS db, GETUTCDATE() AS now");
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: r.recordset[0] };
  } catch (err) {
    context.log.error("ping-sql error", err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: err.message || "server error" } };
  }
};
