import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Clientes() {
  const { token } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formData, setFormData] = useState({ name: '', phone: '', address: '', notes: '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchClients();
  }, [token]);

  const fetchClients = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/data/clients', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setClients(data);
      }
    } catch (e) {
      console.error("Error", e);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (client = null) => {
    if (client) {
      setEditingClient(client);
      setFormData({ 
        name: client.name || '', 
        phone: client.phone || '', 
        address: client.address || '', 
        notes: client.notes || '' 
      });
    } else {
      setEditingClient(null);
      setFormData({ name: '', phone: '', address: '', notes: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingClient(null);
    setFormData({ name: '', phone: '', address: '', notes: '' });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const url = editingClient 
        ? `http://localhost:8000/api/v1/data/clients/${editingClient.id}`
        : 'http://localhost:8000/api/v1/data/clients';
        
      const method = editingClient ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        await fetchClients();
        closeModal();
      } else {
        alert("Error al guardar el cliente.");
      }
    } catch (e) {
      console.error("Error", e);
      alert("Error de red al guardar.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (clientId) => {
    if (!window.confirm("¿Estás seguro de que quieres eliminar este cliente? Los pedidos asociados no se borrarán, pero perderán la referencia a este cliente.")) {
      return;
    }

    try {
      const res = await fetch(`http://localhost:8000/api/v1/data/clients/${clientId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setClients(clients.filter(c => c.id !== clientId));
      } else {
        alert("Error al eliminar el cliente.");
      }
    } catch (e) {
      console.error("Error", e);
      alert("Error de red al eliminar.");
    }
  };

  // Filter logic
  const filteredClients = clients.filter(c => {
    const term = searchTerm.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(term) ||
      (c.phone || '').toLowerCase().includes(term) ||
      (c.address || '').toLowerCase().includes(term)
    );
  });

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentClients = filteredClients.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  return (
    <div className="p-6 relative">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Directorio de Clientes</h2>
          <p className="text-gray-400 text-sm mt-1">Extraído en tiempo real desde Yummy POS</p>
        </div>
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 w-64 transition-colors"
          />
          <div className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 font-semibold shadow-sm flex items-center">
            Total: {filteredClients.length}
          </div>
          <button 
            onClick={() => openModal()}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-semibold transition-colors shadow-sm"
          >
            + Nuevo Cliente
          </button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg flex flex-col">
        {loading ? (
           <div className="p-8 text-center text-gray-500">Cargando datos...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-400">
                  <thead className="bg-gray-900 text-gray-300 uppercase font-semibold border-b border-gray-700">
                    <tr>
                      <th className="px-6 py-4">Nombre</th>
                      <th className="px-6 py-4">Teléfono</th>
                      <th className="px-6 py-4">Dirección principal</th>
                      <th className="px-6 py-4 text-center">Compras</th>
                      <th className="px-6 py-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentClients.map((c) => (
                      <tr key={c.id} className="border-b border-gray-750 hover:bg-gray-700 transition-colors">
                        <td className="px-6 py-4 font-medium text-white">{c.name}</td>
                        <td className="px-6 py-4">{c.phone || '-'}</td>
                        <td className="px-6 py-4">{c.address || '-'}</td>
                        <td className="px-6 py-4 font-bold text-emerald-400 text-center">{c.purchase_count || 0}</td>
                        <td className="px-6 py-4 text-center">
                          <button 
                            onClick={() => openModal(c)}
                            className="text-blue-400 hover:text-blue-300 font-medium mr-3 transition-colors"
                          >
                            Editar
                          </button>
                          <button 
                            onClick={() => handleDelete(c.id)}
                            className="text-red-400 hover:text-red-300 font-medium transition-colors"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredClients.length === 0 && (
                      <tr>
                        <td colSpan="5" className="px-6 py-8 text-center text-gray-500">No se encontraron clientes.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
            </div>
            
            {/* Pagination Controls */}
            {filteredClients.length > 0 && (
                <div className="bg-gray-900 p-4 border-t border-gray-700 flex items-center justify-between">
                    <span className="text-sm text-gray-400">
                        Mostrando <span className="font-semibold text-white">{indexOfFirstItem + 1}</span> a <span className="font-semibold text-white">{Math.min(indexOfLastItem, filteredClients.length)}</span> de <span className="font-semibold text-white">{filteredClients.length}</span> clientes
                    </span>
                    <div className="flex gap-2">
                        <button 
                            onClick={handlePrevPage} 
                            disabled={currentPage === 1}
                            className={`px-4 py-2 rounded font-medium text-sm transition-colors ${currentPage === 1 ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                        >
                            Anterior
                        </button>
                        <button 
                            onClick={handleNextPage} 
                            disabled={currentPage === totalPages}
                            className={`px-4 py-2 rounded font-medium text-sm transition-colors ${currentPage === totalPages ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                        >
                            Siguiente
                        </button>
                    </div>
                </div>
            )}
          </>
        )}
      </div>

      {/* Modal Formulario */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">
                {editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
              </h3>
              <button 
                onClick={closeModal}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Nombre Completo *</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  placeholder="Ej. Juan Pérez"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Teléfono</label>
                <input 
                  type="text" 
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  placeholder="Ej. 3512345678"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Dirección Principal</label>
                <input 
                  type="text" 
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  placeholder="Ej. Av. Siempreviva 742"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Notas / Preferencias</label>
                <textarea 
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors h-24 resize-none"
                  placeholder="Ej. Alérgico al maní, no tocar el timbre..."
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button 
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg font-medium text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Guardando...' : 'Guardar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
