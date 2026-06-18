import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Products from './pages/Products';
import YummyInstallations from './pages/YummyInstallations';
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import Empleados from './pages/Empleados';
import Caja from './pages/Caja';
import Repartidores from './pages/Repartidores';
import NuevoPedido from './pages/NuevoPedido';
import GestionPedidos from './pages/GestionPedidos';

import Cocina from './pages/Cocina';

function MainLayout() {
  const { logout, locations, currentLocation, setCurrentLocation } = useAuth();
  const [currentView, setCurrentView] = useState('dashboard');
  const [orderToEdit, setOrderToEdit] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="h-[73px] px-6 border-b border-gray-800 flex items-center">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">Panel Central</h1>
        </div>
        
        {/* Location Selector */}
        <div className="p-4 border-b border-gray-800 bg-gray-800/30">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Local Activo</label>
          <select 
            value={currentLocation?.id || ''}
            onChange={(e) => {
              const loc = locations.find(l => l.id === e.target.value);
              if(loc) setCurrentLocation(loc);
            }}
            className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none transition-colors mb-3"
          >
            {locations.length === 0 && <option value="">Sin conectores</option>}
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
          <button 
            onClick={() => setCurrentView('installations')} 
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center transition-colors ${currentView === 'installations' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700 hover:text-white'}`}
          >
            <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
            Vincular Local / PC
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          <button onClick={() => { setOrderToEdit(null); setCurrentView('nuevo_pedido'); }} className={`w-full text-center px-4 py-3 mb-2 rounded-xl font-bold transition-all shadow-lg hover:scale-105 ${currentView === 'nuevo_pedido' && !orderToEdit ? 'bg-emerald-500 text-gray-950 shadow-emerald-500/30' : 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'}`}>+ NUEVO PEDIDO</button>
          <button onClick={() => setCurrentView('gestion_pedidos')} className={`w-full text-center px-4 py-2 mb-4 rounded-xl font-bold transition-all shadow-lg hover:scale-105 ${currentView === 'gestion_pedidos' || orderToEdit ? 'bg-purple-500 text-gray-950 shadow-purple-500/30' : 'bg-purple-600/20 text-purple-400 border border-purple-500/30'}`}>GESTIÓN DE PEDIDOS</button>
          
          <button onClick={() => setCurrentView('dashboard')} className={`w-full text-left px-4 py-2.5 rounded-lg font-medium transition-colors ${currentView === 'dashboard' ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>Dashboard</button>
          <button onClick={() => setCurrentView('cocina')} className={`w-full text-left px-4 py-2.5 rounded-lg font-bold transition-colors ${currentView === 'cocina' ? 'bg-orange-600/20 text-orange-400' : 'text-orange-500/60 hover:bg-gray-800 hover:text-orange-400'}`}>Pedidos en Cocina</button>
          <button onClick={() => setCurrentView('caja')} className={`w-full text-left px-4 py-2.5 rounded-lg font-medium transition-colors ${currentView === 'caja' ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>Flujo de Caja</button>
          <button onClick={() => setCurrentView('products')} className={`w-full text-left px-4 py-2.5 rounded-lg font-medium transition-colors ${currentView === 'products' ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>Productos</button>
          <button onClick={() => setCurrentView('clients')} className={`w-full text-left px-4 py-2.5 rounded-lg font-medium transition-colors ${currentView === 'clients' ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>Clientes</button>
          <button onClick={() => setCurrentView('employees')} className={`w-full text-left px-4 py-2.5 rounded-lg font-medium transition-colors ${currentView === 'employees' ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>Empleados</button>
          <button onClick={() => setCurrentView('repartidores')} className={`w-full text-left px-4 py-2.5 rounded-lg font-medium transition-colors ${currentView === 'repartidores' ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>Repartidores</button>
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button onClick={logout} className="w-full text-left px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">Cerrar Sesión</button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Header Content */}
        <header className="h-[73px] bg-gray-900 border-b border-gray-800 px-4 lg:px-8 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-100">
            {currentView === 'nuevo_pedido' && (orderToEdit ? `Editando Pedido #${orderToEdit.id}` : 'Tomar Nuevo Pedido')}
            {currentView === 'gestion_pedidos' && 'Gestión de Pedidos Activos'}
            {currentView === 'dashboard' && 'Resumen General'}
            {currentView === 'cocina' && 'Monitor de Cocina (KDS)'}
            {currentView === 'caja' && 'Movimientos de Caja'}
            {currentView === 'installations' && 'Gestor de Locales y Conexiones'}
            {currentView === 'products' && 'Catálogo de Productos'}
            {currentView === 'clients' && 'Directorio de Clientes'}
            {currentView === 'employees' && 'Nómina de Empleados'}
            {currentView === 'repartidores' && 'Flota de Repartidores'}
          </h2>
          <div className="flex items-center space-x-3 text-sm text-gray-400 transition-all duration-300">
            {isSyncing ? (
              <span className="flex items-center text-amber-400 font-medium tracking-wide"><span className="w-2 h-2 rounded-full bg-amber-400 mr-2 animate-ping"></span> Actualizando...</span>
            ) : (
              <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span> Sincronizado</span>
            )}
          </div>
        </header>

        <div className="p-4 lg:p-8 h-[calc(100vh-73px)]">
          {currentView === 'nuevo_pedido' && <NuevoPedido orderToEdit={orderToEdit} setOrderToEdit={setOrderToEdit} setCurrentView={setCurrentView} />}
          {currentView === 'gestion_pedidos' && <GestionPedidos setOrderToEdit={setOrderToEdit} setCurrentView={setCurrentView} />}
          {currentView === 'dashboard' && <Dashboard setIsSyncing={setIsSyncing} />}
          {currentView === 'cocina' && <Cocina />}
          {currentView === 'caja' && <Caja />}
          {currentView === 'products' && <Products />}
          {currentView === 'installations' && <YummyInstallations />}
          {currentView === 'clients' && <Clientes />}
          {currentView === 'employees' && <Empleados />}
          {currentView === 'repartidores' && <Repartidores />}
        </div>
      </main>
    </div>
  );
}

function App() {
  const { isAuthenticated } = useAuth();
  return <>{isAuthenticated ? <MainLayout /> : <Login />}</>;
}

export default App;
