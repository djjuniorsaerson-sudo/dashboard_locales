import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import LocationSyncBanner from '../components/LocationSyncBanner';
import { subscribePanelSync } from '../components/syncEvents';

export default function Auditoria() {
  const PAGE_SIZE = 10;
  const { token, currentLocation } = useAuth();
  const [logs, setLogs] = useState([]);
  const [remoteActions, setRemoteActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const isOffline = !!currentLocation && currentLocation.status !== 'ONLINE';

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const installationQuery = currentLocation?.id ? `?installation_id=${encodeURIComponent(currentLocation.id)}` : '';
      const res = await fetch(`/api/v1/data/audit-logs${installationQuery}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
        setCurrentPage(1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchRemoteActions = async () => {
    if (!currentLocation?.id) {
      setRemoteActions([]);
      return;
    }
    setRemoteLoading(true);
    try {
      const res = await fetch(`/api/v1/remote-actions/installations/${currentLocation.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRemoteActions(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRemoteLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchRemoteActions();
    return subscribePanelSync((detail) => {
      if (detail?.modules && !detail.modules.some((module) => ['orders', 'cash', 'stock', 'users', 'dashboard'].includes(module))) {
        return;
      }
      fetchLogs();
      fetchRemoteActions();
    });
  }, [token, currentLocation?.id]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, moduleFilter]);

  const uniqueModules = [...new Set(logs.map(l => l.module_name).filter(Boolean))];

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      (log.actor_username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.action_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.payload_json || '').toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesModule = moduleFilter === '' || log.module_name === moduleFilter;
    
    return matchesSearch && matchesModule;
  });

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const remoteSummary = remoteActions.reduce((acc, action) => {
    const status = String(action.status || '').toUpperCase();
    acc.total += 1;
    if (status === 'PENDING' || status === 'PROCESSING') acc.pending += 1;
    if (status === 'FAILED') acc.failed += 1;
    if (status === 'COMPLETED') acc.completed += 1;
    if (Number(action.retry_count || 0) > 0) acc.retried += 1;
    return acc;
  }, { total: 0, pending: 0, failed: 0, completed: 0, retried: 0 });

  if (loading) {
    return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div></div>;
  }

  const formatDateTime = (isoString) => {
    if (!isoString) return '-';
    const d = new Date(isoString);
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${day}/${month}, ${hours}:${mins}`;
  };

  const getActionDescription = (log) => {
    const mod = log.module_name?.toLowerCase() || '';
    const act = log.action_name?.toLowerCase() || '';
    if (mod === 'pedidos' && act === 'alta') return `Creo el pedido #${log.entity_id}`;
    if (mod === 'caja') return `Registro un movimiento de caja`;
    if (mod === 'accesos' && act === 'ingreso') return 'Inicio sesion';
    if (mod === 'usuarios' && act === 'alta') return `Creó el usuario #${log.entity_id}`;
    if (act === 'login') return 'Inicio sesion';
    return `${log.action_name} en ${log.module_name} ${log.entity_id ? '#' + log.entity_id : ''}`;
  };

  return (
    <div className="space-y-6">
      <LocationSyncBanner
        location={currentLocation}
        title="Estado de auditoría"
        onlineMessage="La auditoría y la cola remota están actualizadas."
        offlineMessage="La auditoría puede estar mostrando el último estado sincronizado del local."
      />
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center">
            <svg className="w-6 h-6 mr-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
            Registro de Auditoría
          </h2>
          <p className="text-gray-400 text-sm mt-1">Historial de acciones y seguridad del sistema</p>
        </div>
        <button 
          onClick={fetchLogs}
          className="w-full sm:w-auto bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="rounded-xl border border-white/10 bg-gray-800 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Acciones remotas</div>
          <div className="mt-2 text-3xl font-black text-white">{remoteSummary.total}</div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
          <div className="text-xs uppercase tracking-wide text-amber-200/70">Pendientes</div>
          <div className="mt-2 text-3xl font-black text-amber-200">{remoteSummary.pending}</div>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
          <div className="text-xs uppercase tracking-wide text-red-200/70">Fallidas</div>
          <div className="mt-2 text-3xl font-black text-red-200">{remoteSummary.failed}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
          <div className="text-xs uppercase tracking-wide text-emerald-200/70">Completadas</div>
          <div className="mt-2 text-3xl font-black text-emerald-200">{remoteSummary.completed}</div>
        </div>
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-4">
          <div className="text-xs uppercase tracking-wide text-sky-200/70">Con reintento</div>
          <div className="mt-2 text-3xl font-black text-sky-200">{remoteSummary.retried}</div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-gray-700 px-4 py-4">
          <div>
            <h3 className="text-lg font-bold text-white">Historial de cola remota</h3>
            <p className="text-sm text-gray-400">Pedidos, stock y caja enviados al local, con estado y reintentos.</p>
          </div>
          <button
            onClick={fetchRemoteActions}
            className="w-full sm:w-auto bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-colors"
          >
            Actualizar cola
          </button>
        </div>
        <div className="divide-y divide-gray-700">
          {remoteLoading ? (
            <div className="p-6 text-sm text-gray-400">Cargando acciones remotas...</div>
          ) : remoteActions.length === 0 ? (
            <div className="p-6 text-sm text-gray-400">No hay acciones remotas registradas.</div>
          ) : remoteActions.map((action) => (
            <div key={action.id} className="p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-white">{action.summary || action.action_type}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                      action.status === 'COMPLETED' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20' :
                      action.status === 'FAILED' ? 'bg-red-500/15 text-red-300 border border-red-500/20' :
                      'bg-amber-500/15 text-amber-300 border border-amber-500/20'
                    }`}>
                      {action.status}
                    </span>
                    {action.queued && (
                      <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-sky-300 border border-sky-500/20">
                        En cola
                      </span>
                    )}
                    {Number(action.retry_count || 0) > 0 && (
                      <span className="rounded-full bg-purple-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-purple-300 border border-purple-500/20">
                        Reintento {action.retry_count}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-gray-400">
                    {action.created_by ? `Usuario: ${action.created_by}` : 'Usuario: sistema'} · Creada: {new Date(action.created_at).toLocaleString()}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Última actualización: {new Date(action.updated_at).toLocaleString()}
                  </div>
                  {action.error_message && (
                    <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                      {action.error_message}
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">
                  {action.action_type}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
        {isOffline && (
          <div className="mx-4 mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Mostrando el último registro de auditoría sincronizado. El local está OFFLINE.
          </div>
        )}
        
        {/* Filters */}
        <div className="p-4 border-b border-gray-700 bg-gray-850 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <svg className="w-5 h-5 absolute left-3 top-2.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            <input 
              type="text" 
              placeholder="Buscar por usuario, acción, o detalle..." 
              className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-purple-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="w-full sm:w-auto bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
          >
            <option value="">Todos los Módulos</option>
            {uniqueModules.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="divide-y divide-gray-700 md:hidden">
          {paginatedLogs.map(log => (
            <div key={log.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-gray-400 text-sm font-medium">{formatDateTime(log.created_at)}</div>
                <div className="flex flex-wrap justify-end gap-2">
                  <span className="bg-yellow-900/40 text-yellow-400 px-2.5 py-0.5 rounded-full text-xs font-semibold border border-yellow-800/50">
                    {log.module_name || 'Desconocido'}
                  </span>
                  <span className="bg-green-900/40 text-green-400 px-2.5 py-0.5 rounded-full text-xs font-semibold border border-green-800/50">
                    {log.action_name || 'Generico'}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-sm font-bold text-white">{log.entity_type} {log.entity_id ? '#' + log.entity_id : ''}</div>
                <div className="text-sm text-gray-300 mt-1">{getActionDescription(log)}</div>
              </div>
              <div className="grid grid-cols-1 gap-2 text-sm">
                <div className="bg-gray-900/60 rounded-lg p-3">
                  <div className="text-gray-500 text-xs uppercase tracking-wide">Usuario</div>
                  <div className="text-white font-semibold mt-1">{log.actor_username || '-'}</div>
                  <div className="text-gray-500 mt-1">{log.actor_role || '-'}</div>
                </div>
                <div className="bg-gray-900/60 rounded-lg p-3">
                  <div className="text-gray-500 text-xs uppercase tracking-wide">Terminal</div>
                  <div className="text-white font-semibold mt-1">{log.terminal_name || '-'}</div>
                  <div className="text-gray-500 font-mono text-xs mt-1 break-all">
                    {log.request_method && log.request_path ? `${log.request_method} ${log.request_path}` : '-'}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {paginatedLogs.length === 0 && (
            <div className="p-12 text-center text-gray-400">No se encontraron registros de auditoría.</div>
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <tbody className="divide-y divide-gray-700">
              {paginatedLogs.map(log => (
                <tr key={log.id} className="hover:bg-gray-750 transition-colors">
                  <td className="p-4 text-gray-400 text-sm whitespace-nowrap w-32 font-medium align-top">
                    {formatDateTime(log.created_at)}
                  </td>
                  <td className="p-4 align-top w-64">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="bg-yellow-900/40 text-yellow-400 px-2.5 py-0.5 rounded-full text-xs font-semibold border border-yellow-800/50">
                        {log.module_name || 'Desconocido'}
                      </span>
                      <span className="bg-green-900/40 text-green-400 px-2.5 py-0.5 rounded-full text-xs font-semibold border border-green-800/50">
                        {log.action_name || 'Generico'}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-white">
                      {log.entity_type} {log.entity_id ? '#' + log.entity_id : ''}
                    </div>
                  </td>
                  <td className="p-4 align-top w-40">
                    <div className="font-bold text-white">{log.actor_username || '-'}</div>
                    <div className="text-sm text-gray-500">{log.actor_role || '-'}</div>
                  </td>
                  <td className="p-4 align-top w-48">
                    <div className="font-bold text-white">{log.terminal_name || '-'}</div>
                    <div className="text-sm text-gray-500 font-mono text-xs mt-0.5">
                      {log.request_method && log.request_path ? `${log.request_method} ${log.request_path}` : '-'}
                    </div>
                  </td>
                  <td className="p-4 align-top text-gray-300 text-sm">
                    {getActionDescription(log)}
                  </td>
                </tr>
              ))}
              {paginatedLogs.length === 0 && (
                <tr>
                  <td colSpan="5" className="p-12 text-center text-gray-400">
                    No se encontraron registros de auditoría.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredLogs.length > PAGE_SIZE && (
          <div className="flex flex-col gap-3 border-t border-gray-700 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-400">
              Mostrando {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredLogs.length)} - {Math.min(currentPage * PAGE_SIZE, filteredLogs.length)} de {filteredLogs.length} registros
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-gray-600 bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="text-sm font-semibold text-gray-300">
                Página {currentPage} de {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-gray-600 bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
