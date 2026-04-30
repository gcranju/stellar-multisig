import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useParams } from "react-router-dom";
import { useEvm } from "@/context/EvmContext";
import { useEffect, useState } from "react";
import { Clock, Shield, Users } from "lucide-react";
import { useStellar } from "@/context/StellarContext";

interface MultisigState {
  signers: string[];
  threshold: number;
}

export default function MultisigPage() {
  const { address } = useParams();
  const { getMultisig } = useEvm();
  const { fetchSignersAndThresholds } = useStellar();

  const [walletName, setWalletName] = useState("");
  const [data, setData] = useState<MultisigState>({ signers: [], threshold: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setIsLoading(true);

    Promise.all([getMultisig(address), fetchSignersAndThresholds(address)])
      .then(([metadata, chain]) => {
        if (cancelled) return;
        if (metadata) setWalletName(metadata.name);
        if (chain) {
          setData({
            signers: Array.from(chain.signers),
            threshold: chain.threshold,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, getMultisig, fetchSignersAndThresholds]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-1">
          {walletName || "Multisig"}
        </h1>
        <p className="text-muted-foreground font-mono text-sm break-all">{address}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={Shield}
          tone="primary"
          label="Threshold"
          description="Required signatures"
          value={isLoading ? null : data.threshold}
        />
        <StatCard
          icon={Users}
          tone="accent"
          label="Signers"
          description="Total signers"
          value={isLoading ? null : data.signers.length}
        />
        <StatCard
          icon={Clock}
          tone="success"
          label="Pending"
          description="Awaiting signatures"
          value={isLoading ? null : 0}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Signers</CardTitle>
          <CardDescription>Addresses authorized to sign transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data.signers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No signers configured.</p>
          ) : (
            <div className="space-y-2">
              {data.signers.map((signer) => (
                <div
                  key={signer}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <code className="text-sm font-mono break-all">{signer}</code>
                </div>
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
  description,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "accent" | "success";
  label: string;
  description: string;
  value: number | null;
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent",
    success: "bg-success/10 text-success",
  }[tone];

  return (
    <Card>
      <CardHeader>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${toneClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        <CardTitle className="text-base">{label}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {value === null ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-3xl font-bold text-foreground">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
