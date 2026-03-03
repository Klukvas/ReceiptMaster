import React, { useState } from"react";
import { Eye, EyeOff, Mail, Lock } from"lucide-react";
import { useAuth } from"../../hooks/useAuth";
import { useTranslation } from"../../hooks/useTranslation";
import { Button } from"../ui/Button";
import { Modal } from"../ui/Modal";
import toast from"react-hot-toast";

interface RegisterModalProps {
 isOpen: boolean;
 onClose: () => void;
 onSwitchToLogin?: () => void;
}

export const RegisterModal: React.FC<RegisterModalProps> = ({
 isOpen,
 onClose,
 onSwitchToLogin,
}) => {
 const { register } = useAuth();
 const { t } = useTranslation();
 const [isLoading, setIsLoading] = useState(false);
 const [showPassword, setShowPassword] = useState(false);
 const [showConfirmPassword, setShowConfirmPassword] = useState(false);
 const [formData, setFormData] = useState({
 email:"",
 password:"",
 confirmPassword:"",
 });

 const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 const { name, value } = e.target;
 setFormData((prev) => ({
 ...prev,
 [name]: value,
 }));
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();

 if (!formData.email.trim() || !formData.password.trim()) {
 toast.error(t("errors.requiredFieldMissing"));
 return;
 }

 if (formData.password !== formData.confirmPassword) {
 toast.error(t("errors.passwordsDoNotMatch"));
 return;
 }

 if (formData.password.length < 6) {
 toast.error(t("errors.passwordTooShort"));
 return;
 }

 setIsLoading(true);
 try {
 await register(formData.email, formData.password,"","");
 toast.success(t("auth.registerSuccess") ||"Successfully registered!");
 onClose();
 setFormData({ email:"", password:"", confirmPassword:"" });
 } catch (error: any) {
 toast.error(
 error.response?.data?.message || t("errors.userAlreadyExists"),
 );
 } finally {
 setIsLoading(false);
 }
 };

 const handleClose = () => {
 setFormData({ email:"", password:"", confirmPassword:"" });
 onClose();
 };

 return (
 <Modal
 isOpen={isOpen}
 onClose={handleClose}
 title={t("auth.registerTitle")}
 size="sm"
 >
 <form onSubmit={handleSubmit} className="space-y-6">
 {/* Email */}
 <div>
 <label
 htmlFor="email"
 className="block text-sm font-medium text-content-secondary mb-2"
 >
 {t("auth.email")}
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
 placeholder={t("auth.email")}
 required
 />
 </div>
 </div>

 {/* Password */}
 <div>
 <label
 htmlFor="password"
 className="block text-sm font-medium text-content-secondary mb-2"
 >
 {t("auth.password")}
 </label>
 <div className="relative">
 <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-content-tertiary" />
 <input
 type={showPassword ?"text" :"password"}
 id="password"
 name="password"
 value={formData.password}
 onChange={handleInputChange}
 className="w-full pl-10 pr-10 py-2 border border-[var(--color-border)] rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-accent-base bg-elevated text-content"
 placeholder={t("auth.password")}
 required
 />
 <button
 type="button"
 onClick={() => setShowPassword(!showPassword)}
 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-content-tertiary hover:text-content-secondary"
 >
 {showPassword ? (
 <EyeOff className="h-5 w-5" />
 ) : (
 <Eye className="h-5 w-5" />
 )}
 </button>
 </div>
 </div>

 {/* Confirm Password */}
 <div>
 <label
 htmlFor="confirmPassword"
 className="block text-sm font-medium text-content-secondary mb-2"
 >
 {t("auth.confirmPassword")}
 </label>
 <div className="relative">
 <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-content-tertiary" />
 <input
 type={showConfirmPassword ?"text" :"password"}
 id="confirmPassword"
 name="confirmPassword"
 value={formData.confirmPassword}
 onChange={handleInputChange}
 className="w-full pl-10 pr-10 py-2 border border-[var(--color-border)] rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-accent-base bg-elevated text-content"
 placeholder={t("auth.confirmPassword")}
 required
 />
 <button
 type="button"
 onClick={() => setShowConfirmPassword(!showConfirmPassword)}
 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-content-tertiary hover:text-content-secondary"
 >
 {showConfirmPassword ? (
 <EyeOff className="h-5 w-5" />
 ) : (
 <Eye className="h-5 w-5" />
 )}
 </button>
 </div>
 </div>

 {/* Submit Button */}
 <Button type="submit" className="w-full" disabled={isLoading}>
 {isLoading ? t("common.loading") : t("auth.register")}
 </Button>

 {/* Switch to Login */}
 {onSwitchToLogin && (
 <div className="text-center">
 <p className="text-sm text-content-secondary">
 {t("auth.alreadyHaveAccount")}{""}
 <button
 type="button"
 onClick={onSwitchToLogin}
 className="font-medium text-accent-base hover:text-accent-base transition-colors"
 >
 {t("auth.signInHere")}
 </button>
 </p>
 </div>
 )}
 </form>
 </Modal>
 );
};
