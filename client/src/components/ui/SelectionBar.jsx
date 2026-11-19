/**
 * Auswahlleiste über einer Tabelle. Erscheint nur, wenn count > 0.
 * children: die Aktionen (Buttons mit className="btn"), onClear hebt die Auswahl auf.
 */
export default function SelectionBar({ count, noun = 'Artikel', onClear, children }) {
  if (!count) return null;
  return (
    <div className="ui-selbar" role="region" aria-label="Auswahl" aria-live="polite">
      <b className="ui-selbar-count">{count === 1 ? `1 ${noun} ausgewählt` : `${count} ${noun} ausgewählt`}</b>
      {children}
      <button type="button" className="ui-selbar-clear" onClick={onClear}>Auswahl aufheben</button>
    </div>
  );
}
