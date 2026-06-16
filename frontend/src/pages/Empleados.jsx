import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Empleados() {
  const { token } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novedades, setNovedades] = useState([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null); // 'adelanto' | 'falta'
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  
  // Form State
  const [formData, setFormData] = useState({ amount: 0, notes: '' });
  const [isSaving, setIsSaving] = useState(false);

  const fetchEmployees = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/data/employees', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      }
    } catch (e) {
      console.error("Error fetching employees", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchNovedades = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/data/employees/novedades', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNovedades(data);
      }
    } catch (e) {
      console.error("Error fetching novedades", e);
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchNovedades();
  }, [token]);

  const handleOpenModal = (employee, type) => {
    setSelectedEmployee(employee);
    setModalType(type);
    setFormData({ amount: 0, notes: '' });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedEmployee(null);
    setModalType(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const res = await fetch(`http://localhost:8000/api/v1/data/employees/${selectedEmployee.id}/novedad`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event_type: modalType,
          amount: formData.amount,
          notes: formData.notes
        })
      });
      
      if (res.ok) {
        await fetchEmployees();
        await fetchNovedades();
        closeModal();
      } else {
        alert("Hubo un error al registrar la novedad");
      }
    } catch (error) {
      console.error("Error saving:", error);
      alert("Error de conexión");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Nómina de Empleados</h2>
          <p className="text-gray-400 text-sm mt-1">Gestión de personal extraída desde Yummy POS</p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg mb-6">
        {loading ? (
           <div className="p-8 text-center text-gray-500">Cargando datos...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-400">
              <thead className="bg-gray-900 text-gray-300 uppercase font-semibold border-b border-gray-700">
                <tr>
                  <th className="px-6 py-4">ID</th>
                  <th className="px-6 py-4">Nombre Completo</th>
                  <th className="px-6 py-4">Rol</th>
                  <th className="px-6 py-4 text-right">Sueldo Base</th>
                  <th className="px-6 py-4 text-right">Descuentos</th>
                  <th className="px-6 py-4 text-right">Sueldo Final</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className="border-b border-gray-750 hover:bg-gray-700 transition-colors">
                    <td className="px-6 py-4 font-mono text-gray-500">#{e.id}</td>
                    <td className="px-6 py-4 font-medium text-white">{e.name}</td>
                    <td className="px-6 py-4">{e.role || 'Staff'}</td>
                    <td className="px-6 py-4 text-right text-gray-300">${(e.salary_base || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-red-400 font-medium">-${(e.adelantos || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-emerald-400 font-bold">${(e.final_salary || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-center space-x-2">
                      <button 
                        onClick={() => handleOpenModal(e, 'adelanto')}
                        className="text-xs bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded hover:bg-blue-600/40 transition-colors"
                      >
                        + Adelanto
                      </button>
                      <button 
                        onClick={() => handleOpenModal(e, 'falta')}
                        className="text-xs bg-orange-600/20 text-orange-400 border border-orange-500/30 px-3 py-1.5 rounded hover:bg-orange-600/40 transition-colors"
                      >
                        + Falta
                      </button>
                    </td>
                  </tr>
                ))}
                {employees.length === 0 && (
                  <tr>
                    <td colSpan="7" className="px-6 py-8 text-center text-gray-500">No hay empleados registrados en Yummy POS.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-sm flex flex-col max-h-[500px]">
        <div className="p-4 border-b border-gray-700 flex items-center bg-gray-900 sticky top-0 z-10">
          <h3 className="font-bold text-white">Historial de Adelantos y Faltas</h3>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-3 bg-gray-800">
          {novedades.map((nov) => (
            <div key={nov.id} className="bg-gray-900 p-4 rounded-xl shadow-sm border border-gray-700 flex justify-between items-start hover:bg-gray-800 transition-colors">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="font-bold text-white text-sm">{nov.employee_name}</div>
                        <div className={`border text-[10px] font-bold px-2 py-0.5 rounded uppercase ${nov.event_type.toLowerCase() === 'falta' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}`}>
                            {nov.event_type}
                        </div>
                    </div>
                    <div className="text-xs text-gray-400 mb-1">Monto Descontado: <span className="font-bold text-red-400">-${nov.amount.toLocaleString()}</span></div>
                    <div className="text-xs text-gray-400 mb-1">Motivo: <span className="italic text-gray-300">{nov.notes}</span></div>
                    <div className="text-xs text-gray-500 mt-2">Fecha: {nov.event_date ? new Date(nov.event_date).toLocaleString('es-AR', {day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit'}) : '-'}</div>
                </div>
            </div>
          ))}
          {novedades.length === 0 && (
            <p className="text-center text-gray-500 py-10 text-sm">No hay adelantos ni faltas registrados.</p>
          )}
        </div>
      </div>

      {/* Modal CRUD */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className={`px-6 py-4 border-b border-gray-700 flex justify-between items-center ${modalType === 'falta' ? 'bg-orange-900/30' : 'bg-blue-900/30'}`}>
              <h3 className="text-lg font-bold text-white">
                Registrar {modalType === 'falta' ? 'Falta' : 'Adelanto'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-white transition-colors">
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="text-sm text-gray-300 mb-4">
                Empleado: <span className="font-bold text-white">{selectedEmployee?.name}</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Monto a descontar ($) *</label>
                <input 
                  type="number" 
                  required
                  min="0"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value) || 0})}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Nota o Motivo *</label>
                <textarea 
                  required
                  rows="3"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder={modalType === 'falta' ? 'Ej: Faltó sin avisar' : 'Ej: Adelanto para alquiler'}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
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
                  className={`px-4 py-2 rounded-lg font-medium text-white shadow-lg transition-colors disabled:opacity-50 ${modalType === 'falta' ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-500/30' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30'}`}
                >
                  {isSaving ? 'Guardando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
