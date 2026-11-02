import React from 'react';
import { LoginForm } from './LoginForm';
import { useAfterDelay } from '../../hooks/useAfterDelay';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../ui/Button';

const SPINNER_DELAY_MS = 200;

interface ProtectedRouteProps {
 children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
 const { isAuthenticated, isLoading, hasProfileLoadError, retryLoadProfile } = useAuth();
 const { t } = useTranslation();
 // A fast profile load should not flash a spinner.
 const isSlowLoad = useAfterDelay(SPINNER_DELAY_MS);

 if (isLoading) {
 return (
 <div className="min-h-screen flex items-center justify-center">
 {isSlowLoad && (
 <div role="status">
 <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-accent-base motion-reduce:animate-none" />
 <span className="sr-only">{t('common.loading')}</span>
 </div>
 )}
 </div>
 );
 }

 if (hasProfileLoadError) {
 return (
 <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
 <p className="text-content-secondary">{t('errors.networkError')}</p>
 <Button onClick={() => void retryLoadProfile()}>{t('common.retry')}</Button>
 </div>
 );
 }

 if (!isAuthenticated) {
 return <LoginForm />;
 }

 return <>{children}</>;
};
