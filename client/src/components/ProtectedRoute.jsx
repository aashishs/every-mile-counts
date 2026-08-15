import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted">Loading…</div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles?.length && !roles.some((r) => user.roles?.includes(r))) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

export function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}
