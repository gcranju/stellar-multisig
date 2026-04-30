import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useMatch, useLocation, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { WalletConnect } from "@/components/WalletConnect";
import Dashboard from "./pages/Dashboard";
import CreateMultisig from "./pages/CreateMultisig";
import NewTransaction from "./pages/NewTransaction";
import Transactions from "./pages/Transactions";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import { WalletProvider } from "@/context/WalletContext";
import { EvmProvider } from "@/context/EvmContext";
import MultisigPage from "./pages/MultisigPage";
import { StellarProvider } from "./context/StellarContext";
import TransactionDetail from "./pages/TransactionDetail";
import { Wallet } from "lucide-react";

const queryClient = new QueryClient();

const Brand = () => (
  <Link to="/" className="flex items-center gap-3">
    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md">
      <Wallet className="w-4 h-4 text-primary-foreground" />
    </div>
    <div className="leading-tight">
      <h2 className="font-semibold text-base text-foreground">Stellar Safe</h2>
      <p className="text-xs text-muted-foreground">Multisig Wallet</p>
    </div>
  </Link>
);

const AppContent = () => {
  const match = useMatch("/multisig/:address/*");
  const address = match?.params?.address;
  const location = useLocation();
  const showSidebar = location.pathname.startsWith("/multisig");

  return (
    <div className="min-h-screen flex w-full bg-background">
      {showSidebar && <AppSidebar address={address} />}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            {showSidebar ? <SidebarTrigger /> : <Brand />}
          </div>
          <WalletConnect />
        </header>
        <main className="flex-1 p-8 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/multisig/:address" element={<MultisigPage />} />
            <Route path="/create-multisig" element={<CreateMultisig />} />
            <Route path="/multisig/:address/new-transaction" element={<NewTransaction />} />
            <Route path="/multisig/:address/transactions" element={<Transactions />} />
            <Route path="/multisig/:address/transactions/:proposalId" element={<TransactionDetail />} />
            <Route path="/multisig/:address/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <WalletProvider>
      <EvmProvider>
        <StellarProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <SidebarProvider>
                <AppContent />
              </SidebarProvider>
            </BrowserRouter>
          </TooltipProvider>
        </StellarProvider>
      </EvmProvider>
    </WalletProvider>
  </QueryClientProvider>
);

export default App;
