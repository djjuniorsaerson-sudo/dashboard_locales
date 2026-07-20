import { useState, useEffect } from 'react';

export default function Auditoria({ token }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/data/audit-logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [token]);

  const uniqueModules = [...new Set(logs.map(l => l.module_name).filter(Boolean))];

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      (log.actor_username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.action_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.payload_json || '').toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesModule = moduleFilter === '' || log.module_name === moduleFilter;
    
    return matchesSearch && matchesModule;
  });

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
      <div className="flex justify-between items-center bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center">
            <svg className="w-6 h-6 mr-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
            Registro de Auditoría
          </h2>
          <p className="text-gray-400 text-sm mt-1">Historial de acciones y seguridad del sistema</p>
        </div>
        <button 
          onClick={fetchLogs}
          className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          Actualizar
        </button>
      </div>

      <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
        
        {/* Filters */}
        <div className="p-4 border-b border-gray-700 bg-gray-850 flex gap-4">
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
            className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
          >
            <option value="">Todos los Módulos</option>
            {uniqueModules.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <tbody className="divide-y divide-gray-700">
              {filteredLogs.map(log => (
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
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan="5" className="p-12 text-center text-gray-400">
                    No se encontraron registros de auditoría.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
