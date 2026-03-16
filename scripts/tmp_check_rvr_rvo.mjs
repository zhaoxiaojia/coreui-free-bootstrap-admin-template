import pool from '../server/db.mjs'

const run = async () => {
  const [throughput] = await pool.query(`
    SELECT
      p.data_type,
      SUM(p.throughput_avg_mbps IS NOT NULL) AS avg_nonnull,
      SUM(p.throughput_peak_mbps IS NOT NULL) AS peak_nonnull,
      COUNT(*) AS total
    FROM performance p
    GROUP BY p.data_type
    ORDER BY total DESC
  `)
  console.log('throughput_columns', throughput)

  const [rows] = await pool.query(`
    SELECT p.data_type, SUM(LOWER(tc.case_path) LIKE '%rvr%') AS rvr, SUM(LOWER(tc.case_path) LIKE '%rvo%') AS rvo, COUNT(*) AS total
    FROM performance p
    INNER JOIN test_run ex ON ex.id = p.execution_id
    INNER JOIN test_case tc ON tc.id = ex.test_case_id
    GROUP BY p.data_type
    ORDER BY total DESC
  `)
  console.log(rows)

  const [kv] = await pool.query(`
    SELECT
      p.data_type,
      SUM(kv.metric_name = 'throughput') AS kv_throughput,
      SUM(kv.metric_name = 'rssi') AS kv_rssi,
      COUNT(*) AS kv_total
    FROM perf_metric_kv kv
    INNER JOIN performance p ON p.execution_id = kv.execution_id
    GROUP BY p.data_type
    ORDER BY kv_total DESC
  `)
  console.log('kv_by_type', kv)

  const [[counts]] = await pool.query(`
    SELECT
      SUM(LOWER(tc.case_path) LIKE '%rvr%') AS rvr,
      SUM(LOWER(tc.case_path) LIKE '%rvo%') AS rvo
    FROM performance p
    INNER JOIN test_run ex ON ex.id = p.execution_id
    INNER JOIN test_case tc ON tc.id = ex.test_case_id
  `)
  console.log(counts)

  await pool.end()
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
