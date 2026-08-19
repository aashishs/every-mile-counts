import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';
import { registerPush } from '../utils/push';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user) registerPush(user);
  }, [user]);

  const finishAuth = (data) => {
    localStorage.setItem('token', data.token);
    setUser(data.user);
    return data.user;
  };

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    if (data.token && data.user) finishAuth(data);
    return data;
  };

  const register = async (formData) => {
    const { data } = await api.post('/auth/register', formData);
    if (data.token && data.user) finishAuth(data);
    return data;
  };

  const verifyOtp = async (challengeId, code) => {
    const { data } = await api.post('/auth/verify-otp', { challengeId, code });
    return finishAuth(data);
  };

  const resendOtp = async (challengeId) => {
    const { data } = await api.post('/auth/resend-otp', { challengeId });
    return data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const refresh = async () => {
    const { data } = await api.get('/auth/me');
    setUser(data.user);
    return data.user;
  };

  const hasRole = (...roles) => roles.some((r) => user?.roles?.includes(r));

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        verifyOtp,
        resendOtp,
        logout,
        refresh,
        hasRole,
        isCoach: hasRole('coach'),
        isClubAdmin: hasRole('club_admin'),
        isAppAdmin: hasRole('app_admin'),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
