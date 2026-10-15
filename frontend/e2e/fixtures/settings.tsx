import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { SettingsPage } from "../../src/pages/SettingsPage";
import { AuthContext } from "../../src/contexts/AuthContext.types";
import i18n from "../../src/lib/i18n";
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
Object.assign(window, { settingsFixture: { queryClient, i18n } });
void i18n.changeLanguage("en");
const element = document.getElementById("root");
if (!element) throw new Error("Missing fixture root");
createRoot(element).render(
  <BrowserRouter>
    <AuthContext.Provider
      value={{
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
        login: async () => {},
        register: async () => {},
        logout: async () => {},
      }}
    >
      <QueryClientProvider client={queryClient}>
        <SettingsPage />
        <Toaster />
      </QueryClientProvider>
    </AuthContext.Provider>
  </BrowserRouter>,
);
