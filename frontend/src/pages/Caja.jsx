import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import LocationSyncBanner from '../components/LocationSyncBanner';
import { dispatchPanelSync, subscribePanelSync } from '../components/syncEvents';
import { useModal } from '../context/ModalContext';

export default function Caja() {
  const REPORTS_PER_PAGE = 5;
  const SHIFT_MOVEMENTS_PER_PAGE = 4;
  const { token, currentLocation, fetchLocations } = useAuth();
  const { showAlert, showConfirm } = useModal();
  const [reportes, setReportes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDays, setExpandedDays] = useState({});
  const [expandedShifts, setExpandedShifts] = useState({});
  const [movementPages, setMovementPages] = useState({});
  const [employees, setEmployees] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);

  // Cash Management State
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState(''); // 'saldo_inicial', 'retiro', 'vale', 'perdida', 'reset_turno'
  const [formData, setFormData] = useState({
    amount: '',
    payment_method: 'efectivo',
    notes: '',
    employee_name: '',
    employee_id: '',
    shift_name: 'manana'
  });
  const [submitting, setSubmitting] = useState(false);
  const isOffline = !!currentLocation && currentLocation.status !== 'ONLINE';

  const buildCashClosureHtml = (summaryPayload) => {
    const summary = summaryPayload?.shift_summary || summaryPayload || {};
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
      <div class="card"><div class="label">Pérdidas</div><div class="value">${formatMoney(summary?.losses_total)}</div></div>
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

  const openPrintWindow = (summaryPayload) => {
    const html = buildCashClosureHtml(summaryPayload);
    const printWindow = window.open('', '_blank', 'width=1024,height=900');
    if (!printWindow) {
      showAlert({ title: 'Impresión bloqueada', message: 'El navegador bloqueó la ventana de impresión.', tone: 'warning' });
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 300);
  };

  const reprintShift = async (dayReport, shift) => {
    try {
      const params = new URLSearchParams({
        date: dayReport.date,
        shift: shift.shift_label || shift.shift_id || 'general',
      });
      if (shift.end_time) {
        params.set('closed_at', shift.end_time);
      }
      if (currentLocation?.id) {
        params.set('installation_id', currentLocation.id);
      }
      const res = await fetch(`/api/v1/data/caja/shift-summary?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        showAlert({ title: 'No se pudo reimprimir', message: error.detail || 'No se pudo reimprimir ese cierre.', tone: 'danger' });
        return;
      }
      const summaryData = await res.json();
      const payload = summaryData?.shift_summary ? summaryData : { shift_summary: summaryData };
      openPrintWindow(payload);
    } catch (error) {
      console.error('Error reprinting shift', error);
      showAlert({ title: 'Error de impresión', message: 'Error al reimprimir el cierre.', tone: 'danger' });
    }
  };

  const deleteShift = async (dayReport, shift) => {
    const shiftName = formatShiftLabel(shift);
    const confirmed = await showConfirm({
      title: 'Borrar turno',
      message: `¿Eliminar ${shiftName} del ${formatDateLabel(dayReport.date)}? Esta acción borra la apertura/cierre y movimientos de caja de ese turno.`,
      tone: 'danger',
      confirmLabel: 'Borrar turno',
    });
    if (!confirmed) return;

    try {
      const installationQuery = currentLocation?.id ? `?installation_id=${encodeURIComponent(currentLocation.id)}` : '';
      const res = await fetch(`/api/v1/data/caja/shift-delete${installationQuery}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          date: dayReport.date,
          shift: shift.shift_label || shift.shift_id || 'general',
          start_at: shift.start_time,
          end_at: shift.end_time || null,
          closed_at: shift.end_time || null,
        })
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        showAlert({ title: 'No se pudo eliminar', message: error.detail || 'No se pudo eliminar el turno.', tone: 'danger' });
        return;
      }

      await fetchCaja();
    } catch (error) {
      console.error('Error deleting shift', error);
      showAlert({ title: 'Error al eliminar', message: 'Error al eliminar el turno.', tone: 'danger' });
    }
  };

  const fetchCaja = async () => {
    try {
      const installationQuery = currentLocation?.id ? `?installation_id=${encodeURIComponent(currentLocation.id)}` : '';
      const res = await fetch(`/api/v1/data/caja/report${installationQuery}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const validData = (Array.isArray(data) ? data : []).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row?.date || '').trim()));
        setReportes(validData);
        setCurrentPage(1);
        setMovementPages({});
        setExpandedShifts({});
        if (validData.length > 0) {
          setExpandedDays({ [validData[0].date]: true });
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
    const unsubscribe = subscribePanelSync((detail) => {
      if (detail?.modules && !detail.modules.some((module) => ['cash', 'dashboard', 'users', 'employees'].includes(module))) {
        return;
      }
      fetchCaja();
      if (!detail?.modules || detail.modules.includes('employees') || detail.modules.includes('users')) {
        fetchEmployees();
      }
    });
    return unsubscribe;
  }, [token, currentLocation?.id]);

  const toggleDay = (date) => {
    setExpandedDays(prev => ({ ...prev, [date]: !prev[date] }));
  };

  const handleOpenModal = (type) => {
    if (isOffline && type === 'reset_turno') {
      showAlert({ title: 'Local offline', message: 'El local está OFFLINE. El cierre de turno requiere conexión en tiempo real.', tone: 'warning' });
      return;
    }
    setModalType(type);
    setFormData({
      amount: type === 'reset_turno' ? 0 : '',
      payment_method: type === 'reset_turno' ? '' : 'efectivo',
      notes: type === 'reset_turno' ? 'Turno: ' : '',
      employee_name: '',
      employee_id: '',
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
            employee_id: formData.employee_id ? Number(formData.employee_id) : undefined,
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
        await fetchLocations(token);
        if (!data?.queued) {
      await fetchCaja();
      dispatchPanelSync({ modules: ['cash', 'dashboard'] });
        }
        dispatchPanelSync({ modules: ['cash', 'dashboard', ...(modalType === 'vale' ? ['employees'] : [])] });
        if (isCashClose) {
          const fallbackDate = localDateString;
          const fallbackShift = formData.shift_name;
          const fallbackClosedAt = data?.created_at || data?.closed_at || null;
          let printData = data?.shift_summary ? data : null;

          if (!printData) {
            const params = new URLSearchParams({
              date: fallbackDate,
              shift: fallbackShift,
            });
            if (fallbackClosedAt) {
              params.set('closed_at', fallbackClosedAt);
            }
            const summaryRes = await fetch(`/api/v1/data/caja/shift-summary?${params.toString()}&installation_id=${encodeURIComponent(currentLocation?.id || '')}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (summaryRes.ok) {
              const summaryData = await summaryRes.json();
              printData = summaryData?.shift_summary ? summaryData : { shift_summary: summaryData };
            }
          }

          openPrintWindow(printData || data);
        } else if (data?.queued) {
          showAlert({ title: 'Movimiento en cola', message: data.message || 'Movimiento en cola. Se enviará cuando el local vuelva a estar online.', tone: 'warning' });
        }
      } else {
        const error = await res.json().catch(() => ({}));
        showAlert({ title: 'No se pudo registrar', message: error.detail || 'Error al registrar movimiento', tone: 'danger' });
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || '').trim())) {
      return 'Fecha inválida';
    }
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
    const movementTotals = dayReport.shifts.reduce((acc, shift) => {
      (shift.movimientos || []).forEach((movement) => {
        const normalizedType = normalizeMovementType(movement?.type || movement?.movement_type);
        const amount = Math.abs(Number(movement?.amount || 0));
        if (normalizedType === 'retiro') acc.withdrawals += amount;
        else if (normalizedType === 'vale' || normalizedType === 'adelanto') acc.vouchers += amount;
        else if (normalizedType === 'perdida') acc.losses += amount;
      });
      return acc;
    }, { withdrawals: 0, vouchers: 0, losses: 0 });
    return {
      openingBalance,
      totalSales,
      totalWithdrawals,
      expectedCash,
      activeShift,
      ...movementTotals,
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

  const normalizeMovementType = (value) => String(value || '').trim().toLowerCase();

  const movementTone = (value) => {
    const normalized = normalizeMovementType(value);
    if (normalized === 'saldo_inicial') return 'text-blue-300 bg-blue-500/10 border-blue-500/20';
    if (normalized === 'retiro') return 'text-amber-300 bg-amber-500/10 border-amber-500/20';
    if (normalized === 'vale' || normalized === 'adelanto') return 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20';
    if (normalized === 'perdida') return 'text-red-300 bg-red-500/10 border-red-500/20';
    return 'text-gray-300 bg-white/[0.04] border-white/10';
  };

  const movementLabel = (movement) => {
    const normalized = normalizeMovementType(movement?.type || movement?.movement_type);
    if (normalized === 'saldo_inicial') return 'Inicio de caja';
    if (normalized === 'retiro') return 'Retiro de caja';
    if (normalized === 'vale' || normalized === 'adelanto') return 'Vale a empleado';
    if (normalized === 'perdida') return 'Pérdida';
    if (normalized === 'reset_turno') return 'Cierre de turno';
    return normalized ? normalized.replaceAll('_', ' ') : 'Movimiento';
  };

  const movementDescription = (movement) => {
    const note = String(movement?.notes || '').trim();
    if (note && !note.toLowerCase().startsWith('sin observaciones')) {
      return note;
    }
    const employeeName = String(movement?.employee_name || '').trim();
    if (employeeName) {
      return employeeName;
    }
    const normalized = normalizeMovementType(movement?.type || movement?.movement_type);
    if (normalized === 'saldo_inicial') return 'Apertura del turno';
    if (normalized === 'retiro') return 'Salida manual de dinero';
    if (normalized === 'vale' || normalized === 'adelanto') return 'Descuento para empleado';
    if (normalized === 'perdida') return 'Pérdida registrada';
    return 'Sin detalle';
  };

  const shiftExpectedCash = (shift) => Number(shift?.saldo_inicial || 0) + Number(shift?.efectivo || 0) - Number(shift?.salidas || 0);
  const getShiftPageKey = (dayDate, shift, shiftIndex) => `${dayDate}::${shift?.shift_id || shift?.shift_label || shift?.start_time || shiftIndex}`;
  const getShiftExpandKey = (dayDate, shift, shiftIndex) => `${dayDate}::${shift?.shift_id || shift?.shift_label || shift?.start_time || shiftIndex}`;
  const setShiftPage = (pageKey, nextPage) => {
    setMovementPages((current) => ({
      ...current,
      [pageKey]: Math.max(1, nextPage),
    }));
  };
  const toggleShift = (shiftKey) => {
    setExpandedShifts((current) => ({
      ...current,
      [shiftKey]: !current[shiftKey],
    }));
  };

  const totalPages = Math.max(1, Math.ceil(reportes.length / REPORTS_PER_PAGE));
  const paginatedReportes = reportes.slice(
    (currentPage - 1) * REPORTS_PER_PAGE,
    currentPage * REPORTS_PER_PAGE
  );

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <LocationSyncBanner
        location={currentLocation}
        title="Estado de caja"
        onlineMessage="Retiros, vales y pérdidas se aplican al instante."
        offlineMessage="Retiros, vales y pérdidas pueden quedar en cola. El cierre de turno sigue requiriendo conexión."
      />
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-6 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300/80 mb-2">Control financiero</p>
          <h2 className="text-3xl font-black text-white tracking-tight">Gestión de Caja</h2>
          <p className="text-gray-400 text-sm mt-1">Control integral de ingresos, salidas y turnos</p>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:flex-wrap">
          <button
            onClick={() => handleOpenModal('saldo_inicial')}
            disabled={isOffline}
            className={`text-white px-4 py-3 rounded-2xl text-sm font-bold flex items-center justify-center transition-colors shadow-lg ${isOffline ? 'bg-green-900/40 cursor-not-allowed opacity-60' : 'bg-green-600 hover:bg-green-700'}`}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
            Iniciar Caja
          </button>
          <button
            onClick={() => handleOpenModal('retiro')}
            disabled={isOffline}
            className={`text-white px-4 py-3 rounded-2xl text-sm font-bold flex items-center justify-center transition-colors shadow-lg ${isOffline ? 'bg-orange-900/40 cursor-not-allowed opacity-60' : 'bg-orange-500 hover:bg-orange-600'}`}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4"></path></svg>
            Retiro
          </button>
          <button
            onClick={() => handleOpenModal('reset_turno')}
            disabled={isOffline}
            className={`col-span-2 sm:col-span-1 text-white px-4 py-3 rounded-2xl text-sm font-bold flex items-center justify-center transition-colors shadow-lg ${isOffline ? 'bg-red-900/40 cursor-not-allowed opacity-60' : 'bg-red-600 hover:bg-red-700'}`}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"></path></svg>
            Cerrar Caja
          </button>
        </div>
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
          paginatedReportes.map((dayReport) => {
            const summary = getDaySummary(dayReport);
            return (
            <div key={dayReport.date} className="bg-white/[0.03] rounded-3xl border border-white/10 overflow-hidden shadow-2xl backdrop-blur-xl">
              {/* Encabezado del Día */}
              <div 
                className="bg-black/10 p-4 sm:p-5 md:px-6 md:py-6 cursor-pointer hover:bg-white/[0.03] transition-colors"
                onClick={() => toggleDay(dayReport.date)}
              >
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg mt-1 ${expandedDays[dayReport.date] ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                      <svg className={`w-6 h-6 transform transition-transform ${expandedDays[dayReport.date] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                    <div className="min-w-0">
                      <div>
                        <h3 className="text-lg sm:text-xl font-bold text-white capitalize leading-tight">{formatDateLabel(dayReport.date)}</h3>
                        <p className="text-sm text-gray-400">{dayReport.shifts.length} turnos registrados</p>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                        <span className={`rounded-full border px-3 py-1 font-bold ${summary.activeShift && !summary.activeShift.end_time ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-blue-500/30 bg-blue-500/10 text-blue-300'}`}>
                          {summary.activeShift && !summary.activeShift.end_time ? 'Caja abierta' : 'Caja cerrada'}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-gray-300">
                          {summary.activeShift ? formatShiftLabel(summary.activeShift) : 'Sin turno'}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-gray-300">
                          Abrió {summary.activeShift ? formatTime(summary.activeShift.start_time) : '-'}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-gray-300">
                          {summary.activeShift?.end_time ? `Cerró ${formatTime(summary.activeShift.end_time)}` : 'Todavía abierto'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 xl:min-w-[620px]">
                    <div className="bg-gray-900/45 px-3 sm:px-4 py-3 rounded-2xl border border-white/10">
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wide">Caja inicial</p>
                      <p className="text-base sm:text-lg font-bold text-white mt-1 break-words">{formatMoney(summary.openingBalance)}</p>
                    </div>
                    <div className="bg-gray-900/45 px-3 sm:px-4 py-3 rounded-2xl border border-white/10">
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wide">Entró por ventas</p>
                      <p className="text-base sm:text-lg font-bold text-emerald-500 mt-1 break-words">+{formatMoney(summary.totalSales)}</p>
                    </div>
                    <div className="bg-gray-900/45 px-3 sm:px-4 py-3 rounded-2xl border border-white/10">
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wide">Salió de caja</p>
                      <p className="text-base sm:text-lg font-bold text-red-400 mt-1 break-words">-{formatMoney(summary.totalWithdrawals)}</p>
                    </div>
                    <div className="bg-gray-900/45 px-3 sm:px-4 py-3 rounded-2xl border-2 border-blue-500/40 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
                      <p className="text-xs text-blue-400 font-bold uppercase tracking-wide">Debería haber en efectivo</p>
                      <p className="text-lg sm:text-xl font-black text-white mt-1 break-words">{formatMoney(summary.expectedCash)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contenido Desplegable */}
              {expandedDays[dayReport.date] && (
                <div className="p-6 bg-gray-800/50 border-t border-gray-700">
                  
                  {/* Desglose de Métodos de Pago del Día */}
                  <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">Ventas por forma de pago</h4>
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

                  <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">Salidas de caja</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-amber-300">Retiros</p>
                      <p className="mt-2 text-2xl font-black text-white">{formatMoney(summary.withdrawals)}</p>
                    </div>
                    <div className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-fuchsia-300">Vales a empleados</p>
                      <p className="mt-2 text-2xl font-black text-white">{formatMoney(summary.vouchers)}</p>
                    </div>
                    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-red-300">Pérdidas</p>
                      <p className="mt-2 text-2xl font-black text-white">{formatMoney(summary.losses)}</p>
                    </div>
                  </div>

                  {/* Turnos */}
                  <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">Turnos del día</h4>
                  <div className="space-y-4">
                    {dayReport.shifts.map((shift, idx) => {
                      const pageKey = getShiftPageKey(dayReport.date, shift, idx);
                      const shiftExpandKey = getShiftExpandKey(dayReport.date, shift, idx);
                      const isShiftExpanded = Boolean(expandedShifts[shiftExpandKey]);
                      const totalMovements = shift.movimientos.length;
                      const totalMovementPages = Math.max(1, Math.ceil(totalMovements / SHIFT_MOVEMENTS_PER_PAGE));
                      const currentMovementPage = Math.min(movementPages[pageKey] || 1, totalMovementPages);
                      const visibleMovements = shift.movimientos.slice(
                        (currentMovementPage - 1) * SHIFT_MOVEMENTS_PER_PAGE,
                        currentMovementPage * SHIFT_MOVEMENTS_PER_PAGE,
                      );
                      return (
                      <div key={pageKey} className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleShift(shiftExpandKey)}
                          className="flex w-full items-center justify-between gap-4 p-4 text-left transition hover:bg-white/[0.03]"
                        >
                          <div className="min-w-0">
                            <h5 className="font-bold text-lg text-white">{formatShiftLabel(shift)}</h5>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              <span className="rounded-full bg-white/[0.04] px-3 py-1 text-gray-300">Abrió: {formatTime(shift.start_time)}</span>
                              <span className="rounded-full bg-white/[0.04] px-3 py-1 text-gray-300">
                                {shift.end_time ? `Cerró: ${formatTime(shift.end_time)}` : 'Todavía abierto'}
                              </span>
                              <span className={`rounded-full px-3 py-1 font-semibold ${shift.end_time ? 'bg-blue-500/10 text-blue-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
                                {shift.end_time ? 'Caja cerrada' : 'Caja abierta'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="hidden text-sm text-gray-400 md:block">
                              {isShiftExpanded ? 'Ocultar detalle' : 'Ver detalle'}
                            </span>
                            <div className={`rounded-lg p-2 ${isShiftExpanded ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                              <svg className={`w-5 h-5 transform transition-transform ${isShiftExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                          </div>
                        </button>

                        {isShiftExpanded && (
                          <div className="border-t border-gray-800 p-4">
                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4 pb-4 border-b border-gray-800">
                              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                                <span className="block text-xs text-gray-500">Caja inicial</span>
                                <span className="font-bold text-gray-100">{formatMoney(shift.saldo_inicial)}</span>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                                <span className="block text-xs text-gray-500">Entró por ventas</span>
                                <span className="font-bold text-emerald-400">+{formatMoney(shift.ingresos)}</span>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                                <span className="block text-xs text-gray-500">Salió de caja</span>
                                <span className="font-bold text-red-400">-{formatMoney(shift.salidas)}</span>
                              </div>
                              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-3">
                                <span className="block text-xs text-blue-300">Debería haber</span>
                                <span className="font-bold text-white">{formatMoney(shiftExpectedCash(shift))}</span>
                              </div>
                            </div>

                            <div className="mb-4 flex flex-wrap gap-2">
                              {shift.end_time && (
                                <button
                                  type="button"
                                  onClick={() => reprintShift(dayReport, shift)}
                                  className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-300 transition hover:bg-blue-500/20"
                                >
                                  Reimprimir cierre
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => deleteShift(dayReport, shift)}
                                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/20"
                              >
                                Borrar turno
                              </button>
                            </div>

                            {shift.movimientos.length > 0 ? (
                              <div>
                                <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Movimientos del turno</p>
                                <div className="space-y-2">
                                  {visibleMovements.map((mov, midx) => (
                                    <div key={midx} className="bg-gray-800 p-3 rounded-lg border border-gray-700 text-sm flex items-center justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${movementTone(mov.type)}`}>
                                          {movementLabel(mov)}
                                        </div>
                                        <p className="mt-2 text-sm text-gray-100 break-words" title={movementDescription(mov)}>
                                          {movementDescription(mov)}
                                        </p>
                                      </div>
                                      <span className={`font-bold whitespace-nowrap ${normalizeMovementType(mov.type) === 'saldo_inicial' ? 'text-blue-400' : 'text-red-400'}`}>
                                        {normalizeMovementType(mov.type) === 'saldo_inicial' ? '+' : '-'}{formatMoney(Math.abs(Number(mov.amount || 0)))}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                {totalMovements > SHIFT_MOVEMENTS_PER_PAGE && (
                                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-xs text-gray-500">
                                      Mostrando {((currentMovementPage - 1) * SHIFT_MOVEMENTS_PER_PAGE) + 1} - {Math.min(currentMovementPage * SHIFT_MOVEMENTS_PER_PAGE, totalMovements)} de {totalMovements} movimientos
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setShiftPage(pageKey, currentMovementPage - 1)}
                                        disabled={currentMovementPage === 1}
                                        className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        Anterior
                                      </button>
                                      <span className="text-xs font-semibold text-gray-400">
                                        Página {currentMovementPage} de {totalMovementPages}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setShiftPage(pageKey, currentMovementPage + 1)}
                                        disabled={currentMovementPage === totalMovementPages}
                                        className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        Siguiente
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-600 italic">Sin movimientos registrados en este turno.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )})}
                  </div>

                </div>
              )}
            </div>
          )})
        )}
      </div>

      {!loading && reportes.length > REPORTS_PER_PAGE && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-sm text-gray-400">
            Mostrando {Math.min((currentPage - 1) * REPORTS_PER_PAGE + 1, reportes.length)} - {Math.min(currentPage * REPORTS_PER_PAGE, reportes.length)} de {reportes.length} días
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              className="rounded-xl border border-white/10 bg-gray-900/60 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-sm font-semibold text-gray-300">
              Página {currentPage} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
              className="rounded-xl border border-white/10 bg-gray-900/60 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

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
