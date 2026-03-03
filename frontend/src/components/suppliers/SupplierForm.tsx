import { useState, useEffect } from"react";
import { useMutation, useQuery, useQueryClient } from"@tanstack/react-query";
import { X, Check } from"lucide-react";
import toast from"react-hot-toast";
import {
 suppliersApi,
 productsApi,
 type Supplier,
 type Product,
} from"../../lib/api";
import { Button } from"../ui/Button";
import { Input } from"../ui/Input";
import { Card } from"../ui/Card";
import { useTranslation } from"../../hooks/useTranslation";

interface SupplierFormProps {
 supplier?: Supplier | null;
 onClose: () => void;
}

export const SupplierForm = ({ supplier, onClose }: SupplierFormProps) => {
 const { t } = useTranslation();
 const queryClient = useQueryClient();

 const [formData, setFormData] = useState({
 name:"",
 email:"",
 phone:"",
 address:"",
 contactPerson:"",
 notes:"",
 productIds: [] as string[],
 });

 const [productSearch, setProductSearch] = useState("");

 // Fetch full supplier with products when editing
 const { data: fullSupplierData } = useQuery({
 queryKey: ["supplier", supplier?.id],
 queryFn: () => suppliersApi.getById(supplier!.id),
 enabled: !!supplier?.id,
 });

 const fullSupplier = fullSupplierData?.data ?? supplier;

 const { data: productsData } = useQuery({
 queryKey: ["products","all-for-selector"],
 queryFn: () => productsApi.getAll({ limit: 100 }),
 });

 const products: Product[] = productsData?.data?.data || [];
 const filteredProducts = products.filter((p) =>
 p.name.toLowerCase().includes(productSearch.toLowerCase()),
 );

 useEffect(() => {
 if (fullSupplier) {
 setFormData({
 name: fullSupplier.name,
 email: fullSupplier.email ||"",
 phone: fullSupplier.phone ||"",
 address: fullSupplier.address ||"",
 contactPerson: fullSupplier.contact_person ||"",
 notes: fullSupplier.notes ||"",
 productIds: fullSupplier.products?.map((p) => p.id) || [],
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

 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();

 const data = {
 name: formData.name,
 email: formData.email || undefined,
 phone: formData.phone || undefined,
 address: formData.address || undefined,
 contactPerson: formData.contactPerson || undefined,
 notes: formData.notes || undefined,
 productIds: formData.productIds,
 };

 if (supplier) {
 updateMutation.mutate({ id: supplier.id, data });
 } else {
 createMutation.mutate(data as Parameters<typeof suppliersApi.create>[0]);
 }
 };

 const toggleProduct = (productId: string) => {
 setFormData((prev) => ({
 ...prev,
 productIds: prev.productIds.includes(productId)
 ? prev.productIds.filter((id) => id !== productId)
 : [...prev.productIds, productId],
 }));
 };

 const isLoading = createMutation.isPending || updateMutation.isPending;

 return (
 <div className="fixed inset-0 backdrop-blur-sm bg-[var(--color-overlay)] flex items-center justify-center z-50">
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

 {/* Product multi-select */}
 <div>
 <label className="block text-sm font-medium text-content-secondary mb-1">
 {t("suppliers.products")}
 {formData.productIds.length > 0 && (
 <span className="ml-2 text-xs text-accent-base">
 ({formData.productIds.length})
 </span>
 )}
 </label>
 <input
 type="text"
 placeholder={t("common.search")}
 value={productSearch}
 onChange={(e) => setProductSearch(e.target.value)}
 className="w-full px-3 py-2 mb-2 border border-[var(--color-border)] rounded-lg bg-elevated text-content focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:border-transparent transition-colors duration-200 text-sm"
 />
 <div className="max-h-[160px] overflow-y-auto border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border-light)]">
 {filteredProducts.length === 0 ? (
 <p className="text-xs text-content-tertiary text-center py-4">
 {t("common.noResults")}
 </p>
 ) : (
 filteredProducts.map((product) => {
 const selected = formData.productIds.includes(product.id);
 return (
 <button
 key={product.id}
 type="button"
 onClick={() => toggleProduct(product.id)}
 className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
 selected
 ?"bg-[var(--color-accent-light)] text-accent-base"
 :"text-content-secondary hover:bg-surface-alt"
 }`}
 >
 <div
 className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
 selected
 ?"bg-accent-base border-accent-base"
 :"border-[var(--color-border)]"
 }`}
 >
 {selected && <Check className="w-3 h-3 text-white" />}
 </div>
 <span className="truncate">{product.name}</span>
 </button>
 );
 })
 )}
 </div>
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
