import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Link } from 'react-router-dom';
import { parseApiError } from '../../lib/api-errors';
import { useTranslation } from '../../hooks/useTranslation';

export const RegisterForm: React.FC = () => {
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [confirmPassword, setConfirmPassword] = useState('');
 const [firstName, setFirstName] = useState('');
 const [lastName, setLastName] = useState('');
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState('');
 
 const { register } = useAuth();
 const { t } = useTranslation();

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setIsLoading(true);
 setError('');

 // Validate passwords match
 if (password !== confirmPassword) {
 setError(t('errors.passwordsDoNotMatch'));
 setIsLoading(false);
 return;
 }

 // Validate password length
 if (password.length < 6) {
 setError(t('errors.passwordTooShort'));
 setIsLoading(false);
 return;
 }

 try {
 await register(email, password, firstName, lastName);
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
 {t('auth.registerTitle')}
 </h2>
 <p className="mt-2 text-center text-sm text-content-secondary">
 {t('auth.registerSubtitle')}
 </p>
 </div>
 <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
 <div className="space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label htmlFor="firstName" className="block text-sm font-medium text-content-secondary mb-1">
 {t('auth.firstName')}
 </label>
 <input
 id="firstName"
 name="firstName"
 type="text"
 autoComplete="given-name"
 required
 className="appearance-none relative block w-full px-3 py-2 border border-[var(--color-border)] placeholder-content-tertiary text-content bg-elevated rounded-md focus:outline-none focus:ring-[var(--color-ring)] focus:border-accent-base sm:text-sm transition-colors duration-200"
 placeholder={t('auth.firstName')}
 value={firstName}
 onChange={(e) => setFirstName(e.target.value)}
 />
 </div>
 <div>
 <label htmlFor="lastName" className="block text-sm font-medium text-content-secondary mb-1">
 {t('auth.lastName')}
 </label>
 <input
 id="lastName"
 name="lastName"
 type="text"
 autoComplete="family-name"
 required
 className="appearance-none relative block w-full px-3 py-2 border border-[var(--color-border)] placeholder-content-tertiary text-content bg-elevated rounded-md focus:outline-none focus:ring-[var(--color-ring)] focus:border-accent-base sm:text-sm transition-colors duration-200"
 placeholder={t('auth.lastName')}
 value={lastName}
 onChange={(e) => setLastName(e.target.value)}
 />
 </div>
 </div>
 
 <div>
 <label htmlFor="email" className="block text-sm font-medium text-content-secondary mb-1">
 {t('auth.email')}
 </label>
 <input
 id="email"
 name="email"
 type="email"
 autoComplete="email"
 required
 className="appearance-none relative block w-full px-3 py-2 border border-[var(--color-border)] placeholder-content-tertiary text-content bg-elevated rounded-md focus:outline-none focus:ring-[var(--color-ring)] focus:border-accent-base sm:text-sm transition-colors duration-200"
 placeholder={t('auth.email')}
 value={email}
 onChange={(e) => setEmail(e.target.value)}
 />
 </div>
 
 <div>
 <label htmlFor="password" className="block text-sm font-medium text-content-secondary mb-1">
 {t('auth.password')}
 </label>
 <input
 id="password"
 name="password"
 type="password"
 autoComplete="new-password"
 required
 className="appearance-none relative block w-full px-3 py-2 border border-[var(--color-border)] placeholder-content-tertiary text-content bg-elevated rounded-md focus:outline-none focus:ring-[var(--color-ring)] focus:border-accent-base sm:text-sm transition-colors duration-200"
 placeholder={t('auth.password')}
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 />
 </div>
 
 <div>
 <label htmlFor="confirmPassword" className="block text-sm font-medium text-content-secondary mb-1">
 {t('auth.confirmPassword')}
 </label>
 <input
 id="confirmPassword"
 name="confirmPassword"
 type="password"
 autoComplete="new-password"
 required
 className="appearance-none relative block w-full px-3 py-2 border border-[var(--color-border)] placeholder-content-tertiary text-content bg-elevated rounded-md focus:outline-none focus:ring-[var(--color-ring)] focus:border-accent-base sm:text-sm transition-colors duration-200"
 placeholder={t('auth.confirmPassword')}
 value={confirmPassword}
 onChange={(e) => setConfirmPassword(e.target.value)}
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
 {isLoading ? t('common.loading') : t('auth.register')}
 </button>
 </div>

 <div className="text-center">
 <p className="text-sm text-content-secondary">
 {t('auth.alreadyHaveAccount')}{' '}
 <Link
 to="/login"
 className="font-medium text-accent-base hover:text-accent-base-hover transition-colors duration-200"
 >
 {t('auth.signInHere')}
 </Link>
 </p>
 </div>
 </form>
 </div>
 </div>
 );
};
