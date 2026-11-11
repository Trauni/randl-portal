# Erzeugt die Datendateien des Dashboards aus gas_dashboard_daten.json
import json,os
D=os.path.expanduser('~/mnt/Gas-Preis-Analyse 2026/Auswertung/preismodell/'); O=D+'dashboard/'; os.makedirs(O,exist_ok=True)
j=json.load(open(D+'gas_dashboard_daten.json'))
w=lambda n,rows:json.dump(rows,open(O+n,'w'),ensure_ascii=False)
w('monate_2026.json',j['monate'])
w('propan_stopps_2026.json',[dict(kunde=s[0],kg=s[1],flaschen=s[2],umsatz=s[3],ek=s[4],monat=s[5],ek_alt=s[6]) for s in j['sim']['stopps']])
w('propan_abholung_2026.json',[dict(kunde=s[0],umsatz=s[1],ek=s[2],flaschen=s[3],lagerkonto=s[0] in j['sim']['lagerkonten'],ek_alt=s[4]) for s in j['sim']['lager']])
w('produktgruppen_2026.json',j['produktgruppen'])
w('propan_preise.json',[dict(groesse=p['groesse'],artikel=p['produkt'],kg=p['kg'],vk=p['vk'],ek=p['ek'],ek_alt=p['ek_alt']) for p in j['preise']])
V=[]
for v in j['varianten']:
    V.append(dict(variante=v['name'],staffel=v['staffel_name'],senkung=round(v['cut'],4),
      f11=v['f11'],f33=v['f33'],f66=v['f66'],f99=v['f99'],f100=v['f100'],
      preis_5kg=v['preise']['5 kg'],preis_11kg=v['preise']['11 kg'],preis_33kg=v['preise']['33 kg'],preis_motogas=v['preise']['11 kg Motogas'],
      umsatz_ist=round(v['umsatz_ist']),umsatz_neu=round(v['umsatz_neu']),rohertrag_ist=round(v['rohertrag_ist']),rohertrag_vor=round(v['rohertrag_vor']),rohertrag_neu=round(v['rohertrag_neu']),
      rohertrag_delta=round(v['delta']),pauschalen=round(v['pauschalen']),kunden_guenstiger=v['kunden_guenstiger'],kunden_teurer=v['kunden_teurer'],
      mengenplus_pct=v['mengenplus_pct'],risiko_kunden=v['risiko_kunden_ueber5pct'],risiko_db=v['risiko_db_nach_lieferkosten'],ueber10=v['kunden_ueber10pct'],guenstiger_als_a=v['guenstiger_als_a'],teurer_als_a=v['teurer_als_a'],ab100_stopp=round(v['ab100_delta_stopp'],2)))
# Rohertrag je Monat 2026 (geschätzt, historische EK/VK)
import pandas as _pd
rm=_pd.read_csv(os.path.expanduser('~/mnt/Gas-Preis-Analyse 2026/Auswertung/preismodell/rohertrag_monat_2026.csv'),sep=';',decimal=',')
w('rohertrag_monat_2026.json',[dict(monat=r.monat,flaschen=int(r.flaschen),umsatz=float(r.umsatz),ek=float(r.ek),rohertrag=float(r.rohertrag),marge=round(float(r.rohertrag)/float(r.umsatz),4)) for r in rm.itertuples() if r.monat<='2026-10'])
import sys as _s; _s.path.insert(0,os.path.dirname(__file__)); from historie import EKT
w('ek_historie.json',[dict(gueltig_ab=r[0],ek_5kg=r[1],ek_8kg=r[2],ek_11kg=r[3],ek_33kg=r[4],ek_motogas=r[5]) for r in EKT])
w('preisvarianten.json',V)
for f in sorted(os.listdir(O)):print(f,os.path.getsize(O+f))
print(json.dumps(V[0],ensure_ascii=False))
