import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function ForcePasswordChange() {
  const { token, user, updateUser, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (newPassword.length < 8) {
      setErrorMsg('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('La confirmación no coincide.');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'No se pudo actualizar la contraseña.');
      }

      updateUser(data);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-700">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Cambiá tu contraseña</h2>
          <p className="text-gray-400 text-sm">
            {user?.email || 'Tu usuario'} debe definir una contraseña propia antes de ingresar al Panel.
          </p>
        </div>

        {errorMsg && (
          <div className="bg-red-500/20 text-red-400 p-3 rounded-lg mb-6 text-sm font-medium border border-red-500/50 text-center">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Contraseña actual</label>
            <input
              type="password"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Nueva contraseña</label>
            <input
              type="password"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Confirmar nueva contraseña</label>
            <input
              type="password"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-lg transition-colors shadow-lg shadow-blue-500/30"
          >
            {saving ? 'Guardando...' : 'Guardar nueva contraseña'}
          </button>
        </form>

        <button
          type="button"
          onClick={logout}
          className="w-full mt-4 text-sm text-gray-400 hover:text-white transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
