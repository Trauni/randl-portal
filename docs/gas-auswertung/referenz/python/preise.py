import csv,os,collections as C
from datetime import datetime as DT
D=os.path.expanduser('~/mnt/Gas-Preis-Analyse 2026/Auswertung/')
cur={'5909040':26.89,'5909070':28.89,'5920050':515,'5920100':150,'5920200':255,'7801000':14.97,'7801050':18.48,'7801100':30.80,'7801200':30.80,'7801250':30.80,'7801300':98.30,'7801800':14.97,'7802000':35.13,'7802010':37.22,'T001':64.20,'T002':48.15,'T003':64.20,'T004':42.80,'T005':48.15,'T006':26.07,'T007':64.20,'T010':58.85,'T011':74.90,'T012':96.30,'T015':64.20,'T016':48.15,'T017':90.95,'T020':48.15,'T021':42.80,'T022':69.55,'T030':90.95,'T031':69.55,'T032':481.50,'T033':80.25,'T035':75.00,'T036':75.00,'T037':95.00}
# Preis vor erster Änderung + Änderungsdaten
chg={'7801000':[('2026-10-13',14.27)],'7801050':[('2026-10-13',17.36)],'7801100':[('2026-10-13',29.26)],'7801200':[('2026-10-13',29.26)],
'7801250':[('2026-10-06',27.17),('2026-10-13',29.26)],'7801300':[('2026-10-13',93.68)],'7801800':[('2026-10-13',14.27)],
'7802000':[('2026-10-06',31.50),('2026-10-13',33.59)],'7802010':[('2026-10-06',31.50),('2026-10-13',35.68)],
'T002':[('2026-10-07',45.00)],'T003':[('2026-10-07',70.00)],'T004':[('2026-10-07',40.00)],'T005':[('2026-10-07',45.00)],'T006':[('2026-10-07',24.36)],
'T012':[('2026-10-07',94.30)],'T022':[('2026-10-07',48.15)],'T030':[('2026-10-07',85.00)],'T031':[('2026-10-07',65.00)],'T032':[('2026-10-07',450.00)],'T033':[('2026-10-07',75.00)]}
def preis(p,d):
    iso=DT.strptime(d,'%d.%m.%Y').strftime('%Y-%m-%d')
    for dt,old in chg.get(p,[]):
        if iso<dt:return old
    return cur.get(p)
r=list(csv.DictReader(open(D+'positionen_klassifiziert_2026.csv'),delimiter=';'))
miss=C.Counter()
for x in r:
    pr=preis(x['produkt'],x['datum'])
    if pr is None: miss[x['produkt']]+=int(x['voll']);pr=0
    x['preis']=pr;x['umsatz']=pr*int(x['voll'])
print('ohne Preis:',dict(miss))
with open(D+'positionen_umsatz_2026.csv','w',newline='') as fh:
    w=csv.writer(fh,delimiter=';');w.writerow(list(r[0].keys()))
    for x in r:w.writerow([str(v).replace('.',',') if k in('preis','umsatz') else v for k,v in x.items()])
a=C.defaultdict(float)
for x in r:a[x['art']]+=x['umsatz']
T=sum(a.values());print('Umsatz Liste netto gesamt',round(T),{k:round(v) for k,v in a.items()})
g=C.defaultdict(lambda:[0,0.0])
def grp(p):
    if p in('7801200','7801100','7801250'):return '11 kg Propan'
    if p in('7802000','7802010'):return '11 kg Treibgas'
    if p=='7801300':return '33 kg'
    if p in('7801000','7801800','7801050'):return '5/8 kg'
    if p.startswith('5909'):return 'Campingaz'
    if p in('T001','T007'):return 'Biergas'
    if p in('T002','T003','T004','T005','T006'):return 'CO2'
    if p.startswith('5920'):return 'Helium'
    if p.startswith('T'):return 'Techn. Gase'
    return 'Sonst.'
for x in r:k=grp(x['produkt']);g[k][0]+=int(x['voll']);g[k][1]+=x['umsatz']
for k,v in sorted(g.items(),key=lambda i:-i[1][1]):print(f'  {k:15} Fl {v[0]:5} Umsatz {v[1]:9.0f} ({v[1]/T*100:4.1f} %)')
