import React, { Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { AppToaster } from "./components/common/AppToaster";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { PaddleProvider } from "./providers/PaddleProvider";
import { useAuth } from "./hooks/useAuth";
import { Layout } from "./components/layout/Layout";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { ScrollToTop } from "./components/ScrollToTop";
import { ContentSpinner, PageSpinner } from "./components/common/PageSpinner";
import { HomePage } from "./pages/HomePage";

// Lazy-loaded page components for code splitting
const DashboardHomePage = React.lazy(() =>
  import("./pages/DashboardHomePage").then((m) => ({
    default: m.DashboardHomePage,
  })),
);
const ProductsPage = React.lazy(() =>
  import("./pages/ProductsPage").then((m) => ({ default: m.ProductsPage })),
);
const RecipientsPage = React.lazy(() =>
  import("./pages/RecipientsPage").then((m) => ({ default: m.RecipientsPage })),
);
const SuppliersPage = React.lazy(() =>
  import("./pages/SuppliersPage").then((m) => ({ default: m.SuppliersPage })),
);
const OrdersPage = React.lazy(() =>
  import("./pages/OrdersPage").then((m) => ({ default: m.OrdersPage })),
);
const DashboardPage = React.lazy(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const SettingsPage = React.lazy(() =>
  import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const ProfilePage = React.lazy(() =>
  import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const PublicReceiptPage = React.lazy(() =>
  import("./pages/PublicReceiptPage").then((m) => ({
    default: m.PublicReceiptPage,
  })),
);
const TermsPage = React.lazy(() =>
  import("./pages/TermsPage").then((m) => ({ default: m.TermsPage })),
);
const PrivacyPage = React.lazy(() =>
  import("./pages/PrivacyPage").then((m) => ({ default: m.PrivacyPage })),
);
const RefundPolicyPage = React.lazy(() =>
  import("./pages/RefundPolicyPage").then((m) => ({
    default: m.RefundPolicyPage,
  })),
);
const CookiePolicyPage = React.lazy(() =>
  import("./pages/CookiePolicyPage").then((m) => ({
    default: m.CookiePolicyPage,
  })),
);
const BlogListPage = React.lazy(() =>
  import("./pages/BlogListPage").then((m) => ({ default: m.BlogListPage })),
);
const BlogPostPage = React.lazy(() =>
  import("./pages/BlogPostPage").then((m) => ({ default: m.BlogPostPage })),
);
const NotFoundPage = React.lazy(() =>
  import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes default
      gcTime: 1000 * 60 * 10, // 10 minutes before removing unused data
    },
  },
});

/** Sign-in gate + app shell; the page chunk loads inside the shell so the sidebar stays put. */
const AuthenticatedPage: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <ProtectedRoute>
    <Layout>
      <Suspense fallback={<ContentSpinner />}>{children}</Suspense>
    </Layout>
  </ProtectedRoute>
);

/** Signed-in users keep the sidebar on an unknown URL; visitors get the standalone page. */
const NotFoundRoute: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <PageSpinner />;
  if (!isAuthenticated) return <NotFoundPage />;
  return (
    <Layout>
      <Suspense fallback={<ContentSpinner />}>
        <NotFoundPage isInLayout />
      </Suspense>
    </Layout>
  );
};

const AppRoutes: React.FC = () => {

  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/dashboard"
          element={
            <AuthenticatedPage>
              <DashboardHomePage />
            </AuthenticatedPage>
          }
        />
        <Route
          path="/products"
          element={
            <AuthenticatedPage>
              <ProductsPage />
            </AuthenticatedPage>
          }
        />
        <Route
          path="/recipients"
          element={
            <AuthenticatedPage>
              <RecipientsPage />
            </AuthenticatedPage>
          }
        />
        <Route
          path="/suppliers"
          element={
            <AuthenticatedPage>
              <SuppliersPage />
            </AuthenticatedPage>
          }
        />
        <Route
          path="/orders"
          element={
            <AuthenticatedPage>
              <OrdersPage />
            </AuthenticatedPage>
          }
        />
        <Route
          path="/analytics"
          element={
            <AuthenticatedPage>
              <DashboardPage />
            </AuthenticatedPage>
          }
        />
        <Route
          path="/settings"
          element={
            <AuthenticatedPage>
              <SettingsPage />
            </AuthenticatedPage>
          }
        />
        <Route
          path="/profile"
          element={
            <AuthenticatedPage>
              <ProfilePage />
            </AuthenticatedPage>
          }
        />
        <Route path="/r/:token" element={<PublicReceiptPage />} />
        <Route path="/blog" element={<BlogListPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/refund-policy" element={<RefundPolicyPage />} />
        <Route path="/cookie-policy" element={<CookiePolicyPage />} />
        <Route path="*" element={<NotFoundRoute />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <PaddleProvider>
              <Router>
                <ScrollToTop />
                <AppRoutes />
              </Router>
            </PaddleProvider>
            <AppToaster />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
