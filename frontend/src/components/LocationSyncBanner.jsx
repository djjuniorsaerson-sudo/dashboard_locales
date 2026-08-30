import { formatExactDate, formatRelativeDate, getLocationStatusMeta } from './locationStatus';

export default function LocationSyncBanner({
  location,
  isSyncing = false,
  title = 'Estado del local',
  onlineMessage = '',
  offlineMessage = '',
  className = '',
}) {
  if (!location) return null;

  const statusMeta = getLocationStatusMeta(location, isSyncing);
  const pendingActionsCount = Number(location.pendingActionsCount || 0);
  const pendingActionsSummary = location.pendingActionsSummary || {};
  const lastErrorMessage = String(location.lastErrorMessage || '').trim();
  const isOffline = String(location.status || '').toUpperCase() !== 'ONLINE';

  return (
    <div className={`rounded-2xl border px-4 py-4 shadow-lg ${statusMeta.className} ${className}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`h-2.5 w-2.5 rounded-full ${statusMeta.dotClassName} ${statusMeta.pulse ? 'animate-pulse' : ''}`}></span>
            <span className="text-xs font-bold uppercase tracking-[0.18em]">{title}</span>
            <span className="rounded-full border border-current/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
              {statusMeta.label}
            </span>
          </div>
          <p className="mt-2 text-sm text-white/90">
            {isOffline ? (offlineMessage || statusMeta.detail) : (onlineMessage || statusMeta.detail)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/70">
            <span className="rounded-full bg-black/20 px-3 py-1">Panel actualizado: {formatRelativeDate(location.lastSyncAt)}</span>
            <span className="rounded-full bg-black/20 px-3 py-1">Último contacto con Yummy: {formatRelativeDate(location.lastHealthCheck)}</span>
            {location.lastSeenIp && <span className="rounded-full bg-black/20 px-3 py-1">IP: {location.lastSeenIp}</span>}
          </div>
        </div>
        {pendingActionsCount > 0 && (
          <div className="min-w-[260px] rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-white/80">Cola activa</div>
            <div className="mt-1 text-2xl font-black text-white">{pendingActionsCount}</div>
            <div className="mt-1 text-xs text-white/70">
              {isOffline ? 'Esperando reconexión del local' : 'Aplicándose en segundo plano'}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(pendingActionsSummary).map(([key, count]) => (
                <span key={key} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80">
                  {key}: {count}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      {lastErrorMessage && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/80">
          <span className="font-semibold">Último error:</span> {lastErrorMessage}
          {location.lastErrorAt ? ` · ${formatExactDate(location.lastErrorAt)}` : ''}
        </div>
      )}
    </div>
  );
}
