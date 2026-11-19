/** Weiße Fläche mit Rand. Optional mit Kopf (Titel links, Aktionen rechts). */
export default function Panel({ title, actions, as: Tag = 'section', className = '', children, ...rest }) {
  return (
    <Tag className={`ui-panel ${className}`.trim()} {...rest}>
      {(title || actions) && (
        <div className="ui-panel-head">
          {title && <h2 className="ui-panel-title">{title}</h2>}
          {actions && <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}
