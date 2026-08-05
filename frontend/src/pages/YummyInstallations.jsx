import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function YummyInstallations() {
  const { token, fetchLocations } = useAuth();
  const [installations, setInstallations] = useState([]);
  const [connectionRequests, setConnectionRequests] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [manualForm, setManualForm] = useState({
    local_id: '', local_name: '', base_url: '', api_key: '', sync_mode: 'manual'
  });

  const fetchInstallations = async () => {
    try {
      const res = await fetch("/api/v1/yummy-installations/", {
        headers: { 'Authorization': "Bearer " + token }
      });
      if (res.ok) {
        const data = await res.json();
        setInstallations(data);
      }
    } catch (e) {
      console.error("Error fetching installations:", e);
    }
  };

  const fetchConnectionRequests = async () => {
    try {
      const res = await fetch("/api/v1/yummy-installations/connection-requests/", {
        headers: { 'Authorization': "Bearer " + token }
      });
      if (res.ok) {
        const data = await res.json();
        setConnectionRequests(data);
      }
    } catch (e) {
      console.error("Error fetching connection requests:", e);
    }
  };

  useEffect(() => {
    fetchInstallations();
    fetchConnectionRequests();
    
    const intervalId = setInterval(() => {
      fetchConnectionRequests();
    }, 10000);
    
    return () => clearInterval(intervalId);
  }, [token]);

  const handleAcceptRequest = async (id) => {
    try {
      const res = await fetch(`/api/v1/yummy-installations/connection-requests/${id}/accept`, {
        method: 'POST',
        headers: { 'Authorization': "Bearer " + token }
      });
      if (res.ok) {
        fetchConnectionRequests();
        fetchInstallations();
        fetchLocations(token);
      } else {
        const err = await res.json();
        alert("Error al aceptar: " + (err.detail || "Error desconocido"));
      }
    } catch (e) {
      alert("Error de red");
    }
  };

  const handleRejectRequest = async (id) => {
    try {
      const res = await fetch(`/api/v1/yummy-installations/connection-requests/${id}/reject`, {
        method: 'POST',
        headers: { 'Authorization': "Bearer " + token }
      });
      if (res.ok) {
        fetchConnectionRequests();
      }
    } catch (e) {
      alert("Error de red");
    }
  };

  const handleJsonPaste = (e) => {
    setJsonInput(e.target.value);
    try {
      const parsed = JSON.parse(e.target.value);
      setManualForm({
        local_id: parsed.local_id || '',
        local_name: parsed.local_name || '',
        base_url: parsed.base_url || '',
        api_key: parsed.api_key || '',
        sync_mode: parsed.sync_mode || 'manual'
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
      const registerRes = await fetch("/api/v1/yummy-installations/", {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': "Bearer " + token
        },
        body: JSON.stringify(manualForm)
      });
      
      if (!registerRes.ok) {
        const text = await registerRes.text();
        console.error(registerRes.status, text);
        throw new Error(text || "Error HTTP " + registerRes.status);
      }
      const newInst = await registerRes.json();
      
      setShowModal(false);
      setManualForm({ local_id: '', local_name: '', base_url: '', api_key: '', sync_mode: 'manual' });
      setJsonInput('');
      setPairingCode(null);
      
      setInstallations(prev => [...prev, newInst]);
      fetchLocations(token);
      
      await handleTestConnection(newInst.id);

    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async (id) => {
    try {
      const res = await fetch("/api/v1/yummy-installations/" + id + "/test-connection", {
        method: 'POST',
        headers: { 'Authorization': "Bearer " + token }
      });
      if (res.ok) {
        alert("Conexión Exitosa con el Programa");
      } else {
        alert("Fallo la conexión con el Programa");
      }
      fetchInstallations();
      fetchLocations(token);
    } catch (e) {
      alert("Error de red intentando conectar");
      fetchInstallations();
    }
  };

  const runDiagnostics = async (id) => {
    try {
      const res = await fetch("/api/v1/yummy-installations/" + id + "/diagnostics", {
        method: 'GET',
        headers: { 'Authorization': "Bearer " + token }
      });
      const data = await res.json();
      alert("Diagnóstico:\n" + JSON.stringify(data, null, 2));
    } catch (e) {
      alert("Error ejecutando diagnóstico");
    }
  };

  const handleDeleteInstallation = async (id) => {
    if(!confirm("¿Estás seguro de eliminar esta instalación?")) return;
    try {
      const res = await fetch("/api/v1/yummy-installations/" + id, {
        method: 'DELETE',
        headers: { 'Authorization': "Bearer " + token }
      });
      if (res.ok) {
        setInstallations(prev => prev.filter(i => i.id !== id));
        fetchLocations(token);
      } else {
        alert("Error al eliminar");
      }
    } catch (e) {
      alert("Error de red");
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Terminales Yummy POS</h1>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-gray-600 text-white px-4 py-2 rounded shadow hover:bg-gray-700"
        >
          Añadir Manualmente (Emergencia)
        </button>
      </div>

      {connectionRequests.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4 text-purple-700">Solicitudes Pendientes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {connectionRequests.map(req => (
              <div key={req.id} className="bg-purple-50 rounded-lg shadow p-5 border border-purple-200">
                <h3 className="font-bold text-lg mb-2 text-purple-900">{req.local_name}</h3>
                <p className="text-sm text-purple-700 mb-1">URL: {req.base_url}</p>
                <p className="text-sm text-purple-700 mb-3">
                  Hace: {Math.round((new Date() - new Date(req.requested_at)) / 60000)} min
                </p>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => handleAcceptRequest(req.id)}
                    className="flex-1 bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700 text-sm font-semibold"
                  >
                    Aceptar
                  </button>
                  <button 
                    onClick={() => handleRejectRequest(req.id)}
                    className="flex-1 bg-red-600 text-white px-3 py-2 rounded hover:bg-red-700 text-sm font-semibold"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="text-xl font-bold mb-4">Terminales Vinculadas</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {installations.map(inst => (
          <div key={inst.id} className="bg-white rounded-lg shadow p-5 border border-gray-200">
            <h3 className="font-bold text-lg mb-2">{inst.local_name}</h3>
            <p className="text-sm text-gray-500 mb-1">ID: {inst.local_id}</p>
            <p className="text-sm text-gray-500 mb-3">URL: {inst.base_url}</p>
            
            <div className="flex items-center mb-4">
              <span className={"px-2 py-1 text-xs font-semibold rounded-full " + (
                inst.connection_status === 'ONLINE' ? 'bg-green-100 text-green-800' :
                inst.connection_status === 'ERROR' ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              )}>
                {inst.connection_status}
              </span>
            </div>

            <div className="space-y-2">
              <button 
                onClick={() => handleTestConnection(inst.id)}
                className="w-full bg-gray-100 text-gray-700 px-3 py-1.5 rounded text-sm hover:bg-gray-200"
              >
                Probar Conexión
              </button>
              <button 
                onClick={() => runDiagnostics(inst.id)}
                className="w-full bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded text-sm hover:bg-indigo-200"
              >
                Diagnóstico Avanzado
              </button>
              <button 
                onClick={() => handleDeleteInstallation(inst.id)}
                className="w-full bg-red-50 text-red-600 px-3 py-1.5 rounded text-sm hover:bg-red-100"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {installations.length === 0 && (
          <div className="col-span-full text-center text-gray-500 py-12">
            No hay instalaciones vinculadas a esta cuenta.
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full">
            <h2 className="text-xl font-bold mb-4">Añadir Instalación Manual</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Pegar JSON de Yummy POS (Opcional)</label>
              <textarea 
                className="w-full border rounded p-2 text-sm font-mono h-24"
                placeholder="Pega aquí el JSON si lo tienes..."
                value={jsonInput}
                onChange={handleJsonPaste}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-1">Local ID</label>
                <input 
                  type="text" className="w-full border rounded p-2"
                  value={manualForm.local_id} 
                  onChange={e => setManualForm({...manualForm, local_id: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nombre del Local</label>
                <input 
                  type="text" className="w-full border rounded p-2"
                  value={manualForm.local_name} 
                  onChange={e => setManualForm({...manualForm, local_name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Base URL (IP Tailscale)</label>
                <input 
                  type="text" className="w-full border rounded p-2"
                  value={manualForm.base_url} 
                  onChange={e => setManualForm({...manualForm, base_url: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">API Key</label>
                <input 
                  type="text" className="w-full border rounded p-2"
                  value={manualForm.api_key} 
                  onChange={e => setManualForm({...manualForm, api_key: e.target.value})}
                />
              </div>
            </div>

            {errorMsg && (
              <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm break-all">
                {errorMsg}
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button 
                onClick={handleRegister}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Guardando...' : 'Vincular Instalación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}