import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { SettingsPage } from "../../src/pages/SettingsPage";
import { OrderActionsMenu } from "../../src/components/orders/OrderActionsMenu";
import { api, type Order } from "../../src/lib/api";
import {
  AuthContext,
  type AuthContextType,
} from "../../src/contexts/AuthContext.types";
import i18n from "../../src/lib/i18n";
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
// The settings page reads the account's plan, which is asked for only when signed in. The
// real AuthProvider would verify a stored session against endpoints the fixture lacks.
const notInFixture = async (): Promise<void> => {
  throw new Error("Auth actions are not part of the document fixture");
};
const SIGNED_IN: AuthContextType = {
  user: null,
  token: null,
  login: notInFixture,
  register: notInFixture,
  changePassword: notInFixture,
  logout: notInFixture,
  isLoading: false,
  isAuthenticated: true,
  hasProfileLoadError: false,
  retryLoadProfile: notInFixture,
  refreshProfile: notInFixture,
};
function Fixture() {
  const [order, setOrder] = useState<Order>();
  useEffect(() => {
    void api.get<Order>("/fixture-order").then((value) => setOrder(value.data));
  }, []);
  return (
    <main className="mx-auto max-w-7xl p-5">
      {/* The page confirms a save with a toast, as the app does. */}
      <Toaster />
      <SettingsPage />
      <div className="mt-8 rounded-xl border border-[var(--color-border)] bg-elevated p-6">
        <h2>Orders · document customization fixture</h2>
        {order && (
          <OrderActionsMenu
            order={order}
            onView={() => {}}
            onEdit={() => {}}
            onConfirm={() => {}}
            onCancel={() => {}}
            onDelete={() => {}}
            onDownloadReceipt={() => {}}
            onPrintReceipt={() => {}}
            onGenerateReceipt={() => {}}
            isDeleting={false}
          />
        )}
      </div>
    </main>
  );
}
Object.assign(window, { templateFixture: { queryClient, i18n } });
void i18n.changeLanguage("en");
const element = document.getElementById("root");
if (!element) throw new Error("Missing fixture root");
createRoot(element).render(
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={SIGNED_IN}>
        <Fixture />
      </AuthContext.Provider>
    </QueryClientProvider>
  </BrowserRouter>,
);
