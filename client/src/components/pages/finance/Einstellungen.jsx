import { useState } from 'react';
import { Panel, Tabs } from '../../ui';
import LadebasenTab from './einstellungen/LadebasenTab';
import TourvorlagenTab from './einstellungen/TourvorlagenTab';
import GeraeteTab from './einstellungen/GeraeteTab';
import LagerverkaufTab from './einstellungen/LagerverkaufTab';

// #608 Einstellungen Gashandel: Ladebasen und Tourvorlagen (Recht fahrer.geraete, wie die Disposition).
// #550 Geräte der Fahrer-App, #516 Lagerverkauf (Sonder-PIN, Sammelmail) – gleiches Recht.
const TABS = [
  { id: 'ladebasen', label: 'Ladebasen' }, { id: 'vorlagen', label: 'Tourvorlagen' },
  { id: 'geraete', label: 'Geräte' }, { id: 'lager', label: 'Lagerverkauf' },
];

export default function Einstellungen() {
  const [tab, setTab] = useState('ladebasen');
  return (
    <div style={{ maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 className="page-title">Einstellungen</h1>
        <p className="page-subtitle" style={{ fontSize: 15, color: 'var(--text2)' }}>Ladebasen, Tourvorlagen, Geräte und Lagerverkauf für die Disposition und die Fahrer-App.</p>
      </div>
      <Panel>
        <Tabs items={TABS} value={tab} onChange={setTab} label="Einstellungen" />
        <div style={{ padding: 18 }}>
          {tab === 'ladebasen' && <LadebasenTab />}
          {tab === 'vorlagen' && <TourvorlagenTab />}
          {tab === 'geraete' && <GeraeteTab />}
          {tab === 'lager' && <LagerverkaufTab />}
        </div>
      </Panel>
    </div>
  );
}
