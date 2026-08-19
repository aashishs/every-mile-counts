import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute';
import { homePath, isClubOnlyAccount } from './utils/roles';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Activities from './pages/Activities';
import ActivityDetail from './pages/ActivityDetail';
import Events from './pages/Events';
import Analysis from './pages/Analysis';
import Coaches from './pages/Coaches';
import Goals from './pages/Goals';
import Clubs from './pages/Clubs';
import ClubDetail from './pages/ClubDetail';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import Support from './pages/Support';
import Membership from './pages/Membership';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
          <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><AthleteRoute><Dashboard /></AthleteRoute></ProtectedRoute>} />
          <Route path="/activities" element={<ProtectedRoute><AthleteRoute><Activities /></AthleteRoute></ProtectedRoute>} />
          <Route path="/activities/:id" element={<ProtectedRoute><AthleteRoute><ActivityDetail /></AthleteRoute></ProtectedRoute>} />
          <Route path="/events" element={<ProtectedRoute><AthleteRoute><Events /></AthleteRoute></ProtectedRoute>} />
          <Route path="/analysis" element={<ProtectedRoute><AthleteRoute><Analysis /></AthleteRoute></ProtectedRoute>} />
          <Route path="/coaches" element={<ProtectedRoute><AthleteRoute><Coaches /></AthleteRoute></ProtectedRoute>} />
          <Route path="/goals" element={<ProtectedRoute><AthleteRoute><Goals /></AthleteRoute></ProtectedRoute>} />
          <Route path="/clubs" element={<ProtectedRoute><Clubs /></ProtectedRoute>} />
          <Route path="/clubs/:id" element={<ProtectedRoute><ClubDetail /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
          <Route path="/membership" element={<ProtectedRoute><Membership /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute roles={['app_admin']}><Admin /></ProtectedRoute>} />
          <Route path="/" element={<HomeRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homePath(user)} replace />;
}

function AthleteRoute({ children }) {
  const { user } = useAuth();
  if (isClubOnlyAccount(user)) return <Navigate to="/clubs" replace />;
  return children;
}
