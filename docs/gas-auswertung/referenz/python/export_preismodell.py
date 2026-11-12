# Exportiert Ergebnisse Preismodell + Kennzahlen als CSV/JSON (für Dashboard, Folien, Handout)
import sys,os,json; sys.path.insert(0,os.path.dirname(__file__))
from preismodell import *
u=pd.read_csv(D+'positionen_umsatz_2026.csv',sep=';',dtype=str)
u['umsatz']=u.umsatz.str.replace(',','.').astype(float); u['n']=u.voll.astype(int)
u['monat']=u.datum.str[6:10]+'-'+u.datum.str[3:5]
u['propan']=u.produkt.isin(VK)
tk=pd.read_csv(D+'touren_km_2026.csv',sep=';',dtype={'terminal':str})
tk['monat']=tk.datum.str[6:10]+'-'+tk.datum.str[3:5]
st_all=u[u.art=='Tour'].groupby(['terminal','datum','kunde']).agg(fl=('n','sum'),u=('umsatz','sum')).reset_index()
st_all=st_all[st_all.fl>0]; st_all['monat']=st_all.datum.str[6:10]+'-'+st_all.datum.str[3:5]
st_all['kosten']=st_all.fl.clip(lower=0).map(KOST)
def grp(p):
    if p in('7801200','7801100','7801250'):return '11 kg Propan'
    if p in('7802000','7802010'):return '11 kg Treibgas'
    if p=='7801300':return '33 kg Propan'
    if p in('7801000','7801800','7801050'):return '5/8 kg Propan'
    if p.startswith('5909'):return 'Campingaz'
    if p in('T001','T007'):return 'Biergas'
    if p in('T002','T003','T004','T005','T006'):return 'CO2'
    if p.startswith('5920'):return 'Helium'
    return 'Techn. Gase'
u['gruppe']=u.produkt.map(grp)
M=[]
for m,g in u.groupby('monat'):
    if m>'2026-10':continue   # Nov. nur 3 Tage
    t=tk[tk.monat==m]; s=st_all[st_all.monat==m]
    M.append(dict(monat=m,umsatz=round(g.umsatz.sum()),umsatz_tour=round(g[g.art=='Tour'].umsatz.sum()),umsatz_propan=round(g[g.propan].umsatz.sum()),
        flaschen=int(g.n.clip(lower=0).sum()),touren=int(len(t)),stopps=int(len(s)),km=round(t.km_optimal.sum()),kg=round(t.kg_netto.sum()),lieferkosten=round(s.kosten.sum())))
PG=[dict(gruppe=k,flaschen=int(v.n.sum()),umsatz=round(v.umsatz.sum())) for k,v in u.groupby('gruppe')]
PG.sort(key=lambda x:-x['umsatz'])
KPI=dict(zeitraum='01.01.–03.11.2026',umsatz=round(u.umsatz.sum()),umsatz_tour=round(u[u.art=='Tour'].umsatz.sum()),
    touren=int(len(tk)),stopps=int(len(st_all)),km=round(tk.km_optimal.sum()),lieferkosten=round(st_all.kosten.sum()),
    flaschen=int(u.n.clip(lower=0).sum()),propan_flaschen=int(p.n.sum()),
    propan_umsatz_heute=round((p.produkt.map(VK)*p.n).sum()),propan_ek=round((p.produkt.map(EK)*p.n).sum()),
    stopps_propan=int(len(stops)),propan_lieferkosten=round(stops.kosten.sum()),kg_median_stopp=float(stops.kg.median()))
KPI['propan_rohertrag']=KPI['propan_umsatz_heute']-KPI['propan_ek']
# Simulator-Daten: je Propan-Stopp kg, Umsatz heute, Kunde; Lager/Abholung je Kunde
q=p.copy(); q['u']=q.produkt.map(VK)*q.n; q['ek']=q.produkt.map(EK)*q.n; q['ek_alt']=q.produkt.map(EK_ALT)*q.n
sq=q[q.tour].groupby(['terminal','datum','kunde']).agg(kg=('kg','sum'),fl=('n','sum'),u=('u','sum'),ek=('ek','sum'),ek_alt=('ek_alt','sum')).reset_index()
sq=sq[sq.fl>0]
neg=q.tour & (q.groupby(['terminal','datum','kunde']).n.transform('sum')<=0)   # Stopps ohne Netto-Lieferung (Rücknahmen) zählen zur Abholung
lag=q[(~q.tour)|neg].groupby('kunde').agg(u=('u','sum'),ek=('ek','sum'),fl=('n','sum'),ek_alt=('ek_alt','sum')).reset_index()
SIM=dict(stopps=[[r.kunde,int(r.kg),int(r.fl),round(r.u,2),round(r.ek,2),r.datum[6:10]+'-'+r.datum[3:5],round(r.ek_alt,2)] for r in sq.itertuples()],
         lager=[[r.kunde,round(r.u,2),round(r.ek,2),int(r.fl),round(r.ek_alt,2)] for r in lag.itertuples()],
         lagerkonten=sorted(LAGERKONTEN),kosten_formel='12,65 km × 0,40 €/km + (15,4 + 9 + 0,6 × Flaschen) min × 20 €/h')
VAR=[];alle=[];cuA=None
for nm,sn,T,c in VARIANTEN:
    res,cu,s=rechne(nm,c,T)
    if cuA is None: cuA=cu.copy()
    cu=cu.copy(); cu['delta_vs_a']=cu.u_neu-cuA.u_neu.reindex(cu.index)
    cu=cu.copy(); cu['re_ist']=cu.u_ist-(cu.u_ist-cu.u_ist)  # Platzhalter
    ek=q.groupby('kunde').ek.sum(); cu['db_ist']=cu.u_ist-ek.reindex(cu.index).fillna(0)-cu.kosten
    real=cu[~cu.index.isin(LAGERKONTEN)]
    risk=real[(real.stopps>0)&(real.delta_pct>5)]
    res['risiko_kunden_ueber5pct']=int(len(risk)); res['risiko_db_nach_lieferkosten']=round(risk.db_ist.sum())
    res['risiko_umsatz']=round(risk.u_ist.sum())
    res['mengenplus_pct']=round(max(0,-res['delta'])/res['rohertrag_neu']*100,1)
    res['staffel_name']=sn
    tk_=real[real.stopps>0]
    res['kunden_ueber10pct']=int((tk_.delta_pct>10).sum())
    res['guenstiger_als_a']=int((tk_.delta_vs_a<-1).sum()); res['teurer_als_a']=int((tk_.delta_vs_a>1).sum())
    for g_ in (11,33,66,99,100): res[f'f{g_}']=fee(g_,T)
    res['ab100_delta_stopp']=res['klassen']['ab 100 kg']['u_neu']/res['klassen']['ab 100 kg']['stopps']-res['klassen']['ab 100 kg']['u_ist']/res['klassen']['ab 100 kg']['stopps']
    tkd=real[real.stopps>0].sort_values('delta')
    col=['u_ist','u_neu','delta','delta_pct','stopps','kg','kg_je_stopp']
    res['top_gewinner']=[dict(kunde=i,**{k:round(float(v[k]),1) for k in col}) for i,v in tkd.head(10).iterrows()]
    res['top_verlierer']=[dict(kunde=i,**{k:round(float(v[k]),1) for k in col}) for i,v in tkd.tail(10)[::-1].iterrows()]
    res['staffel']=[[ (None if lim>1e8 else lim),f] for lim,f in T]
    res['preise']={GR[k]:float(v) for k,v in res['preise'].items()}
    for k in list(res):
        if isinstance(res[k],(np.floating,np.integer)):res[k]=float(res[k])
    VAR.append(res)
    t=cu[['u_ist','u_neu','delta','delta_pct','delta_vs_a','stopps','kg','kg_je_stopp','fee']].copy(); t.insert(0,'variante',nm); alle.append(t)
pd.concat(alle).round(2).to_csv(O+'kunden_wirkung.csv',sep=';',decimal=',',index_label='kunde')
vk_tab=[dict(groesse=GR[k],produkt=k,vk=VK[k],ek=EK[k],ek_alt=EK_ALT[k],kg=KG[k]) for k in VK]
out=dict(stand='03.11.2026',kpi=KPI,monate=M,produktgruppen=PG,varianten=VAR,sim=SIM,preise=vk_tab,
    stoppklassen_ist={k:v for k,v in VAR[0]['klassen'].items()})
json.dump(out,open(O+'gas_dashboard_daten.json','w'),ensure_ascii=False,default=float,indent=0)
rows=[dict(variante=v['name'],staffel=v['staffel_name'],senkung_pct=round(v['cut']*100,1),umsatz_ist=round(v['umsatz_ist']),umsatz_neu=round(v['umsatz_neu']),
    rohertrag_ist=round(v['rohertrag_ist']),rohertrag_vor=round(v['rohertrag_vor']),rohertrag_neu=round(v['rohertrag_neu']),delta=round(v['delta']),pauschalen=round(v['pauschalen']),
    kunden_guenstiger=v['kunden_guenstiger'],kunden_teurer=v['kunden_teurer'],mengenplus_pct=v['mengenplus_pct'],
    risiko_kunden=v['risiko_kunden_ueber5pct'],ueber10=v['kunden_ueber10pct'],guenstiger_als_a=v['guenstiger_als_a'],teurer_als_a=v['teurer_als_a'],risiko_db=v['risiko_db_nach_lieferkosten'],**{'preis '+k:x for k,x in v['preise'].items()}) for v in VAR]
pd.DataFrame(rows).to_csv(O+'varianten.csv',sep=';',decimal=',',index=False)
print(json.dumps(KPI,ensure_ascii=False)); print(pd.DataFrame(M).to_string()); print(pd.DataFrame(PG).to_string())
print(pd.DataFrame(rows).T.to_string())
