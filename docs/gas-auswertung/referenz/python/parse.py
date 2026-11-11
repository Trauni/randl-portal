import re,subprocess,glob,os,json,csv,sys
LAGER={'125001':'Lager Verkauf','125218':'Lager 20%','125222':'Lager B-V'}
head=re.compile(r'^\s*(\d+)\s+(\d+)\s+([A-Z][A-Za-z ]{0,4}?)\s+(\d{10})\s+(\d\d\.\d\d\.\d{4})\s+(\S+)\s+(-?\d+)\s+(-?\d+)\s+(-?[\d.]+,\d)\s*$')
cont=re.compile(r'^\s{20,}(\S+)\s+(-?\d+)\s+(-?\d+)\s+(-?[\d.]+,\d)\s*$')
rows=[]
for f in sorted(glob.glob(os.path.expanduser('~/mnt/Gas-Preis-Analyse 2026/Komplettstatistiken pro Terminal Belege/*.pdf'))):
    t=subprocess.run(['pdftotext','-layout',f,'-'],capture_output=True,text=True).stdout
    term=re.search(r'Lieferstelle:\s+#(\d+)',t).group(1)
    cur=None
    for line in t.splitlines():
        m=head.match(line)
        if m:
            _,kd,typ,bel,dat,p,v,l,kg=m.groups()
            cur=(term,kd,typ,bel,dat)
            rows.append([*cur,p,int(v),int(l),float(kg.replace('.','').replace(',','.'))]);continue
        m=cont.match(line)
        if m and cur and m.group(1) not in ('Übertrag','Gesamt','Zwischensumme'):
            p,v,l,kg=m.groups()
            rows.append([*cur,p,int(v),int(l),float(kg.replace('.','').replace(',','.'))])
with open(os.path.expanduser('~/work/positionen.csv'),'w',newline='') as fh:
    w=csv.writer(fh,delimiter=';');w.writerow(['terminal','kunde','typ','beleg','datum','produkt','voll','leer','kg']);w.writerows(rows)
print(len(rows),'Positionen')
