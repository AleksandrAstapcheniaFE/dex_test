/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import {
  Appointments,
  isDateInFuture,
  isBusinessHours,
  getFieldValidationError,
  validateBookingForm,
} from './Appointments';

jest.mock('../../services/appointmentService', () => ({
  appointmentService: {
    getAll: () => Promise.resolve({ appointments: [] }),
    create: () => Promise.resolve({}),
  },
}));
jest.mock('../../services/userService', () => ({
  userService: {
    getAll: () =>
      Promise.resolve({
        users: [{ _id: 'd1', name: 'Dr. Smith', specialization: 'General' }],
      }),
  },
}));
jest.mock('../../components/Card', () => ({
  Card: ({ children }) => <div>{children}</div>,
  CardHeader: ({ children }) => <div>{children}</div>,
  CardTitle: ({ children }) => <div>{children}</div>,
  CardContent: ({ children }) => <div>{children}</div>,
}));
jest.mock('../../components/Button', () => ({
  Button: ({ children, disabled, ...p }) => <button disabled={disabled} {...p}>{children}</button>,
}));
jest.mock('../../components/Input', () => ({
  Input: (p) => <input {...p} />,
}));
jest.mock('../../components/Label', () => ({
  Label: ({ children, htmlFor }) => <label htmlFor={htmlFor}>{children}</label>,
}));

const todayStr = () => new Date().toISOString().split('T')[0];
const yesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};

describe('Appointments validation', () => {
  describe('isDateInFuture', () => {
    it('past/today/future', () => {
      expect(isDateInFuture('')).toBe(false);
      expect(isDateInFuture(yesterdayStr())).toBe(false);
      expect(isDateInFuture(todayStr())).toBe(true);
    });
  });
  describe('isBusinessHours', () => {
    it('9–17 only', () => {
      expect(isBusinessHours('08:59')).toBe(false);
      expect(isBusinessHours('09:00')).toBe(true);
      expect(isBusinessHours('17:00')).toBe(true);
      expect(isBusinessHours('17:01')).toBe(false);
    });
  });
  describe('getFieldValidationError', () => {
    it('doctor', () => {
      expect(getFieldValidationError('doctor', '')).toBe('Doctor selection is required');
      expect(getFieldValidationError('doctor', 'd1')).toBe('');
    });
    it('date/time/reason', () => {
      expect(getFieldValidationError('appointmentDate', yesterdayStr())).toBe('Date must be in the future');
      expect(getFieldValidationError('appointmentDate', todayStr())).toBe('');
      expect(getFieldValidationError('appointmentTime', '08:00')).toMatch(/business hours/);
      expect(getFieldValidationError('appointmentTime', '10:00')).toBe('');
      expect(getFieldValidationError('reason', '')).toMatch(/10 characters/);
      expect(getFieldValidationError('reason', 'long enough!!')).toBe('');
    });
  });
  describe('validateBookingForm', () => {
    it('empty vs valid', () => {
      const empty = validateBookingForm({
        doctor: '',
        appointmentDate: '',
        appointmentTime: '',
        reason: '',
      });
      expect(empty.doctor && empty.reason).toBeTruthy();
      const valid = validateBookingForm({
        doctor: 'd1',
        appointmentDate: todayStr(),
        appointmentTime: '10:00',
        reason: 'Checkup and tests',
      });
      expect(valid.doctor || valid.reason).toBe('');
    });
  });
  describe('form UX', () => {
    const openForm = async () => {
      render(<Appointments />);
      await waitFor(() => expect(screen.queryByText(/Loading/)).not.toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: /Book Appointment/ }));
    };
    const getSubmit = () =>
      within(screen.getByRole('form')).getByRole('button', { name: /^Book Appointment$/ });

    it('submit disabled when empty or missing doctor', async () => {
      await openForm();
      expect(getSubmit()).toBeDisabled();
      fireEvent.change(screen.getByPlaceholderText(/Brief reason/), {
        target: { value: 'I need a checkup' },
      });
      fireEvent.change(screen.getByLabelText(/^Date$/), { target: { value: todayStr() } });
      fireEvent.change(screen.getByLabelText(/^Time$/), { target: { value: '10:00' } });
      expect(getSubmit()).toBeDisabled();
    });
    it('reason error and submit enabled when valid', async () => {
      await openForm();
      fireEvent.change(screen.getByPlaceholderText(/Brief reason/), {
        target: { value: 'short' },
      });
      expect(screen.getByText(/at least 10 characters/)).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText(/^Doctor$/), { target: { value: 'd1' } });
      fireEvent.change(screen.getByLabelText(/^Date$/), { target: { value: todayStr() } });
      fireEvent.change(screen.getByLabelText(/^Time$/), { target: { value: '10:00' } });
      fireEvent.change(screen.getByPlaceholderText(/Brief reason/), {
        target: { value: 'Annual checkup and blood work' },
      });
      await waitFor(() => expect(getSubmit()).not.toBeDisabled());
    });
  });
});
