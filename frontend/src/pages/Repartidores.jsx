import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Repartidores() {
  const { token } = useAuth();
  const [repartidores, setRepartidores] = useState([]);
  const [loading, setLoading] = useState(true);

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [driverHistory, setDriverHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [globalHistory, setGlobalHistory] = useState([]);

  useEffect(() => {
    const fetchRepartidores = async () => {
      try {
        const res = await fetch(`/api/v1/data/repartidores`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setRepartidores(await res.json());
        }
      } catch (e) {
        console.error("Error", e);
      } finally {
        setLoading(false);
      }
    };
    
    const fetchGlobalHistory = async () => {
      try {
        const res = await fetch(`/api/v1/data/repartidores/history`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setGlobalHistory(await res.json());
        }
      } catch (e) {
        console.error("Error fetching history", e);
      }
    };

    fetchRepartidores();
    fetchGlobalHistory();
    const interval = setInterval(() => {
      fetchRepartidores();
      fetchGlobalHistory();
    }, 15000);
    return () => clearInterval(interval);
  }, [token]);

  const viewHistory = async (driver) => {
    setSelectedDriver(driver);
    setHistoryModalOpen(true);
    setLoadingHistory(true);
    try {
        const res = await fetch(`/api/v1/data/repartidor/${driver.id}/history`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            setDriverHistory(await res.json());
        }
    } catch (e) {
        console.error(e);
    } finally {
        setLoadingHistory(false);
    }
  };

  return (
    <div className="p-6 relative">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Flota de Repartidores</h2>
          <p className="text-gray-400 text-sm mt-1">Monitoreo de cadetes y dinero a rendir en tiempo real</p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg mb-8">
        {loading && repartidores.length === 0 ? (
           <div className="p-8 text-center text-gray-500">Cargando datos de la flota...</div>
        ) : (
          <table className="w-full text-left text-sm text-gray-400">
            <thead className="bg-gray-900 text-gray-300 uppercase font-semibold">
              <tr>
                <th className="px-6 py-4">Repartidor</th>
                <th className="px-6 py-4">Turno</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-center">Viajes Pendientes</th>
                <th className="px-6 py-4 text-right">Efectivo a Rendir</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {repartidores.map((r) => (
                <tr key={r.id} className="border-t border-gray-700 hover:bg-gray-750 transition-colors">
                  <td className="px-6 py-4 font-medium text-white text-base flex items-center">
                    <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold mr-3">
                      {r.name.charAt(0)}
                    </div>
                    {r.name}
                  </td>
                  <td className="px-6 py-4 text-gray-300">{r.shift}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${r.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {r.active ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="bg-gray-900 px-3 py-1 rounded text-gray-300 font-mono">
                      {r.trips_count}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-bold ${r.pending_cash > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                      ${r.pending_cash.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => viewHistory(r)}
                      className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded transition-colors"
                    >
                      Ver Viajes
                    </button>
                  </td>
                </tr>
              ))}
              {repartidores.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-500">No hay repartidores registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Global History and Devueltos UI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Historial Panel (2/3 width) */}
        <div className="lg:col-span-2 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-sm flex flex-col max-h-[600px]">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 sticky top-0 z-10">
                <h3 className="font-bold text-white">Historial</h3>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-3 bg-gray-800">
                {globalHistory.filter(t => !['devuelto', 'cancelado', 'rechazado', 'anulado'].includes(t.status?.trim().toLowerCase())).map(trip => (
                    <div key={trip.id} className="bg-gray-900 p-4 rounded-xl shadow-sm border border-gray-700 flex justify-between items-start hover:bg-gray-800 transition-colors">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="font-bold text-white text-sm">Pedido #{trip.pedido_id || trip.id}</div>
                                <div className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                                    {trip.status || 'SIN ESTADO'}
                                </div>
                            </div>
                            <div className="text-xs text-gray-400 mb-1">Cliente: <span className="font-medium text-gray-300">{trip.client_name || 'Sin nombre'}</span></div>
                            <div className="text-xs text-gray-400 mb-1">Direccion: <span className="font-medium text-gray-300">{trip.address || '-'}</span></div>
                            <div className="text-xs text-gray-400 mb-1">Total: <span className="font-bold text-emerald-400">${trip.total_amount.toLocaleString()}</span></div>
                            <div className="text-xs text-gray-500 mt-2">Fecha: {trip.created_at ? new Date(trip.created_at).toLocaleString('es-AR', {day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit'}) : '-'}</div>
                        </div>
                        <div className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-[10px] font-bold px-2 py-1 rounded-full uppercase">
                            {trip.repartidor_name}
                        </div>
                    </div>
                ))}
                {globalHistory.filter(t => !['devuelto', 'cancelado', 'rechazado', 'anulado'].includes(t.status?.trim().toLowerCase())).length === 0 && (
                    <p className="text-center text-gray-500 py-10 text-sm">No hay historial reciente.</p>
                )}
            </div>
        </div>

        {/* Panel de Pedidos Devueltos (1/3 width) */}
        <div className="lg:col-span-1 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-sm flex flex-col max-h-[600px]">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 sticky top-0 z-10">
                <h3 className="font-bold text-white">Pedidos devueltos</h3>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-3 bg-gray-800">
                {globalHistory.filter(t => ['devuelto', 'cancelado', 'rechazado', 'anulado'].includes(t.status?.trim().toLowerCase())).map(trip => (
                    <div key={trip.id} className="bg-gray-900 p-4 rounded-xl shadow-sm border border-gray-700 flex justify-between items-start hover:bg-gray-800 transition-colors">
                        <div className="w-full">
                            <div className="flex justify-between items-center mb-2">
                                <div className="font-bold text-white text-sm">Pedido #{trip.pedido_id || trip.id}</div>
                                <div className="bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold px-2 py-1 rounded-full uppercase">
                                    Devuelto
                                </div>
                            </div>
                            <div className="text-xs text-gray-400 mb-1">De: <span className="font-medium text-gray-300">{trip.from_repartidor_name || 'SISTEMA'}</span></div>
                            <div className="text-xs text-gray-400 mb-1">A: <span className="font-medium text-yellow-400 uppercase">{trip.repartidor_name}</span></div>
                            <div className="text-xs text-gray-400 mb-1">Cliente: <span className="font-medium text-gray-300">{trip.client_name || 'Sin nombre'}</span></div>
                            <div className="text-xs text-gray-400 mb-1">Direccion: <span className="font-medium text-gray-300">{trip.address || '-'}</span></div>
                            <div className="text-xs text-gray-400 mb-1">Total: <span className="font-bold text-emerald-400">${trip.total_amount.toLocaleString()}</span></div>
                            <div className="text-xs text-gray-500 mt-2">Motivo: <span className="italic text-gray-400">{trip.notes || 'Sin motivo'}</span></div>
                        </div>
                    </div>
                ))}
                {globalHistory.filter(t => ['devuelto', 'cancelado', 'rechazado', 'anulado'].includes(t.status?.trim().toLowerCase())).length === 0 && (
                    <p className="text-center text-gray-500 py-10 text-sm">No hay pedidos devueltos.</p>
                )}
            </div>
        </div>

      </div>

      {/* History Modal */}
      {historyModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-2xl w-full flex flex-col shadow-2xl max-h-[90vh]">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
              <div>
                <h3 className="text-xl font-bold text-white">Historial de Viajes</h3>
                <p className="text-emerald-400 text-sm font-semibold">{selectedDriver?.name}</p>
              </div>
              <button onClick={() => setHistoryModalOpen(false)} className="text-gray-400 hover:text-white text-2xl font-bold leading-none">×</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {loadingHistory ? (
                <p className="text-center text-gray-500 py-10">Cargando historial...</p>
              ) : driverHistory.length === 0 ? (
                <p className="text-center text-gray-500 py-10">No hay viajes registrados para este repartidor.</p>
              ) : (
                <div className="space-y-3">
                  {driverHistory.map((trip) => (
                    <div key={trip.id} className="bg-gray-800 p-4 rounded-lg flex flex-col md:flex-row md:items-center justify-between border border-gray-700">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-gray-300 font-bold">Viaje #{trip.id}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${trip.status === 'rendido' || trip.status === 'liquidado' || trip.status === 'settled' ? 'bg-emerald-500/20 text-emerald-400' : trip.status === 'cancelado' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                    {trip.status}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500">{trip.created_at}</p>
                            {trip.address && <p className="text-sm text-gray-400 mt-1">📍 {trip.address}</p>}
                        </div>
                        <div className="mt-3 md:mt-0 md:text-right">
                            <p className="text-emerald-400 font-bold text-lg">${trip.total_amount.toLocaleString()}</p>
                            {trip.pedido_id && <p className="text-xs text-gray-500">Pedido #{trip.pedido_id}</p>}
                        </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
