import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function YummyInstallations() {
  const { token, fetchLocations } = useAuth();
  const [installations, setInstallations] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [manualForm, setManualForm] = useState({
    local_id: '', local_name: '', base_url: '', api_key: '', sync_mode: 'manual', program_type: 'yummy'
  });

  const fetchInstallations = async () => {
    try {
      const res = await fetch(`/api/v1/yummy-installations/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInstallations(data);
      }
    } catch (e) {
      console.error("Error fetching installations:", e);
    }
  };

  useEffect(() => {
    fetchInstallations();
  }, [token]);

  const handleJsonPaste = (e) => {
    setJsonInput(e.target.value);
    try {
      const parsed = JSON.parse(e.target.value);
      setManualForm({
        local_id: parsed.local_id || '',
        local_name: parsed.local_name || '',
        base_url: parsed.base_url || '',
        api_key: parsed.api_key || '',
        sync_mode: parsed.sync_mode || 'manual',
        program_type: manualForm.program_type
      });
    } catch (err) {
      // invalid json, ignore
    }
  };

  const handleRegister = async () => {
    if (!manualForm.base_url || !manualForm.api_key || !manualForm.local_id || !manualForm.local_name) {
      return setErrorMsg("Faltan datos requeridos (local_id, local_name, base_url, api_key)");
    }
    setLoading(true);
    setErrorMsg('');

    try {
      // 1. Registrar
      const registerRes = await fetch(`/api/v1/yummy-installations/`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(manualForm)
      });
      
      if (!registerRes.ok) throw new Error("Error al guardar la instalación");
      const newInst = await registerRes.json();
      
      setShowModal(false);
      setManualForm({ local_id: '', local_name: '', base_url: '', api_key: '', sync_mode: 'manual', program_type: 'yummy' });
      setJsonInput('');
      
      // Añadir provisoriamente a la vista
      setInstallations(prev => [...prev, newInst]);
      fetchLocations(token); // ACTUALIZA EL SELECTOR DE LOCAL ACTIVO
      
      // 2. Probar conexión automáticamente
      await handleTestConnection(newInst.id);

    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async (id) => {
    try {
      const res = await fetch(`/api/v1/yummy-installations/${id}/test-connection`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert("Conexión Exitosa con el Programa");
      } else {
        alert("Fallo la conexión con el Programa");
      }
      // Actualizar estado visual
      fetchInstallations();
      fetchLocations(token);
    } catch (e) {
      alert("Error de red intentando conectar");
      fetchInstallations();
    }
  };

  const handleSyncSnapshot = async (id) => {
    if(!confirm("¿Importar todo el snapshot desde el programa? Esto puede tardar.")) return;
    
    try {
      const res = await fetch(`/api/v1/yummy-installations/${id}/sync-snapshot`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        alert("Snapshot importado y guardado correctamente. ID: " + data.snapshot_id);
      } else {
        alert("Error al importar snapshot: " + (data.detail || "Error desconocido"));
      }
      fetchInstallations();
    } catch (e) {
      alert("Error de red");
    }
  };

  const handleViewEvents = async (id) => {
    try {
      const res = await fetch(`/api/v1/yummy-installations/${id}/events`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        alert("Eventos leídos: \n" + JSON.stringify(data.events, null, 2));
      } else {
        alert("Fallo al leer eventos");
      }
    } catch (e) {
      alert("Error de red");
    }
  };

  const handleDeleteInstallation = async (id) => {
    if(!confirm("¿Estás seguro de eliminar esta instalación?")) return;
    try {
      const res = await fetch(`/api/v1/yummy-installations/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert("Instalación eliminada correctamente.");
        fetchInstallations();
        fetchLocations(token);
      } else {
        alert("Fallo al eliminar instalación");
      }
    } catch (e) {
      alert("Error de red");
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">Gestor de Locales y Conexiones</h2>
          <p className="text-gray-400 text-sm mt-1">Vincula los sistemas locales (Puntos de Venta, Farmacias, etc.) con el panel central</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg font-medium shadow-lg shadow-blue-500/30 transition-all flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
          Nueva Vinculación
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {installations.map((inst) => (
          <div key={inst.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg flex flex-col">
            <div className="p-5 border-b border-gray-700/50 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-white">{inst.local_name}</h3>
                <p className="text-xs text-gray-400 font-mono mt-1 bg-gray-700/50 inline-block px-2 py-0.5 rounded capitalize">{inst.program_type || 'yummy'}</p>
                <p className="text-xs text-gray-500 font-mono mt-1">ID: {inst.local_id}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                inst.connection_status === 'ONLINE' ? 'bg-emerald-500/20 text-emerald-400' : 
                inst.connection_status === 'ERROR' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                {inst.connection_status}
              </span>
            </div>
            
            <div className="p-5 flex-1 space-y-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Base URL</p>
                <p className="text-sm text-gray-300 truncate font-mono bg-gray-900 p-2 rounded">{inst.base_url}</p>
              </div>
              
              <div className="flex justify-between text-xs text-gray-400">
                <span>Modo: <strong className="text-white capitalize">{inst.sync_mode}</strong></span>
                <span>Último Test: {inst.last_health_check ? new Date(inst.last_health_check).toLocaleTimeString() : 'Nunca'}</span>
              </div>
              <div className="text-xs text-gray-400">
                Última Sincronización: {inst.last_sync_at ? new Date(inst.last_sync_at).toLocaleString() : 'Nunca'}
              </div>
            </div>
            
            <div className="bg-gray-900/50 p-4 border-t border-gray-700/50 grid grid-cols-2 gap-2">
              <button onClick={() => handleTestConnection(inst.id)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-2 rounded font-medium border border-gray-600 transition-colors">
                Probar Conexión
              </button>
              <button onClick={() => handleSyncSnapshot(inst.id)} className="bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded font-medium shadow shadow-blue-500/20 transition-colors">
                Importar Snapshot
              </button>
              <button onClick={() => handleViewEvents(inst.id)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-2 rounded font-medium border border-gray-600 transition-colors">
                Ver Eventos
              </button>
              <button onClick={() => handleDeleteInstallation(inst.id)} className="bg-red-900/50 hover:bg-red-800 text-red-300 text-xs py-2 rounded font-medium border border-red-700/50 transition-colors">
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {installations.length === 0 && (
          <div className="col-span-full py-16 text-center border-2 border-dashed border-gray-700 rounded-2xl">
            <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
            <h3 className="text-lg font-medium text-gray-400 mb-1">No hay programas vinculados</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">Vincule un sistema local (como Yummy POS) para comenzar a recibir sus datos.</p>
          </div>
        )}
      </div>

      {/* Modal de Vinculación */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Vincular Nuevo Programa</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {errorMsg && <div className="bg-red-500/20 text-red-400 p-3 rounded mb-4 text-sm font-medium">{errorMsg}</div>}
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-400 mb-2">1. Pega el código de integración generado en el programa</label>
                <textarea 
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-green-400 font-mono focus:ring-blue-500 focus:border-blue-500 outline-none h-32"
                  placeholder='{ "local_id": "...", "base_url": "..." }'
                  value={jsonInput}
                  onChange={handleJsonPaste}
                ></textarea>
              </div>

              <div className="relative flex py-4 items-center">
                <div className="flex-grow border-t border-gray-800"></div>
                <span className="flex-shrink-0 mx-4 text-gray-500 text-sm font-medium">O carga manual</span>
                <div className="flex-grow border-t border-gray-800"></div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Nombre Comercial</label>
                  <input type="text" value={manualForm.local_name} onChange={e => setManualForm({...manualForm, local_name: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">ID Local</label>
                  <input type="text" value={manualForm.local_id} onChange={e => setManualForm({...manualForm, local_id: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Modo de Sincronización</label>
                  <select value={manualForm.sync_mode} onChange={e => setManualForm({...manualForm, sync_mode: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white text-sm">
                    <option value="manual">Manual</option>
                    <option value="automatic">Automático</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">URL Base del Programa (Ej: IP de Tailscale)</label>
                  <input type="text" value={manualForm.base_url} onChange={e => setManualForm({...manualForm, base_url: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white text-sm font-mono" placeholder="https://..." />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">API Key</label>
                  <input type="password" value={manualForm.api_key} onChange={e => setManualForm({...manualForm, api_key: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white text-sm font-mono" />
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-800 bg-gray-900/80 flex justify-end space-x-3">
              <button onClick={() => setShowModal(false)} className="px-5 py-2.5 text-gray-400 hover:text-white font-medium transition-colors">Cancelar</button>
              <button disabled={loading} onClick={handleRegister} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-medium shadow-lg shadow-blue-500/30 transition-all flex items-center">
                {loading ? 'Guardando...' : 'Guardar y Probar Conexión'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
