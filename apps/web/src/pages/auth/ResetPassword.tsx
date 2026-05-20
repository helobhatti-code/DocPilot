import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Lock } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { api } from '@/lib/api';

const schema = z
  .object({
    password: z.string().min(8, 'At least 8 characters'),
    confirm: z.string().min(8),
  })
  .refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'Passwords must match' });
type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (v: FormValues) => {
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, password: v.password });
      nav('/login');
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Reset failed');
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen grid place-items-center bg-bg-primary p-4">
        <div className="text-center">
          <p className="text-status-expired">Invalid or missing reset token.</p>
          <Link to="/forgot-password" className="text-accent-primary hover:underline text-sm">Request a new link</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg-primary">
      <div className="w-full max-w-md bg-bg-card border border-border rounded-2xl p-8 shadow-xl">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-accent-primary text-white grid place-items-center font-bold text-xl">G</div>
          <h1 className="mt-3 text-xl font-semibold">Choose new password</h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm mb-1 text-text-secondary">New password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
              <input
                {...register('password')}
                type="password"
                className="w-full pl-10 pr-3 py-2.5 bg-bg-input border border-border rounded-lg outline-none focus:border-accent-primary"
              />
            </div>
            {errors.password && <p className="text-xs text-status-expired mt-1">{errors.password.message}</p>}
          </div>

          <div>
            <label className="block text-sm mb-1 text-text-secondary">Confirm password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
              <input
                {...register('confirm')}
                type="password"
                className="w-full pl-10 pr-3 py-2.5 bg-bg-input border border-border rounded-lg outline-none focus:border-accent-primary"
              />
            </div>
            {errors.confirm && <p className="text-xs text-status-expired mt-1">{errors.confirm.message}</p>}
          </div>

          {error && (
            <div className="text-sm text-status-expired bg-status-expired/10 border border-status-expired/30 rounded-lg p-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-lg bg-accent-primary text-white font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
            Reset password
          </button>
        </form>
      </div>
    </div>
  );
}
