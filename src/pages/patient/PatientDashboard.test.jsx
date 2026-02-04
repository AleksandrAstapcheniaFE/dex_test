/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import {
  PatientDashboard,
  getCurrentPatientId,
  getPatientIdFromAppointment,
  filterAppointmentsForPatientAndCountUpcoming,
} from './PatientDashboard';

// --- mocks
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'patient-1', _id: 'patient-1', name: 'Test Patient' },
  }),
}));

jest.mock('../../services/userService', () => ({
  userService: {
    getStats: () =>
      Promise.resolve({ stats: { myAnalyses: 0, myReports: 0 } }),
    getTrends: () => Promise.resolve({ trends: [] }),
  },
}));

jest.mock('../../services/appointmentService', () => ({
  appointmentService: {
    getAll: () =>
      Promise.resolve({
        appointments: [
          {
            _id: 'a1',
            patient: 'patient-1',
            doctor: { name: 'Dr. A' },
            appointmentDate: '2025-02-10',
            appointmentTime: '10:00',
            status: 'confirmed',
          },
          {
            _id: 'a2',
            patient: 'patient-2',
            doctor: { name: 'Dr. B' },
            appointmentDate: '2025-02-11',
            appointmentTime: '11:00',
            status: 'pending',
          },
          {
            _id: 'a3',
            patient: 'patient-1',
            doctor: { name: 'Dr. C' },
            appointmentDate: '2025-02-12',
            appointmentTime: '09:00',
            status: 'confirmed',
          },
        ],
      }),
  },
}));

jest.mock('../../services/aiService', () => ({
  aiService: {
    getAll: () => Promise.resolve({ analyses: [] }),
  },
}));

jest.mock('react-router-dom', () => ({
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}));

jest.mock('../../components/Card', () => ({
  Card: ({ children }) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }) => (
    <div data-testid="card-header">{children}</div>
  ),
  CardTitle: ({ children }) => (
    <div data-testid="card-title">{children}</div>
  ),
  CardContent: ({ children }) => (
    <div data-testid="card-content">{children}</div>
  ),
}));

jest.mock('../../components/Button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

describe('getCurrentPatientId', () => {
  it('returns id from user.id', () => {
    expect(getCurrentPatientId({ id: 'uid-1' })).toBe('uid-1');
  });
  it('returns id from user._id when id missing', () => {
    expect(getCurrentPatientId({ _id: 'uid-2' })).toBe('uid-2');
  });
  it('prefers _id over id', () => {
    expect(getCurrentPatientId({ _id: 'a', id: 'b' })).toBe('a');
  });
  it('returns empty string for null/undefined', () => {
    expect(getCurrentPatientId(null)).toBe('');
    expect(getCurrentPatientId(undefined)).toBe('');
  });
});

describe('getPatientIdFromAppointment', () => {
  it('returns patient._id when populated', () => {
    expect(getPatientIdFromAppointment({ patient: { _id: 'p1' } })).toBe(
      'p1',
    );
  });
  it('returns patient when string', () => {
    expect(getPatientIdFromAppointment({ patient: 'p2' })).toBe('p2');
  });
  it('returns patientId', () => {
    expect(getPatientIdFromAppointment({ patientId: 'p3' })).toBe('p3');
  });
  it('returns userId when no patient field (common API shape)', () => {
    expect(getPatientIdFromAppointment({ userId: 'u1' })).toBe('u1');
  });
  it('returns user._id when user object populated', () => {
    expect(getPatientIdFromAppointment({ user: { _id: 'u2' } })).toBe('u2');
  });
});

describe('filterAppointmentsForPatientAndCountUpcoming', () => {
  it('returns filtered list and upcoming count in one pass', () => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const list = [
      { _id: '1', patient: 'p1', appointmentDate: todayStr, status: 'confirmed' },
      { _id: '2', patient: 'p2', appointmentDate: todayStr, status: 'pending' },
      { _id: '3', patient: 'p1', appointmentDate: todayStr, status: 'cancelled' },
      { _id: '4', patient: 'p1', appointmentDate: todayStr, status: 'pending' },
    ];
    const { patientAppointments, upcomingCount } =
      filterAppointmentsForPatientAndCountUpcoming(list, 'p1');
    expect(patientAppointments).toHaveLength(3);
    expect(patientAppointments.map((a) => a._id)).toEqual(['1', '3', '4']);
    expect(upcomingCount).toBe(2);
  });
  it('returns empty list and 0 when patientId is empty (no data leak)', () => {
    const list = [{ _id: '1', patient: 'p1' }];
    const { patientAppointments, upcomingCount } =
      filterAppointmentsForPatientAndCountUpcoming(list, '');
    expect(patientAppointments).toEqual([]);
    expect(upcomingCount).toBe(0);
  });
});

// --- RTL: component shows only current patient's appointments
describe('PatientDashboard', () => {
  it('shows loading then only current patient appointments and correct count', async () => {
    render(<PatientDashboard />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
    });

    // Stats: only 2 appointments for patient-1 (a1, a3)
    expect(screen.getByText('2')).toBeInTheDocument();
    // Recent list: only patient-1's doctors
    expect(screen.getByText(/Dr. A/)).toBeInTheDocument();
    expect(screen.getByText(/Dr. C/)).toBeInTheDocument();
    expect(screen.queryByText(/Dr. B/)).not.toBeInTheDocument();
  });
});
