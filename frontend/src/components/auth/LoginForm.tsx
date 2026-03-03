import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Link } from 'react-router-dom';
import { parseApiError } from '../../lib/api-errors';
import { useTranslation } from '../../hooks/useTranslation';

export const LoginForm: React.FC = () => {
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState('');
 
 const { login } = useAuth();
 const { t } = useTranslation();

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setIsLoading(true);
 setError('');

 try {
 await login(email, password);
 } catch (err: unknown) {
 const apiError = parseApiError(err);
 setError(apiError.message);
 } finally {
 setIsLoading(false);
 }
 };

 return (
 <div className="min-h-screen flex items-center justify-center bg-surface-alt py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
 <div className="max-w-md w-full space-y-8">
 <div>
 <h2 className="mt-6 text-center text-3xl font-extrabold text-content">
 {t('auth.loginTitle')}
 </h2>
 <p className="mt-2 text-center text-sm text-content-secondary">
 {t('auth.loginSubtitle')}
 </p>
 </div>
 <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
 <div className="rounded-md shadow-sm -space-y-px">
 <div>
 <label htmlFor="email" className="sr-only">
 {t('auth.email')}
 </label>
 <input
 id="email"
 name="email"
 type="email"
 autoComplete="email"
 required
 className="appearance-none rounded-none relative block w-full px-3 py-2 border border-[var(--color-border)] placeholder-content-tertiary text-content bg-elevated rounded-t-md focus:outline-none focus:ring-[var(--color-ring)] focus:border-accent-base focus:z-10 sm:text-sm transition-colors duration-200"
 placeholder={t('auth.email')}
 value={email}
 onChange={(e) => setEmail(e.target.value)}
 />
 </div>
 <div>
 <label htmlFor="password" className="sr-only">
 {t('auth.password')}
 </label>
 <input
 id="password"
 name="password"
 type="password"
 autoComplete="current-password"
 required
 className="appearance-none rounded-none relative block w-full px-3 py-2 border border-[var(--color-border)] placeholder-content-tertiary text-content bg-elevated rounded-b-md focus:outline-none focus:ring-[var(--color-ring)] focus:border-accent-base focus:z-10 sm:text-sm transition-colors duration-200"
 placeholder={t('auth.password')}
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 />
 </div>
 </div>

 {error && (
 <div className="rounded-md bg-[var(--color-danger-light)] border border-[var(--color-danger-light)] p-4">
 <div className="text-sm text-danger-base">{error}</div>
 </div>
 )}

 <div>
 <button
 type="submit"
 disabled={isLoading}
 className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-accent-base hover:bg-accent-base-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-ring)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
 >
 {isLoading ? t('common.loading') : t('auth.login')}
 </button>
 </div>

 <div className="text-center">
 <p className="text-sm text-content-secondary">
 {t('auth.dontHaveAccount')}{' '}
 <Link
 to="/register"
 className="font-medium text-accent-base hover:text-accent-base-hover transition-colors duration-200"
 >
 {t('auth.signUpHere')}
 </Link>
 </p>
 </div>
 </form>
 </div>
 </div>
 );
};
