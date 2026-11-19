import { gasFarbe, PFAND_FARBE } from '../../utils/gasFarben';

/** Flaschensymbol mit Schulterfarbe der Gasart (typ "P" = Pfand: grau). size="gross" für Kopfbereiche. Dekoration, daher aria-hidden. */
export default function GasCylinder({ gasart, typ, size }) {
  const farbe = typ === 'P' ? PFAND_FARBE : gasFarbe(gasart);
  const klassen = ['ui-cyl', !farbe && 'ui-cyl--leer', size === 'gross' && 'ui-cyl--gross'].filter(Boolean).join(' ');
  return <span className={klassen} style={farbe ? { '--cyl': farbe } : undefined} aria-hidden="true" />;
}
