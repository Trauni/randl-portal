import { useRef } from 'react';

/**
 * Reiter. items: [{ id, label }], value: aktive id, onChange(id).
 * Pfeil links/rechts, Pos1 und Ende wechseln den Reiter (WAI-ARIA Tabs).
 */
export default function Tabs({ items, value, onChange, label = 'Reiter' }) {
  const refs = useRef({});
  const gehZu = (index) => {
    const ziel = items[(index + items.length) % items.length];
    onChange(ziel.id);
    refs.current[ziel.id]?.focus();
  };
  const taste = (e, index) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); gehZu(index + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); gehZu(index - 1); }
    else if (e.key === 'Home') { e.preventDefault(); gehZu(0); }
    else if (e.key === 'End') { e.preventDefault(); gehZu(items.length - 1); }
  };
  return (
    <div role="tablist" aria-label={label} className="ui-tabs">
      {items.map((item, i) => (
        <button
          key={item.id}
          ref={(el) => { refs.current[item.id] = el; }}
          role="tab"
          type="button"
          className="ui-tab"
          aria-selected={item.id === value}
          tabIndex={item.id === value ? 0 : -1}
          onClick={() => onChange(item.id)}
          onKeyDown={(e) => taste(e, i)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
