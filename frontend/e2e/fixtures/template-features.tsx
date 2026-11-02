import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { SettingsPage } from "../../src/pages/SettingsPage";
import { OrderActionsMenu } from "../../src/components/orders/OrderActionsMenu";
import { api, type Order } from "../../src/lib/api";
import i18n from "../../src/lib/i18n";
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
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
      <Fixture />
    </QueryClientProvider>
  </BrowserRouter>,
);
