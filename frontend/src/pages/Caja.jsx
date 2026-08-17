import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Caja() {
  const { token, currentLocation } = useAuth();
  const [reportes, setReportes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDays, setExpandedDays] = useState({});
  const [employees, setEmployees] = useState([]);

  // Cash Management State
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState(''); // 'saldo_inicial', 'retiro', 'vale', 'perdida', 'reset_turno'
  const [formData, setFormData] = useState({
    amount: '',
    payment_method: 'efectivo',
    notes: '',
    employee_name: '',
    shift_name: 'manana'
  });
  const [submitting, setSubmitting] = useState(false);
  const isOffline = !!currentLocation && currentLocation.status !== 'ONLINE';

  const buildCashClosureHtml = (summary) => {
    const formatMoney = (amount) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(amount || 0));
    const rows = Array.isArray(summary?.movements) ? summary.movements : [];
    const products = Array.isArray(summary?.products) ? summary.products : [];
    const sales = Array.isArray(summary?.sales) ? summary.sales : [];
    return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Cierre de caja ${summary?.date || ''}</title>
    <style>
      @page { size: A4; margin: 16mm; }
      body { font-family: Arial, sans-serif; color: #111827; font-size: 12px; }
      h1, h2, h3 { margin: 0 0 8px; }
      .header { margin-bottom: 16px; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 16px 0; }
      .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; }
      .label { font-size: 10px; text-transform: uppercase; color: #6b7280; margin-bottom: 4px; }
      .value { font-size: 16px; font-weight: 700; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
      th { background: #f3f4f6; }
      .section { margin-top: 18px; }
      .right { text-align: right; }
      .muted { color: #6b7280; }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>Cierre de Caja</h1>
      <div class="muted">Local: ${currentLocation?.name || 'Local activo'}</div>
      <div class="muted">Fecha: ${summary?.date || '-'}</div>
      <div class="muted">Turno: ${summary?.shift || '-'}</div>
      <div class="muted">Rango: ${summary?.start_at || '-'} a ${summary?.end_at || '-'}</div>
    </div>

    <div class="grid">
      <div class="card"><div class="label">Saldo inicial</div><div class="value">${formatMoney(summary?.opening_balance)}</div></div>
      <div class="card"><div class="label">Ventas totales</div><div class="value">${formatMoney(summary?.sales_total)}</div></div>
      <div class="card"><div class="label">Saldo efectivo</div><div class="value">${formatMoney(summary?.cash_balance)}</div></div>
      <div class="card"><div class="label">Efectivo</div><div class="value">${formatMoney(summary?.cash_total)}</div></div>
      <div class="card"><div class="label">Transferencia</div><div class="value">${formatMoney(summary?.transfer_total)}</div></div>
      <div class="card"><div class="label">Débito</div><div class="value">${formatMoney(summary?.debit_total)}</div></div>
      <div class="card"><div class="label">Online</div><div class="value">${formatMoney(summary?.online_total)}</div></div>
      <div class="card"><div class="label">Retiros</div><div class="value">${formatMoney(summary?.withdrawals_total)}</div></div>
      <div class="card"><div class="label">Vales</div><div class="value">${formatMoney(summary?.vouchers_total)}</div></div>
    </div>

    <div class="section">
      <h3>Movimientos de caja</h3>
      <table>
        <thead>
          <tr><th>Tipo</th><th>Notas</th><th>Fecha</th><th class="right">Monto</th></tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((row) => `<tr><td>${row.movement_type || row.type || '-'}</td><td>${row.notes || '-'}</td><td>${row.created_at || row.movement_date || '-'}</td><td class="right">${formatMoney(row.amount)}</td></tr>`).join('') : '<tr><td colspan="4">Sin movimientos registrados.</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h3>Productos vendidos</h3>
      <table>
        <thead>
          <tr><th>Producto</th><th class="right">Cantidad</th><th class="right">Importe</th></tr>
        </thead>
        <tbody>
          ${products.length ? products.map((row) => `<tr><td>${row.product_name || '-'}</td><td class="right">${row.quantity || 0}</td><td class="right">${formatMoney(row.amount)}</td></tr>`).join('') : '<tr><td colspan="3">Sin productos vendidos en este cierre.</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h3>Ventas incluidas</h3>
      <table>
        <thead>
          <tr><th>ID</th><th>Medio de pago</th><th>Detalle</th><th class="right">Total</th></tr>
        </thead>
        <tbody>
          ${sales.length ? sales.map((sale) => `<tr><td>#${sale.id || '-'}</td><td>${sale.payment_method || '-'}</td><td>${sale.payment_detail || '-'}</td><td class="right">${formatMoney(sale.total)}</td></tr>`).join('') : '<tr><td colspan="4">Sin ventas registradas en este cierre.</td></tr>'}
        </tbody>
      </table>
    </div>
  </body>
</html>`;
  };

  const openPrintWindow = (summary) => {
    const html = buildCashClosureHtml(summary);
    const printWindow = window.open('', '_blank', 'width=1024,height=900');
    if (!printWindow) {
      alert('El navegador bloqueó la ventana de impresión.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 300);
  };

  const fetchCaja = async () => {
    try {
      const installationQuery = currentLocation?.id ? `?installation_id=${encodeURIComponent(currentLocation.id)}` : '';
      const res = await fetch(`/api/v1/data/caja/report${installationQuery}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReportes(data);
        if (data.length > 0) {
          setExpandedDays({ [data[0].date]: true });
        }
      }
    } catch (e) {
      console.error("Error", e);
    } finally {
      setLoading(false);
    }
  };

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
    }
  };

  useEffect(() => {
    fetchCaja();
    fetchEmployees();
  }, [token, currentLocation?.id]);

  const toggleDay = (date) => {
    setExpandedDays(prev => ({ ...prev, [date]: !prev[date] }));
  };

  const handleOpenModal = (type) => {
    if (isOffline) {
      alert('El local está OFFLINE. Podés ver el último cierre sincronizado, pero no registrar movimientos en tiempo real.');
      return;
    }
    setModalType(type);
    setFormData({
      amount: type === 'reset_turno' ? 0 : '',
      payment_method: type === 'reset_turno' ? '' : 'efectivo',
      notes: type === 'reset_turno' ? 'Turno: ' : '',
      employee_name: '',
      shift_name: 'manana'
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let finalNotes = formData.notes;
      if (modalType === 'saldo_inicial' || modalType === 'reset_turno') {
        finalNotes = `Turno: ${formData.shift_name}`;
      }

      // Fix for timezone bug: get LOCAL YYYY-MM-DD
      const localDate = new Date();
      localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
      const localDateString = localDate.toISOString().split('T')[0];

      const isCashClose = modalType === 'reset_turno';
      const endpoint = isCashClose
        ? `/api/v1/data/caja/reset-turno?installation_id=${encodeURIComponent(currentLocation?.id || '')}`
        : `/api/v1/data/caja/movimiento?installation_id=${encodeURIComponent(currentLocation?.id || '')}`;

      const payload = isCashClose
        ? {
            shift: formData.shift_name,
            movement_date: localDateString,
            generate_report: true,
          }
        : {
            movement_type: modalType,
            amount: Number(formData.amount),
            payment_method: formData.payment_method,
            movement_date: localDateString,
            notes: finalNotes,
            employee_name: formData.employee_name
          };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setShowModal(false);
        await fetchCaja();
        if (isCashClose) {
          openPrintWindow(data);
        }
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.detail || 'Error al registrar movimiento');
      }
    } catch (error) {
      console.error("Error saving movimiento", error);
    } finally {
      setSubmitting(false);
    }
  };

  const formatMoney = (amount) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount);
  };

  const formatDateLabel = (dateValue) => {
    return new Date(`${dateValue}T00:00:00`).toLocaleDateString('es-AR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (value) => {
    if (!value) return '-';
    return new Date(value).toLocaleTimeString('es-AR');
  };

  const getDaySummary = (dayReport) => {
    const openingBalance = dayReport.shifts.reduce((acc, shift) => acc + Number(shift.saldo_inicial || 0), 0);
    const totalSales = Number(dayReport.total_ingresos || 0);
    const totalWithdrawals = Number(dayReport.total_salidas || 0);
    const expectedCash = openingBalance + Number(dayReport.efectivo || 0) - totalWithdrawals;
    const activeShift = dayReport.shifts.find((shift) => !shift.end_time) || dayReport.shifts[dayReport.shifts.length - 1] || null;
    return {
      openingBalance,
      totalSales,
      totalWithdrawals,
      expectedCash,
      activeShift,
    };
  };

  const formatShiftLabel = (shift) => {
    const label = String(shift?.shift_label || '').trim();
    if (label) {
      return `Turno ${label}`;
    }
    if (shift?.shift_id) {
      return `Turno ${shift.shift_id}`;
    }
    return 'Turno';
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Gestión de Caja</h2>
          <p className="text-gray-400 text-sm mt-1">Control integral de ingresos, salidas y turnos</p>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:flex-wrap">
          <button
            onClick={() => handleOpenModal('saldo_inicial')}
            disabled={isOffline}
            className={`text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-colors ${isOffline ? 'bg-green-900/40 cursor-not-allowed opacity-60' : 'bg-green-600 hover:bg-green-700'}`}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
            Iniciar Caja
          </button>
          <button
            onClick={() => handleOpenModal('retiro')}
            disabled={isOffline}
            className={`text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-colors ${isOffline ? 'bg-orange-900/40 cursor-not-allowed opacity-60' : 'bg-orange-500 hover:bg-orange-600'}`}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4"></path></svg>
            Retiro
          </button>
          <button
            onClick={() => handleOpenModal('reset_turno')}
            disabled={isOffline}
            className={`col-span-2 sm:col-span-1 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-colors ${isOffline ? 'bg-red-900/40 cursor-not-allowed opacity-60' : 'bg-red-600 hover:bg-red-700'}`}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"></path></svg>
            Cerrar Caja
          </button>
        </div>
      </div>

      {isOffline && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Mostrando el último estado sincronizado de caja. Las acciones en tiempo real quedan deshabilitadas hasta que el local vuelva a estar ONLINE.
        </div>
      )}

      <div className="space-y-4">
        {loading ? (
           <div className="p-8 text-center text-gray-500 bg-gray-800 rounded-xl animate-pulse h-32"></div>
        ) : reportes.length === 0 ? (
           <div className="p-8 text-center text-gray-500 bg-gray-800 rounded-xl">No hay datos de caja registrados recientes.</div>
        ) : (
          reportes.map((dayReport) => (
            <div key={dayReport.date} className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden shadow-lg">
              {/* Encabezado del Día */}
              {(() => {
                const summary = getDaySummary(dayReport);
                return (
              <div 
                className="bg-gray-900 p-4 sm:p-5 md:px-6 md:py-6 cursor-pointer hover:bg-gray-850 transition-colors"
                onClick={() => toggleDay(dayReport.date)}
              >
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg mt-1 ${expandedDays[dayReport.date] ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                      <svg className={`w-6 h-6 transform transition-transform ${expandedDays[dayReport.date] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                    <div className="space-y-4 min-w-0">
                      <div>
                        <h3 className="text-lg sm:text-xl font-bold text-white capitalize leading-tight">{formatDateLabel(dayReport.date)}</h3>
                        <p className="text-sm text-gray-400">{dayReport.shifts.length} turnos registrados</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-gray-800/90 border border-gray-700 rounded-xl px-4 py-3 min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wide text-blue-400">Estado de caja ahora</p>
                          <p className="mt-1 text-lg font-bold text-white">
                            {summary.activeShift && !summary.activeShift.end_time ? 'Caja abierta' : 'Caja cerrada'}
                          </p>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-400">
                            <div>
                              <span className="block text-gray-500">Turno actual</span>
                              <span className="text-gray-200 font-semibold">
                                {summary.activeShift ? formatShiftLabel(summary.activeShift) : '-'}
                              </span>
                            </div>
                            <div>
                              <span className="block text-gray-500">Apertura</span>
                              <span className="text-gray-200 font-semibold">
                                {summary.activeShift ? formatTime(summary.activeShift.start_time) : '-'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-gray-800/90 border border-gray-700 rounded-xl px-4 py-3 min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wide text-emerald-400">Resumen rápido</p>
                          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="block text-gray-500 text-xs">Saldo inicial</span>
                              <span className="text-white font-bold">{formatMoney(summary.openingBalance)}</span>
                            </div>
                            <div>
                              <span className="block text-gray-500 text-xs">Cobrado hoy</span>
                              <span className="text-emerald-400 font-bold">{formatMoney(summary.totalSales)}</span>
                            </div>
                            <div>
                              <span className="block text-gray-500 text-xs">Retiros</span>
                              <span className="text-red-400 font-bold">-{formatMoney(summary.totalWithdrawals)}</span>
                            </div>
                            <div>
                              <span className="block text-gray-500 text-xs">Efectivo esperado</span>
                              <span className="text-blue-300 font-bold">{formatMoney(summary.expectedCash)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 xl:min-w-[620px]">
                    <div className="bg-gray-800 px-3 sm:px-4 py-3 rounded-xl border border-gray-700">
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wide">Saldo inicial</p>
                      <p className="text-base sm:text-lg font-bold text-white mt-1 break-words">{formatMoney(summary.openingBalance)}</p>
                    </div>
                    <div className="bg-gray-800 px-3 sm:px-4 py-3 rounded-xl border border-gray-700">
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wide">Cobrado hoy</p>
                      <p className="text-base sm:text-lg font-bold text-emerald-500 mt-1 break-words">{formatMoney(summary.totalSales)}</p>
                    </div>
                    <div className="bg-gray-800 px-3 sm:px-4 py-3 rounded-xl border border-gray-700">
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wide">Retiros</p>
                      <p className="text-base sm:text-lg font-bold text-red-400 mt-1 break-words">-{formatMoney(summary.totalWithdrawals)}</p>
                    </div>
                    <div className="bg-gray-800 px-3 sm:px-4 py-3 rounded-xl border-2 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
                      <p className="text-xs text-blue-400 font-bold uppercase tracking-wide">Efectivo esperado</p>
                      <p className="text-lg sm:text-xl font-black text-white mt-1 break-words">{formatMoney(summary.expectedCash)}</p>
                    </div>
                  </div>
                </div>
              </div>
                );
              })()}

              {/* Contenido Desplegable */}
              {expandedDays[dayReport.date] && (
                <div className="p-6 bg-gray-800/50 border-t border-gray-700">
                  
                  {/* Desglose de Métodos de Pago del Día */}
                  <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">Ventas por medio de pago</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
                    <div className="bg-gray-700/50 p-4 rounded-xl border border-gray-600">
                      <div className="flex items-center text-green-400 mb-1">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                        Efectivo
                      </div>
                      <p className="text-2xl font-bold text-white">{formatMoney(dayReport.efectivo)}</p>
                    </div>
                    <div className="bg-gray-700/50 p-4 rounded-xl border border-gray-600">
                      <div className="flex items-center text-blue-400 mb-1">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                        Transf.
                      </div>
                      <p className="text-2xl font-bold text-white">{formatMoney(dayReport.transferencia)}</p>
                    </div>
                    <div className="bg-gray-700/50 p-4 rounded-xl border border-gray-600">
                      <div className="flex items-center text-indigo-400 mb-1">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg>
                        Online
                      </div>
                      <p className="text-2xl font-bold text-white">{formatMoney(dayReport.online || 0)}</p>
                    </div>
                    <div className="bg-gray-700/50 p-4 rounded-xl border border-gray-600">
                      <div className="flex items-center text-pink-400 mb-1">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
                        Débito
                      </div>
                      <p className="text-2xl font-bold text-white">{formatMoney(dayReport.debito || 0)}</p>
                    </div>
                    <div className="bg-gray-700/50 p-4 rounded-xl border border-gray-600">
                      <div className="flex items-center text-purple-400 mb-1">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        Mixto
                      </div>
                      <p className="text-2xl font-bold text-white">{formatMoney(dayReport.mixto)}</p>
                    </div>
                  </div>

                  {/* Turnos */}
                  <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">Turnos del día</h4>
                  <div className="space-y-4">
                    {dayReport.shifts.map((shift, idx) => (
                      <div key={idx} className="bg-gray-900 rounded-xl p-4 border border-gray-700">
                        <div className="flex flex-col md:flex-row justify-between mb-4 pb-4 border-b border-gray-800">
                          <div>
                            <h5 className="font-bold text-lg text-white">{formatShiftLabel(shift)}</h5>
                            <p className="text-xs text-gray-500">
                              Apertura: {formatTime(shift.start_time)} 
                              {shift.end_time ? ` - Cierre: ${formatTime(shift.end_time)}` : ' - Caja abierta'}
                            </p>
                          </div>
                          <div className="flex gap-4 mt-2 md:mt-0">
                            <div className="text-right">
                              <span className="block text-xs text-gray-500">Saldo Inicial</span>
                              <span className="font-bold text-gray-300">{formatMoney(shift.saldo_inicial)}</span>
                            </div>
                            <div className="text-right">
                              <span className="block text-xs text-emerald-500/70">Ingresos</span>
                              <span className="font-bold text-emerald-400">{formatMoney(shift.ingresos)}</span>
                            </div>
                            <div className="text-right">
                              <span className="block text-xs text-red-500/70">Retiros/Salidas</span>
                              <span className="font-bold text-red-400">-{formatMoney(shift.salidas)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Movimientos del turno */}
                        {shift.movimientos.length > 0 ? (
                          <div>
                            <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Movimientos del turno</p>
                            <div className="space-y-2">
                              {shift.movimientos.map((mov, midx) => (
                                <div key={midx} className="bg-gray-800 p-3 rounded-lg border border-gray-700 text-sm flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-gray-200 uppercase text-xs font-bold tracking-wide truncate" title={mov.notes || mov.type}>
                                      {mov.type}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate" title={mov.notes || 'Sin observaciones'}>
                                      {mov.notes || 'Sin observaciones'}
                                    </p>
                                  </div>
                                  <span className={`font-bold whitespace-nowrap ${mov.type === 'saldo_inicial' ? 'text-blue-400' : 'text-red-400'}`}>
                                    {mov.type === 'saldo_inicial' ? '' : '-'}{formatMoney(mov.amount)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-600 italic">Sin movimientos registrados en este turno.</p>
                        )}
                      </div>
                    ))}
                  </div>

                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modal for Movements */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl max-w-md w-full p-6 border border-gray-700 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white uppercase tracking-wide">
                {modalType === 'saldo_inicial' ? 'Abrir Caja (Saldo Inicial)' : 
                 modalType === 'retiro' ? 'Registrar Retiro o Gasto' : 
                 modalType === 'perdida' ? 'Registrar Pérdida' : 'Cerrar Turno'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {modalType !== 'reset_turno' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Monto ($)</label>
                    <input 
                      type="number" 
                      required 
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white text-lg focus:outline-none focus:border-blue-500"
                      value={formData.amount}
                      onChange={(e) => setFormData({...formData, amount: e.target.value})}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  {(modalType === 'saldo_inicial' || modalType === 'reset_turno') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Nombre del Turno</label>
                      <select 
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                        value={formData.shift_name}
                        onChange={(e) => setFormData({...formData, shift_name: e.target.value})}
                      >
                        <option value="manana">Mañana</option>
                        <option value="tarde">Tarde</option>
                        <option value="noche">Noche</option>
                      </select>
                    </div>
                  )}
                  {modalType !== 'saldo_inicial' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Método de Pago</label>
                      <select 
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                        value={formData.payment_method}
                        onChange={(e) => setFormData({...formData, payment_method: e.target.value})}
                      >
                        <option value="efectivo">Efectivo</option>
                        <option value="transferencia">Transferencia</option>
                      </select>
                    </div>
                  )}
                </>
              )}
              
              {modalType === 'reset_turno' && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Nombre del Turno a Cerrar</label>
                  <select 
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 mb-4"
                    value={formData.shift_name}
                    onChange={(e) => setFormData({...formData, shift_name: e.target.value})}
                  >
                    <option value="manana">Mañana</option>
                    <option value="tarde">Tarde</option>
                    <option value="noche">Noche</option>
                  </select>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Notas / Descripción</label>
                <textarea 
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  value={formData.notes}
                  required={modalType === 'retiro' || modalType === 'reset_turno'}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder={modalType === 'reset_turno' ? 'Ej. Turno: mañana' : 'Detalles de la operación...'}
                  rows="2"
                ></textarea>
              </div>
              
              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={submitting || (modalType === 'reset_turno' && !currentLocation?.id)}
                  className={`flex-1 text-white py-2 rounded-lg font-bold transition-colors ${
                    modalType === 'saldo_inicial' ? 'bg-blue-600 hover:bg-blue-700' : 
                    modalType === 'reset_turno' ? 'bg-gray-500 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'
                  } ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {submitting ? 'Guardando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
