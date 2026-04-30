import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle, Shield, Users, Clock, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@/context/WalletContext";
import { useEvm } from "@/context/EvmContext";
import { useEffect, useMemo, useState } from "react";

interface MultisigSummary {
  address: string;
  name: string;
  signers: string[];
  threshold: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { walletAddress, signerAccounts } = useWallet();
  const { getMultisig } = useEvm();

  const [accounts, setAccounts] = useState<MultisigSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!walletAddress) {
      setAccounts([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    Promise.all(
      signerAccounts.map(async (address) => {
        const metadata = await getMultisig(address);
        return {
          address,
          name: metadata?.name ?? "",
          signers: metadata?.signers ?? [],
          threshold: metadata?.threshold ?? 0,
        };
      }),
    ).then((results) => {
      if (!cancelled) {
        setAccounts(results);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [walletAddress, signerAccounts, getMultisig]);

  const totalSigners = useMemo(
    () => accounts.reduce((sum, a) => sum + a.signers.length, 0),
    [accounts],
  );

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-1">Dashboard</h1>
          <p className="text-muted-foreground">Manage your multisignature accounts and transactions</p>
        </div>
        <Button onClick={() => navigate("/create-multisig")} className="gap-2">
          <PlusCircle className="w-4 h-4" />
          Create Multisig
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={Shield} tone="primary" label="Total Multisigs" value={signerAccounts.length} />
        <StatCard icon={Clock} tone="accent" label="Pending Transactions" value={0} />
        <StatCard icon={Users} tone="success" label="Total Signers" value={totalSigners} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Multisig Accounts</CardTitle>
          <CardDescription>Manage and view your multisignature accounts</CardDescription>
        </CardHeader>
        <CardContent>
          {!walletAddress ? (
            <EmptyState
              icon={Wallet}
              title="Connect your wallet"
              body="Connect Freighter to see multisig accounts you're a signer on."
            />
          ) : isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="No multisig accounts"
              body="You aren't a signer on any multisigs yet. Create one to get started."
              action={
                <Button onClick={() => navigate("/create-multisig")} className="gap-2">
                  <PlusCircle className="w-4 h-4" />
                  Create Multisig
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {accounts.map((account, index) => (
                <button
                  key={account.address}
                  onClick={() => navigate(`/multisig/${account.address}`)}
                  className="w-full text-left border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="font-semibold truncate">
                        {account.name || `Multisig Account ${index + 1}`}
                      </h3>
                      <p className="text-sm text-muted-foreground font-mono truncate">{account.address}</p>
                      <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
                        <span>
                          <strong className="text-foreground">{account.threshold}</strong> threshold
                        </span>
                        <span>
                          <strong className="text-foreground">{account.signers.length}</strong>{" "}
                          {account.signers.length === 1 ? "signer" : "signers"}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 self-center">View →</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "accent" | "success";
  label: string;
  value: number;
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent",
    success: "bg-success/10 text-success",
  }[tone];

  return (
    <Card>
      <CardContent className="pt-6 flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${toneClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <Icon className="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p className="text-base text-foreground mb-1">{title}</p>
      <p className="text-sm mb-4">{body}</p>
      {action}
    </div>
  );
}
