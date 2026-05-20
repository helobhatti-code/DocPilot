import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { api } from '@/lib/api';
import { authStore } from '@/store/auth';

const schema = z.object({
  password: z.string().min(8, 'At least 8 characters'),
  confirm: z.string().min(8),
}).refine((d) => d.password === d.confirm, {
  path: ['confirm'],
  message: 'Passwords do not match',
});
type FormValues = z.infer<typeof schema>;

export default function SetupAccountPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get('token');
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormValues>({ resolver: zodResolver(schema) });

  if (!token) {
    return (
      <div className="min-h-screen grid place-items-center text-text-secondary">
        Missing invitation token.
      </div>
    );
  }

  const onSubmit = async (v: FormValues) => {
    setError(null);
    try {
      const res = await api.post('/auth/setup-account', {
        invitationToken: token,
        password: v.password,
      });
      const { accessToken, refreshToken } = res.data;
      authStore.getState().setTokens(accessToken, refreshToken);
      nav('/dashboard');
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Setup failed — token may be expired');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg-primary">
      <div className="w-full max-w-md bg-bg-card border border-border rounded-2xl p-8">
        <h1 className="text-xl font-semibold mb-1">Set up your account</h1>
        <p className="text-sm text-text-secondary mb-6">Choose a password to activate your account.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm mb-1 text-text-secondary">New password</label>
            <input {...register('password')} type="password"
              className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg outline-none focus:border-accent-primary" />
            {errors.password && <p className="text-xs text-status-expired mt-1">{errors.password.message}</p>}
          </div>
          <div>
            <label className="block text-sm mb-1 text-text-secondary">Confirm password</label>
            <input {...register('confirm')} type="password"
              className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg outline-none focus:border-accent-primary" />
            {errors.confirm && <p className="text-xs text-status-expired mt-1">{errors.confirm.message}</p>}
          </div>
          {error && <div className="text-sm text-status-expired">{error}</div>}
          <button type="submit" disabled={isSubmitting}
            className="w-full py-2.5 rounded-lg bg-accent-primary text-white font-medium hover:opacity-90 disabled:opacity-50">
            Activate account
          </button>
        </form>
      </div>
    </div>
  );
}
