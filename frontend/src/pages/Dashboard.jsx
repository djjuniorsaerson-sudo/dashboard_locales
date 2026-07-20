import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

export default function Dashboard({ setIsSyncing }) {
  const { token, currentLocation } = useAuth();
  const [metrics, setMetrics] = useState({
    ventas_turno: 0,
    pedidos_activos: 0,
    pedidos_finalizados: 0
  });
  const [loading, setLoading] = useState(true);

  // Modal State para Agregar Stock
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [selectedStockItem, setSelectedStockItem] = useState(null);
  const [qtyToAdd, setQtyToAdd] = useState('');
  const [isSavingStock, setIsSavingStock] = useState(false);

  const fetchMetrics = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    if (setIsSyncing) setIsSyncing(true);
    try {
      const res = await fetch(`/api/v1/data/dashboard/metrics`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (e) {
      console.error("Error fetching metrics", e);
    } finally {
      if (!isBackground) setLoading(false);
      if (setIsSyncing) setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchMetrics(false);
    // Actualizar cada 15 segundos
    const interval = setInterval(() => fetchMetrics(true), 15000);
    return () => {
      clearInterval(interval);
      if (setIsSyncing) setIsSyncing(false);
    };
  }, [token]);

  const handleAddStock = (item) => {
    setSelectedStockItem(item);
    setQtyToAdd('');
    setIsStockModalOpen(true);
  };

  const closeStockModal = () => {
    setIsStockModalOpen(false);
    setSelectedStockItem(null);
    setQtyToAdd('');
  };

  const submitStockUpdate = async (e) => {
    e.preventDefault();
    const qty = parseInt(qtyToAdd, 10);
    
    if (isNaN(qty) || qty === 0) {
      alert("Por favor ingresa un número válido (puede ser negativo para restar).");
      return;
    }

    setIsSavingStock(true);
    try {
      const res = await fetch(`/api/v1/data/products/${selectedStockItem.id}/stock`, {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ stock: selectedStockItem.stock + qty })
      });
      
      if (res.ok) {
        await fetchMetrics();
        closeStockModal();
      } else {
        alert("Error al actualizar el stock.");
      }
    } catch (e) {
      console.error(e);
      alert("Error de red.");
    } finally {
      setIsSavingStock(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-white mb-1">Métricas en Tiempo Real</h2>
            <p className="text-gray-400">Viendo datos del <span className="text-white font-semibold">Turno Actual Abierto</span> en {currentLocation?.name || 'Local Central'}</p>
        </div>
      </div>
      
      {loading && metrics.ventas_turno === 0 ? (
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-20 bg-gray-700 rounded w-full"></div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10"><svg className="w-16 h-16 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd"/></svg></div>
              <h3 className="text-gray-400 text-sm font-medium relative z-10 uppercase tracking-wider">Total Vendido (Turno)</h3>
              <p className="text-4xl font-bold mt-2 text-white relative z-10">${metrics.ventas_turno.toLocaleString()}</p>
            </div>
            
            <div className="bg-gray-800 p-6 rounded-2xl border border-orange-700/50 shadow-lg relative overflow-hidden ring-1 ring-orange-500/20">
              <div className="absolute top-0 right-0 p-4 opacity-10"><svg className="w-16 h-16 text-orange-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd"/></svg></div>
              <h3 className="text-orange-400 text-sm font-bold relative z-10 uppercase tracking-wider">Pedidos Activos en Cocina</h3>
              <p className="text-4xl font-bold mt-2 text-white relative z-10">{metrics.pedidos_activos}</p>
              {metrics.pedidos_activos > 0 && (
                <div className="absolute bottom-4 right-4 flex items-center">
                    <span className="w-3 h-3 rounded-full bg-orange-500 mr-2 animate-ping"></span>
                    <span className="text-xs text-orange-400 font-bold">Cocinando</span>
                </div>
              )}
            </div>

            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10"><svg className="w-16 h-16 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg></div>
              <h3 className="text-gray-400 text-sm font-medium relative z-10 uppercase tracking-wider">Pedidos Entregados</h3>
              <p className="text-4xl font-bold mt-2 text-emerald-400 relative z-10">{metrics.pedidos_finalizados}</p>
            </div>
          </div>

          <div className="space-y-6">
            
            {/* Productos Vendidos (Turno vs Día) - Fila Horizontal */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-900/60 backdrop-blur-xl rounded-3xl border border-gray-800/50 shadow-2xl overflow-hidden flex flex-col relative"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>
              <div className="p-5 border-b border-gray-800/80 bg-gray-900/50 flex justify-between items-center z-10">
                <h3 className="text-xl font-bold text-white flex items-center tracking-wide">
                  <svg className="w-6 h-6 mr-3 text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                  Productos Vendidos
                </h3>
              </div>
              <div className="p-6 overflow-x-auto custom-scrollbar">
                {metrics.product_sales && metrics.product_sales.length > 0 ? (
                  <div className="flex space-x-5 pb-4">
                    {metrics.product_sales.map((item, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        whileHover={{ scale: 1.05, y: -4 }}
                        key={idx} 
                        className="flex-shrink-0 flex flex-col p-4 bg-gray-800/40 backdrop-blur-md rounded-2xl border border-gray-700/50 hover:border-blue-500/50 shadow-lg hover:shadow-blue-500/10 transition-all group min-w-[140px]"
                      >
                        <span className="text-white font-bold mb-3 text-base whitespace-nowrap group-hover:text-blue-400 transition-colors" title={item.name}>{item.name}</span>
                        <div className="flex items-center justify-between gap-4 mt-auto">
                          <div className="flex flex-col items-center">
                            <span className="text-gray-500 text-[10px] uppercase font-bold tracking-wider mb-1">Turno</span>
                            <span className="text-blue-400 font-black bg-blue-500/10 px-2.5 py-1 rounded-lg shadow-inner shadow-blue-500/20">{item.sold_turno} u.</span>
                          </div>
                          <div className="w-px h-8 bg-gray-700/50"></div>
                          <div className="flex flex-col items-center">
                            <span className="text-gray-500 text-[10px] uppercase font-bold tracking-wider mb-1">Hoy</span>
                            <span className="text-emerald-400 font-black bg-emerald-500/10 px-2.5 py-1 rounded-lg shadow-inner shadow-emerald-500/20">{item.sold_dia} u.</span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500 font-medium">No hay ventas registradas aún.</p>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Niveles de Stock Actual - Ancho Completo */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-gray-900/60 backdrop-blur-xl rounded-3xl border border-gray-800/50 shadow-2xl overflow-hidden flex flex-col max-h-[450px] relative"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 via-rose-500 to-purple-500"></div>
              <div className="p-5 border-b border-gray-800/80 bg-gray-900/50 sticky top-0 flex justify-between items-center z-10">
                <h3 className="text-xl font-bold text-white flex items-center tracking-wide">
                  <svg className="w-6 h-6 mr-3 text-orange-400 drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                  Niveles de Stock Actual
                </h3>
              </div>
              <div className="overflow-y-auto p-6 flex-1 custom-scrollbar">
                {metrics.stock_levels && metrics.stock_levels.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                    {metrics.stock_levels.map((item, idx) => {
                      const isLowStock = item.stock <= 5;
                      return (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.02 }}
                          whileHover={{ scale: 1.03 }}
                          onClick={() => handleAddStock(item)}
                          key={item.id} 
                          className={`cursor-pointer flex items-center justify-between p-4 rounded-2xl border shadow-md transition-all ${isLowStock ? 'bg-red-500/10 border-red-500/40 hover:border-red-500/80 shadow-[inset_0_0_20px_rgba(239,68,68,0.1)]' : 'bg-gray-800/40 backdrop-blur-sm border-gray-700/50 hover:border-emerald-500/50'}`}
                        >
                          <span className={`font-semibold truncate pr-3 ${isLowStock ? 'text-red-200' : 'text-gray-200'}`} title={item.name}>{item.name}</span>
                          <span className={`px-3 py-1.5 rounded-lg font-black text-sm shadow-inner ${isLowStock ? 'bg-red-500/20 text-red-400 shadow-red-500/30 animate-pulse' : 'bg-gray-900/80 text-emerald-400 shadow-black/50'}`}>
                            {item.stock}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <p className="text-gray-500 font-medium">No hay productos en el inventario.</p>
                  </div>
                )}
              </div>
            </motion.div>

          </div>
        </>
      )}

      {/* Modal Ajustar Stock */}
      {isStockModalOpen && selectedStockItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
              <h3 className="text-lg font-bold text-white flex items-center">
                <svg className="w-5 h-5 mr-2 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                Ajustar Stock
              </h3>
              <button onClick={closeStockModal} className="text-gray-400 hover:text-white transition-colors">
                ✕
              </button>
            </div>
            
            <form onSubmit={submitStockUpdate} className="p-6 space-y-4">
              <div className="text-center mb-4">
                <p className="text-gray-400 text-sm">Producto seleccionado:</p>
                <p className="text-lg font-bold text-white">{selectedStockItem.name}</p>
                <div className="mt-2 inline-block bg-gray-900 rounded-lg px-4 py-2 border border-gray-700">
                  <span className="text-gray-400 text-sm mr-2">Stock Actual:</span>
                  <span className="text-emerald-400 font-black text-lg">{selectedStockItem.stock}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 text-center">¿Cuánto stock deseas AÑADIR o RESTAR?</label>
                <input 
                  type="number" 
                  required
                  value={qtyToAdd}
                  onChange={(e) => setQtyToAdd(e.target.value)}
                  className="w-full text-center text-xl font-bold bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  placeholder="Ej: 10 o -5"
                  autoFocus
                />
                <p className="text-xs text-gray-500 text-center mt-2">
                  Usa números negativos (ej. -5) para restar unidades.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-3 w-full">
                <button 
                  type="button"
                  onClick={closeStockModal}
                  className="flex-1 py-2 rounded-lg font-medium text-gray-300 hover:bg-gray-700 border border-gray-600 hover:border-gray-500 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isSavingStock || !qtyToAdd}
                  className="flex-1 py-2 rounded-lg font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingStock ? 'Guardando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
