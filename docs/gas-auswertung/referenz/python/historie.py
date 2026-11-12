# Rohertrag Propan 2026 mit Einkaufspreisen je Tyczka-Periode und geschätzten Verkaufspreisen je Periode
# VK-Stufen aus Barverkäufen (Komplettstatistik, Kunde 125001 u. Listenkunden) abgeleitet:
#   A 01.01.–14.04.: 5 kg 13,32 · 11 kg 25,63 · 33 kg 80,63 · übrige ≈ 0,83 × Okt-Preis
#   B/C 15.04.–Okt-Erhöhung: Preise vor Oktober (preise.py: 14,27 / 29,26 / 93,68 …)
#   D ab 06./13.10.: aktuelle Preise
# Sonderkunden mit beobachtetem Rabatt (Barbelege): 125011/125012/125014 (33 kg), 125253, 1252242
import pandas as pd, os
D=os.path.expanduser('~/mnt/Gas-Preis-Analyse 2026/Auswertung/')
EKT=[ # gültig ab, 5 kg, 8 kg, 11 kg, 33 kg, Motogas/Bluetec
('2025-12-20',6.40,10.24,14.08,42.24,17.93),('2026-02-15',6.55,10.48,14.41,43.23,18.26),('2026-03-15',6.70,10.72,14.74,44.22,18.59),
('2026-04-15',8.35,13.36,18.37,55.11,22.22),('2026-05-15',7.40,11.84,16.28,48.84,20.13),('2026-06-15',7.05,11.28,15.51,46.53,19.36),
('2026-07-15',6.65,10.64,14.63,43.89,18.48),('2026-08-15',7.00,11.20,15.40,46.20,19.25),('2026-10-15',7.70,12.32,16.94,50.82,20.79),
('2026-11-11',7.60,12.16,16.72,50.16,20.79),  # verhandelt: Propan 1,52 €/kg netto, unbefristet; Motogas/Bluetec weiter Liste
('2026-11-15',7.60,12.16,16.72,50.16,22.55)]  # Liste ab 15.11. gilt nur noch für Motogas/Bluetec (22,55)
GRP={'7801000':0,'7801800':0,'7801050':1,'7801100':2,'7801200':2,'7801250':2,'7801300':3,'7802000':4,'7802010':4}
def ek(p,iso):
    row=[r for r in EKT if r[0]<=iso][-1]; return row[1+GRP[p]]
CUR={'7801000':14.97,'7801800':14.97,'7801050':18.48,'7801100':30.80,'7801200':30.80,'7801250':30.80,'7801300':98.30,'7802000':35.13,'7802010':37.22}
PREOCT={'7801000':14.27,'7801800':14.27,'7801050':17.36,'7801100':29.26,'7801200':29.26,'7801250':29.26,'7801300':93.68,'7802000':33.59,'7802010':35.68}
OCT={'7801000':'2026-10-13','7801800':'2026-10-13','7801050':'2026-10-13','7801100':'2026-10-13','7801200':'2026-10-13','7801250':'2026-10-13','7801300':'2026-10-13','7802000':'2026-10-13','7802010':'2026-10-13'}
A={'7801000':13.32,'7801800':13.32,'7801100':25.63,'7801200':25.63,'7801250':25.63,'7801300':80.63}
def vk(p,iso):
    if iso<'2026-04-15': return A.get(p,round(CUR[p]*0.83,2))
    if iso<OCT[p]: return PREOCT[p]
    return CUR[p]
# Sonderpreise (beobachtet) als Faktor auf Liste
SONDER={'125011':{'A':74.63/80.63,'B':87.17/93.68,'C':80.90/93.68,'D':85.52/98.30}}
for k in ('125012','125014'): SONDER[k]=SONDER['125011']
SONDER['125253']={'A':23.66/25.63,'B':27.84/29.26,'C':26.96/29.26,'D':26.96/30.80}
SONDER['1252242']={'A':24.21/25.63,'B':24.21/29.26,'C':24.21/29.26,'D':24.21/30.80}
def per(iso): return 'A' if iso<'2026-04-15' else 'B' if iso<'2026-05-15' else 'C' if iso<'2026-10-13' else 'D'
if __name__=='__main__':
    p=pd.read_csv(D+'positionen_klassifiziert_2026.csv',sep=';',dtype=str)
    p=p[p.produkt.isin(GRP)].copy(); p['n']=p.voll.astype(int)
    p['iso']=pd.to_datetime(p.datum,format='%d.%m.%Y').dt.strftime('%Y-%m-%d')
    p['ek']=[ek(a,b) for a,b in zip(p.produkt,p.iso)]
    p['vk_liste']=[vk(a,b) for a,b in zip(p.produkt,p.iso)]
    p['faktor']=[SONDER.get(k,{}).get(per(i),1.0) for k,i in zip(p.kunde,p.iso)]
    p['vk']=(p.vk_liste*p.faktor).round(2)
    p['u']=p.vk*p.n; p['e']=p.ek*p.n; p['u_l']=p.vk_liste*p.n
    p['monat']=p.iso.str[:7]
    m=p.groupby('monat').agg(flaschen=('n','sum'),umsatz=('u','sum'),umsatz_liste=('u_l','sum'),ek=('e','sum')).round(0)
    m['rohertrag']=m.umsatz-m.ek; m['marge_pct']=(m.rohertrag/m.umsatz*100).round(1)
    print(m.to_string()); T=m.sum(numeric_only=True)
    print(f"Summe Umsatz {T.umsatz:.0f} (Liste {T.umsatz_liste:.0f}) EK {T.ek:.0f} RE {T.rohertrag:.0f} Marge {T.rohertrag/T.umsatz*100:.1f} %  Sonderkunden-Abschlag {T.umsatz_liste-T.umsatz:.0f}")
    # Rohertrag je 11 kg / 33 kg Flasche nach Periode
    for per_,iso in [('A Jan–Mitte Feb','2026-01-10'),('A ab 15.02.','2026-02-20'),('A ab 15.03.','2026-03-20'),('B ab 15.04.','2026-04-20'),('C ab 15.05.','2026-05-20'),('C ab 15.06.','2026-06-20'),('C ab 15.07.','2026-07-20'),('C ab 15.08.','2026-08-20'),('D ab 15.10.','2026-10-20'),('ab 11.11. 1,52 €/kg (VK unverändert)','2026-11-20')]:
        print(per_, *[f"{GR}: VK {vk(pp,iso):.2f} EK {ek(pp,iso):.2f} RE {vk(pp,iso)-ek(pp,iso):.2f} ({(vk(pp,iso)-ek(pp,iso))/vk(pp,iso)*100:.0f} %)" for GR,pp in [('11',"7801200"),('33',"7801300")]])
    os.makedirs(D+'preismodell',exist_ok=True)
    pd.DataFrame(EKT,columns=['gueltig_ab','ek_5kg','ek_8kg','ek_11kg','ek_33kg','ek_motogas']).to_csv(D+'ek_tyczka_historie.csv',sep=';',decimal=',',index=False)
    m.to_csv(D+'preismodell/rohertrag_monat_2026.csv',sep=';',decimal=',')
