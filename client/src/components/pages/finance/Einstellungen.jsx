import { useState } from 'react';
import { Panel, Tabs } from '../../ui';
import LadebasenTab from './einstellungen/LadebasenTab';
import TourvorlagenTab from './einstellungen/TourvorlagenTab';

// #608 Einstellungen Gashandel: Ladebasen und Tourvorlagen (Recht fahrer.geraete, wie die Disposition).
const TABS = [{ id: 'ladebasen', label: 'Ladebasen' }, { id: 'vorlagen', label: 'Tourvorlagen' }];

export default function Einstellungen() {
  const [tab, setTab] = useState('ladebasen');
  return (
    <div style={{ maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 className="page-title">Einstellungen</h1>
        <p className="page-subtitle" style={{ fontSize: 15, color: 'var(--text2)' }}>Ladebasen und Tourvorlagen für die Disposition und die Fahrer-App.</p>
      </div>
      <Panel>
        <Tabs items={TABS} value={tab} onChange={setTab} label="Einstellungen" />
        <div style={{ padding: 18 }}>
          {tab === 'ladebasen' && <LadebasenTab />}
          {tab === 'vorlagen' && <TourvorlagenTab />}
        </div>
      </Panel>
    </div>
  );
}
