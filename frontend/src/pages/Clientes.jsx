import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Clientes() {
  const { token } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
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
    fetchClients();
  }, [token]);

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentClients = clients.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(clients.length / itemsPerPage);

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Directorio de Clientes</h2>
          <p className="text-gray-400 text-sm mt-1">Extraído en tiempo real desde Yummy POS</p>
        </div>
        <div className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 font-semibold shadow-sm">
          Total: {clients.length}
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
                      <th className="px-6 py-4">Compras</th>
                      <th className="px-6 py-4 text-right">Fecha Registro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentClients.map((c) => (
                      <tr key={c.id} className="border-b border-gray-750 hover:bg-gray-700 transition-colors">
                        <td className="px-6 py-4 font-medium text-white">{c.name}</td>
                        <td className="px-6 py-4">{c.phone || '-'}</td>
                        <td className="px-6 py-4">{c.address || '-'}</td>
                        <td className="px-6 py-4 font-bold text-emerald-400">{c.purchase_count || 0}</td>
                        <td className="px-6 py-4 text-right">{c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}</td>
                      </tr>
                    ))}
                    {clients.length === 0 && (
                      <tr>
                        <td colSpan="5" className="px-6 py-8 text-center text-gray-500">No hay clientes registrados en Yummy POS.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
            </div>
            
            {/* Pagination Controls */}
            {clients.length > 0 && (
                <div className="bg-gray-900 p-4 border-t border-gray-700 flex items-center justify-between">
                    <span className="text-sm text-gray-400">
                        Mostrando <span className="font-semibold text-white">{indexOfFirstItem + 1}</span> a <span className="font-semibold text-white">{Math.min(indexOfLastItem, clients.length)}</span> de <span className="font-semibold text-white">{clients.length}</span> clientes
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
    </div>
  );
}
