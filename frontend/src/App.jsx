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
import Usuarios from './pages/Usuarios';
import Auditoria from './pages/Auditoria';
import ForcePasswordChange from './pages/ForcePasswordChange';
import { formatExactDate, formatRelativeDate, getLocationStatusMeta } from './components/locationStatus';

import Cocina from './pages/Cocina';

function WelcomeHub() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4 animate-fade-in">
      <div className="w-24 h-24 mb-6 rounded-full bg-gradient-to-tr from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-gray-700/50 shadow-xl">
        <svg className="w-12 h-12 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
      </div>
      <h2 className="text-3xl font-bold text-gray-100 mb-3 tracking-tight">Bienvenido al Panel Central</h2>
      <p className="text-gray-400 max-w-md text-sm leading-relaxed mb-8">
        Este es el centro de control principal. Por favor, selecciona un local en el menú lateral o vincula una nueva aplicación para comenzar a administrar sus funciones.
      </p>
      <div className="flex space-x-4">
        <div className="flex items-center text-xs font-semibold text-gray-500 uppercase tracking-widest">
          <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span> Sistema En Línea
        </div>
      </div>
    </div>
  );
}

function MainLayout() {
  const { token, logout, locations, currentLocation, setCurrentLocation, fetchLocations } = useAuth();
  const [currentView, setCurrentView] = useState('welcome');
  const [orderToEdit, setOrderToEdit] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showSyncDetails, setShowSyncDetails] = useState(false);
  const [syncActionLoading, setSyncActionLoading] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsResult, setDiagnosticsResult] = useState(null);
  const statusMeta = getLocationStatusMeta(currentLocation, isSyncing);
  const pendingActionsCount = Number(currentLocation?.pendingActionsCount || 0);
  const pendingActionsSummary = currentLocation?.pendingActionsSummary || {};

  const navButtonClass = (view, accent = 'blue') => {
    const active = currentView === view;
    const accents = {
      blue: active
        ? 'bg-blue-500/15 text-blue-300 border-blue-500/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
        : 'text-gray-400 border-transparent hover:bg-gray-800/80 hover:text-gray-100',
      orange: active
        ? 'bg-orange-500/15 text-orange-300 border-orange-500/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
        : 'text-orange-500/70 border-transparent hover:bg-gray-800/80 hover:text-orange-300',
    };
    return `w-full text-left px-4 py-3 rounded-xl border text-[15px] font-medium transition-all ${accents[accent]}`;
  };

  const handleNavigate = (view, options = {}) => {
    if (options.resetOrder) {
      setOrderToEdit(null);
    }
    setCurrentView(view);
    setMobileMenuOpen(false);
    setShowSyncDetails(false);
  };

  const refreshLocationStatus = async () => {
    if (!token) return;
    setSyncActionLoading(true);
    try {
      await fetchLocations(token);
    } catch (error) {
      console.error('Error refreshing locations', error);
    } finally {
      setSyncActionLoading(false);
    }
  };

  const runConnectionDiagnostics = async () => {
    if (!token || !currentLocation?.id) return;
    setDiagnosticsLoading(true);
    setDiagnosticsResult(null);
    try {
      const [testRes, diagnosticsRes] = await Promise.all([
        fetch(`/api/v1/yummy-installations/${currentLocation.id}/test-connection`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/v1/yummy-installations/${currentLocation.id}/diagnostics`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const testData = await testRes.json().catch(() => ({}));
      const diagnosticsData = await diagnosticsRes.json().catch(() => ({}));

      setDiagnosticsResult({
        ok: testRes.ok && diagnosticsRes.ok && diagnosticsData?.reachable !== false,
        test: testData,
        diagnostics: diagnosticsData,
      });
      await fetchLocations(token);
    } catch (error) {
      console.error('Error running diagnostics', error);
      setDiagnosticsResult({
        ok: false,
        diagnostics: { message: 'No se pudo ejecutar el diagnóstico.' },
      });
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050816] text-white md:flex">
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[88vw] max-w-72 bg-[#121a2b] border-r border-white/10 flex flex-col transform transition-transform duration-200 md:static md:z-auto md:w-72 md:max-w-none md:translate-x-0 shadow-2xl ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-[78px] px-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div>
            <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-sky-400 to-emerald-400 bg-clip-text text-transparent">Panel Central</h1>
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500 mt-1">Control unificado</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-sm text-gray-300"
          >
            Cerrar
          </button>
        </div>
        
        {/* Location Selector */}
        <div className="p-4 border-b border-white/10 bg-white/[0.02]">
          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-[0.16em] mb-2">Local Activo</label>
          <select 
            value={currentLocation?.id || ''}
            onChange={(e) => {
              const loc = locations.find(l => l.id === e.target.value);
              if(loc) {
                setCurrentLocation(loc);
                handleNavigate('dashboard');
              } else {
                setCurrentLocation(null);
                handleNavigate('welcome');
              }
            }}
            className="w-full bg-white/[0.07] border border-white/10 text-white text-sm rounded-xl focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/40 block p-3 outline-none transition-colors mb-3"
          >
            {locations.length === 0 && <option value="">Sin conectores</option>}
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
          <button 
            onClick={() => handleNavigate('installations')} 
            className={`w-full text-left px-3 py-3 rounded-xl text-xs font-bold uppercase tracking-[0.12em] flex items-center justify-center transition-colors border ${currentView === 'installations' ? 'bg-purple-500/15 text-purple-300 border-purple-500/30' : 'bg-white/[0.04] text-gray-300 border-white/10 hover:bg-white/[0.07] hover:text-white'}`}
          >
            <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
            Vincular Local / PC
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
          {currentLocation && (
            <div className="mb-6 animate-fade-in">
              <button onClick={() => handleNavigate('nuevo_pedido', { resetOrder: true })} className={`w-full text-center px-4 py-3 mb-2 rounded-2xl font-bold transition-all shadow-lg hover:scale-[1.01] ${currentView === 'nuevo_pedido' && !orderToEdit ? 'bg-emerald-500 text-gray-950 shadow-emerald-500/30' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/20'}`}>+ NUEVO PEDIDO</button>
              <button onClick={() => handleNavigate('gestion_pedidos')} className={`w-full text-center px-4 py-3 mb-5 rounded-2xl font-bold transition-all shadow-lg hover:scale-[1.01] ${currentView === 'gestion_pedidos' || orderToEdit ? 'bg-purple-500 text-gray-950 shadow-purple-500/30' : 'bg-purple-500/15 text-purple-300 border border-purple-500/25 hover:bg-purple-500/20'}`}>GESTIÓN DE PEDIDOS</button>
              
              <div className="space-y-1.5">
                <button onClick={() => handleNavigate('dashboard')} className={navButtonClass('dashboard')}>Dashboard</button>
                <button onClick={() => handleNavigate('cocina')} className={navButtonClass('cocina', 'orange')}>Pedidos en Cocina</button>
                <button onClick={() => handleNavigate('caja')} className={navButtonClass('caja')}>Flujo de Caja</button>
                <button onClick={() => handleNavigate('products')} className={navButtonClass('products')}>Productos</button>
                <button onClick={() => handleNavigate('clients')} className={navButtonClass('clients')}>Clientes</button>
                <button onClick={() => handleNavigate('employees')} className={navButtonClass('employees')}>Empleados</button>
                <button onClick={() => handleNavigate('repartidores')} className={navButtonClass('repartidores')}>Repartidores</button>
              </div>
              <div className="pt-5 mt-4 border-t border-white/10">
                <span className="px-4 text-[11px] font-bold text-gray-500 uppercase tracking-[0.16em] mb-2 block">Sistema</span>
                <div className="space-y-1.5">
                  <button onClick={() => handleNavigate('usuarios')} className={navButtonClass('usuarios')}>Usuarios</button>
                  <button onClick={() => handleNavigate('auditoria')} className={navButtonClass('auditoria')}>Auditoría</button>
                </div>
              </div>
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-white/10 bg-white/[0.02]">
          <button onClick={logout} className="w-full text-left px-4 py-3 text-sm font-semibold text-red-300 hover:bg-red-500/10 rounded-xl transition-colors border border-transparent hover:border-red-500/10">Cerrar Sesión</button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        {/* Header Content */}
        <header className="min-h-[78px] bg-[#11192a]/95 backdrop-blur-xl border-b border-white/10 px-4 lg:px-8 py-3 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-gray-300"
            >
              Menú
            </button>
            <div className="min-w-0">
            <h2 className="text-base sm:text-xl font-bold text-gray-100 truncate tracking-tight">
            {currentView === 'welcome' && 'Inicio'}
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
            {currentView === 'usuarios' && 'Gestión de Usuarios'}
            {currentView === 'auditoria' && 'Registro de Auditoría'}
            </h2>
            {currentLocation && (
              <p className="text-xs text-gray-500 mt-1 truncate">Local: <span className="text-gray-300 font-medium">{currentLocation.name}</span></p>
            )}
            </div>
          </div>
          <div className="relative flex items-center space-x-3 text-sm text-gray-400 transition-all duration-300 shrink-0">
            <button
              type="button"
              onClick={() => setShowSyncDetails((current) => !current)}
              className={`flex items-center gap-3 rounded-full border px-3 py-1.5 text-left transition-colors ${statusMeta.className}`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${statusMeta.dotClassName} ${statusMeta.pulse ? 'animate-pulse' : ''}`}></span>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-medium">{statusMeta.label}</span>
                <span className="text-[11px] opacity-80">{statusMeta.detail}</span>
              </div>
            </button>
            {showSyncDetails && (
              <div className="absolute right-0 top-[calc(100%+0.75rem)] z-40 w-[min(92vw,22rem)] rounded-2xl border border-white/10 bg-[#11192a] p-4 shadow-2xl">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300/80">Diagnóstico</p>
                    <h3 className="text-sm font-semibold text-white">{currentLocation?.name || 'Local sin seleccionar'}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSyncDetails(false)}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-gray-300"
                  >
                    Cerrar
                  </button>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-start justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
                    <span className="text-gray-400">Estado</span>
                    <span className="text-right font-medium text-white">{statusMeta.label}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
                    <span className="text-gray-400">Última sync</span>
                    <span className="text-right text-gray-200">
                      {formatExactDate(currentLocation?.lastSyncAt)}
                      <span className="mt-1 block text-xs text-gray-500">{formatRelativeDate(currentLocation?.lastSyncAt)}</span>
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
                    <span className="text-gray-400">Último heartbeat</span>
                    <span className="text-right text-gray-200">
                      {formatExactDate(currentLocation?.lastHealthCheck)}
                      <span className="mt-1 block text-xs text-gray-500">{formatRelativeDate(currentLocation?.lastHealthCheck)}</span>
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
                    <span className="text-gray-400">Pendientes</span>
                    <span className={`text-right font-medium ${pendingActionsCount > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                      {pendingActionsCount}
                    </span>
                  </div>
                  {Object.keys(pendingActionsSummary).length > 0 && (
                    <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                      <span className="block text-gray-400">Pendientes por tipo</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(pendingActionsSummary).map(([actionType, count]) => (
                          <span key={actionType} className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-200">
                            {actionType}: {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
                    <span className="text-gray-400">Última IP vista</span>
                    <span className="text-right text-gray-200">{currentLocation?.lastSeenIp || 'Sin dato'}</span>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                    <span className="block text-gray-400">Último error</span>
                    <span className={`mt-1 block text-sm ${currentLocation?.lastErrorMessage ? 'text-orange-200' : 'text-gray-500'}`}>
                      {currentLocation?.lastErrorMessage || 'Sin errores recientes'}
                    </span>
                    {currentLocation?.lastErrorAt && (
                      <span className="mt-1 block text-xs text-gray-500">
                        {formatExactDate(currentLocation.lastErrorAt)}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={refreshLocationStatus}
                      disabled={syncActionLoading}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${syncActionLoading ? 'bg-sky-900/30 text-sky-200/70 cursor-not-allowed' : 'bg-sky-500/15 text-sky-200 hover:bg-sky-500/25'}`}
                    >
                      {syncActionLoading ? 'Actualizando...' : 'Actualizar estado'}
                    </button>
                    <button
                      type="button"
                      onClick={runConnectionDiagnostics}
                      disabled={diagnosticsLoading || !currentLocation?.id}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${diagnosticsLoading ? 'bg-emerald-900/30 text-emerald-200/70 cursor-not-allowed' : 'bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'}`}
                    >
                      {diagnosticsLoading ? 'Probando...' : 'Probar conexión'}
                    </button>
                  </div>
                  {diagnosticsResult && (
                    <div className={`rounded-xl px-3 py-2 ${diagnosticsResult.ok ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                      <span className={`block text-sm font-medium ${diagnosticsResult.ok ? 'text-emerald-200' : 'text-red-200'}`}>
                        {diagnosticsResult.ok ? 'Conexión correcta' : 'Problema de conexión'}
                      </span>
                      <span className="mt-1 block text-xs text-gray-300">
                        {diagnosticsResult?.diagnostics?.message
                          || diagnosticsResult?.test?.detail
                          || (diagnosticsResult?.diagnostics?.response_time_ms ? `Tiempo de respuesta ${diagnosticsResult.diagnostics.response_time_ms} ms` : 'Sin detalle adicional')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="p-4 lg:p-8 min-h-[calc(100vh-78px)] bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.08),_transparent_28%),radial-gradient(circle_at_right,_rgba(16,185,129,0.05),_transparent_24%)]">
          {currentView === 'welcome' && <WelcomeHub />}
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
          {currentView === 'usuarios' && <Usuarios />}
          {currentView === 'auditoria' && <Auditoria />}
        </div>
      </main>
    </div>
  );
}

function App() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Login />;
  if (user?.force_password_change) return <ForcePasswordChange />;
  return <MainLayout />;
}

export default App;
