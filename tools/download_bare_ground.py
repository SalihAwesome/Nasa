import requests,rasterio,numpy as np,hashlib
from pathlib import Path
url='https://zenodo.org/records/3939050/files/PROBAV_LC100_global_v3.0.1_2019-nrt_Bare-CoverFraction-layer_EPSG-4326.tif'
p=Path('data/raw/terrain/bare.tif'); p.parent.mkdir(parents=True,exist_ok=True)
if not p.exists():
 prefix=p.with_suffix('.download')
 size=prefix.stat().st_size if prefix.exists() else 0
 total=3204609492
 from concurrent.futures import ThreadPoolExecutor, as_completed
 def part(start):
  end=min(start+64*1024*1024,total)-1
  file=p.with_suffix('.segment-'+str(start))
  if file.exists() and file.stat().st_size==end-start+1:return file
  with requests.get(url+'?download=1&segment='+str(start),headers={'Range':f'bytes={start}-{end}','Accept-Encoding':'identity'},stream=True,timeout=(30,120)) as response:
   response.raise_for_status()
   if response.status_code!=206 or not response.headers.get('Content-Range','').startswith(f'bytes {start}-{end}/'):raise ValueError('Incorrect range response')
   with file.open('wb') as f:
    for chunk in response.iter_content(4*1024*1024):f.write(chunk)
  if file.stat().st_size!=end-start+1:raise ValueError('Incomplete segment')
  return file
 starts=list(range(size,total,64*1024*1024))
 with ThreadPoolExecutor(max_workers=6) as executor:
  for i,result in enumerate(as_completed([executor.submit(part,start) for start in starts])):
   result.result();print('Bare-ground segments',i+1,'/',len(starts),flush=True)
 import shutil
 with p.open('wb') as f:
  if prefix.exists():
   with prefix.open('rb') as source:shutil.copyfileobj(source,f)
  for start in starts:
   with p.with_suffix('.segment-'+str(start)).open('rb') as source:shutil.copyfileobj(source,f)
print('Checking published MD5',flush=True)
if hashlib.file_digest(p.open('rb'),'md5').hexdigest()!='f2c9432c37ced7af02b6d9207036c2dc':raise ValueError('Bare-ground checksum mismatch')
with rasterio.Env(GDAL_CACHEMAX=64*1024*1024):
 with rasterio.open(p) as src:
  if (src.width,src.height)!=(362880,141120):raise ValueError('Unexpected cover grid dimensions')
  values=np.full((280,720),255,dtype=np.float32)
  for row in range(280):
   block=src.read(1,window=rasterio.windows.Window(0,row*504,362880,504))
   valid=block!=255
   block[~valid]=0
   sums=block.reshape(504,720,504).sum(axis=(0,2),dtype=np.uint64)
   counts=valid.reshape(504,720,504).sum(axis=(0,2),dtype=np.uint64)
   values[row]=np.divide(sums,counts,out=np.full(720,255.),where=counts>0)
   if row%10==0:print('Bare-ground reduction',row+1,'/ 280 latitude strips',flush=True)
  np.savez_compressed('data/raw/terrain/bare.npz',values=values,bounds=list(src.bounds),nodata=255)
  print(values.shape,values[values!=255].min(),values[values!=255].max(),int((values==255).sum()),flush=True)
