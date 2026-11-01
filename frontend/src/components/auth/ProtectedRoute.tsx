import React from 'react';
import { LoginForm } from './LoginForm';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../ui/Button';

interface ProtectedRouteProps {
 children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
 const { isAuthenticated, isLoading, hasProfileLoadError, retryLoadProfile } = useAuth();
 const { t } = useTranslation();

 if (isLoading) {
 return (
 <div className="min-h-screen flex items-center justify-center">
 <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-accent-base"></div>
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
