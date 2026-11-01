import { useState, useEffect, useRef } from"react";
import { useMutation, useQuery, useQueryClient } from"@tanstack/react-query";
import { X } from"lucide-react";
import toast from"react-hot-toast";
import {
 suppliersApi,
 type Supplier,
} from"../../lib/api";
import { Button } from"../ui/Button";
import { Input } from"../ui/Input";
import { Card } from"../ui/Card";
import { useFocusTrap } from"../../hooks/useFocusTrap";
import { useTranslation } from"../../hooks/useTranslation";

interface SupplierFormProps {
 supplier?: Supplier | null;
 onClose: () => void;
}

export const SupplierForm = ({ supplier, onClose }: SupplierFormProps) => {
 const { t } = useTranslation();
 const queryClient = useQueryClient();

 const isSubmittingRef = useRef(false);
 const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);
 const [formData, setFormData] = useState({
 name:"",
 email:"",
 phone:"",
 address:"",
 contactPerson:"",
 notes:"",
 });

 // Fetch full supplier with products when editing
 const { data: fullSupplierData } = useQuery({
 queryKey: ["supplier", supplier?.id],
 queryFn: () => suppliersApi.getById(supplier!.id),
 enabled: !!supplier?.id,
 });

 const fullSupplier = fullSupplierData?.data ?? supplier;

 // Which products belong to a supplier is set on each product (its Supplier field).
 const linkedProducts = fullSupplier?.products ?? [];

 useEffect(() => {
 if (fullSupplier) {
 setFormData({
 name: fullSupplier.name,
 email: fullSupplier.email ||"",
 phone: fullSupplier.phone ||"",
 address: fullSupplier.address ||"",
 contactPerson: fullSupplier.contact_person ||"",
 notes: fullSupplier.notes ||"",
 });
 }
 }, [fullSupplier]);

 const createMutation = useMutation({
 mutationFn: suppliersApi.create,
 onSuccess: () => {
 toast.success(t("suppliers.supplierCreated"));
 queryClient.invalidateQueries({ queryKey: ["suppliers"] });
 onClose();
 },
 onError: () => {
 toast.error(t("errors.badRequest"));
 },
 });

 const updateMutation = useMutation({
 mutationFn: ({
 id,
 data,
 }: {
 id: string;
 data: Parameters<typeof suppliersApi.update>[1];
 }) => suppliersApi.update(id, data),
 onSuccess: () => {
 toast.success(t("suppliers.supplierUpdated"));
 queryClient.invalidateQueries({ queryKey: ["suppliers"] });
 onClose();
 },
 onError: () => {
 toast.error(t("errors.badRequest"));
 },
 });

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();

 const data = {
 name: formData.name,
 email: formData.email || undefined,
 phone: formData.phone || undefined,
 address: formData.address || undefined,
 contactPerson: formData.contactPerson || undefined,
 notes: formData.notes || undefined,
 };

 // A fast double click fires twice before the button re-renders as disabled.
 if (isSubmittingRef.current) return;
 isSubmittingRef.current = true;
 try {
 if (supplier) {
 await updateMutation.mutateAsync({ id: supplier.id, data });
 } else {
 await createMutation.mutateAsync(
 data as Parameters<typeof suppliersApi.create>[0],
 );
 }
 } catch {
 // The mutation's onError already tells the user what went wrong.
 } finally {
 isSubmittingRef.current = false;
 }
 };

 const isLoading = createMutation.isPending || updateMutation.isPending;

 return (
 <div
 ref={dialogRef}
 role="dialog"
 aria-modal="true"
 aria-label={supplier ? t("suppliers.editSupplier") : t("suppliers.createSupplier")}
 tabIndex={-1}
 className="fixed inset-0 backdrop-blur-sm bg-[var(--color-overlay)] flex items-center justify-center z-50 outline-none"
 >
 <Card className="w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
 <div className="flex items-center justify-between mb-4">
 <h2 className="text-lg font-semibold text-content">
 {supplier
 ? t("suppliers.editSupplier")
 : t("suppliers.createSupplier")}
 </h2>
 <Button variant="secondary" size="sm" onClick={onClose}>
 <X className="w-4 h-4" />
 </Button>
 </div>

 <form onSubmit={handleSubmit} className="space-y-4">
 <Input
 label={t("suppliers.name")}
 value={formData.name}
 onChange={(e) =>
 setFormData((prev) => ({ ...prev, name: e.target.value }))
 }
 required
 />

 <Input
 label={t("suppliers.email")}
 type="email"
 value={formData.email}
 onChange={(e) =>
 setFormData((prev) => ({ ...prev, email: e.target.value }))
 }
 />

 <Input
 label={t("suppliers.phone")}
 value={formData.phone}
 onChange={(e) =>
 setFormData((prev) => ({ ...prev, phone: e.target.value }))
 }
 />

 <Input
 label={t("suppliers.contactPerson")}
 value={formData.contactPerson}
 onChange={(e) =>
 setFormData((prev) => ({
 ...prev,
 contactPerson: e.target.value,
 }))
 }
 />

 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">
 {t("suppliers.address")}
 </label>
 <textarea
 className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-transparent transition-colors duration-200 min-h-[80px] resize-none"
 value={formData.address}
 onChange={(e) =>
 setFormData((prev) => ({ ...prev, address: e.target.value }))
 }
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">
 {t("suppliers.notes")}
 </label>
 <textarea
 className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-transparent transition-colors duration-200 min-h-[60px] resize-none"
 value={formData.notes}
 onChange={(e) =>
 setFormData((prev) => ({ ...prev, notes: e.target.value }))
 }
 />
 </div>

 {/* Linked products: read-only, because the link lives on the product */}
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">
 {t("suppliers.products")}
 {linkedProducts.length > 0 && (
 <span className="ml-2 text-xs text-accent-base">
 ({linkedProducts.length})
 </span>
 )}
 </label>
 {linkedProducts.length > 0 && (
 <ul className="max-h-[120px] overflow-y-auto border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border-light)] text-sm text-content-secondary">
 {linkedProducts.map((product) => (
 <li key={product.id} className="truncate px-3 py-2">
 {product.name}
 </li>
 ))}
 </ul>
 )}
 <p className="mt-1 text-xs text-content-tertiary">
 {t("suppliers.productsLinkHint")}
 </p>
 </div>

 <div className="flex space-x-3 pt-4">
 <Button type="submit" disabled={isLoading} className="flex-1">
 {isLoading
 ? t("suppliers.saving")
 : supplier
 ? t("suppliers.update")
 : t("common.create")}
 </Button>
 <Button type="button" variant="secondary" onClick={onClose}>
 {t("common.cancel")}
 </Button>
 </div>
 </form>
 </Card>
 </div>
 );
};
