import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { ConfigMissing } from "./components/ConfigMissing";
import { configError } from "./lib/config";
import "./styles.css";

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 5000, retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {configError ? (
      <ConfigMissing message={configError} />
    ) : (
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    )}
  </StrictMode>,
);
