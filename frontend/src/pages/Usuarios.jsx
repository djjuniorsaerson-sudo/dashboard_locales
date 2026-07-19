import { useState, useEffect } from 'react';

export default function Usuarios({ token }) {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Forms state
  const [createForm, setCreateForm] = useState({ username: '', password: '', role: 'cajero', active: true });
  const [passwordForm, setPasswordForm] = useState({ password: '' });

  const fetchUsuarios = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/v1/data/usuarios', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsuarios(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsuarios();
  }, [token]);

  const handleCreateUsuario = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:8000/api/v1/data/usuarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(createForm)
      });
      if (res.ok) {
        setShowCreateModal(false);
        setCreateForm({ username: '', password: '', role: 'cajero', active: true });
        fetchUsuarios();
      } else {
        alert("Error creando usuario");
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión");
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      const res = await fetch(`http://localhost:8000/api/v1/data/usuarios/${selectedUser.id}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(passwordForm)
      });
      if (res.ok) {
        setShowPasswordModal(false);
        setPasswordForm({ password: '' });
        setSelectedUser(null);
        alert("Contraseña actualizada correctamente");
      } else {
        alert("Error actualizando contraseña");
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión");
    }
  };

  const handleToggleStatus = async (user) => {
    const newStatus = !user.active;
    if (!window.confirm(`¿Seguro que deseas ${newStatus ? 'activar' : 'desactivar'} al usuario ${user.username}?`)) return;
    
    try {
      const res = await fetch(`http://localhost:8000/api/v1/data/usuarios/${user.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ active: newStatus })
      });
      if (res.ok) {
        fetchUsuarios();
      }
    } catch (e) {
      console.error(e);
      alert("Error cambiando estado");
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center">
            <svg className="w-6 h-6 mr-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            Gestión de Usuarios
          </h2>
          <p className="text-gray-400 text-sm mt-1">Administra los accesos al sistema Yummy</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
          Nuevo Usuario
        </button>
      </div>

      <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-900 border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold">ID</th>
                <th className="p-4 font-semibold">Usuario</th>
                <th className="p-4 font-semibold">Rol</th>
                <th className="p-4 font-semibold">Último Acceso</th>
                <th className="p-4 font-semibold text-center">Estado</th>
                <th className="p-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {usuarios.map(u => (
                <tr key={u.id} className="hover:bg-gray-750 transition-colors">
                  <td className="p-4 text-gray-300 font-mono text-sm">#{u.id}</td>
                  <td className="p-4">
                    <div className="text-white font-medium">{u.username}</div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${u.role === 'admin' ? 'bg-purple-900/50 text-purple-400' : 'bg-blue-900/50 text-blue-400'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="p-4 text-gray-400 text-sm">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Nunca'}
                  </td>
                  <td className="p-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${u.active ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                      {u.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => { setSelectedUser(u); setShowPasswordModal(true); }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs transition-colors"
                        title="Cambiar Contraseña"
                      >
                        🔑
                      </button>
                      <button 
                        onClick={() => handleToggleStatus(u)}
                        className={`${u.active ? 'bg-red-600/80 hover:bg-red-700' : 'bg-green-600/80 hover:bg-green-700'} text-white px-3 py-1 rounded text-xs transition-colors`}
                      >
                        {u.active ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-gray-400">
                    No hay usuarios registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-700">
            <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-900">
              <h3 className="text-xl font-bold text-white uppercase tracking-wide">Nuevo Usuario</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <form onSubmit={handleCreateUsuario} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Nombre de Usuario</label>
                <input 
                  type="text" 
                  required 
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  value={createForm.username}
                  onChange={(e) => setCreateForm({...createForm, username: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Contraseña</label>
                <input 
                  type="password" 
                  required 
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({...createForm, password: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Rol</label>
                <select 
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  value={createForm.role}
                  onChange={(e) => setCreateForm({...createForm, role: e.target.value})}
                >
                  <option value="cajero">Cajero</option>
                  <option value="encargado">Encargado</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors">
                  Crear Usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PASSWORD MODAL */}
      {showPasswordModal && selectedUser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-700">
            <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-900">
              <h3 className="text-xl font-bold text-white uppercase tracking-wide">Cambiar Contraseña</h3>
              <button onClick={() => {setShowPasswordModal(false); setSelectedUser(null);}} className="text-gray-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="p-6 space-y-4">
              <div className="bg-blue-900/30 p-3 rounded-lg border border-blue-800/50 mb-4">
                <p className="text-blue-400 text-sm">Usuario seleccionado: <strong className="text-white">{selectedUser.username}</strong></p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Nueva Contraseña</label>
                <input 
                  type="password" 
                  required 
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  value={passwordForm.password}
                  onChange={(e) => setPasswordForm({...passwordForm, password: e.target.value})}
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => {setShowPasswordModal(false); setSelectedUser(null);}} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
