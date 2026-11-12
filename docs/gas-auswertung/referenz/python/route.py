import csv,json,os,time,urllib.request,collections as C,statistics as S
D=os.path.expanduser('~/mnt/Gas-Preis-Analyse 2026/Auswertung/');W=os.path.expanduser('~/work/')
g={x['kunde']:(float(x['lon']),float(x['lat'])) for x in csv.DictReader(open(D+'kunden_geo_2026.csv'),delimiter=';') if x['lat']}
L=g.pop('LAGER')
RC=json.load(open(W+'rcache.json')) if os.path.exists(W+'rcache.json') else {}
def get(u):
    if u in RC:return RC[u]
    for i in range(3):
        try:
            r=json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'randl-gasanalyse/1.0'}),timeout=30));time.sleep(1)
            if r.get('code')=='Ok':
                for k_ in ('trips','waypoints'):
                    if k_ in r and k_=='waypoints':r.pop(k_)
                RC[u]=r;json.dump(RC,open(W+'rc.tmp','w'));os.replace(W+'rc.tmp',W+'rcache.json')
            return r
        except Exception as e: time.sleep(3)
    return None
B='https://router.project-osrm.org'
f=lambda p:f"{p[0]:.6f},{p[1]:.6f}"
# 1) Direktentfernung Lager -> Kunde (einfach)
ks=list(g);direkt={}
for i in range(0,len(ks),90):
    part=ks[i:i+90];u=f"{B}/table/v1/driving/{';'.join([f(L)]+[f(g[k]) for k in part])}?sources=0&annotations=distance,duration"
    r=get(u)
    if r and r.get('code')=='Ok':
        for j,k in enumerate(part):direkt[k]=(r['distances'][0][j+1]/1000,r['durations'][0][j+1]/60)
# 2) Touren: optimale Rundreise ab Lager
r=list(csv.DictReader(open(D+'positionen_klassifiziert_2026.csv'),delimiter=';'))
t=C.defaultdict(lambda:{'kunden':C.defaultdict(float),'tour':''})
for x in r:
    if x['art']!='Tour':continue
    k=(x['terminal'],x['datum']);t[k]['tour']=x['tour'];t[k]['kunden'][x['kunde']]+=float(x['kg'].replace(',','.'))
out=[]
for (term,dat),v in sorted(t.items()):
    ku=[k for k in v['kunden'] if k in g];miss=len(v['kunden'])-len(ku)
    pts=[L]+[g[k] for k in ku];km=mins=None
    if len(pts)>1:
        res=get(f"{B}/trip/v1/driving/{';'.join(f(p) for p in pts)}?source=first&roundtrip=true&overview=false")
        if res and res.get('code')=='Ok':km=res['trips'][0]['distance']/1000;mins=res['trips'][0]['duration']/60
    out.append([term,dat,v['tour'],len(v['kunden']),miss,round(sum(v['kunden'].values()),1),round(km,1) if km else '',round(mins) if mins else ''])
with open(D+'touren_km_2026.csv','w',newline='') as fh:
    w=csv.writer(fh,delimiter=';');w.writerow(['terminal','datum','tour','stopps','stopps_ohne_geo','kg_netto','km_optimal','fahrminuten_optimal']);w.writerows(out)
with open(D+'kunden_entfernung_2026.csv','w',newline='') as fh:
    w=csv.writer(fh,delimiter=';');w.writerow(['kunde','km_einfach','min_einfach'])
    for k,(a,b) in sorted(direkt.items()):w.writerow([k,round(a,1),round(b)])
print('fertig',len(out),'Touren',len(direkt),'Kunden')
