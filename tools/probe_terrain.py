import requests,re,json
from pathlib import Path
root=Path('data/raw/terrain');root.mkdir(parents=True,exist_ok=True)
urls={'moon-page':'https://svs.gsfc.nasa.gov/4720/','mars-page':'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg004/','earth-info':'https://oceanwatch.aoml.noaa.gov/erddap/info/etopo180/index.json'}
for key,url in urls.items():
 try:
  r=requests.get(url,timeout=60);print(key,r.status_code,len(r.content));(root/(key+'.txt')).write_bytes(r.content)
  if key=='moon-page':print([x for x in re.findall('href="([^"]+)"',r.text) if 'ldem_4.tif' in x])
  if key=='mars-page':print(re.findall('HREF="([^"]+)"',r.text,re.I))
 except Exception as e:print(key,str(e))
