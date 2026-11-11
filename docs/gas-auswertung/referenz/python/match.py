import csv,os,re,collections as C,statistics as S
from datetime import datetime as DT,timedelta as TD
H=os.path.expanduser('~/work/')
P=lambda s:DT.strptime(s,'%d.%m.%Y')
tours=[]
for l in open(H+'touren.txt',encoding='utf-8'):
    d,e,b,t,kg,n=l.rstrip('\n').split(';')
    if e=='STORNO':continue
    m=re.search(r'(Luis|Louis|Axel|Male|Klaus|Domi)',b,re.I);fa=m.group(1).capitalize().replace('Louis','Luis') if m else '?'
    tours.append(dict(datum=d,terminal=t,bez=b,fahrer=fa,plan_kg=float(kg),plan_best=int(n)))
r=list(csv.DictReader(open(H+'positionen.csv'),delimiter=';'))
for x in r:x['kg']=float(x['kg']);x['voll']=int(x['voll'])
L={'125001','125218','125222'}
days=C.defaultdict(list)
for x in r:days[(x['terminal'],x['datum'])].append(x)
tkey={(t['terminal'],t['datum']):t for t in tours}
# Touren ohne Belege am selben Tag: +-3 Tage suchen
used=set(tkey);shift=[]
for t in tours:
    k=(t['terminal'],t['datum'])
    if k in days:continue
    for dd in (1,-1,2,-2,3,-3):
        k2=(t['terminal'],(P(t['datum'])+TD(days=dd)).strftime('%d.%m.%Y'))
        if k2 in days and k2 not in used: used.add(k2);tkey[k2]=t;shift.append((t['bez'],t['terminal'],t['datum'],'->',k2[1]));break
    else: shift.append((t['bez'],t['terminal'],t['datum'],'KEINE BELEGE'))
for x in r:
    k=(x['terminal'],x['datum'])
    if x['kunde'] in L: x['art']='Lager-Account'
    elif x['terminal']=='6444': x['art']='Lager-PC (6444)'
    elif k in tkey: x['art']='Tour';x['tour']=tkey[k]['bez']
    else: x['art']='Tablet ohne Tour'
with open(H+'positionen_klassifiziert.csv','w',newline='') as fh:
    w=csv.writer(fh,delimiter=';');w.writerow(['terminal','kunde','typ','beleg','datum','produkt','voll','leer','kg','art','tour'])
    for x in r:w.writerow([x['terminal'],x['kunde'],x['typ'],x['beleg'],x['datum'],x['produkt'],x['voll'],x['leer'],str(x['kg']).replace('.',','),x['art'],x.get('tour','')])
print('Verschobene/ungematchte Touren:');[print(' ',s) for s in shift]
a=C.defaultdict(lambda:[set(),0.0,0]);
for x in r:a[x['art']][0].add(x['beleg']);a[x['art']][1]+=x['kg'];a[x['art']][2]+=x['voll']
tot=sum(v[1] for v in a.values())
for k,v in a.items():print(f'{k:18} Belege {len(v[0]):5} kg {v[1]:8.0f} ({v[1]/tot*100:4.1f} %) volle Fl. {v[2]}')
# Tour-Stopps
st=C.defaultdict(float);tt=C.defaultdict(set)
for x in r:
    if x['art']=='Tour':st[(x['terminal'],x['datum'],x['kunde'])]+=x['kg'];tt[(x['terminal'],x['datum'])].add(x['kunde'])
nt=len(tt);print('Touren mit Belegen',nt,'Stopps',len(st),'Ø Stopps/Tour',round(len(st)/nt,1),'Median',S.median(len(v) for v in tt.values()))
tkg=[sum(st[(t,d,k)] for k in ks) for (t,d),ks in tt.items()];print('kg/Tour netto Ø',round(S.mean(tkg)),'Median',S.median(tkg))
kgs=sorted(st.values());T=sum(kgs);print('kg/Stopp Ø',round(S.mean(kgs),1),'Median',S.median(kgs))
for a_,b_ in [(-1e9,0.01),(0.01,25),(25,50),(50,100),(100,200),(200,500),(500,1e9)]:
    s=[k for k in kgs if a_<=k<b_];print(f'  {a_:>6.0f}-{b_:<6.0f} kg: {len(s):4} Stopps ({len(s)/len(kgs)*100:3.0f} %), {sum(s):7.0f} kg ({sum(s)/T*100:3.0f} %)')
cu=C.defaultdict(lambda:[0,0.0])
for (t,d,k),kg in st.items():cu[k][0]+=1;cu[k][1]+=kg
print('Tourkunden',len(cu),' mit nur 1 Lieferung',sum(1 for v in cu.values() if v[0]==1),' Ø<25kg/Stopp',sum(1 for v in cu.values() if v[1]/v[0]<25))
cs=sorted(cu.values(),key=lambda v:-v[1]);print(' Top20 Kunden kg-Anteil',round(sum(v[1] for v in cs[:20])/T*100),'%')
fa=C.Counter(t['fahrer'] for t in tours);print('Touren je Fahrer',dict(fa))
wd=C.Counter(P(t['datum']).strftime('%a') for t in tours);print('Wochentage',dict(wd))
# Tablet ohne Tour: welche Kunden/Typ
o=[x for x in r if x['art']=='Tablet ohne Tour'];print('Ohne Tour Typen',C.Counter(x['typ'] for x in o),'Tage',len({(x['terminal'],x['datum']) for x in o}))
