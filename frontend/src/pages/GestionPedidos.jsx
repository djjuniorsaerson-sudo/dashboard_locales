import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit, XCircle, Search, CreditCard, User, Download } from 'lucide-react';

export default function GestionPedidos({ setOrderToEdit, setCurrentView }) {
  const { token, currentLocation } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const isOffline = !!currentLocation && currentLocation.status !== 'ONLINE';

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const installationQuery = currentLocation?.id ? `?installation_id=${encodeURIComponent(currentLocation.id)}` : '';
      const res = await fetch(`/api/v1/data/cocina/pedidos${installationQuery}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Ensure data is an array
        setOrders(Array.isArray(data) ? data : (data.pedidos || data.data || []));
      } else {
        console.error("API error response:", res.status);
        setOrders([]);
      }
    } catch (e) {
      console.error("Error fetching orders", e);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [token, currentLocation?.id]);

  const handleEdit = (order) => {
    if (isOffline) {
      alert('El local está OFFLINE. Podés ver el último estado sincronizado, pero no editar pedidos hasta que vuelva a estar ONLINE.');
      return;
    }
    setOrderToEdit(order);
    setCurrentView('nuevo_pedido');
  };

  const handleCancel = async (orderId) => {
    if (isOffline) {
      alert('El local está OFFLINE. Podés ver el último estado sincronizado, pero no anular pedidos hasta que vuelva a estar ONLINE.');
      return;
    }
    if (!window.confirm(`¿Estás seguro de que quieres anular el pedido #${orderId}?`)) return;
    
    // Optimistic UI update
    setOrders(orders.filter(o => o.id !== orderId));

    try {
      const res = await fetch(`/api/v1/data/pedidos/${orderId}/cancel?installation_id=${encodeURIComponent(currentLocation?.id || '')}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const errText = await res.text();
        alert(`Error al cancelar: ${res.status} - ${errText}`);
        fetchOrders();
      } else {
        // En un caso real mostraríamos un toast
      }
    } catch (e) {
      console.error("Error canceling order", e);
      alert(`Error de red al cancelar: ${e.message}`);
      // Reload orders to revert optimistic update if failed
      fetchOrders();
    }
  };

  const exportOrders = async () => {
    if (!currentLocation?.id) {
      alert('No hay un local activo seleccionado.');
      return;
    }
    setExporting(true);
    try {
      const res = await fetch(`/api/v1/data/pedidos/export/xlsx?installation_id=${encodeURIComponent(currentLocation.id)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || 'No se pudo descargar el Excel');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || `pedidos_activos_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting pedidos', error);
      alert(error.message || 'No se pudo descargar el Excel');
    } finally {
      setExporting(false);
    }
  };

  const filteredOrders = Array.isArray(orders) ? orders.filter(o => 
    (o.id && o.id.toString().includes(search)) || 
    (o.client_name && o.client_name.toLowerCase().includes(search.toLowerCase()))
  ) : [];

  const formatMoney = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;

  const getClientName = (order) =>
    String(order?.client_name || order?.customer_name || '').trim() || 'Cliente Mostrador';

  const getAddress = (order) =>
    String(order?.customer_address || order?.address || '').trim();

  const getItemName = (item) =>
    String(item?.product_name || item?.name || '').trim() || 'Producto';

  return (
    <div className="flex flex-col h-full bg-white/[0.03] rounded-3xl border border-white/10 overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
      {/* Header & Search */}
      <div className="p-6 border-b border-white/10 bg-black/10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-purple-300/80 mb-2">Operación en curso</p>
          <h2 className="text-3xl font-black text-white tracking-tight">Pedidos Activos</h2>
          <p className="text-sm text-gray-400 mt-1">Gestiona, edita o cancela órdenes en curso.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <button
            onClick={exportOrders}
            disabled={exporting || !currentLocation?.id}
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-900/40 disabled:text-emerald-300/60 disabled:cursor-not-allowed text-white px-4 py-3 rounded-2xl font-bold transition-colors w-full sm:w-auto shadow-lg shadow-emerald-950/20"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Descargando...' : 'Descargar Excel'}
          </button>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar por ID o Cliente..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-950/70 border border-white/10 text-white rounded-2xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/40 transition-all"
          />
        </div>
      </div>
      </div>

      {isOffline && (
        <div className="mx-6 mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Mostrando el último estado sincronizado de pedidos. Las acciones en tiempo real quedan deshabilitadas hasta que el local vuelva a estar ONLINE.
        </div>
      )}

      {/* Orders List */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-full text-gray-500">
            <Search className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg">No hay pedidos activos que coincidan.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <AnimatePresence>
              {filteredOrders.map((order, idx) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-gray-900/50 rounded-3xl border border-white/10 overflow-hidden hover:border-purple-500/30 transition-colors flex flex-col shadow-xl"
                >
                  <div className="p-5 border-b border-white/10 flex justify-between items-start bg-black/10">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-bold text-white">#{order.id}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wider ${
                          (order.state || '').toLowerCase() === 'listo' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : 
                          'bg-orange-500/20 text-orange-400 border border-orange-500/20'
                        }`}>
                          {(order.state || 'Pendiente').replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center text-gray-400 text-sm mt-2">
                        <User className="w-4 h-4 mr-1.5" />
                        {getClientName(order)}
                      </div>
                      {getAddress(order) && (
                        <div className="text-gray-500 text-xs mt-2 break-words max-w-[240px]">
                          {getAddress(order)}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-emerald-400">{formatMoney(order.total)}</div>
                      <div className="flex items-center justify-end text-gray-500 text-xs mt-1 uppercase tracking-wide">
                        <CreditCard className="w-3.5 h-3.5 mr-1" />
                        {order.payment_method || 'sin definir'}
                      </div>
                    </div>
                  </div>

                  <div className="p-5 flex-1">
                    <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.16em] mb-3">Detalle del Pedido</h4>
                    <div className="space-y-3">
                      {(order.items || []).map((item, i) => (
                        <div key={i} className="border-b border-white/10 pb-3 last:border-0 last:pb-0">
                          <div className="flex justify-between gap-3 text-sm">
                            <span className="text-gray-200 break-words">
                              <span className="text-orange-400 font-semibold mr-2">{item.quantity || 1}x</span>
                              {getItemName(item)}
                            </span>
                            <span className="text-gray-400 font-medium whitespace-nowrap">
                              {formatMoney((Number(item.price || 0) * Number(item.quantity || 1)))}
                            </span>
                          </div>

                          {Array.isArray(item.guarniciones) && item.guarniciones.length > 0 && (
                            <div className="mt-2 pl-5 space-y-1">
                              {item.guarniciones.map((g, gi) => (
                                <div key={gi} className="text-xs text-gray-400 flex items-center">
                                  <div className="w-1.5 h-1.5 rounded-full bg-orange-500/50 mr-2"></div>
                                  {g.quantity || 1}x {g.name}
                                </div>
                              ))}
                            </div>
                          )}

                          {Array.isArray(item.extras) && item.extras.length > 0 && (
                            <div className="mt-2 pl-5 space-y-1">
                              {item.extras.map((extra, extraIndex) => (
                                <div key={extraIndex} className="text-xs text-blue-400 flex items-center">
                                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50 mr-2"></div>
                                  + {extra.quantity || 1}x {extra.name}
                                </div>
                              ))}
                            </div>
                          )}

                          {Array.isArray(item.toppings) && item.toppings.length > 0 && (
                            <div className="mt-2 pl-5 space-y-1">
                              {item.toppings.map((topping, toppingIndex) => (
                                <div key={toppingIndex} className="text-xs text-emerald-400 flex items-center">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 mr-2"></div>
                                  + {topping.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}

                      {(!order.items || order.items.length === 0) && (
                        <div className="text-sm text-gray-500">Sin detalle de productos disponible.</div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 bg-black/10 flex gap-3 border-t border-white/10">
                    <button 
                      onClick={() => handleCancel(order.id)}
                      disabled={isOffline}
                      className={`flex-1 flex items-center justify-center px-4 py-3 border rounded-2xl font-semibold transition-all ${isOffline ? 'bg-red-900/20 text-red-300/60 border-red-500/10 cursor-not-allowed opacity-60' : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 hover:text-red-300'}`}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Anular
                    </button>
                    <button 
                      onClick={() => handleEdit(order)}
                      disabled={isOffline}
                      className={`flex-1 flex items-center justify-center px-4 py-3 border rounded-2xl font-semibold transition-all ${isOffline ? 'bg-blue-900/20 text-blue-300/60 border-blue-500/10 cursor-not-allowed opacity-60' : 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20 hover:text-blue-300'}`}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Editar
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
