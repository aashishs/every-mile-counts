import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
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
import MyTraining from './pages/MyTraining';
import TrainingProgram from './pages/TrainingProgram';
import WorkoutDetail from './pages/WorkoutDetail';
import CoachTraining from './pages/CoachTraining';
import CoachProgramEditor from './pages/CoachProgramEditor';
import CoachAthleteTraining from './pages/CoachAthleteTraining';
import CoachGroups from './pages/CoachGroups';
import CoachAssignActivity from './pages/CoachAssignActivity';
import Clubs from './pages/Clubs';
import ClubDetail from './pages/ClubDetail';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import Support from './pages/Support';
import SupportDesk from './pages/SupportDesk';
import Membership from './pages/Membership';
import JoinClub from './pages/JoinClub';
import Privacy from './pages/Privacy';
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
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/join" element={<JoinClub />} />
          <Route path="/dashboard" element={<ProtectedRoute><AthleteRoute><Dashboard /></AthleteRoute></ProtectedRoute>} />
          <Route path="/activities" element={<ProtectedRoute><AthleteRoute><Activities /></AthleteRoute></ProtectedRoute>} />
          <Route path="/activities/compare" element={<ProtectedRoute><NotAppAdmin><CompareActivities /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/activities/:id" element={<ProtectedRoute><NotAppAdmin><ActivityDetail /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/events" element={<ProtectedRoute><AthleteRoute><Events /></AthleteRoute></ProtectedRoute>} />
          <Route path="/analysis" element={<ProtectedRoute><AthleteRoute><Analysis /></AthleteRoute></ProtectedRoute>} />
          <Route path="/coaches" element={<ProtectedRoute><NotAppAdmin><Coaches /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/coaches/training" element={<ProtectedRoute><NotAppAdmin><CoachTraining /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/coaches/groups" element={<ProtectedRoute><NotAppAdmin><CoachGroups /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/coaches/activities/new" element={<ProtectedRoute><NotAppAdmin><CoachAssignActivity /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/coaches/programs/new" element={<ProtectedRoute><NotAppAdmin><CoachProgramEditor /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/coaches/programs/:id" element={<ProtectedRoute><NotAppAdmin><CoachProgramEditor /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/coaches/athletes/:athleteId/training" element={<ProtectedRoute><NotAppAdmin><CoachAthleteTraining /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/coaches/athletes/:athleteId" element={<ProtectedRoute><NotAppAdmin><CoachAthleteActivities /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/training" element={<ProtectedRoute><AthleteRoute><MyTraining /></AthleteRoute></ProtectedRoute>} />
          <Route path="/training/programs/:id" element={<ProtectedRoute><NotAppAdmin><TrainingProgram /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/training/workouts/:id" element={<ProtectedRoute><NotAppAdmin><WorkoutDetail /></NotAppAdmin></ProtectedRoute>} />
          <Route path="/coaches/workouts/:id" element={<ProtectedRoute><NotAppAdmin><WorkoutRedirect /></NotAppAdmin></ProtectedRoute>} />
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

function WorkoutRedirect() {
  const { id } = useParams();
  return <Navigate to={`/training/workouts/${id}`} replace />;
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
