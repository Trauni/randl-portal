/**
 * ADR-Tafel: Punkte der Beförderungseinheit nach ADR 1.1.3.6 gegen die Grenze (Standard 1000).
 * Über der Grenze steht "überschritten", sonst "Grenze eingehalten". Die Zahl steht immer im Text.
 */
export default function AdrPlate({ punkte, grenze = 1000 }) {
  const ueber = punkte > grenze;
  const status = ueber ? 'ADR 1.1.3.6 überschritten' : 'ADR 1.1.3.6 eingehalten';
  return (
    <div className="ui-adr" role="img" aria-label={`${punkte} von ${grenze} Punkten nach ADR 1.1.3.6, Grenze ${ueber ? 'überschritten' : 'eingehalten'}`}>
      <div className="ui-adr-zahl">
        <b className="ui-adr-punkte">{punkte}</b>
        <span className="ui-adr-von">von {grenze} Punkten</span>
      </div>
      <span className="ui-adr-text">{status}</span>
    </div>
  );
}
