import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { AppSplash } from "./components/app-splash";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: AppSplash,
    defaultPendingMs: 200,
    defaultPendingMinMs: 300,
  });

  return router;
};
