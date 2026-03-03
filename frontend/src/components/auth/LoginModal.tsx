import React, { useState } from 'react';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import toast from 'react-hot-toast';

interface LoginModalProps {
 isOpen: boolean;
 onClose: () => void;
 onSwitchToRegister?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
 isOpen,
 onClose,
 onSwitchToRegister,
}) => {
 const { login } = useAuth();
 const { t } = useTranslation();
 const [isLoading, setIsLoading] = useState(false);
 const [showPassword, setShowPassword] = useState(false);
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
 const [formData, setFormData] = useState({
 email: '',
 password: '',
 });

 const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 const { name, value } = e.target;
 setFormData(prev => ({
 ...prev,
 [name]: value
 }));
 if (errorMessage) setErrorMessage(null);
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 
 if (!formData.email.trim() || !formData.password.trim()) {
 setErrorMessage(t('errors.requiredFieldMissing'));
 return;
 }

 setIsLoading(true);
 try {
 setErrorMessage(null);
 await login(formData.email, formData.password);
 toast.success(t('auth.loginSuccess') || 'Successfully logged in!');
 onClose();
 setFormData({ email: '', password: '' });
 } catch (error: any) {
 setErrorMessage(error.response?.data?.message || t('errors.invalidCredentials'));
 } finally {
 setIsLoading(false);
 }
 };

 const handleClose = () => {
 setFormData({ email: '', password: '' });
 onClose();
 };

 return (
 <Modal
 isOpen={isOpen}
 onClose={handleClose}
 title={t('auth.loginTitle')}
 size="sm"
 >
 {errorMessage && (
 <div className="mb-4 rounded border border-[var(--color-danger-light)] bg-[var(--color-danger-light)] px-3 py-2 text-sm text-danger-base">
 {errorMessage}
 </div>
 )}
 <form onSubmit={handleSubmit} className="space-y-6">
 {/* Email */}
 <div>
 <label htmlFor="email" className="block text-sm font-medium text-content-secondary mb-2">
 {t('auth.email')}
 </label>
 <div className="relative">
 <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-content-tertiary" />
 <input
 type="email"
 id="email"
 name="email"
 value={formData.email}
 onChange={handleInputChange}
 className="w-full pl-10 pr-3 py-2 border border-[var(--color-border)] rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-accent-base bg-elevated text-content"
 placeholder={t('auth.email')}
 required
 />
 </div>
 </div>

 {/* Password */}
 <div>
 <label htmlFor="password" className="block text-sm font-medium text-content-secondary mb-2">
 {t('auth.password')}
 </label>
 <div className="relative">
 <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-content-tertiary" />
 <input
 type={showPassword ? 'text' : 'password'}
 id="password"
 name="password"
 value={formData.password}
 onChange={handleInputChange}
 className="w-full pl-10 pr-10 py-2 border border-[var(--color-border)] rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-accent-base bg-elevated text-content"
 placeholder={t('auth.password')}
 required
 />
 <button
 type="button"
 onClick={() => setShowPassword(!showPassword)}
 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-content-tertiary hover:text-content-secondary"
 >
 {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
 </button>
 </div>
 </div>

 {/* Submit Button */}
 <Button
 type="submit"
 className="w-full"
 disabled={isLoading}
 >
 {isLoading ? t('common.loading') : t('auth.login')}
 </Button>

 {/* Switch to Register */}
 {onSwitchToRegister && (
 <div className="text-center">
 <p className="text-sm text-content-secondary">
 {t('auth.dontHaveAccount')}{' '}
 <button
 type="button"
 onClick={onSwitchToRegister}
 className="font-medium text-accent-base hover:text-accent-base transition-colors"
 >
 {t('auth.signUpHere')}
 </button>
 </p>
 </div>
 )}
 </form>
 </Modal>
 );
};
