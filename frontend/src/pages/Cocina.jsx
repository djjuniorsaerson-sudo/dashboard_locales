import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CheckCircle2 } from 'lucide-react';
import LocationSyncBanner from '../components/LocationSyncBanner';
import { subscribePanelSync } from '../components/syncEvents';

export default function Cocina() {
  const { token, currentLocation } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('kitchen1'); // kitchen1, kitchen2, listos
  const [config, setConfig] = useState(null);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/v1/data/cocina/config', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (e) {
      console.error("Error fetching config", e);
    }
  };

  const fetchOrders = async () => {
    try {
      const params = new URLSearchParams({ t: String(Date.now()) });
      if (currentLocation?.id) {
        params.set('installation_id', currentLocation.id);
      }
      const res = await fetch(`/api/v1/data/cocina/pedidos?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (e) {
      console.error("Error fetching orders", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchOrders();
    const interval = setInterval(fetchOrders, 4000); // Polling cada 4s
    const unsubscribe = subscribePanelSync((detail) => {
      if (detail?.modules && !detail.modules.some((module) => ['orders', 'kitchen', 'dashboard'].includes(module))) {
        return;
      }
      fetchOrders();
    });
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [token, currentLocation?.id]);

  const parseServerDateTime = (value) => {
    if (value instanceof Date) {
      return value;
    }
    const raw = String(value || '').trim();
    if (!raw) {
      return null;
    }
    const gmtMatch = raw.match(/^[A-Za-z]{3}, (\d{2}) ([A-Za-z]{3}) (\d{4}) (\d{2}):(\d{2})(?::(\d{2}))? GMT$/);
    if (gmtMatch) {
      const [, day, monthLabel, year, hours, minutes, seconds = '00'] = gmtMatch;
      const monthMap = {
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
        Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
      };
      return new Date(
        Number(year),
        monthMap[monthLabel] ?? 0,
        Number(day),
        Number(hours),
        Number(minutes),
        Number(seconds),
      );
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const parseScheduledOrderDate = (order) => {
    const orderTime = String(order?.order_time || '').trim();
    if (!orderTime) {
      return null;
    }
    const [hours, minutes] = orderTime.split(':').map((value) => Number(value || 0));
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null;
    }
    const createdAt = parseServerDateTime(order?.created_at || new Date().toISOString());
    if (!(createdAt instanceof Date) || Number.isNaN(createdAt.getTime())) {
      return null;
    }
    let scheduledAt = new Date(
      createdAt.getFullYear(),
      createdAt.getMonth(),
      createdAt.getDate(),
      hours,
      minutes,
      0,
      0,
    );
    const diffMs = createdAt.getTime() - scheduledAt.getTime();
    if (Number.isFinite(diffMs) && diffMs > (6 * 60 * 60 * 1000)) {
      scheduledAt = new Date(scheduledAt.getTime() + (24 * 60 * 60 * 1000));
    }
    return scheduledAt;
  };

  const calculateDelay = (order) => {
    const now = new Date();
    const created = parseServerDateTime(order?.created_at || '');
    const scheduledAt = parseScheduledOrderDate(order);
    let reference = created;
    if (scheduledAt instanceof Date && !Number.isNaN(scheduledAt.getTime())) {
      if (!(created instanceof Date) || Number.isNaN(created.getTime()) || scheduledAt.getTime() >= created.getTime()) {
        reference = scheduledAt;
      }
    }
    if (!(reference instanceof Date) || Number.isNaN(reference.getTime())) {
      return 0;
    }
    const elapsed = (now.getTime() - reference.getTime()) / 60000;
    return Math.max(0, Math.floor(elapsed));
  };

  const kitchen1Orders = orders.filter((order) => {
    const ticket = order.kitchen_tickets?.kitchen1;
    return Boolean(ticket?.visible) && Array.isArray(ticket?.items) && ticket.items.length > 0 && ticket.status !== 'done';
  });

  const kitchen2Orders = orders.filter((order) => {
    const ticket = order.kitchen_tickets?.kitchen2;
    return Boolean(ticket?.visible) && Array.isArray(ticket?.items) && ticket.items.length > 0 && ticket.status !== 'done';
  });

  const readyOrders = orders.filter((order) => {
    const normalizedStatus = String(order?.status || order?.state || '').trim().toLowerCase();
    return ['listo', 'entregado'].includes(normalizedStatus) && order.archived === false;
  });

  const isOrderPaid = (order) => {
    if (typeof order?.is_paid === 'boolean') {
      return order.is_paid;
    }

    const method = String(order?.payment_method || '').trim().toLowerCase();
    const detail = String(order?.payment_detail || '').trim().toLowerCase();
    const breakdown = order?.payment_breakdown || {};
    const transferAmount = Number(breakdown?.transferencia || 0);
    const onlineAmount = Number(breakdown?.online || 0);
    const awaitingTransfer = detail.includes('transfer') && detail.includes('pend');

    if (awaitingTransfer) {
      return false;
    }

    return (
      method === 'transferencia'
      || transferAmount > 0
      || onlineAmount > 0
      || detail.includes('confirm')
      || detail.includes('pagad')
    );
  };

  const paymentStateLabel = (order) => (isOrderPaid(order) ? 'Pagado' : 'No pagado');

  const displayOrders = activeTab === 'kitchen1' ? kitchen1Orders : 
                        activeTab === 'kitchen2' ? kitchen2Orders : readyOrders;

  return (
    <div className="flex flex-col h-full space-y-6">
      <LocationSyncBanner
        location={currentLocation}
        title="Estado de cocina"
        onlineMessage="La cocina está leyendo pedidos en vivo."
        offlineMessage="La cocina puede mostrar el último estado sincronizado. Si el local cae, puede haber demora hasta reconectar."
      />
      <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Pedidos en Cocina (KDS)</h2>
            <p className="text-gray-400">Monitor en Tiempo Real</p>
          </div>
          <button 
            onClick={fetchOrders}
            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center transition-colors border border-gray-700 h-fit"
            title="Actualizar pedidos"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            Actualizar
          </button>
        </div>
        <div className="flex flex-wrap bg-gray-800 rounded-lg p-1 border border-gray-700 w-full xl:w-max shadow-inner">
          <button 
            onClick={() => setActiveTab('kitchen1')} 
            className={`flex-1 xl:flex-none px-4 py-2 text-sm font-bold rounded-md transition-all duration-300 ${activeTab === 'kitchen1' ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/30' : 'text-gray-400 hover:text-white'}`}
          >
            {config?.kitchen1_name || 'Cocina 1'} ({kitchen1Orders.length})
          </button>
          <button 
            onClick={() => setActiveTab('kitchen2')} 
            className={`flex-1 xl:flex-none px-4 py-2 text-sm font-bold rounded-md transition-all duration-300 ${activeTab === 'kitchen2' ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/30' : 'text-gray-400 hover:text-white'}`}
          >
            {config?.kitchen2_name || 'Cocina 2'} ({kitchen2Orders.length})
          </button>
          <button 
            onClick={() => setActiveTab('listos')} 
            className={`flex-1 xl:flex-none px-4 py-2 text-sm font-bold rounded-md transition-all duration-300 ${activeTab === 'listos' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30' : 'text-gray-400 hover:text-white'}`}
          >
            Salida / Listos ({readyOrders.length})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-4 pr-2 custom-scrollbar">
        {loading && displayOrders.length === 0 ? (
           <div className="flex flex-wrap gap-4 items-start">
             {[1,2,3].map(i => (
               <div key={i} className="w-80 bg-gray-800 rounded-xl p-4 animate-pulse h-64 border border-gray-700"></div>
             ))}
           </div>
        ) : displayOrders.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }}
            className="h-full flex items-center justify-center bg-gray-900/50 rounded-2xl border border-dashed border-gray-700 backdrop-blur-sm"
          >
            <div className="text-center">
              <CheckCircle2 className="w-16 h-16 text-emerald-500/50 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-300 mb-2">Excelente, no hay pedidos pendientes.</h3>
              <p className="text-gray-500">Todo marcha al día en {activeTab === 'kitchen1' ? 'Cocina 1' : activeTab === 'kitchen2' ? 'Cocina 2' : 'la Salida'}.</p>
            </div>
          </motion.div>
        ) : (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 sm:gap-6 items-start content-start">
            <AnimatePresence>
              {displayOrders.map(order => {
                const ticket = activeTab === 'kitchen1' ? order.kitchen_tickets?.kitchen1 : 
                               activeTab === 'kitchen2' ? order.kitchen_tickets?.kitchen2 : null;
                const isReadyTab = activeTab === 'listos';
                const customerAddress = String(
                  order.customer_address ||
                  order.address ||
                  order.delivery_address ||
                  ''
                ).trim();
                const delay = calculateDelay(order);
                const isCritical = delay >= 20;
                const isWarning = delay >= 10 && delay < 20;

                // Estilos dinámicos estilo Neon
                let borderGlow = "border-gray-700";
                let headerBg = "bg-gray-800/80";
                let timerBg = "bg-gray-700 text-gray-300";
                
                if (isReadyTab) {
                  borderGlow = "border-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.18)]";
                  headerBg = "bg-emerald-950/20";
                  timerBg = "bg-emerald-500 text-black";
                } else if (isCritical) {
                  borderGlow = "border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-pulse";
                  headerBg = "bg-red-950/50";
                  timerBg = "bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)]";
                } else if (isWarning) {
                  borderGlow = "border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.2)]";
                  headerBg = "bg-orange-950/30";
                  timerBg = "bg-orange-500 text-black";
                } else {
                  borderGlow = "border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]";
                  headerBg = "bg-emerald-950/20";
                  timerBg = "bg-emerald-500 text-black";
                }

                return (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8, filter: "blur(10px)" }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    key={order.id} 
                    className={`w-full flex flex-col bg-gray-900 backdrop-blur-md rounded-2xl border ${borderGlow} overflow-hidden h-max transition-colors`}
                  >
                    {/* Card Header */}
                    <div className={`p-4 ${headerBg} border-b border-gray-800 flex justify-between items-center`}>
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-400 flex flex-wrap gap-1 items-center">
                          #{order.id} • {order.order_type}
                          {order.is_scheduled && <span className="bg-purple-500 text-white text-[9px] px-1.5 py-0.5 rounded">PROG</span>}
                          {order.is_updated && <span className="bg-blue-500 text-white text-[9px] px-1.5 py-0.5 rounded">ACTUALIZADO</span>}
                          {order.needs_reassignment && <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded animate-pulse">REASIGNAR</span>}
                        </span>
                        <h3 className="text-lg font-bold text-white mt-1 truncate" title={order.customer_name || 'Sin Nombre'}>{order.customer_name || 'Sin Nombre'}</h3>
                        {customerAddress && (
                          <p className="text-sm text-gray-300 mt-1 break-words" title={customerAddress}>
                            {customerAddress}
                          </p>
                        )}
                        {isReadyTab && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                              {String(order.payment_method || 'sin definir').trim() || 'sin definir'}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                                isOrderPaid(order)
                                  ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                                  : 'border-red-500/30 bg-red-500/15 text-red-300'
                              }`}
                            >
                              {paymentStateLabel(order)}
                            </span>
                          </div>
                        )}
                      </div>
                      {isReadyTab ? (
                        <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${timerBg} transition-colors`}>
                          <CheckCircle2 className="w-7 h-7" />
                        </div>
                      ) : (
                        <div className={`flex flex-col items-center justify-center px-3 py-1.5 rounded-xl ${timerBg} transition-colors`}>
                          <div className="flex items-center gap-1">
                            {isCritical && <Clock className="w-3 h-3 animate-spin" style={{ animationDuration: '2s' }}/>}
                            <span className="text-xl font-black">{delay}</span>
                          </div>
                          <span className="text-[10px] uppercase font-bold tracking-widest">MIN</span>
                        </div>
                      )}
                    </div>

                    {/* Card Body - Items */}
                    <div className="p-4 overflow-y-auto flex-1 space-y-3">
                      {(ticket?.items || order.items || []).map((item, idx) => (
                        <div key={idx} className="border-b border-gray-800/50 pb-3 last:border-0 last:pb-0">
                          <div className="flex justify-between items-start">
                            <span className="font-bold text-gray-100 text-lg flex items-center flex-wrap">
                              <span><span className="text-orange-400 mr-2">{item.quantity}x</span>{item.product_name}</span>
                              {item.routing_type === 'Prioritario' && <span className="ml-2 text-[9px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded tracking-widest shadow-[0_0_5px_rgba(220,38,38,0.6)]">PRIORITARIO</span>}
                              {item.routing_type === 'Prioritario 2' && <span className="ml-2 text-[9px] font-bold bg-orange-600 text-white px-1.5 py-0.5 rounded tracking-widest">PRIORITARIO 2</span>}
                              {item.routing_type === 'Secundario' && <span className="ml-2 text-[9px] font-medium bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded tracking-widest">SECUNDARIO</span>}
                            </span>
                          </div>
                          
                          {/* Guarniciones */}
                          {item.guarniciones && item.guarniciones.length > 0 && (
                            <div className="mt-1 pl-6">
                              {item.guarniciones.map((g, gi) => (
                                <div key={gi} className="text-sm text-gray-400 flex items-center">
                                  <div className="w-1.5 h-1.5 rounded-full bg-orange-500/50 mr-2"></div>
                                  {g.quantity || 1}x {g.name}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Extras */}
                          {item.extras && item.extras.length > 0 && (
                            <div className="mt-1 pl-6">
                              {item.extras.map((ex, exi) => (
                                <div key={exi} className="text-sm text-blue-400 flex items-center">
                                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50 mr-2"></div>
                                  + {ex.quantity || 1}x {ex.name}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Toppings */}
                          {item.toppings && item.toppings.length > 0 && (
                            <div className="mt-1 pl-6">
                              {item.toppings.map((t, ti) => (
                                <div key={ti} className="text-sm text-emerald-400 flex items-center">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 mr-2"></div>
                                  + {t.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {order.notes && (
                        <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                          <p className="text-sm text-yellow-200 font-medium">💬 {order.notes}</p>
                        </div>
                      )}
                    </div>

                    {activeTab === 'listos' && (
                      <div className="p-4 border-t border-gray-800 bg-gray-900 text-center">
                        <span className="text-emerald-500 font-bold flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5 mr-1" />
                          Entregado
                        </span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
