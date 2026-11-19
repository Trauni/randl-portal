import { gasFarbe } from '../../utils/gasFarben';

/** Flaschensymbol mit Schulterfarbe der Gasart. size="gross" für Kopfbereiche. Dekoration, daher aria-hidden. */
export default function GasCylinder({ gasart, size }) {
  const farbe = gasFarbe(gasart);
  const klassen = ['ui-cyl', !farbe && 'ui-cyl--leer', size === 'gross' && 'ui-cyl--gross'].filter(Boolean).join(' ');
  return <span className={klassen} style={farbe ? { '--cyl': farbe } : undefined} aria-hidden="true" />;
}
