/** Full-page loading state: a route chunk on its way, or a reload in progress. */
export const PageSpinner = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-base" />
  </div>
);
