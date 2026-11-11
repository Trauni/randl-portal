# Flaschenstatistik alle Gase (Tour + Lager): je Artikel, Monat und Kalenderwoche
# Grundlage: positionen_klassifiziert_2026.csv (Terminal-Belege 01.01.-03.11.2026), Bezeichnungen aus "Abrechnung (Flaschen)"
import pandas as pd, numpy as np, json, os, re
D=os.path.expanduser('~/mnt/Gas-Preis-Analyse 2026/Auswertung/'); O=D+'flaschen/'; os.makedirs(O,exist_ok=True)
NAME={'5909040':('R904 Füllung 1,8 kg Campingaz',1.8),'5909070':('R907 Füllung 2,75 kg Campingaz',2.75),'5920100':('Ballongas Typ 10, 1,8 m³',10),'5920200':('Helium Ballongas Füllung 20 L',20),
'7801000':('5-kg Brenngas Camping',5),'7801050':('8-kg Brenngas BBQ-Fla.',8),'7801100':('11-kg Brenngas Camping',11),'7801200':('11-kg Brenngas Pfand',11),'7801250':('11-kg Brenngas ALUGAS',11),
'7801300':('33-kg Brenngas Pfand',33),'7801800':('5-kg Brenngas Pfand',5),'7802000':('11-kg MOTOGAS Pfand',11),'7802010':('11-kg BLUETEC Pfand',11),
'T001':('Biergas 70/30 20 L',20),'T002':('10 kg CO2 Theke Lebensmittel',10),'T003':('20 kg CO2 Lebensmittel',20),'T004':('6 kg CO2 Theke Lebensmittel',6),'T005':('10 kg CO2 Theke Lebensmittel Steigrohr',10),
'T006':('2 kg CO2 Theke Lebensmittel',2),'T007':('Biergas 70/30 50 L',50),'T010':('Argon 4.6 10 L',10),'T011':('Argon 4.6 20 L',20),'T012':('Argon 4.6 50 L',50),'T015':('Arcox18 20 L',2),'T016':('Arcox18 10 L',2),
'T017':('Arcox18 50 L',2),'T020':('Sauerstoff 20 L',20),'T021':('Sauerstoff 10 L',10),'T022':('Sauerstoff 50 L',50),'T030':('Stickstoff 5.0 50 L',50),'T031':('Stickstoff 5.0 10 L',10),'T033':('Stickstoff 5.0 20 L',20),
'T035':('Acetylen 10 L',5),'T036':('Acetylen 20 L',10),'T037':('Acetylen 50 L',25),'T038':('Formiergas 90/10 10 L',10)}
def gasart(a):
    if a.startswith('7801'):return 'Propan'
    if a.startswith('7802'):return 'Propan Treibgas'
    if a.startswith('5909'):return 'Campingaz'
    if a.startswith('5920'):return 'Ballongas/Helium'
    n=int(a[1:])
    return {1:'Biergas',7:'Biergas'}.get(n) or ('CO2' if 2<=n<=6 else 'Argon' if 10<=n<=12 else 'Arcox (Mischgas)' if 15<=n<=17 else 'Sauerstoff' if 20<=n<=22 else 'Stickstoff' if 30<=n<=33 else 'Acetylen' if 35<=n<=37 else 'Formiergas')
def groesse(a,name):
    m=re.search(r'(\d+(?:,\d+)?)[- ]?kg',name) or re.search(r'(\d+) ?L\b',name)
    if not m: return '1,8 m³' if 'm³' in name else '–'
    unit='kg' if 'kg' in m.group(0) else 'L'
    return f"{m.group(1)} {unit}"
ORDER=['Propan','Propan Treibgas','CO2','Biergas','Campingaz','Argon','Arcox (Mischgas)','Sauerstoff','Stickstoff','Acetylen','Formiergas','Ballongas/Helium']
p=pd.read_csv(D+'positionen_klassifiziert_2026.csv',sep=';',dtype=str)
p=p[p.produkt.isin(NAME)].copy()
p['voll']=p.voll.astype(int);p['leer']=p.leer.astype(int)
p['bez']=p.produkt.map(lambda a:NAME[a][0]);p['kg_fl']=p.produkt.map(lambda a:NAME[a][1])
p['gasart']=p.produkt.map(gasart);p['groesse']=[groesse(a,n) for a,n in zip(p.produkt,p.bez)]
KGART={'Propan','Propan Treibgas','CO2','Campingaz'}  # nur hier ist die Füllmenge in kg; technische Gase/Biergas in Liter Flaschenvolumen
p['kg_fl']=p.kg_fl.where(p.gasart.isin(KGART))
p['kg']=p.voll*p.kg_fl
p['d']=pd.to_datetime(p.datum,format='%d.%m.%Y');p['monat']=p.d.dt.strftime('%Y-%m')
iso=p.d.dt.isocalendar();p['kw']=iso.year.astype(str)+'-W'+iso.week.astype(str).str.zfill(2)
p['montag']=(p.d-pd.to_timedelta(p.d.dt.weekday,unit='D')).dt.strftime('%Y-%m-%d')
p['tour']=p.art.eq('Tour')
# volle Wochen: Montag 05.01.2026 bis Sonntag 01.11.2026 (KW 2–44), volle Monate Jan–Okt
WK=pd.date_range('2026-01-05','2026-10-26',freq='7D').strftime('%Y-%m-%d'); NW=len(WK)
MON=[f'2026-{m:02d}' for m in range(1,11)]
w=p[p.montag.isin(WK)].pivot_table(index='produkt',columns='montag',values='voll',aggfunc='sum',fill_value=0).reindex(columns=WK,fill_value=0)
mo=p[p.monat.isin(MON)].pivot_table(index='produkt',columns='monat',values='voll',aggfunc='sum',fill_value=0).reindex(columns=MON,fill_value=0)
art=p.groupby('produkt').agg(bezeichnung=('bez','first'),gasart=('gasart','first'),groesse=('groesse','first'),kg_je_flasche=('kg_fl','first'),
    voll=('voll','sum'),leer=('leer','sum'),kg=('kg','sum'),voll_tour=('voll',lambda x:x[p.loc[x.index,'tour']].sum()))
art['anteil_tour']=(art.voll_tour/art.voll.where(art.voll>0)).round(3)
wv=w.reindex(art.index,fill_value=0)
art['woche_avg']=wv.mean(axis=1).round(2);art['woche_median']=wv.median(axis=1);art['woche_p90']=wv.quantile(.9,axis=1).round(1);art['woche_max']=wv.max(axis=1)
art['wochen_mit_bedarf']=(wv>0).sum(axis=1);art['wochen_gesamt']=NW
mv=mo.reindex(art.index,fill_value=0);art['monat_avg']=mv.mean(axis=1).round(1);art['monat_max']=mv.max(axis=1);art['monat_min']=mv.min(axis=1)
art['sort']=art.gasart.map(ORDER.index);art=art.sort_values(['sort','kg_je_flasche','voll'],ascending=[True,True,False]).drop(columns='sort')
art=art[art.voll>0]
art.index.name='artikel'
art.reset_index().to_csv(O+'flaschen_je_artikel_2026.csv',sep=';',decimal=',',index=False)
# Gasart gesamt
ga=p.groupby('gasart').agg(voll=('voll','sum'),leer=('leer','sum'),kg=('kg','sum'))
gw=p[p.montag.isin(WK)].pivot_table(index='gasart',columns='montag',values='voll',aggfunc='sum',fill_value=0).reindex(columns=WK,fill_value=0)
gkw=p[p.montag.isin(WK)].pivot_table(index='gasart',columns='montag',values='kg',aggfunc='sum',fill_value=0).reindex(columns=WK,fill_value=0)
ga['woche_avg']=gw.mean(axis=1).round(1);ga['woche_p90']=gw.quantile(.9,axis=1).round(1);ga['woche_max']=gw.max(axis=1);ga['kg_woche_avg']=gkw.mean(axis=1).round(0);ga['kg_woche_max']=gkw.max(axis=1)
gm=p[p.monat.isin(MON)].pivot_table(index='gasart',columns='monat',values='voll',aggfunc='sum',fill_value=0).reindex(columns=MON,fill_value=0)
gmk=p[p.monat.isin(MON)].pivot_table(index='gasart',columns='monat',values='kg',aggfunc='sum',fill_value=0).reindex(columns=MON,fill_value=0)
ga['monat_avg']=gm.mean(axis=1).round(1);ga['monat_max']=gm.max(axis=1);ga['kg_monat_avg']=gmk.mean(axis=1).round(0)
ga=ga.loc[[g for g in ORDER if g in ga.index]]
ga.to_csv(O+'flaschen_je_gasart_2026.csv',sep=';',decimal=',')
# Monat und Woche je Artikel (lang)
ml=p[p.monat.isin(MON)].groupby(['monat','produkt','gasart']).agg(voll=('voll','sum'),leer=('leer','sum'),kg=('kg','sum')).reset_index().rename(columns={'produkt':'artikel'})
ml.to_csv(O+'flaschen_monat_2026.csv',sep=';',decimal=',',index=False)
wl=p[p.montag.isin(WK)].groupby(['montag','kw','gasart']).agg(voll=('voll','sum'),kg=('kg','sum')).reset_index()
wl.to_csv(O+'flaschen_woche_2026.csv',sep=';',decimal=',',index=False)
# Dashboard-Dateien
DD=D+'preismodell/dashboard/'
def clean(r):
    out={}
    for k,v in r.items():
        v=v.item() if hasattr(v,'item') else v
        if isinstance(v,float) and np.isnan(v): v=None
        if k in ('kg','kg_je_flasche') and r.get('gasart') not in KGART: v=None
        out[k]=v
    return out
json.dump([clean(dict(artikel=i,**r)) for i,r in art.drop(columns=['voll_tour']).iterrows()],open(DD+'flaschen_artikel.json','w'),ensure_ascii=False)
json.dump([clean(r) for r in ml.to_dict('records')],open(DD+'flaschen_monat.json','w'),ensure_ascii=False)
json.dump([clean(r) for r in wl.to_dict('records')],open(DD+'flaschen_woche.json','w'),ensure_ascii=False)
pd.set_option('display.width',250)
print('Wochen',NW, 'Summe voll',art.voll.sum(),'leer',art.leer.sum(),'kg',round(art.kg.sum()))
print(ga.to_string())
print(art[['bezeichnung','gasart','groesse','voll','leer','kg','monat_avg','woche_avg','woche_median','woche_p90','woche_max','wochen_mit_bedarf','anteil_tour']].to_string())
