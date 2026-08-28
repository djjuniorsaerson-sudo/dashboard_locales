import { createContext, useState, useContext, useEffect } from 'react';
import { subscribePanelSync } from '../components/syncEvents';

const AuthContext = createContext();
const LOCATIONS_REFRESH_MS = 15000;

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [user, setUser] = useState(null);
  const [locations, setLocations] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);

  const fetchLocations = async (currentToken) => {
    try {
      const res = await fetch(`/api/v1/yummy-installations/`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        // map data to { id: inst.id, name: inst.local_name, ... }
        const mapped = data.map(inst => ({
          id: inst.id.toString(),
          name: inst.local_name,
          systemType: inst.system_type,
          connectorSlug: inst.connector_slug,
          status: inst.connection_status,
          deviceName: inst.device_name,
          lastHealthCheck: inst.last_health_check,
          lastSyncAt: inst.last_sync_at,
          lastSeenIp: inst.last_seen_ip,
          pendingActionsCount: Number(inst.pending_actions_count || 0),
          pendingActionsSummary: inst.pending_actions_summary || {},
          lastErrorMessage: inst.last_error_message || '',
          lastErrorAt: inst.last_error_at,
          createdAt: inst.created_at,
        }));
        setLocations(mapped);
        setCurrentLocation((previous) => {
          if (!mapped.length) return null;
          if (!previous) return mapped[0];
          return mapped.find((loc) => loc.id === previous.id) || mapped[0];
        });
      }
    } catch (e) {
      console.error("Error fetching locations:", e);
    }
  };

  useEffect(() => {
    if (token) {
      fetchLocations(token);
    } else {
      setLocations([]);
      setCurrentLocation(null);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    const intervalId = window.setInterval(() => {
      fetchLocations(token);
    }, LOCATIONS_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    return subscribePanelSync(() => {
      fetchLocations(token);
    });
  }, [token]);

  const login = (newToken, userData) => {
    setToken(newToken);
    setUser(userData);
    localStorage.setItem('token', newToken);
  };

  const updateUser = (userData) => {
    setUser(userData);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ 
      token, user, login, logout, updateUser, isAuthenticated: !!token,
      locations, currentLocation, setCurrentLocation, fetchLocations
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
