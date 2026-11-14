# MEDA reference files

The Jezero reference uses sol 300. Run `python pipeline/fetch_meda.py` from the repository root to regenerate the outputs.

The pipeline reads native units from the XML labels. It averages measurements in ten-minute LMST bins and keeps empty bins missing. The D11 reduction settings are in `shared/meda_settings.json`.

| Product | CSV | XML label |
| --- | --- | --- |
| CAL_TIRS | [WE__0300___________CAL_TIRS________________P02.CSV](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_calibrated_env/sol_0300_0419/sol_0300/WE__0300___________CAL_TIRS________________P02.CSV) | [WE__0300___________CAL_TIRS________________P02.xml](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_calibrated_env/sol_0300_0419/sol_0300/WE__0300___________CAL_TIRS________________P02.xml) |
| CAL_ATS | [WE__0300___________CAL_ATS_________________P01.CSV](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_calibrated_env/sol_0300_0419/sol_0300/WE__0300___________CAL_ATS_________________P01.CSV) | [WE__0300___________CAL_ATS_________________P01.xml](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_calibrated_env/sol_0300_0419/sol_0300/WE__0300___________CAL_ATS_________________P01.xml) |
| DER_RHS | [WE__0300___________DER_RHS_________________P01.CSV](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/sol_0300_0419/sol_0300/WE__0300___________DER_RHS_________________P01.CSV) | [WE__0300___________DER_RHS_________________P01.xml](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/sol_0300_0419/sol_0300/WE__0300___________DER_RHS_________________P01.xml) |
| DER_PS | [WE__0300___________DER_PS__________________P01.CSV](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/sol_0300_0419/sol_0300/WE__0300___________DER_PS__________________P01.CSV) | [WE__0300___________DER_PS__________________P01.xml](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/sol_0300_0419/sol_0300/WE__0300___________DER_PS__________________P01.xml) |

Humidity has no unit in its MEDA label. UV and reflectivity stay missing pending the team's decision about how to compare them.
