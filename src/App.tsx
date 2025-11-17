import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { WalletConnect } from "@/components/WalletConnect";
import CreateMultisig from "./pages/CreateMultisig";
import NewTransaction from "./pages/NewTransaction";
import MultisigPage from "./pages/MultisigPage";
import NotFound from "./pages/NotFound";
import { MultisigDropdown } from "./components/MultisigDropdown";
import { WalletProvider } from "@/context/WalletContext";
import { EvmProvider } from "@/context/EvmContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <WalletProvider>
    <EvmProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SidebarProvider>
          <div className="min-h-screen flex w-full bg-background">
            <AppSidebar />
            <div className="flex-1 flex flex-col">
              <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 sticky top-0 z-10 shadow-sm">
                <div className="flex items-center gap-4">
                  <SidebarTrigger />
                  <MultisigDropdown />
                </div>
                <WalletConnect />
              </header>
              <main className="flex-1 p-8 overflow-auto">
                <Routes>
                  <Route path="/multisig/:address" element={<MultisigPage />} />
                  <Route path="/create-multisig" element={<CreateMultisig />} />
                  <Route path="/new-transaction" element={<NewTransaction />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </main>
            </div>
          </div>
        </SidebarProvider>
      </BrowserRouter>
    </TooltipProvider>
    </EvmProvider>
    </WalletProvider>
  </QueryClientProvider>
);

export default App;
