import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute';
import { homePath, isAthleteAccount, isStaffAccount } from './utils/roles';
import { GOALS_ENABLED } from './utils/features';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Activities from './pages/Activities';
import ActivityDetail from './pages/ActivityDetail';
import Events from './pages/Events';
import Analysis from './pages/Analysis';
import CompareActivities from './pages/CompareActivities';
import Coaches from './pages/Coaches';
import CoachAthleteActivities from './pages/CoachAthleteActivities';
import Goals from './pages/Goals';
import Clubs from './pages/Clubs';
import ClubDetail from './pages/ClubDetail';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import Support from './pages/Support';
import SupportDesk from './pages/SupportDesk';
import Membership from './pages/Membership';
import JoinClub from './pages/JoinClub';
import InstallPrompt from './components/InstallPrompt';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
          <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
          <Route path="/join" element={<JoinClub />} />
          <Route path="/dashboard" element={<ProtectedRoute><AthleteRoute><Dashboard /></AthleteRoute></ProtectedRoute>} />
          <Route path="/activities" element={<ProtectedRoute><AthleteRoute><Activities /></AthleteRoute></ProtectedRoute>} />
          <Route path="/activities/compare" element={<ProtectedRoute><NotAppAdmin><CompareActivities /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/activities/:id" element={<ProtectedRoute><NotAppAdmin><ActivityDetail /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/events" element={<ProtectedRoute><AthleteRoute><Events /></AthleteRoute></ProtectedRoute>} />
          <Route path="/analysis" element={<ProtectedRoute><AthleteRoute><Analysis /></AthleteRoute></ProtectedRoute>} />
          <Route path="/coaches" element={<ProtectedRoute><NotAppAdmin><Coaches /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/coaches/athletes/:athleteId" element={<ProtectedRoute><NotAppAdmin><CoachAthleteActivities /></NotAppAdmin></ProtectedRoute>} />
          <Route
            path="/goals"
            element={
              <ProtectedRoute>
                {GOALS_ENABLED ? <AthleteRoute><Goals /></AthleteRoute> : <Navigate to="/dashboard" replace />}
              </ProtectedRoute>
            }
          />
          <Route path="/clubs" element={<ProtectedRoute><NotAppAdmin><Clubs /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/clubs/:id" element={<ProtectedRoute><NotAppAdmin><ClubDetail /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><NotAppAdmin><Notifications /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/complete-profile" element={<Navigate to="/profile" replace />} />
          <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
          <Route path="/support-desk" element={<ProtectedRoute roles={['support_admin', 'super_admin', 'app_admin']}><SupportDesk /></ProtectedRoute>} />
          <Route path="/membership" element={<ProtectedRoute><NotAppAdmin><Membership /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute roles={['admin', 'super_admin', 'app_admin']}><Admin /></ProtectedRoute>} />
          <Route path="/" element={<HomeRedirect />} />
        </Routes>
        <InstallPrompt />
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

function NotAppAdmin({ children }) {
  const { user } = useAuth();
  if (isStaffAccount(user)) return <Navigate to={homePath(user)} replace />;
  return children;
}

function AthleteRoute({ children }) {
  const { user } = useAuth();
  if (isStaffAccount(user)) return <Navigate to={homePath(user)} replace />;
  if (!isAthleteAccount(user)) return <Navigate to={homePath(user)} replace />;
  return children;
}
