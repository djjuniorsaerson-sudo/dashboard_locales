import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { dispatchPanelSync, subscribePanelSync } from '../components/syncEvents';

const formatNovedadDate = (value) => {
  if (!value) {
    return '-';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year} • sin hora`;
  }

  const explicitLocalDateTime = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/
  );
  if (explicitLocalDateTime) {
    const [, year, month, day, hour, minute] = explicitLocalDateTime;
    return `${day}/${month}/${year}, ${hour}:${minute}`;
  }

  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('es-AR', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function Empleados() {
  const { token, currentLocation } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novedades, setNovedades] = useState([]);
  const [novedadesPage, setNovedadesPage] = useState(1);
  const NOVEDADES_PER_PAGE = 10;

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null); // 'adelanto' | 'falta'
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({ amount: 0, notes: '' });
  const [editForm, setEditForm] = useState({
    name: '',
    role: '',
    phone: '',
    salary_base: 0,
    profile_image: '',
    notes: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const fetchEmployees = async () => {
    try {
      const installationQuery = currentLocation?.id ? `?installation_id=${encodeURIComponent(currentLocation.id)}` : '';
      const res = await fetch(`/api/v1/data/employees${installationQuery}`, {
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
      const installationQuery = currentLocation?.id ? `?installation_id=${encodeURIComponent(currentLocation.id)}` : '';
      const res = await fetch(`/api/v1/data/employees/novedades${installationQuery}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNovedades(data);
        setNovedadesPage(1);
      }
    } catch (e) {
      console.error("Error fetching novedades", e);
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchNovedades();
    return subscribePanelSync((detail) => {
      if (detail?.modules && !detail.modules.some((module) => ['employees', 'cash'].includes(module))) {
        return;
      }
      fetchEmployees();
      fetchNovedades();
    });
  }, [token, currentLocation?.id]);

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

  const openEditModal = (employee) => {
    setEditingEmployee(employee);
    setEditForm({
      name: employee?.name || '',
      role: employee?.role || '',
      phone: employee?.phone || '',
      salary_base: employee?.salary_base || 0,
      profile_image: employee?.profile_image || '',
      notes: employee?.notes || '',
    });
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditingEmployee(null);
    setIsEditModalOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEmployee?.id || !currentLocation?.id) {
      alert('No hay un empleado o local activo seleccionado.');
      return;
    }
    setIsSaving(true);
    
    try {
      const res = await fetch(`/api/v1/data/employees/${selectedEmployee.id}/novedad?installation_id=${encodeURIComponent(currentLocation.id)}`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event_type: modalType,
          amount: Number(formData.amount || 0),
          notes: formData.notes
        })
      });
      
      if (res.ok) {
        await fetchEmployees();
        await fetchNovedades();
        closeModal();
        dispatchPanelSync({ modules: ['employees', 'cash'] });
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

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingEmployee || !currentLocation?.id) {
      alert('No hay un local activo seleccionado.');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/v1/data/employees/${editingEmployee.id}?installation_id=${encodeURIComponent(currentLocation.id)}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...editingEmployee,
          ...editForm,
          salary_base: Number(editForm.salary_base || 0),
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || 'No se pudo actualizar el empleado');
      }
      await fetchEmployees();
      await fetchNovedades();
      closeEditModal();
      dispatchPanelSync({ modules: ['employees'] });
    } catch (error) {
      console.error("Error updating employee", error);
      alert(error.message || "No se pudo actualizar el empleado");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetEmployee = async (employee) => {
    if (!currentLocation?.id) {
      alert('No hay un local activo seleccionado.');
      return;
    }
    const confirmed = window.confirm(`Se van a borrar faltas, adelantos y pagos de ${employee.name}. ¿Querés continuar?`);
    if (!confirmed) {
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/v1/data/employees/${employee.id}/reset?installation_id=${encodeURIComponent(currentLocation.id)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || 'No se pudo reiniciar el empleado');
      }
      await fetchEmployees();
      await fetchNovedades();
      dispatchPanelSync({ modules: ['employees'] });
    } catch (error) {
      console.error("Error resetting employee", error);
      alert(error.message || "No se pudo reiniciar el empleado");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNovedad = async (nov) => {
    if (!currentLocation?.id) {
      alert('No hay un local activo seleccionado.');
      return;
    }
    const confirmed = window.confirm(`¿Borrar ${nov.event_type?.toLowerCase() || 'la novedad'} de ${nov.employee_name}?`);
    if (!confirmed) {
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/v1/data/employees/novedades/${nov.id}?installation_id=${encodeURIComponent(currentLocation.id)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || 'No se pudo eliminar la novedad');
      }
      await fetchEmployees();
      await fetchNovedades();
      dispatchPanelSync({ modules: ['employees', 'cash'] });
    } catch (error) {
      console.error("Error deleting novedad", error);
      alert(error.message || "No se pudo eliminar la novedad");
    } finally {
      setIsSaving(false);
    }
  };

  const totalAPagar = employees.reduce((acc, emp) => {
    return (emp.final_salary > 0) ? acc + emp.final_salary : acc;
  }, 0);
  const totalNovedadesPages = Math.max(1, Math.ceil(novedades.length / NOVEDADES_PER_PAGE));
  const paginatedNovedades = novedades.slice(
    (novedadesPage - 1) * NOVEDADES_PER_PAGE,
    novedadesPage * NOVEDADES_PER_PAGE
  );

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Nómina de Empleados</h2>
          <p className="text-gray-400 text-sm mt-1">Gestión de personal extraída desde Yummy POS</p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg mb-6">
        {loading ? (
           <div className="p-8 text-center text-gray-500">Cargando datos...</div>
        ) : (
          <>
            <div className="divide-y divide-gray-700 md:hidden">
              {employees.map((e) => (
                <div key={e.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-gray-500">#{e.id}</div>
                      <div className="font-semibold text-white break-words mt-1">{e.name}</div>
                      <div className="text-sm text-gray-400 mt-1">{e.role || 'Staff'}</div>
                    </div>
                    <div className="shrink-0 rounded-lg bg-emerald-500/10 px-3 py-2 text-right">
                      <div className="text-[10px] uppercase tracking-wide text-gray-500">Final</div>
                      <div className="text-emerald-400 font-bold">${(e.final_salary || 0).toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-gray-900/60 rounded-lg p-3">
                      <div className="text-gray-500 text-xs uppercase tracking-wide">Sueldo base</div>
                      <div className="text-white font-semibold mt-1">${(e.salary_base || 0).toLocaleString()}</div>
                    </div>
                    <div className="bg-gray-900/60 rounded-lg p-3">
                      <div className="text-gray-500 text-xs uppercase tracking-wide">Descuentos</div>
                      <div className="text-red-400 font-semibold mt-1">-${(e.adelantos || 0).toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => handleOpenModal(e, 'adelanto')}
                      className="rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 py-2 text-sm font-medium"
                    >
                      + Adelanto
                    </button>
                    <button 
                      onClick={() => handleOpenModal(e, 'falta')}
                      className="rounded-lg bg-orange-600/20 text-orange-400 border border-orange-500/30 px-3 py-2 text-sm font-medium"
                    >
                      + Falta
                    </button>
                    <button
                      onClick={() => openEditModal(e)}
                      className="rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-3 py-2 text-sm font-medium"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleResetEmployee(e)}
                      disabled={isSaving}
                      className="rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 px-3 py-2 text-sm font-medium disabled:opacity-50"
                    >
                      Reiniciar
                    </button>
                  </div>
                </div>
              ))}
              {employees.length === 0 && (
                <div className="px-6 py-8 text-center text-gray-500">No hay empleados registrados en Yummy POS.</div>
              )}
              {employees.length > 0 && (
                <div className="p-4 bg-gray-900/80 border-t border-gray-600">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Total sueldos a pagar</div>
                  <div className="text-[11px] text-gray-500 mt-1">(Ignorando negativos)</div>
                  <div className="text-emerald-400 font-black text-2xl mt-2">${totalAPagar.toLocaleString()}</div>
                </div>
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
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
                        <button
                          onClick={() => openEditModal(e)}
                          className="text-xs bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded hover:bg-emerald-600/40 transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleResetEmployee(e)}
                          disabled={isSaving}
                          className="text-xs bg-red-600/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded hover:bg-red-600/40 transition-colors disabled:opacity-50"
                        >
                          Reiniciar
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
                {employees.length > 0 && (
                  <tfoot className="bg-gray-900/80 border-t border-gray-600">
                    <tr>
                      <td colSpan="5" className="px-6 py-5 text-right font-bold text-white uppercase tracking-wider text-sm">
                        Total Sueldos a Pagar <span className="text-gray-500 text-xs normal-case ml-2">(Ignorando negativos)</span>
                      </td>
                      <td className="px-6 py-5 text-right text-emerald-400 font-black text-xl">
                        ${totalAPagar.toLocaleString()}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-sm flex flex-col max-h-[500px]">
        <div className="p-4 border-b border-gray-700 flex items-center bg-gray-900 sticky top-0 z-10">
          <h3 className="font-bold text-white">Historial de Adelantos y Faltas</h3>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-3 bg-gray-800">
          {paginatedNovedades.map((nov) => (
            <div key={nov.id} className="bg-gray-900 p-4 rounded-xl shadow-sm border border-gray-700 hover:bg-gray-800 transition-colors">
                <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-white text-sm">{nov.employee_name}</div>
                          <div className={`border text-[10px] font-bold px-2 py-0.5 rounded uppercase ${nov.event_type.toLowerCase() === 'falta' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}`}>
                            {nov.event_type}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteNovedad(nov)}
                        disabled={isSaving}
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                      >
                        Borrar
                      </button>
                    </div>
                    <div className="text-xs text-gray-400 mb-1">Monto Descontado: <span className="font-bold text-red-400">-${nov.amount.toLocaleString()}</span></div>
                    <div className="text-xs text-gray-400 mb-1">Motivo: <span className="italic text-gray-300">{nov.notes}</span></div>
                    <div className="text-xs text-gray-500 mt-2">Fecha: {formatNovedadDate(nov.event_date)}</div>
                </div>
            </div>
          ))}
          {novedades.length === 0 && (
            <p className="text-center text-gray-500 py-10 text-sm">No hay adelantos ni faltas registrados.</p>
          )}
        </div>
        {novedades.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-gray-700 bg-gray-900 px-4 py-3">
            <p className="text-sm text-gray-400">
              Mostrando {Math.min((novedadesPage - 1) * NOVEDADES_PER_PAGE + 1, novedades.length)} - {Math.min(novedadesPage * NOVEDADES_PER_PAGE, novedades.length)} de {novedades.length} vales/faltas
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNovedadesPage((page) => Math.max(1, page - 1))}
                disabled={novedadesPage === 1}
                className="rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="text-sm font-semibold text-gray-300">
                Página {novedadesPage} de {totalNovedadesPages}
              </span>
              <button
                type="button"
                onClick={() => setNovedadesPage((page) => Math.min(totalNovedadesPages, page + 1))}
                disabled={novedadesPage === totalNovedadesPages}
                className="rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
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

      {isEditModalOpen && editingEmployee && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700 bg-emerald-900/20 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Editar Empleado</h3>
              <button onClick={closeEditModal} className="text-gray-400 hover:text-white transition-colors">✕</button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Nombre</label>
                  <input
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Puesto</label>
                  <input
                    required
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Teléfono</label>
                  <input
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Sueldo base</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.salary_base}
                    onChange={(e) => setEditForm({ ...editForm, salary_base: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Foto cargada o URL</label>
                <input
                  value={editForm.profile_image}
                  onChange={(e) => setEditForm({ ...editForm, profile_image: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Notas</label>
                <textarea
                  rows="4"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white"
                />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={closeEditModal} className="px-4 py-2 rounded-lg font-medium text-gray-300 hover:bg-gray-700 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-lg font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">
                  {isSaving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
