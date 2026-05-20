import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { api } from '@/lib/api';

const schema = z.object({ email: z.string().email() });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (v: FormValues) => {
    setError(null);
    try {
      await api.post('/auth/forgot-password', v);
      setSent(true);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Request failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg-primary">
      <div className="w-full max-w-md bg-bg-card border border-border rounded-2xl p-8 shadow-xl">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-accent-primary text-white grid place-items-center font-bold text-xl">G</div>
          <h1 className="mt-3 text-xl font-semibold">Reset password</h1>
          <p className="text-sm text-text-secondary text-center mt-1">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        {sent ? (
          <div className="text-sm text-text-secondary text-center space-y-3">
            <p className="text-status-valid">Check your inbox for the reset link.</p>
            <Link to="/login" className="block text-accent-primary hover:underline">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm mb-1 text-text-secondary">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
                <input
                  {...register('email')}
                  type="email"
                  className="w-full pl-10 pr-3 py-2.5 bg-bg-input border border-border rounded-lg outline-none focus:border-accent-primary"
                  placeholder="you@company.com"
                />
              </div>
              {errors.email && <p className="text-xs text-status-expired mt-1">{errors.email.message}</p>}
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
              Send reset link
            </button>

            <div className="text-center text-sm">
              <Link to="/login" className="text-accent-primary hover:underline">Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
