import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit, XCircle, Search, Clock, CreditCard, User } from 'lucide-react';

export default function GestionPedidos({ setOrderToEdit, setCurrentView }) {
  const { token, currentLocation } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/v1/data/cocina/pedidos`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'X-Integration-Key': currentLocation?.api_key || '' 
        }
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
  }, [token]);

  const handleEdit = (order) => {
    setOrderToEdit(order);
    setCurrentView('nuevo_pedido');
  };

  const handleCancel = async (orderId) => {
    if (!window.confirm(`¿Estás seguro de que quieres anular el pedido #${orderId}?`)) return;
    
    // Optimistic UI update
    setOrders(orders.filter(o => o.id !== orderId));

    try {
      const res = await fetch(`http://localhost:8000/api/v1/data/pedidos/${orderId}/cancel`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'X-Integration-Key': currentLocation?.api_key || ''
        }
      });
      if (!res.ok) {
        const errText = await res.text();
        alert(`Error al cancelar: ${res.status} - KeyEnviada: ${currentLocation?.api_key} - ${errText}`);
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

  const filteredOrders = Array.isArray(orders) ? orders.filter(o => 
    (o.id && o.id.toString().includes(search)) || 
    (o.client_name && o.client_name.toLowerCase().includes(search.toLowerCase()))
  ) : [];

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
      {/* Header & Search */}
      <div className="p-6 border-b border-gray-800 bg-gray-800/50 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Pedidos Activos</h2>
          <p className="text-sm text-gray-400 mt-1">Gestiona, edita o cancela órdenes en curso.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Buscar por ID o Cliente..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-950 border border-gray-700 text-white rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
          />
        </div>
      </div>

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {filteredOrders.map((order, idx) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-gray-800/80 rounded-2xl border border-gray-700 overflow-hidden hover:border-gray-600 transition-colors flex flex-col"
                >
                  <div className="p-5 border-b border-gray-700/50 flex justify-between items-start">
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
                        {order.client_name || 'Cliente Mostrador'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-emerald-400">${order.total}</div>
                      <div className="flex items-center justify-end text-gray-500 text-xs mt-1 uppercase tracking-wide">
                        <CreditCard className="w-3.5 h-3.5 mr-1" />
                        {order.payment_method}
                      </div>
                    </div>
                  </div>

                  <div className="p-5 flex-1">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Detalle del Pedido</h4>
                    <ul className="space-y-2">
                      {order.items && order.items.map((item, i) => (
                        <li key={i} className="flex justify-between text-sm">
                          <span className="text-gray-300"><span className="text-gray-500 mr-2">{item.quantity}x</span>{item.name}</span>
                          <span className="text-gray-400 font-medium">${item.price * item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 bg-gray-900/50 flex gap-3 border-t border-gray-800">
                    <button 
                      onClick={() => handleCancel(order.id)}
                      className="flex-1 flex items-center justify-center px-4 py-2.5 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300 rounded-xl font-medium transition-all"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Anular
                    </button>
                    <button 
                      onClick={() => handleEdit(order)}
                      className="flex-1 flex items-center justify-center px-4 py-2.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 hover:text-blue-300 rounded-xl font-medium transition-all"
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
