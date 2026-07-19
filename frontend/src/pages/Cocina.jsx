import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CheckCircle2 } from 'lucide-react';

export default function Cocina() {
  const { token } = useAuth();
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
      const res = await fetch(`/api/v1/data/cocina/pedidos?t=${Date.now()}`, {
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
    return () => clearInterval(interval);
  }, [token]);

  const markDone = async (orderId, kitchenKey) => {
    try {
      const res = await fetch(`/api/v1/data/cocina/comandas/${orderId}/${kitchenKey}/state`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: "done" })
      });
      if (res.ok) {
        fetchOrders();
      } else {
        console.error("Error updating state");
      }
    } catch (e) {
      console.error("Error marking done", e);
    }
  };

  const calculateDelay = (orderTime) => {
    if (!orderTime) return 0;
    const orderDate = new Date(orderTime);
    const now = new Date();
    const diffMs = now - orderDate;
    return Math.floor(diffMs / 60000); // Minutos de demora
  };

  // Filtrar según lógica Yummy
  // Temporary override: show all orders for debugging
  const kitchen1Orders = orders;
  const kitchen2Orders = orders;

  const readyOrders = orders.filter(o => o.status === 'Listo' && o.archived === false);

  const displayOrders = activeTab === 'kitchen1' ? kitchen1Orders : 
                        activeTab === 'kitchen2' ? kitchen2Orders : readyOrders;

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
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
        <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700 w-max shadow-inner">
          <button 
            onClick={() => setActiveTab('kitchen1')} 
            className={`px-4 py-2 text-sm font-bold rounded-md transition-all duration-300 ${activeTab === 'kitchen1' ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/30' : 'text-gray-400 hover:text-white'}`}
          >
            {config?.kitchen1_name || 'Cocina 1'} ({kitchen1Orders.length})
          </button>
          <button 
            onClick={() => setActiveTab('kitchen2')} 
            className={`px-4 py-2 text-sm font-bold rounded-md transition-all duration-300 ${activeTab === 'kitchen2' ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/30' : 'text-gray-400 hover:text-white'}`}
          >
            {config?.kitchen2_name || 'Cocina 2'} ({kitchen2Orders.length})
          </button>
          <button 
            onClick={() => setActiveTab('listos')} 
            className={`px-4 py-2 text-sm font-bold rounded-md transition-all duration-300 ${activeTab === 'listos' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30' : 'text-gray-400 hover:text-white'}`}
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
          <motion.div layout className="flex flex-wrap gap-6 items-start content-start">
            <AnimatePresence>
              {displayOrders.map(order => {
                const ticket = activeTab === 'kitchen1' ? order.kitchen_tickets?.kitchen1 : 
                               activeTab === 'kitchen2' ? order.kitchen_tickets?.kitchen2 : null;
                
                const delay = calculateDelay(order.order_time || order.created_at);
                const isCritical = delay >= 20;
                const isWarning = delay >= 10 && delay < 20;

                // Estilos dinámicos estilo Neon
                let borderGlow = "border-gray-700";
                let headerBg = "bg-gray-800/80";
                let timerBg = "bg-gray-700 text-gray-300";
                
                if (isCritical) {
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
                    className={`w-80 max-w-sm flex flex-col bg-gray-900 backdrop-blur-md rounded-2xl border ${borderGlow} overflow-hidden h-max transition-colors`}
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
                      </div>
                      <div className={`flex flex-col items-center justify-center px-3 py-1.5 rounded-xl ${timerBg} transition-colors`}>
                        <div className="flex items-center gap-1">
                          {isCritical && <Clock className="w-3 h-3 animate-spin" style={{ animationDuration: '2s' }}/>}
                          <span className="text-xl font-black">{delay}</span>
                        </div>
                        <span className="text-[10px] uppercase font-bold tracking-widest">MIN</span>
                      </div>
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

                    {/* Footer Actions */}
                    {activeTab !== 'listos' && (
                      <div className="p-3 bg-gray-950 border-t border-gray-800">
                        <button 
                          onClick={() => markDone(order.id, activeTab)} 
                          className="w-full bg-gray-800 hover:bg-emerald-500 text-gray-300 hover:text-black font-bold py-3 rounded-xl transition-all duration-300 shadow-md flex items-center justify-center gap-2 group"
                        >
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 group-hover:text-black transition-colors" />
                          Marcar Terminado
                        </button>
                      </div>
                    )}
                    {activeTab === 'listos' && (
                      <div className="p-4 border-t border-gray-800 bg-gray-900 text-center">
                        <span className="text-emerald-500 font-bold flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5 mr-1" />
                          Esperando Despacho / Retiro
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
