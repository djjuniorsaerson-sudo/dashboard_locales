import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Comandero() {
  const { currentLocation } = useAuth();
  
  // Mock data for orders
  const [orders, setOrders] = useState([
    { id: '101', customer: 'Juan Pérez', status: 'PENDING', total: 4500, time: '12:30', priority: 'NORMAL', items: ['1x Hamburguesa Doble', '1x Papas'] },
    { id: '102', customer: 'María López', status: 'PREPARING', total: 8200, time: '12:35', priority: 'HIGH', items: ['2x Pizza Muzzarella', '1x Gaseosa 1.5L'] },
    { id: '103', customer: 'Carlos Gómez', status: 'READY', total: 1500, time: '12:45', priority: 'NORMAL', items: ['1x Helado'] },
  ]);

  const updateStatus = (id, newStatus) => {
    setOrders(orders.map(o => o.id === id ? { ...o, status: newStatus } : o));
  };

  const Column = ({ title, status, color }) => {
    const columnOrders = orders.filter(o => o.status === status);
    
    return (
      <div className={`bg-gray-800/50 rounded-xl border border-gray-700/50 flex flex-col h-[calc(100vh-160px)]`}>
        <div className={`p-4 border-b border-gray-700 font-bold text-${color}-400 flex justify-between items-center`}>
          {title}
          <span className="bg-gray-900 text-gray-300 text-xs px-2 py-1 rounded-full">{columnOrders.length}</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {columnOrders.map(order => (
            <div key={order.id} className="bg-gray-800 p-4 rounded-lg border border-gray-600 shadow-lg hover:border-gray-500 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <span className="text-white font-bold">#{order.id}</span>
                <span className="text-xs text-gray-400 bg-gray-900 px-2 py-1 rounded">{order.time}</span>
              </div>
              <h4 className="text-sm font-semibold text-gray-200 mb-2">{order.customer}</h4>
              <ul className="text-xs text-gray-400 mb-4 space-y-1">
                {order.items.map((item, i) => <li key={i}>• {item}</li>)}
              </ul>
              <div className="flex justify-between items-center mt-auto border-t border-gray-700 pt-3">
                <span className={`text-xs font-bold ${order.priority === 'HIGH' ? 'text-red-400' : 'text-blue-400'}`}>
                  {order.priority === 'HIGH' ? 'URGENTE' : 'NORMAL'}
                </span>
                
                {/* Actions based on status */}
                {status === 'PENDING' && (
                  <button onClick={() => updateStatus(order.id, 'PREPARING')} className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded transition-colors">A Cocina</button>
                )}
                {status === 'PREPARING' && (
                  <button onClick={() => updateStatus(order.id, 'READY')} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded transition-colors">Terminar</button>
                )}
                {status === 'READY' && (
                  <button onClick={() => updateStatus(order.id, 'COMPLETED')} className="bg-gray-600 hover:bg-gray-500 text-white text-xs px-3 py-1.5 rounded transition-colors">Entregar</button>
                )}
              </div>
            </div>
          ))}
          {columnOrders.length === 0 && (
            <div className="text-center text-gray-500 text-sm mt-10">Sin pedidos</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Comandero en Vivo</h2>
        <div className="flex space-x-3">
          <span className="px-3 py-1 bg-gray-800 text-gray-300 text-sm rounded-lg border border-gray-700">
            Local: <span className="font-bold text-white">{currentLocation?.name}</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 flex-1">
        <Column title="Pendientes" status="PENDING" color="blue" />
        <Column title="En Preparación" status="PREPARING" color="yellow" />
        <Column title="Listos" status="READY" color="emerald" />
        <Column title="En Camino / Entregados" status="COMPLETED" color="gray" />
      </div>
    </div>
  );
}
