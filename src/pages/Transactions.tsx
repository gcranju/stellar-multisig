import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useParams } from "react-router-dom";
import { useEvm } from "@/context/EvmContext";
import { useEffect, useState } from "react";
import { Clock, CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
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

export default function Transactions() {
  const { address } = useParams();
  const { getMultisig, getProposals } = useEvm();
  const { toast } = useToast();
  const [multisigData, setMultisigData] = useState<any>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!address) return;
      
      setIsLoading(true);
      try {
        // Fetch multisig metadata
        const metadata = await getMultisig(address);
        if (metadata) {
          setMultisigData(metadata);
        }

        // Fetch proposals
        const proposalList = await getProposals(address);
        console.log("Proposals fetched:", proposalList);
        setProposals(proposalList);
      } catch (error) {
        console.error("Error fetching data:", error);
        toast({
          title: "Error",
          description: "Failed to load multisig data",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [address]);

  const queuedProposals = proposals.filter(p => !p.executed);
  const executedProposals = proposals.filter(p => p.executed);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = Date.now();
    const diff = now - date.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 60) return `${minutes} minutes ago`;
    if (hours < 24) return `${hours} hours ago`;
    return `${days} days ago`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-2">
          {multisigData?.name || "Multisig Account"}
        </h1>
        <p className="text-muted-foreground font-mono text-sm">{address}</p>
      </div>

      <Tabs defaultValue="queue" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="queue">
            Queue {queuedProposals.length > 0 && `(${queuedProposals.length})`}
          </TabsTrigger>
          <TabsTrigger value="history">
            History {executedProposals.length > 0 && `(${executedProposals.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4 mt-6">
          {queuedProposals.length === 0 ? (
            <Card className="shadow-md">
              <CardContent className="text-center py-12 text-muted-foreground">
                <Clock className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">No pending transactions</p>
                <p className="text-sm">All transactions have been executed</p>
              </CardContent>
            </Card>
          ) : (
            queuedProposals.map((proposal) => (
              <Card key={proposal.proposalId} className="shadow-md hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-xl">Proposal #{proposal.proposalId.toLocaleString()}</CardTitle>
                        <Badge variant="secondary">Awaiting Execution</Badge>
                      </div>
                      <CardDescription>{formatDate(Number(proposal.createdAt.toString()))}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {proposal.description && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm text-foreground">{proposal.description}</p>
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-semibold uppercase">Transaction XDR</p>
                      <code className="block p-3 bg-muted rounded text-xs font-mono break-all">
                        {proposal.xdr.substring(0, 100)}...
                      </code>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-warning" />
                        <div>
                          <p className="font-semibold text-sm">Ready for execution</p>
                          <p className="text-xs text-muted-foreground">
                            Requires {multisigData?.threshold} signatures
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" className="gap-2">
                        View Details
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-6">
          {executedProposals.length === 0 ? (
            <Card className="shadow-md">
              <CardContent className="text-center py-12 text-muted-foreground">
                <CheckCircle2 className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">No transaction history</p>
                <p className="text-sm">Executed transactions will appear here</p>
              </CardContent>
            </Card>
          ) : (
            executedProposals.map((proposal) => (
              <Card key={proposal.proposalId} className="shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-xl">Proposal #{proposal.proposalId.toLocaleString()}</CardTitle>
                        <Badge variant="default">Executed</Badge>
                      </div>
                      <CardDescription>{formatDate(Number(proposal.createdAt.toString()))}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {proposal.description && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm text-foreground">{proposal.description}</p>
                      </div>
                    )}
                    
                    {proposal.executedTxHash && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Transaction Hash:</span>
                        <code className="px-2 py-1 bg-muted rounded text-foreground font-mono">
                          {proposal.executedTxHash.substring(0, 20)}...
                        </code>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}