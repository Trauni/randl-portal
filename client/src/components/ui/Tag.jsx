/** Kleine Zustandsmarke. tone: ok | warn | err | mute (Standard). Farbe nie allein, immer mit Text. */
export default function Tag({ tone = 'mute', children }) {
  const toneClass = tone === 'mute' ? '' : ` ui-tag--${tone}`;
  return <span className={`ui-tag${toneClass}`}>{children}</span>;
}
