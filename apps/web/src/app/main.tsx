import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { authClient } from "../shared/lib/auth-client";
import { configError } from "../shared/lib/config";
import { App } from "./App";
import { ConfigMissing } from "./ConfigMissing";
import { createQueryClient } from "./queryClient";
import "../shared/styles/styles.css";

const client = createQueryClient(() => authClient.$store.notify("$sessionSignal"));

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
