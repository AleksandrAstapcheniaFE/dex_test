'use client';

/**
 * Patient Dashboard — health overview for the logged-in patient.
 *
 * Problem 1 (fixed): Statistics and recent list now use only the current patient's appointments.
 * Root cause: Raw API appointments were used without filtering; stats came from userService only.
 * Fix: Single O(n) pass (filterAppointmentsForPatientAndCountUpcoming); stable effect deps (userId); cleanup to avoid setState after unmount.
 */

import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Calendar,
  Activity,
  FileText,
  Stethoscope,
  TrendingUp,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { userService } from '../../services/userService';
import { appointmentService } from '../../services/appointmentService';
import { aiService } from '../../services/aiService';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../../components/Card';
import { Button } from '../../components/Button';

const RECENT_LIMIT = 3;

/** Returns current user id (supports user._id and user.id for JWT/API). */
export function getCurrentPatientId(user) {
  return user ? String(user._id ?? user.id ?? '') : '';
}

/** Extracts patient id from appointment (patient ref may be string or populated object; supports userId/user). */
export function getPatientIdFromAppointment(appointment) {
  const id =
    appointment.patient?._id ??
    appointment.patient ??
    appointment.patientId ??
    appointment.user?._id ??
    appointment.user ??
    appointment.userId ??
    '';
  return String(id);
}

/**
 * Single O(n) pass: filter appointments for current patient and count upcoming (confirmed/pending from today).
 * Empty patientId → empty result (no data leak).
 */
export function filterAppointmentsForPatientAndCountUpcoming(
  appointments,
  patientId,
) {
  if (!patientId) return { patientAppointments: [], upcomingCount: 0 };
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const patientAppointments = [];
  let upcomingCount = 0;
  for (let i = 0; i < appointments.length; i++) {
    const appointment = appointments[i];
    if (getPatientIdFromAppointment(appointment) !== patientId) continue;
    patientAppointments.push(appointment);
    if (
      new Date(appointment.appointmentDate) >= todayStart &&
      (appointment.status === 'confirmed' ||
        appointment.status === 'pending')
    ) {
      upcomingCount++;
    }
  }
  return { patientAppointments, upcomingCount };
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'confirmed':
      return 'bg-green-100 text-green-800';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function getSeverityClass(severity) {
  switch (severity) {
    case 'high':
      return 'text-orange-600';
    case 'medium':
      return 'text-yellow-600';
    default:
      return 'text-green-600';
  }
}

/** Fetches dashboard data; filters by current patient in one O(n) pass; stable deps (userId), cleanup. */
function usePatientDashboardData(user) {
  // 1. State
  const userId = user?.id ?? user?._id ?? null;
  const [stats, setStats] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 2. Derived state (useMemo)
  const recentAppointments = useMemo(
    () => appointments.slice(0, RECENT_LIMIT),
    [appointments],
  );
  const recentAnalyses = useMemo(
    () => analyses.slice(0, RECENT_LIMIT),
    [analyses],
  );

  // 3. Data loader (used by effect; defined before effect)
  const fetchDashboardData = async (currentPatientId, isCancelled) => {
    try {
      const [
        statsResponse,
        appointmentsResponse,
        analysesResponse,
        trendsResponse,
      ] = await Promise.all([
        userService.getStats(),
        appointmentService.getAll().catch(() => ({ appointments: [] })),
        aiService.getAll().catch(() => ({ analyses: [] })),
        userService.getTrends().catch(() => ({ trends: [] })),
      ]);

      if (isCancelled()) return;

      const allAppointments = appointmentsResponse?.appointments ?? [];
      const { patientAppointments, upcomingCount } =
        filterAppointmentsForPatientAndCountUpcoming(
          allAppointments,
          currentPatientId,
        );

      setStats({
        ...statsResponse?.stats,
        myAppointments: patientAppointments.length,
        upcomingAppointments: upcomingCount,
      });
      setAppointments(patientAppointments);
      setAnalyses(analysesResponse?.analyses ?? []);
      setTrends(trendsResponse?.trends ?? []);
    } catch (err) {
      if (!isCancelled()) {
        setError(err);
        console.error('Failed to fetch dashboard data');
      }
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  };

  // 4. Effect
  useEffect(() => {
    const currentPatientId = userId ? String(userId) : '';
    if (!currentPatientId) {
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const isCancelled = () => cancelled;
    setLoading(true);
    setError(null);

    fetchDashboardData(currentPatientId, isCancelled);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return {
    stats,
    recentAppointments,
    recentAnalyses,
    trends,
    loading,
    error,
  };
}

export const PatientDashboard = () => {
  const { user } = useAuth();
  const {
    stats,
    recentAppointments,
    recentAnalyses,
    trends,
    loading,
    error,
  } = usePatientDashboardData(user);

  const trendsChartData = useMemo(
    () =>
      trends.map((entry) => ({
        date: format(new Date(entry.date), 'MMM dd'),
        confidence: entry.confidence ?? 0,
        accuracy: entry.accuracy ?? 0,
      })),
    [trends],
  );

  if (loading) {
    return (
      <div
        className="text-center py-12"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12" role="alert">
        <p className="text-destructive font-medium">
          Failed to load dashboard
        </p>
        <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Welcome back, {user?.name}</h1>
        <p className="text-muted-foreground mt-2">
          Here's your health overview
        </p>
      </header>

      <section
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
        aria-label="Statistics"
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Appointments</CardTitle>
            <Calendar
              className="h-4 w-4 text-muted-foreground"
              aria-hidden
            />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.myAppointments ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.upcomingAppointments ?? 0} upcoming
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Analyses</CardTitle>
            <Activity
              className="h-4 w-4 text-muted-foreground"
              aria-hidden
            />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.myAnalyses ?? 0}</div>
            <p className="text-xs text-muted-foreground">Total analyses</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reports</CardTitle>
            <FileText
              className="h-4 w-4 text-muted-foreground"
              aria-hidden
            />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.myReports ?? 0}</div>
            <p className="text-xs text-muted-foreground">Medical reports</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
            <Stethoscope
              className="h-4 w-4 text-muted-foreground"
              aria-hidden
            />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Link to="/patient/symptom-checker">
                <Button variant="outline" size="sm" className="w-full">
                  Check Symptoms
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link to="/patient/appointments">
              <Button variant="outline" className="w-full justify-start">
                <Calendar className="mr-2 h-4 w-4" aria-hidden />
                View Appointments
              </Button>
            </Link>
            <Link to="/patient/symptom-checker">
              <Button variant="outline" className="w-full justify-start">
                <Stethoscope className="mr-2 h-4 w-4" aria-hidden />
                Symptom Checker
              </Button>
            </Link>
            <Link to="/patient/reports">
              <Button variant="outline" className="w-full justify-start">
                <FileText className="mr-2 h-4 w-4" aria-hidden />
                Medical Reports
              </Button>
            </Link>
            <Link to="/patient/analyses">
              <Button variant="outline" className="w-full justify-start">
                <Activity className="mr-2 h-4 w-4" aria-hidden />
                AI Analyses
              </Button>
            </Link>
            <Link to="/patient/profile">
              <Button variant="outline" className="w-full justify-start">
                <User className="mr-2 h-4 w-4" aria-hidden />
                My Profile
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Appointments</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No recent appointments
              </p>
            ) : (
              <div className="space-y-3">
                {recentAppointments.map((appointment) => (
                  <div
                    key={appointment._id}
                    className="flex justify-between items-center p-2 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-sm">
                        Dr. {appointment.doctor?.name ?? 'Unknown'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(
                          new Date(appointment.appointmentDate),
                          'MMM dd',
                        )}{' '}
                        at {appointment.appointmentTime}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(
                        appointment.status,
                      )}`}
                    >
                      {appointment.status}
                    </span>
                  </div>
                ))}
                <Link to="/patient/appointments">
                  <Button variant="outline" size="sm" className="w-full mt-2">
                    View All
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent AI Analyses</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAnalyses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No analyses yet
              </p>
            ) : (
              <div className="space-y-3">
                {recentAnalyses.map((analysis) => (
                  <div
                    key={analysis._id}
                    className="p-2 border rounded-lg"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium">
                        {format(
                          new Date(analysis.createdAt),
                          'MMM dd',
                        )}
                      </span>
                      <span
                        className={`text-xs font-medium ${getSeverityClass(
                          analysis.aiResponse?.severity,
                        )}`}
                      >
                        {analysis.aiResponse?.severity?.toUpperCase() ??
                          'LOW'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {analysis.userInput?.substring(0, 100)}...
                    </p>
                  </div>
                ))}
                <Link to="/patient/analyses">
                  <Button variant="outline" size="sm" className="w-full mt-2">
                    View All
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {trends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" aria-hidden />
              <span>Health Trends</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={trendsChartData}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="confidence"
                  stroke="#8884d8"
                  name="Confidence %"
                />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  stroke="#82ca9d"
                  name="Accuracy %"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
