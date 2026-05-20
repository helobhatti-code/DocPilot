import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Lock, Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { api } from '@/lib/api';
import { AuthUser } from '@/lib/types';
import { applyTheme, authStore } from '@/store/auth';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'At least 8 characters'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const res = await api.post('/auth/login', values);
      const { accessToken, refreshToken, user } = res.data as {
        accessToken: string;
        refreshToken: string;
        user: AuthUser;
      };
      authStore.getState().setSession({ accessToken, refreshToken, user });
      applyTheme(user.themePreference);
      nav('/dashboard');
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Login failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg-primary">
      <div className="w-full max-w-md bg-bg-card border border-border rounded-2xl p-8 shadow-card">

        {/* Logo */}
        {/* TODO: replace with DocPilot logo asset */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-orange flex items-center justify-center shadow-card-hover mb-3">
            <span className="text-white font-bold text-2xl tracking-tight">D</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-heading">DocPilot</h1>
          <p className="text-sm text-text-secondary mt-0.5">Document &amp; Compliance Operations</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-label text-text-secondary mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
              <input
                {...register('email')}
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                className="w-full pl-10 pr-3 py-2.5 rounded-lg text-sm
                  bg-bg-input border border-border text-text-primary placeholder-text-secondary
                  focus:outline-none focus:border-brand-orange transition-colors"
              />
            </div>
            {errors.email && (
              <p className="text-xs text-rose-400 mt-1">{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-label text-text-secondary mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
              <input
                {...register('password')}
                type="password"
                autoComplete="current-password"
                className="w-full pl-10 pr-3 py-2.5 rounded-lg text-sm
                  bg-bg-input border border-border text-text-primary
                  focus:outline-none focus:border-brand-orange transition-colors"
              />
            </div>
            {errors.password && (
              <p className="text-xs text-rose-400 mt-1">{errors.password.message}</p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-rose-400 bg-rose-400/10 border border-rose-400/25 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Sign in */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-lg font-semibold text-sm text-white
              bg-brand-orange hover:bg-brand-orange-dark
              disabled:opacity-50 transition-colors
              flex items-center justify-center gap-2 mt-2"
          >
            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
            Sign in
          </button>

          <div className="text-center text-sm pt-1">
            <Link to="/forgot-password" className="text-accent-blue hover:text-brand-orange transition-colors">
              Forgot password?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
