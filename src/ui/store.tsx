import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { openRepository, type Repository } from '../data/repository';
import { emptySnapshot, type Snapshot } from '../domain/types';
import { cleanupTemporaryImages } from '../integrations/images';

interface Store {
  data: Snapshot;
  repository: Repository | null;
  loading: boolean;
  error: string;
  busy: boolean;
  generation: number;
  refresh: () => Promise<void>;
  maintenance: (task: (repository: Repository) => Promise<void>) => Promise<void>;
}
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState(emptySnapshot);
  const [repository, setRepository] = useState<Repository | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);
  const maintenanceLock = useRef(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await cleanupTemporaryImages().catch(() => undefined);
        const repo = await openRepository();
        const initial = await repo.load();
        if (alive) { setRepository(repo); setData(initial); }
      } catch { if (alive) setError('No se pudo abrir el almacenamiento local. Cierra y vuelve a abrir Boceli; no borres la app.'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);
  const refresh = useCallback(async () => { if (repository) setData(await repository.load()); }, [repository]);
  const maintenance = useCallback(async (task: (repo: Repository) => Promise<void>) => {
    if (!repository || maintenanceLock.current) throw new Error('Hay otra operación de datos en curso.');
    maintenanceLock.current = true; setBusy(true); setGeneration(v => v + 1);
    try { await task(repository); setData(await repository.load()); }
    finally { maintenanceLock.current = false; setBusy(false); }
  }, [repository]);
  return <Context.Provider value={{ data, repository, loading, error, busy, generation, refresh, maintenance }}>{children}</Context.Provider>;
}
export function useStore() { const store = useContext(Context); if (!store) throw new Error('Falta StoreProvider'); return store; }
