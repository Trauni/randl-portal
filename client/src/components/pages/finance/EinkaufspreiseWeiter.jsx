import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Alte Route /gashandel/einkaufspreise (#606): Die Einkaufspreise stehen jetzt im Reiter "Einkauf" eines Artikels.
 * Die Preise hängen an der Preisgruppe. Wer den alten Link nutzt (z. B. aus der Gas-Auswertung), landet im Einkauf
 * eines Propan-Artikels (11 kg bevorzugt); gibt es keinen, in der Artikelliste.
 */
export default function EinkaufspreiseWeiter() {
  const [ziel, setZiel] = useState(null);
  useEffect(() => {
    fetch('/api/finance/artikelliste')
      .then((r) => r.json())
      .then((d) => {
        const propan = (d.artikel || []).filter((a) => a.ek_gruppe === 'propan');
        const a = propan.find((x) => x.artikel_nr === '7801100') || propan[0];
        setZiel(a ? `/gashandel/artikel/${encodeURIComponent(a.artikel_nr)}?reiter=einkauf` : '/gashandel/artikel/liste');
      })
      .catch(() => setZiel('/gashandel/artikel/liste'));
  }, []);
  return ziel ? <Navigate to={ziel} replace /> : <div style={{ color: 'var(--text3)', padding: 24 }}>Lade…</div>;
}
