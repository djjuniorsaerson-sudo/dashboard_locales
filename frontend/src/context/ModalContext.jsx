import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ModalContext = createContext(null);

function normalizeOptions(input, defaults = {}) {
  if (typeof input === 'string') {
    return {
      ...defaults,
      message: input,
    };
  }
  return {
    ...defaults,
    ...(input || {}),
  };
}

function GlobalModal({ modal, onConfirm, onCancel }) {
  if (!modal) return null;

  const isConfirm = modal.kind === 'confirm';
  const toneStyles = {
    info: {
      accent: 'text-sky-300',
      button: 'bg-sky-600 hover:bg-sky-500 text-white',
      border: 'border-sky-500/20',
    },
    success: {
      accent: 'text-emerald-300',
      button: 'bg-emerald-600 hover:bg-emerald-500 text-white',
      border: 'border-emerald-500/20',
    },
    warning: {
      accent: 'text-amber-300',
      button: 'bg-amber-500 hover:bg-amber-400 text-gray-950',
      border: 'border-amber-500/20',
    },
    danger: {
      accent: 'text-red-300',
      button: 'bg-red-600 hover:bg-red-500 text-white',
      border: 'border-red-500/20',
    },
  };
  const tone = toneStyles[modal.tone] || toneStyles.info;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Cerrar modal"
        onClick={onCancel}
        className="absolute inset-0 cursor-default"
      />
      <div className={`relative w-full max-w-lg rounded-3xl border bg-[#131c2e] p-6 shadow-2xl ${tone.border}`}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className={`text-[11px] font-bold uppercase tracking-[0.18em] ${tone.accent}`}>
              {modal.eyebrow || (isConfirm ? 'Confirmación' : 'Mensaje')}
            </p>
            <h3 className="mt-2 text-xl font-black tracking-tight text-white">
              {modal.title || (isConfirm ? 'Confirmar acción' : 'Aviso')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            ×
          </button>
        </div>
        <div className="space-y-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
            {modal.message || ''}
          </p>
          {modal.details && (
            <pre className="max-h-64 overflow-auto rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-gray-300 whitespace-pre-wrap break-words">
              {typeof modal.details === 'string' ? modal.details : JSON.stringify(modal.details, null, 2)}
            </pre>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          {isConfirm && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-gray-200 transition-colors hover:bg-white/[0.08]"
            >
              {modal.cancelLabel || 'Cancelar'}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-2xl px-5 py-3 text-sm font-bold transition-colors ${tone.button}`}
          >
            {modal.confirmLabel || 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ModalProvider({ children }) {
  const [modal, setModal] = useState(null);
  const resolverRef = useRef(null);

  const closeModal = useCallback((result) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setModal(null);
    if (resolver) {
      resolver(result);
    }
  }, []);

  const showAlert = useCallback((input) => {
    const options = normalizeOptions(input, { kind: 'alert', tone: 'info', confirmLabel: 'Aceptar' });
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setModal(options);
    });
  }, []);

  const showConfirm = useCallback((input) => {
    const options = normalizeOptions(input, { kind: 'confirm', tone: 'warning', confirmLabel: 'Aceptar', cancelLabel: 'Cancelar' });
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setModal(options);
    });
  }, []);

  const value = useMemo(() => ({
    showAlert,
    showConfirm,
  }), [showAlert, showConfirm]);

  return (
    <ModalContext.Provider value={value}>
      {children}
      <GlobalModal
        modal={modal}
        onConfirm={() => closeModal(isConfirmModal(modal) ? true : undefined)}
        onCancel={() => closeModal(isConfirmModal(modal) ? false : undefined)}
      />
    </ModalContext.Provider>
  );
}

function isConfirmModal(modal) {
  return modal?.kind === 'confirm';
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}
