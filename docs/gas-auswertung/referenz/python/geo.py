import csv,json,os,re,time,urllib.request,urllib.parse
D=os.path.expanduser('~/mnt/Gas-Preis-Analyse 2026/Auswertung/');W=os.path.expanduser('~/work/')
SER={'f4abe6ee','86cbe037','6044e23d','7db82ee2','58cadadf','15f4a4cb','31fe7929','0e7213b9','184ecfc6'}
dup={'10044','10033','10212','10208','10215','10040','10004','10127','10039'}
a=[x for x in csv.DictReader(open(D+'gas_adressen.csv'),delimiter=';') if x['customer_id']]
a=[x for x in a if x['kunde'] not in dup or x['customer_id'][:8] in SER]
ls={}
for x in csv.DictReader(open(D+'gas_lieferstellen.csv'),delimiter=';'):
    if x['strasse'] in ('','NULL') or x['ort'] in ('','NULL'):continue
    ls.setdefault(x['customer_number'].split('/')[0],[]).append(x)
cache=json.load(open(W+'geocache.json')) if os.path.exists(W+'geocache.json') else {}
def q(s):
    if s in cache:return cache[s]
    url='https://nominatim.openstreetmap.org/search?'+urllib.parse.urlencode({'q':s,'format':'json','limit':1,'countrycodes':'de,at'})
    req=urllib.request.Request(url,headers={'User-Agent':'randl-gasanalyse/1.0 (intern)'})
    try:r=json.load(urllib.request.urlopen(req,timeout=20))
    except Exception as e:r=[]
    cache[s]=[r[0]['lat'],r[0]['lon']] if r else None
    json.dump(cache,open(W+'gc.tmp','w'));os.replace(W+'gc.tmp',W+'geocache.json');time.sleep(1.1);return cache[s]
norm=lambda s:re.sub(r'([a-zäöüß.])(\d)',r'\1 \2',s or '',flags=re.I).strip()
out=[['LAGER','Lager','Rankhamerweg 15','83093','Bad Endorf (Hemhof)']+list(q('Rankhamerweg 15, 83093 Bad Endorf') or ['',''])+['Adresse']]
for x in a:
    src='Rechnung';st,pl,ot=x['strasse'],x['plz'],x['ort']
    if len(ls.get(x['kunde'],[]))==1:
        l=ls[x['kunde']][0];st,pl,ot=l['strasse'],l['plz'],l['ort'];src='Lieferstelle'
    lat,lon,prec=x['latitude'],x['longitude'],'DB'
    if src=='Lieferstelle' or not lat:
        ot=ot.split('/')[0].strip().replace('Pruting','Prutting').replace('a. Ch.','am Chiemsee').replace('a.Ch.','am Chiemsee')
        r=q(f"{norm(st)}, {pl} {ot}") if st else None;prec='Adresse'
        if not r and pl: r=q(f"{pl} {ot}");prec='PLZ/Ort'
        if r and abs(float(r[0])-47.91)>0.45: r=None
        if not r and pl: r=q(f"{pl}, Deutschland");prec='PLZ'
        if not r and ot: r=q(f"{ot}, Bayern");prec='Ort'
        lat,lon=(r if r else ('',''));prec=prec if r else 'fehlt'
    out.append([x['kunde'],src,st,pl,ot,lat,lon,prec])
with open(D+'kunden_geo_2026.csv','w',newline='') as fh:
    w=csv.writer(fh,delimiter=';');w.writerow(['kunde','quelle','strasse','plz','ort','lat','lon','genauigkeit']);w.writerows(out)
print('fertig',len(out))
