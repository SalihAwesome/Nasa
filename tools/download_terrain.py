import requests,json
from pathlib import Path
r=Path('data/raw/terrain')
files={'moon.tif':'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_4.tif','mars.lbl':'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg004/megt90n000cb.lbl','mars.img':'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg004/megt90n000cb.img','earth.nc':'https://oceanwatch.aoml.noaa.gov/erddap/griddap/etopo180.nc?altitude[0:6:10800][0:6:21600]'}
for name,url in files.items():
 if (r/name).exists():continue
 response=requests.get(url,timeout=180);response.raise_for_status();(r/name).write_bytes(response.content);print(name,len(response.content),flush=True)
print((r/'mars.lbl').read_text())
