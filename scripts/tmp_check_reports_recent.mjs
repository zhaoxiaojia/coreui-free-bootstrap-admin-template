import pool from '../server/db.mjs'

const run = async () => {
  const [rows] = await pool.query(`
    SELECT
      p.execution_id AS report_id,
      p.data_type,
      MAX(p.csv_name) AS csv_name,
      MAX(tc.case_path) AS case_path,
      MAX(tc.report_name) AS report_name,
      MAX(p.created_at) AS last_updated_at,
      pr.id AS project_id,
      pr.brand,
      pr.product_line,
      pr.project_name,
      pr.main_chip,
      pr.wifi_module,
      pr.interface,
      pr.ecosystem,
      pr.mass_production_status,
      d.id AS dut_id,
      d.connect_type AS dut_connect_type,
      d.software_version AS dut_software_version,
      d.main_chip AS dut_main_chip,
      d.wifi_module AS dut_wifi_module,
      d.interface AS dut_interface
    FROM performance p
    INNER JOIN test_run ex ON ex.id = p.execution_id
    INNER JOIN test_case tc ON tc.id = ex.test_case_id
    INNER JOIN project pr ON pr.id = tc.project_id
    INNER JOIN dut d ON d.id = ex.dut_id
    GROUP BY
      p.execution_id,
      p.data_type,
      pr.id,
      pr.brand,
      pr.product_line,
      pr.project_name,
      pr.main_chip,
      pr.wifi_module,
      pr.interface,
      pr.ecosystem,
      pr.mass_production_status,
      d.id,
      d.connect_type,
      d.software_version,
      d.main_chip,
      d.wifi_module,
      d.interface
    ORDER BY last_updated_at DESC, report_id DESC
    LIMIT 3
  `)

  console.log(rows)
  await pool.end()
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})

