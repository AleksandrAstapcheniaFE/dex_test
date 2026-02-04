'use client';

/**
 * Appointment booking form (Problem 2): validation and feedback.
 *
 * - Real-time validation on field change (getFieldValidationError, validateBookingForm).
 * - Rules: date in future; time 9 AM–5 PM; doctor required; reason ≥ 10 chars.
 * - Submit disabled when invalid; success message after booking (timeout cleared on unmount).
 * - Initial fetch: cancelled flag to avoid setState after unmount; no PII in console.
 */

import { useState, useRef, useMemo, useEffect } from 'react';
import { appointmentService } from '../../services/appointmentService';
import { userService } from '../../services/userService';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Label } from '../../components/Label';
import { format } from 'date-fns';
import { Calendar, Clock, User, X } from 'lucide-react';

const BUSINESS_HOURS = { start: 9, end: 17 }; // 9 AM - 5 PM
const REASON_MIN_LENGTH = 10;
const SUCCESS_MESSAGE_HIDE_MS = 5000;

/** Req: "Date must be in the future" (today or later). */
export function isDateInFuture(dateStr) {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const chosen = new Date(dateStr);
  chosen.setHours(0, 0, 0, 0);
  return chosen >= today;
}

/** Req: "Time must be during business hours (9 AM - 5 PM)". */
export function isBusinessHours(timeStr) {
  if (!timeStr) return false;
  const [h, m] = timeStr.split(':').map(Number);
  const minutes = h * 60 + (m ?? 0);
  const startMinutes = BUSINESS_HOURS.start * 60;
  const endMinutes = BUSINESS_HOURS.end * 60;
  return minutes >= startMinutes && minutes <= endMinutes;
}

const initialFormData = {
  doctor: '',
  appointmentDate: '',
  appointmentTime: '',
  reason: '',
  symptoms: '',
};

const initialErrors = {
  doctor: '',
  appointmentDate: '',
  appointmentTime: '',
  reason: '',
};

export function getFieldValidationError(name, value) {
  switch (name) {
    case 'doctor':
      return value ? '' : 'Doctor selection is required';
    case 'appointmentDate':
      return value
        ? isDateInFuture(value)
          ? ''
          : 'Date must be in the future'
        : '';
    case 'appointmentTime':
      return value
        ? isBusinessHours(value)
          ? ''
          : `Time must be during business hours (${BUSINESS_HOURS.start} AM - ${BUSINESS_HOURS.end} PM)`
        : '';
    case 'reason':
      return value
        ? value.trim().length >= REASON_MIN_LENGTH
          ? ''
          : `Reason must be at least ${REASON_MIN_LENGTH} characters`
        : 'Reason must be at least 10 characters';
    default:
      return '';
  }
}

export function validateBookingForm(data) {
  return {
    doctor: getFieldValidationError('doctor', data.doctor),
    appointmentDate: getFieldValidationError(
      'appointmentDate',
      data.appointmentDate,
    ),
    appointmentTime: getFieldValidationError(
      'appointmentTime',
      data.appointmentTime,
    ),
    reason: getFieldValidationError('reason', data.reason),
  };
}

export const Appointments = () => {
  // State & refs
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState(initialErrors);
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const successMessageTimeoutRef = useRef(null);

  const isFormValid = useMemo(() => {
    const fieldErrors = validateBookingForm(formData);
    return (
      !fieldErrors.doctor &&
      !fieldErrors.appointmentDate &&
      !fieldErrors.appointmentTime &&
      !fieldErrors.reason
    );
  }, [formData]);

  // Data loaders (used by effect; defined before effect so closure is correct)
  const loadAppointments = async (isCancelled) => {
    try {
      const { appointments: data } = await appointmentService.getAll();
      if (!isCancelled()) setAppointments(data ?? []);
    } catch {
      if (!isCancelled()) setAppointments([]);
      console.error('Failed to fetch appointments');
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  };

  const loadDoctors = async (isCancelled) => {
    try {
      const { users } = await userService.getAll({ role: 'doctor' });
      if (!isCancelled()) setDoctors(users ?? []);
    } catch {
      console.error('Failed to fetch doctors');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    loadAppointments(isCancelled);
    loadDoctors(isCancelled);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (successMessageTimeoutRef.current != null) {
        clearTimeout(successMessageTimeoutRef.current);
      }
    };
  }, []);

  const handleFieldChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({
      ...prev,
      [name]: getFieldValidationError(name, value),
    }));
    setSubmitError('');
  };

  const refreshAppointments = async () => {
    try {
      const { appointments: data } = await appointmentService.getAll();
      setAppointments(data ?? []);
    } catch {
      console.error('Failed to fetch appointments');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fieldErrors = validateBookingForm(formData);
    setErrors(fieldErrors);
    if (
      fieldErrors.doctor ||
      fieldErrors.appointmentDate ||
      fieldErrors.appointmentTime ||
      fieldErrors.reason
    ) {
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      await appointmentService.create(formData);
      setSuccessMessage('Appointment booked successfully.');
      setFormData(initialFormData);
      setErrors(initialErrors);
      setShowForm(false);
      refreshAppointments();
      if (successMessageTimeoutRef.current != null) {
        clearTimeout(successMessageTimeoutRef.current);
      }
      successMessageTimeoutRef.current = setTimeout(
        () => setSuccessMessage(''),
        SUCCESS_MESSAGE_HIDE_MS,
      );
    } catch (error) {
      setSubmitError(
        error.response?.data?.message || 'Failed to create appointment',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelAppointment = async (id) => {
    if (
      window.confirm('Are you sure you want to cancel this appointment?')
    ) {
      try {
        await appointmentService.update(id, { status: 'cancelled' });
        refreshAppointments();
      } catch (error) {
        alert(
          error.response?.data?.message || 'Failed to cancel appointment',
        );
      }
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'completed':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const inputErrorClass = (hasError) =>
    hasError
      ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
      : 'border-input';

  const selectClassName = `flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ${errors.doctor ? 'border-red-500' : 'border-input'}`;

  if (loading) {
    return (
      <div className="text-center py-12" role="status">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Req 4: Success message after booking (inline alert, auto-hide after 5s). */}
      {successMessage && (
        <div
          className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-green-800"
          role="alert"
        >
          {successMessage}
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">My Appointments</h1>
          <p className="text-muted-foreground mt-2">
            Manage your medical appointments
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          Book Appointment
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Book New Appointment</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {submitError && (
                <p className="text-sm text-red-600" role="alert">
                  {submitError}
                </p>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Req 2: Doctor selection required — inline error below. */}
                <div className="space-y-2">
                  <Label htmlFor="doctor">Doctor</Label>
                  <select
                    id="doctor"
                    className={selectClassName}
                    value={formData.doctor}
                    onChange={(e) => handleFieldChange('doctor', e.target.value)}
                    aria-invalid={!!errors.doctor}
                    aria-describedby={errors.doctor ? 'doctor-error' : undefined}
                  >
                    <option value="">Select a doctor</option>
                    {doctors.map((doctor) => (
                      <option key={doctor._id} value={doctor._id}>
                        {doctor.name}{' '}
                        {doctor.specialization &&
                          `- ${doctor.specialization}`}
                      </option>
                    ))}
                  </select>
                  {errors.doctor && (
                    <p id="doctor-error" className="text-sm text-red-600">
                      {errors.doctor}
                    </p>
                  )}
                </div>
                {/* Req 2: Date must be in the future — inline error below. */}
                <div className="space-y-2">
                  <Label htmlFor="appointmentDate">Date</Label>
                  <Input
                    id="appointmentDate"
                    type="date"
                    value={formData.appointmentDate}
                    onChange={(e) =>
                      handleFieldChange('appointmentDate', e.target.value)
                    }
                    min={new Date().toISOString().split('T')[0]}
                    className={inputErrorClass(errors.appointmentDate)}
                    aria-invalid={!!errors.appointmentDate}
                    aria-describedby={
                      errors.appointmentDate
                        ? 'appointmentDate-error'
                        : undefined
                    }
                  />
                  {errors.appointmentDate && (
                    <p
                      id="appointmentDate-error"
                      className="text-sm text-red-600"
                    >
                      {errors.appointmentDate}
                    </p>
                  )}
                </div>
                {/* Req 2: Time 9 AM - 5 PM — inline error below. */}
                <div className="space-y-2">
                  <Label htmlFor="appointmentTime">Time</Label>
                  <Input
                    id="appointmentTime"
                    type="time"
                    value={formData.appointmentTime}
                    onChange={(e) =>
                      handleFieldChange('appointmentTime', e.target.value)
                    }
                    className={inputErrorClass(errors.appointmentTime)}
                    aria-invalid={!!errors.appointmentTime}
                    aria-describedby={
                      errors.appointmentTime
                        ? 'appointmentTime-error'
                        : undefined
                    }
                  />
                  {errors.appointmentTime && (
                    <p
                      id="appointmentTime-error"
                      className="text-sm text-red-600"
                    >
                      {errors.appointmentTime}
                    </p>
                  )}
                </div>
                {/* Req 2: Reason at least 10 characters — inline error below. */}
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason</Label>
                  <Input
                    id="reason"
                    value={formData.reason}
                    onChange={(e) => handleFieldChange('reason', e.target.value)}
                    placeholder="Brief reason for visit (min 10 characters)"
                    className={inputErrorClass(errors.reason)}
                    aria-invalid={!!errors.reason}
                    aria-describedby={
                      errors.reason ? 'reason-error' : undefined
                    }
                  />
                  {errors.reason && (
                    <p id="reason-error" className="text-sm text-red-600">
                      {errors.reason}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="symptoms">Symptoms (Optional)</Label>
                <textarea
                  id="symptoms"
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.symptoms}
                  onChange={(e) =>
                    setFormData({ ...formData, symptoms: e.target.value })
                  }
                  placeholder="Describe your symptoms..."
                />
              </div>
              <div className="flex space-x-2">
                {/* Req 3: Disable submit when form is invalid. */}
                <Button
                  type="submit"
                  disabled={!isFormValid || submitting}
                >
                  {submitting ? 'Booking...' : 'Book Appointment'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {appointments.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">No appointments found</p>
            </CardContent>
          </Card>
        ) : (
          appointments.map((appointment) => (
            <Card key={appointment._id}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <User className="h-5 w-5 text-muted-foreground" />
                      <span className="font-semibold">
                        Dr. {appointment.doctor?.name}
                      </span>
                      {appointment.doctor?.specialization && (
                        <span className="text-sm text-muted-foreground">
                          - {appointment.doctor.specialization}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {format(
                            new Date(appointment.appointmentDate),
                            'MMM dd, yyyy',
                          )}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Clock className="h-4 w-4" />
                        <span>{appointment.appointmentTime}</span>
                      </div>
                    </div>
                    {appointment.reason && (
                      <p className="text-sm">{appointment.reason}</p>
                    )}
                    {appointment.symptoms && (
                      <p className="text-sm text-muted-foreground">
                        Symptoms: {appointment.symptoms}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end space-y-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                        appointment.status,
                      )}`}
                    >
                      {appointment.status}
                    </span>
                    {appointment.status !== 'cancelled' &&
                      appointment.status !== 'completed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancelAppointment(appointment._id)}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                      )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
