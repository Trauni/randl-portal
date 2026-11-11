# Preismodell Propan: Abholpreis (Lager) + Lieferpauschale gestaffelt nach kg je Lieferung
# Basis: Belegpositionen 01.01.-03.11.2026, VK Stand Oktober 2026, EK Tyczka verhandelt 1,52 €/kg ab 11.11.2026, Motogas/Bluetec Liste ab 15.11. (netto)
# Vorgängerstand mit EK ab 15.10.: preismodell_ek1510.py
import pandas as pd, numpy as np, json, os, sys
D=os.path.expanduser('~/mnt/Gas-Preis-Analyse 2026/Auswertung/'); O=D+'preismodell/'
VK={'7801000':14.97,'7801800':14.97,'7801050':18.48,'7801100':30.80,'7801200':30.80,'7801250':30.80,'7801300':98.30,'7802000':35.13,'7802010':37.22}
EK_ALT={'7801000':7.70,'7801800':7.70,'7801050':12.32,'7801100':16.94,'7801200':16.94,'7801250':16.94,'7801300':50.82,'7802000':20.79,'7802010':20.79}  # Tyczka ab 15.10.2026
EK_LISTE_1511={'7801000':8.50,'7801800':8.50,'7801050':13.60,'7801100':18.70,'7801200':18.70,'7801250':18.70,'7801300':56.10,'7802000':22.55,'7802010':22.55}  # Tyczka-Liste ab 15.11.2026 (für Propan durch Verhandlung ersetzt)
EK_PRO_KG=1.52  # Tyczka verhandelt ab 11.11.2026, netto je kg Propan, unbefristet
KG_={'7801000':5,'7801800':5,'7801050':8,'7801100':11,'7801200':11,'7801250':11,'7801300':33}
EK={**{k:round(v*EK_PRO_KG,2) for k,v in KG_.items()},'7802000':22.55,'7802010':22.55}  # Motogas/Bluetec weiter Liste (ab 15.11.)
KG={'7801000':5,'7801800':5,'7801050':8,'7801100':11,'7801200':11,'7801250':11,'7801300':33,'7802000':11,'7802010':11}
GR={'7801000':'5 kg','7801800':'5 kg','7801050':'8 kg BBQ','7801100':'11 kg','7801200':'11 kg','7801250':'11 kg','7801300':'33 kg','7802000':'11 kg Motogas','7802010':'11 kg Bluetec'}
LAGERKONTEN={'125001','125218','125222'}
r=pd.read_csv(D+'positionen_klassifiziert_2026.csv',sep=';',dtype=str)
p=r[r.produkt.isin(VK)].copy(); p['n']=p.voll.astype(int)
p['gr']=p.produkt.map(GR); p['kg']=p.produkt.map(KG)*p.n
p['tour']=p.art.eq('Tour')
st=p[p.tour].groupby(['terminal','datum','kunde'])
stopkg=st.kg.transform('sum'); stopfl=st.n.transform('sum')
p.loc[p.tour,'stopkg']=stopkg; p.loc[p.tour,'stopfl']=stopfl
stops=p[p.tour].groupby(['terminal','datum','kunde']).agg(fl=('n','sum'),kg=('kg','sum')).reset_index()
stops=stops[stops.fl>0].reset_index(drop=True)
KOST=lambda fl:12.65*0.40+(15.4+9+0.6*fl)/60*20   # Lieferkosten-Modell je Stopp
stops['kosten']=stops.fl.map(KOST)

def r90(x): # auf 10 Cent runden
    return round(round(x*10)/10,2)
def preisliste(cut,rund=True):
    return {k:(r90(v*(1-cut)) if rund else round(v*(1-cut),2)) for k,v in VK.items()}
def fee(kg,T): return next(f for lim,f in T if kg<=lim)

def rechne(name,cut,T,rund=True):
    PL=preisliste(cut,rund)
    q=p.copy(); q['u_ist']=q.produkt.map(VK)*q.n; q['ek']=q.produkt.map(EK)*q.n; q['u_neu']=q.produkt.map(PL)*q.n
    s=stops.copy(); s['fee']=s.kg.map(lambda k:fee(k,T))
    U0=q.u_ist.sum(); E=q.ek.sum(); U1=q.u_neu.sum()+s.fee.sum(); E_ALT=(q.produkt.map(EK_ALT)*q.n).sum()
    # Kunden
    cu=q.groupby('kunde').agg(u_ist=('u_ist','sum'),u_neu=('u_neu','sum'),fl=('n','sum'),kg=('kg','sum'))
    cf=s.groupby('kunde').agg(fee=('fee','sum'),stopps=('fee','size'),kosten=('kosten','sum'))
    cu=cu.join(cf).fillna({'fee':0,'stopps':0,'kosten':0}); cu['u_neu']+=cu.fee
    cu['delta']=cu.u_neu-cu.u_ist; cu['delta_pct']=cu.delta/cu.u_ist*100
    cu['kg_je_stopp']=np.where(cu.stopps>0,cu.kg/cu.stopps.replace(0,np.nan),np.nan)
    cu=cu[cu.fl>0]
    real=cu[~cu.index.isin(LAGERKONTEN)]; tk=real[real.stopps>0]
    # nach Stoppgröße
    s['u_ist']=0.0
    bins=[0,11,33,66,99,1e9]; lab=['bis 11 kg','12–33 kg','34–66 kg','67–99 kg','ab 100 kg']
    ql=q[q.tour].merge(s[['terminal','datum','kunde','kg','fee']].rename(columns={'kg':'skg'}),on=['terminal','datum','kunde'])
    ql['kl']=pd.cut(ql.skg,bins,labels=lab)
    s['kl']=pd.cut(s.kg,bins,labels=lab)
    kl=ql.groupby('kl',observed=False).agg(u_ist=('u_ist','sum'),u_neu=('u_neu','sum'),ek=('ek','sum'))
    kl=kl.join(s.groupby('kl',observed=False).agg(stopps=('fee','size'),fee=('fee','sum'),kosten=('kosten','sum')))
    kl['u_neu']+=kl.fee
    re_fl11=(PL['7801200']-EK['7801200'])
    res=dict(name=name,cut=cut,staffel=T,preise=PL,
        umsatz_ist=U0,umsatz_neu=U1,rohertrag_ist=U0-E,rohertrag_vor=U0-E_ALT,rohertrag_neu=U1-E,delta=U1-U0,pauschalen=s.fee.sum(),
        eff_cut=1-q.u_neu.sum()/U0,
        kunden_guenstiger=int((tk.delta<-1).sum()),kunden_teurer=int((tk.delta>1).sum()),kunden_gleich=int(((tk.delta>=-1)&(tk.delta<=1)).sum()),
        abholer_guenstiger=int(((real.stopps==0)&(real.delta<-1)).sum()),
        mehr_11kg_fuer_ausgleich=(-(U1-U0)/re_fl11 if U1<U0 else 0),
        klassen={k:dict(stopps=int(v.stopps),u_ist=v.u_ist,u_neu=v.u_neu,fee=v.fee,kosten=v.kosten) for k,v in kl.iterrows()})
    return res,cu,s

S ={'name':'Staffel S', 'T':[(11,19.90),(33,14.90),(66,9.90),(99,4.90),(1e9,0.0)]}
S2={'name':'Staffel S+','T':[(11,24.90),(33,19.90),(66,14.90),(99,9.90),(1e9,4.90)]}
OHNE={'name':'ohne Pauschale','T':[(1e9,0.0)]}
U_IST=(p.produkt.map(VK)*p.n).sum()
def neutral(T): return stops.kg.map(lambda k:fee(k,T)).sum()/U_IST
# cut > 0 = Senkung, cut < 0 = Erhöhung des Gas-/Abholpreises
VARIANTEN=[('V0 Heute, keine Änderung','ohne Pauschale',OHNE['T'],0.0),
           ('V1 Abholpreis −4 % + Staffel S','Staffel S',S['T'],0.04),
           ('V2 Abholpreis −6 % + Staffel S+','Staffel S+',S2['T'],0.06),
           ('V3 Abholpreis −10 % + Staffel S+','Staffel S+',S2['T'],0.10)]
if __name__=='__main__':
    for T in (S,S2): print(T['name'],'neutral',round(neutral(T['T'])*100,2),'%')
    for nm,sn,T,c in VARIANTEN:
        res,cu,s=rechne(nm,c,T)
        print(f"{nm} ({sn}, {-c*100:+.1f} %): eff {res['eff_cut']*100:.1f} % Umsatz {res['umsatz_neu']:.0f} Δ {res['delta']:+.0f} RE {res['rohertrag_neu']:.0f} Pausch {res['pauschalen']:.0f} RE vor {res['rohertrag_vor']:.0f} Δvor {res['rohertrag_neu']-res['rohertrag_vor']:+.0f} günstiger {res['kunden_guenstiger']} teurer {res['kunden_teurer']} Abholer günstiger {res['abholer_guenstiger']} Ausgleich 11kg-Fl {res['mehr_11kg_fuer_ausgleich']:.0f}")
        print('   ',{GR[k]:float(v) for k,v in res['preise'].items() if k in('7801000','7801050','7801200','7801300','7802000','7802010')})
        for k,v in res['klassen'].items(): print(f"    {k:10} St {v['stopps']:4} Δ/Stopp {(v['u_neu']-v['u_ist'])/max(v['stopps'],1):+7.2f}  Fee {v['fee']/max(v['stopps'],1):5.2f} Kost {v['kosten']/max(v['stopps'],1):5.2f} RE-Δ {v['u_neu']-v['u_ist']:+8.0f}")
        t=cu[cu.stopps>0].sort_values('delta')
        print('    Top Gewinner',[(i,round(x)) for i,x in t.delta.head(5).items()],' Verlierer',[(i,round(x),round(pc)) for i,x,pc in zip(t.index[-5:],t.delta.tail(5),t.delta_pct.tail(5))])
