export function formatRelativeDate(value) {
  if (!value) return 'Nunca';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Nunca';
  const diffMs = Date.now() - parsed.getTime();
  const diffSeconds = Math.max(0, Math.round(diffMs / 1000));
  if (diffSeconds < 10) return 'recién';
  if (diffSeconds < 60) return `hace ${diffSeconds}s`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `hace ${diffMinutes}m`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `hace ${diffDays}d`;
  return parsed.toLocaleString();
}

export function formatExactDate(value) {
  if (!value) return 'Nunca';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Nunca';
  return parsed.toLocaleString();
}

export function getLocationStatusMeta(location, isSyncing = false) {
  if (!location) {
    return {
      label: 'Sin local',
      detail: 'Seleccioná un local',
      className: 'border-gray-500/20 bg-gray-500/10 text-gray-300',
      dotClassName: 'bg-gray-400',
      pulse: false,
    };
  }
  const pendingActionsCount = Number(location.pendingActionsCount || 0);
  const lastErrorMessage = String(location.lastErrorMessage || '').trim();
  if (isSyncing) {
    return {
      label: 'Sincronizando',
      detail: pendingActionsCount > 0
        ? `${pendingActionsCount} cambio${pendingActionsCount === 1 ? '' : 's'} pendiente${pendingActionsCount === 1 ? '' : 's'}`
        : (location.lastSyncAt ? `Última sync ${formatRelativeDate(location.lastSyncAt)}` : 'Actualizando datos'),
      className: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
      dotClassName: 'bg-amber-400',
      pulse: true,
    };
  }
  const status = String(location.status || 'PENDING').toUpperCase();
  if (status === 'ONLINE' && pendingActionsCount > 0) {
    return {
      label: 'Sincronizando',
      detail: `${pendingActionsCount} cambio${pendingActionsCount === 1 ? '' : 's'} pendiente${pendingActionsCount === 1 ? '' : 's'}`,
      className: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
      dotClassName: 'bg-amber-400',
      pulse: true,
    };
  }
  if (status === 'ONLINE') {
    return {
      label: 'Online',
      detail: location.lastSyncAt ? `Última sync ${formatRelativeDate(location.lastSyncAt)}` : 'Conectado',
      className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
      dotClassName: 'bg-emerald-500',
      pulse: false,
    };
  }
  if (status === 'OFFLINE') {
    return {
      label: 'Desconectado',
      detail: pendingActionsCount > 0
        ? `${pendingActionsCount} cambio${pendingActionsCount === 1 ? '' : 's'} esperando reconexión`
        : (location.lastHealthCheck ? `Último contacto ${formatRelativeDate(location.lastHealthCheck)}` : 'Sin heartbeat'),
      className: 'border-red-500/20 bg-red-500/10 text-red-300',
      dotClassName: 'bg-red-400',
      pulse: false,
    };
  }
  if (status === 'ERROR') {
    return {
      label: 'Con error',
      detail: lastErrorMessage
        ? lastErrorMessage
        : (location.lastHealthCheck ? `Último contacto ${formatRelativeDate(location.lastHealthCheck)}` : 'Revisar conexión'),
      className: 'border-orange-500/20 bg-orange-500/10 text-orange-300',
      dotClassName: 'bg-orange-400',
      pulse: false,
    };
  }
  if (status === 'REVOKED') {
    return {
      label: 'Revocado',
      detail: 'Volvé a vincular el local',
      className: 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-300',
      dotClassName: 'bg-fuchsia-400',
      pulse: false,
    };
  }
  return {
    label: 'Pendiente',
    detail: location.lastHealthCheck ? `Último contacto ${formatRelativeDate(location.lastHealthCheck)}` : 'Esperando conexión',
    className: 'border-sky-500/20 bg-sky-500/10 text-sky-300',
    dotClassName: 'bg-sky-400',
    pulse: false,
  };
}
