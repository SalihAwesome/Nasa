# MEDA sol 300 parser fixtures

Downloaded on 14 November 2026 from the MEDA PDS archive. Each CSV preserves
the header and first data record as an exact byte slice of the downloaded
response. Each XML label is the complete downloaded response. Its declared
record count describes the full product, so the excerpt tests read the first
record without treating the excerpt as a complete sol.

The source folders contain the CSV and XML pairs listed below.

- `WE__0300___________CAL_TIRS________________P02`
- `WE__0300___________CAL_ATS_________________P01`

[Calibrated source folder](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_calibrated_env/sol_0300_0419/sol_0300/)

- `WE__0300___________DER_PS__________________P01`
- `WE__0300___________DER_RHS_________________P01`

[Derived source folder](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/sol_0300_0419/sol_0300/)

The raw-data test reads the full downloads under `data/raw/meda/`. It skips
when they are absent. The regular parser checks use these excerpts offline.
Tests that construct edge cases mark their generated CSVs with
`# simulated=true`. Public output generation rejects those simulated rows.
