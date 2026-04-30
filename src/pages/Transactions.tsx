import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate, useParams } from "react-router-dom";
import { useEvm } from "@/context/EvmContext";
import { useEffect, useState } from "react";
import { Clock, CheckCircle2, ArrowRight, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Proposal {
  proposalId: bigint;
  xdr: string;
  description: string;
  executed: boolean;
  executedTxHash: string;
  createdAt: bigint;
  isDeleted: boolean;
}

interface MultisigData {
  threshold: number;
  signers: string[];
}

export default function Transactions() {
  const { address } = useParams();
  const navigate = useNavigate();
  const { getMultisig, getProposals } = useEvm();
  const { toast } = useToast();
  const [multisigData, setMultisigData] = useState<MultisigData | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const [metadata, proposalList] = await Promise.all([
          getMultisig(address),
          getProposals(address),
        ]);
        if (cancelled) return;
        if (metadata) setMultisigData(metadata);
        setProposals(Array.from(proposalList).reverse());
      } catch (error) {
        if (cancelled) return;
        toast({
          title: "Error",
          description: "Failed to load multisig data",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, getMultisig, getProposals, toast]);

  const queuedProposals = proposals.filter((p) => !p.executed);
  const executedProposals = proposals.filter((p) => p.executed);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-foreground mb-1">Transactions</h1>
          <p className="text-muted-foreground font-mono text-sm break-all">{address}</p>
        </div>
        <Button
          onClick={() => navigate(`/multisig/${address}/new-transaction`)}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          New Transaction
        </Button>
      </div>

      <Tabs defaultValue="queue" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-sm">
          <TabsTrigger value="queue">
            Queue {!isLoading && queuedProposals.length > 0 && `(${queuedProposals.length})`}
          </TabsTrigger>
          <TabsTrigger value="history">
            History {!isLoading && executedProposals.length > 0 && `(${executedProposals.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-3 mt-6">
          {isLoading ? (
            <ProposalSkeletons />
          ) : queuedProposals.length === 0 ? (
            <EmptyCard
              icon={Clock}
              title="No pending transactions"
              body="All transactions have been executed"
            />
          ) : (
            queuedProposals.map((proposal) => (
              <ProposalCard
                key={proposal.proposalId.toString()}
                proposal={proposal}
                threshold={multisigData?.threshold}
                onView={() =>
                  navigate(`/multisig/${address}/transactions/${proposal.proposalId}`)
                }
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3 mt-6">
          {isLoading ? (
            <ProposalSkeletons />
          ) : executedProposals.length === 0 ? (
            <EmptyCard
              icon={CheckCircle2}
              title="No transaction history"
              body="Executed transactions will appear here"
            />
          ) : (
            executedProposals.map((proposal) => (
              <ExecutedProposalCard key={proposal.proposalId.toString()} proposal={proposal} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function formatRelativeTime(timestamp: number) {
  const date = new Date(timestamp * 1000);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function ProposalCard({
  proposal,
  threshold,
  onView,
}: {
  proposal: Proposal;
  threshold?: number;
  onView: () => void;
}) {
  return (
    <Card className="hover:border-primary/40 transition-colors cursor-pointer" onClick={onView}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold">
                Proposal #{proposal.proposalId.toLocaleString()}
              </h3>
              <Badge variant="secondary">Awaiting Execution</Badge>
            </div>
            {proposal.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{proposal.description}</p>
            )}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{formatRelativeTime(Number(proposal.createdAt))}</span>
              {threshold !== undefined && <span>· Requires {threshold} signatures</span>}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="gap-1 shrink-0">
            View
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ExecutedProposalCard({ proposal }: { proposal: Proposal }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold">
                Proposal #{proposal.proposalId.toLocaleString()}
              </h3>
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Executed
              </Badge>
            </div>
            {proposal.description && (
              <p className="text-sm text-muted-foreground">{proposal.description}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {formatRelativeTime(Number(proposal.createdAt))}
            </p>
            {proposal.executedTxHash && (
              <code className="block text-xs font-mono text-muted-foreground break-all">
                {proposal.executedTxHash}
              </code>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <Card>
      <CardContent className="text-center py-12 text-muted-foreground">
        <Icon className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="text-base text-foreground mb-1">{title}</p>
        <p className="text-sm">{body}</p>
      </CardContent>
    </Card>
  );
}

function ProposalSkeletons() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="pt-6 space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </>
  );
}
