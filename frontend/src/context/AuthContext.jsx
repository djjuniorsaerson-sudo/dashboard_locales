import { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

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
          deviceName: inst.device_name
        }));
        setLocations(mapped);
        if (mapped.length > 0 && !currentLocation) {
          setCurrentLocation(mapped[0]);
        }
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
