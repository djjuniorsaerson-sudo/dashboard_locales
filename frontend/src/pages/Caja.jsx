import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Caja() {
  const { token } = useAuth();
  const [reportes, setReportes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDays, setExpandedDays] = useState({});

  useEffect(() => {
    const fetchCaja = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/v1/data/caja/report', {
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
    fetchCaja();
  }, [token]);

  const toggleDay = (date) => {
    setExpandedDays(prev => ({ ...prev, [date]: !prev[date] }));
  };

  const formatMoney = (amount) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Reporte de Caja (Por Día y Turnos)</h2>
          <p className="text-gray-400 text-sm mt-1">Ingresos de ventas, métodos de pago y movimientos consolidados</p>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
           <div className="p-8 text-center text-gray-500 bg-gray-800 rounded-xl animate-pulse h-32"></div>
        ) : reportes.length === 0 ? (
           <div className="p-8 text-center text-gray-500 bg-gray-800 rounded-xl">No hay datos de caja registrados recientes.</div>
        ) : (
          reportes.map((dayReport) => (
            <div key={dayReport.date} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg">
              {/* Encabezado del Día */}
              <div 
                className="bg-gray-900 p-4 md:px-6 md:py-5 flex flex-col md:flex-row justify-between items-center cursor-pointer hover:bg-gray-850 transition-colors"
                onClick={() => toggleDay(dayReport.date)}
              >
                <div className="flex items-center space-x-4 mb-4 md:mb-0">
                  <div className={`p-2 rounded-lg ${expandedDays[dayReport.date] ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                    <svg className={`w-6 h-6 transform transition-transform ${expandedDays[dayReport.date] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{new Date(dayReport.date + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                    <p className="text-sm text-gray-400">{dayReport.shifts.length} Turnos registrados</p>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-4 text-right">
                  <div className="bg-gray-800 px-4 py-2 rounded-lg border border-gray-700">
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wide">Ingresos Ventas</p>
                    <p className="text-lg font-bold text-emerald-400">{formatMoney(dayReport.total_ingresos)}</p>
                  </div>
                  <div className="bg-gray-800 px-4 py-2 rounded-lg border border-gray-700">
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wide">Salidas (Egresos)</p>
                    <p className="text-lg font-bold text-red-400">-{formatMoney(dayReport.total_salidas)}</p>
                  </div>
                  <div className="bg-gray-800 px-4 py-2 rounded-lg border border-gray-600 shadow-md">
                    <p className="text-xs text-blue-300 font-bold uppercase tracking-wide">Caja del Día</p>
                    <p className="text-xl font-black text-white">{formatMoney(dayReport.neto_dia)}</p>
                  </div>
                </div>
              </div>

              {/* Contenido Desplegable */}
              {expandedDays[dayReport.date] && (
                <div className="p-6 bg-gray-800/50 border-t border-gray-700">
                  
                  {/* Desglose de Métodos de Pago del Día */}
                  <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">Métodos de Pago (Todo el Día)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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
                        Transferencia
                      </div>
                      <p className="text-2xl font-bold text-white">{formatMoney(dayReport.transferencia)}</p>
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
                  <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">Detalle por Turnos</h4>
                  <div className="space-y-4">
                    {dayReport.shifts.map((shift, idx) => (
                      <div key={idx} className="bg-gray-900 rounded-xl p-4 border border-gray-700">
                        <div className="flex flex-col md:flex-row justify-between mb-4 pb-4 border-b border-gray-800">
                          <div>
                            <h5 className="font-bold text-lg text-white">Turno {shift.shift_id}</h5>
                            <p className="text-xs text-gray-500">
                              Apertura: {new Date(shift.start_time).toLocaleTimeString()} 
                              {shift.end_time ? ` - Cierre: ${new Date(shift.end_time).toLocaleTimeString()}` : ' - (Turno Abierto)'}
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
                            <p className="text-xs font-bold text-gray-500 mb-2">MOVIMIENTOS DE CAJA REGISTRADOS:</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {shift.movimientos.map((mov, midx) => (
                                <div key={midx} className="bg-gray-800 p-2 rounded text-sm flex justify-between items-center">
                                  <span className="text-gray-400 uppercase text-xs truncate mr-2" title={mov.notes || mov.type}>{mov.type}</span>
                                  <span className={`font-bold ${mov.type === 'saldo_inicial' ? 'text-blue-400' : 'text-red-400'}`}>
                                    {mov.type === 'saldo_inicial' ? '' : '-'}{formatMoney(mov.amount)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-600 italic">Sin movimientos de caja físicos en este turno.</p>
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
    </div>
  );
}
