import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribePanelSync } from '../components/syncEvents';
import { useModal } from '../context/ModalContext';

export default function Repartidores() {
  const { token, currentLocation } = useAuth();
  const { showAlert } = useModal();
  const [repartidores, setRepartidores] = useState([]);
  const [loading, setLoading] = useState(true);

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [driverHistory, setDriverHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [globalHistory, setGlobalHistory] = useState([]);
  const [deliveredOrders, setDeliveredOrders] = useState([]);
  const [deliveredSearch, setDeliveredSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const fetchRepartidores = async () => {
      try {
        if (!currentLocation?.id) {
          setRepartidores([]);
          return;
        }
        const res = await fetch(`/api/v1/data/repartidores?installation_id=${encodeURIComponent(currentLocation.id)}`, {
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
        if (!currentLocation?.id) {
          setGlobalHistory([]);
          return;
        }
        const res = await fetch(`/api/v1/data/repartidores/history?installation_id=${encodeURIComponent(currentLocation.id)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setGlobalHistory(await res.json());
        }
      } catch (e) {
        console.error("Error fetching history", e);
      }
    };

    const fetchDeliveredOrders = async () => {
      try {
        if (!currentLocation?.id) {
          setDeliveredOrders([]);
          return;
        }
        const res = await fetch(`/api/v1/data/repartidores/delivered?installation_id=${encodeURIComponent(currentLocation.id)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setDeliveredOrders(await res.json());
        }
      } catch (e) {
        console.error("Error fetching delivered orders", e);
      }
    };

    fetchRepartidores();
    fetchGlobalHistory();
    fetchDeliveredOrders();
    const interval = setInterval(() => {
      fetchRepartidores();
      fetchGlobalHistory();
      fetchDeliveredOrders();
    }, 15000);
    const unsubscribe = subscribePanelSync((detail) => {
      if (detail?.modules && !detail.modules.some((module) => ['orders', 'repartidores', 'dashboard'].includes(module))) {
        return;
      }
      fetchRepartidores();
      fetchGlobalHistory();
      fetchDeliveredOrders();
    });
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [token, currentLocation?.id]);

  const viewHistory = async (driver) => {
    setSelectedDriver(driver);
    setHistoryModalOpen(true);
    setLoadingHistory(true);
    try {
        const installationQuery = currentLocation?.id ? `?installation_id=${encodeURIComponent(currentLocation.id)}` : '';
        const res = await fetch(`/api/v1/data/repartidores/history${installationQuery}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const historyRows = await res.json();
            const filteredRows = (historyRows || []).filter((row) => {
              const driverId = Number(row.repartidor_id || row.driver_id || 0);
              const driverName = String(row.repartidor_name || row.driver_name || '').trim().toLowerCase();
              return driverId === Number(driver.id) || driverName === String(driver.name || '').trim().toLowerCase();
            }).map((row) => ({
              ...row,
              id: row.trip_id || row.id,
              pedido_id: row.order_id || row.pedido_id || null,
              total_amount: Number(row.total_amount || 0),
              created_at: row.assigned_at || row.created_at || row.order_created_at || null,
              address: getTripDestination(row),
              notes: row.notes || '',
              status: row.status || row.movement_type || 'activo',
            }));
            setDriverHistory(filteredRows);
        }
    } catch (e) {
        console.error(e);
    } finally {
        setLoadingHistory(false);
    }
  };

  const exportMovimientos = async () => {
    if (!currentLocation?.id) {
      showAlert({ title: 'Falta local activo', message: 'No hay un local activo seleccionado.', tone: 'warning' });
      return;
    }
    setExporting(true);
    try {
      const res = await fetch(`/api/v1/data/repartidores/export/xlsx?installation_id=${encodeURIComponent(currentLocation.id)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || 'No se pudo descargar el Excel');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || `repartidores_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting repartidores', error);
      showAlert({ title: 'No se pudo descargar', message: error.message || 'No se pudo descargar el Excel', tone: 'danger' });
    } finally {
      setExporting(false);
    }
  };

  const formatMoney = (amount) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount);
  };

  const getDriverShift = (driver) => String(driver?.shift || driver?.shift_label || '-').trim() || '-';
  const isDriverActive = (driver) => Boolean(driver?.active ?? driver?.is_active);
  const getDriverPendingCash = (driver) => Number(
    driver?.pending_cash
    ?? driver?.total_to_settle
    ?? driver?.money_total
    ?? 0
  );

  const formatDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('es-AR', {day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit'});
  };

  const getTripDestination = (trip) => {
    const destination = [
      trip?.address,
      trip?.customer_address,
      trip?.destination_address,
      trip?.delivery_address,
      trip?.destino,
    ].find((value) => String(value || '').trim());
    return destination || 'Sin dirección registrada';
  };

  const normalizeSearch = (value) => String(value || '').toLowerCase().trim();
  const filteredDeliveredOrders = deliveredOrders.filter((row) => {
    const searchTerm = normalizeSearch(deliveredSearch);
    if (!searchTerm) {
      return true;
    }
    const totalAmount = Number(row.total_amount || 0);
    const searchable = normalizeSearch([
      row.order_id,
      row.driver_name,
      row.cashier_name,
      row.customer_address,
      formatDateTime(row.marked_at),
      Math.round(totalAmount),
      formatMoney(totalAmount),
    ].join(' '));
    return searchable.includes(searchTerm);
  });

  return (
    <div className="relative space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Flota de Repartidores</h2>
          <p className="text-gray-400 text-sm mt-1">Monitoreo de cadetes y dinero a rendir en tiempo real</p>
        </div>
        <button
          onClick={exportMovimientos}
          disabled={exporting || !currentLocation?.id}
          className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 16v-8m0 8l-3-3m3 3l3-3M4 18h16"></path></svg>
          {exporting ? 'Descargando...' : 'Descargar Excel'}
        </button>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg mb-8">
        {loading && repartidores.length === 0 ? (
           <div className="p-8 text-center text-gray-500">Cargando datos de la flota...</div>
        ) : (
          <>
            <div className="divide-y divide-gray-700 md:hidden">
              {repartidores.map((r) => (
                <div key={r.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center min-w-0">
                      <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold mr-3 shrink-0">
                        {r.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-white break-words">{r.name}</div>
                        <div className="text-sm text-gray-400 mt-1">{getDriverShift(r)}</div>
                      </div>
                    </div>
                    <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-bold ${isDriverActive(r) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {isDriverActive(r) ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-gray-900/60 rounded-lg p-3">
                      <div className="text-gray-500 text-xs uppercase tracking-wide">Viajes</div>
                      <div className="text-white font-semibold mt-1">{r.trips_count}</div>
                    </div>
                    <div className="bg-gray-900/60 rounded-lg p-3">
                      <div className="text-gray-500 text-xs uppercase tracking-wide">Efectivo</div>
                      <div className={`font-semibold mt-1 ${getDriverPendingCash(r) > 0 ? 'text-emerald-400' : 'text-gray-400'}`}>
                        ${getDriverPendingCash(r).toLocaleString(undefined, {minimumFractionDigits: 2})}
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => viewHistory(r)}
                    className="w-full rounded-lg bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 text-sm font-medium transition-colors"
                  >
                    Ver Viajes
                  </button>
                </div>
              ))}
              {repartidores.length === 0 && (
                <div className="px-6 py-8 text-center text-gray-500">No hay repartidores registrados.</div>
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
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
                      <td className="px-6 py-4 text-gray-300">{getDriverShift(r)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${isDriverActive(r) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                          {isDriverActive(r) ? 'ACTIVO' : 'INACTIVO'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="bg-gray-900 px-3 py-1 rounded text-gray-300 font-mono">
                          {r.trips_count}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-bold ${getDriverPendingCash(r) > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                          ${getDriverPendingCash(r).toLocaleString(undefined, {minimumFractionDigits: 2})}
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
            </div>
          </>
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

      <div className="mt-6 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-gray-700 bg-gray-900">
          <h3 className="font-bold text-white text-lg">Delivery Entregados</h3>
          <p className="text-gray-400 text-sm mt-1">Solo pedidos marcados como listos desde Salida Delivery.</p>
        </div>
        <div className="p-4 border-b border-gray-700 bg-gray-800">
          <input
            type="text"
            value={deliveredSearch}
            onChange={(e) => setDeliveredSearch(e.target.value)}
            placeholder="Buscar por repartidor, cajera, dirección, monto u hora"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-400">
            <thead className="bg-gray-900 text-gray-300 uppercase font-semibold">
              <tr>
                <th className="px-6 py-4">Pedido</th>
                <th className="px-6 py-4">Repartidor</th>
                <th className="px-6 py-4">Horario</th>
                <th className="px-6 py-4">Dirección</th>
                <th className="px-6 py-4">Pago</th>
                <th className="px-6 py-4 text-right">Monto</th>
                <th className="px-6 py-4 text-right">Vuelto</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeliveredOrders.map((row) => (
                <tr key={`${row.order_id}-${row.marked_at}`} className="border-t border-gray-700 hover:bg-gray-750 transition-colors">
                  <td className="px-6 py-4 font-medium text-white">#{row.order_id}</td>
                  <td className="px-6 py-4 text-white">{row.driver_name || 'Sin repartidor'}</td>
                  <td className="px-6 py-4">{formatDateTime(row.marked_at)}</td>
                  <td className="px-6 py-4">{row.customer_address || '-'}</td>
                  <td className="px-6 py-4">
                    {row.is_paid ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-emerald-700 text-white">
                        PAGADO
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 text-right text-white font-semibold">{formatMoney(row.total_amount || 0)}</td>
                  <td className="px-6 py-4 text-right">{formatMoney(row.change_amount || 0)}</td>
                </tr>
              ))}
              {filteredDeliveredOrders.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                    {deliveredSearch.trim() ? 'No hay pedidos que coincidan con la búsqueda.' : 'No hay pedidos entregados desde salida delivery.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
                            <p className="text-xs text-gray-500">{formatDateTime(trip.created_at)}</p>
                            <p className="text-sm text-gray-300 mt-2 break-words">
                              <span className="text-gray-500">Destino:</span> {getTripDestination(trip)}
                            </p>
                            {trip.notes && (
                              <p className="text-xs text-gray-500 mt-1 break-words">
                                Nota: {trip.notes}
                              </p>
                            )}
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
