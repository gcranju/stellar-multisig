import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useParams, useNavigate } from "react-router-dom";
import { useEvm } from "@/context/EvmContext";
import { useStellar } from "@/context/StellarContext";
import { useWallet } from "@/context/WalletContext";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock, Loader2, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TransactionBuilder, Transaction } from "@stellar/stellar-sdk";

interface DecodedTransaction {
  source: string;
  operations: any[];
  fee: string;
  sequenceNumber: string;
}

interface MultisigData {
  threshold: number;
  signers: string[];
}

export default function TransactionDetail() {
  const { address, proposalId } = useParams();
  const navigate = useNavigate();
  const { getProposal, deleteProposal } = useEvm();
  const { networkPassphrase, signAndExecuteProposal, signProposal, fetchSignersAndThresholds } = useStellar();
  const { walletAddress } = useWallet();
  const { toast } = useToast();
  const [multisigData, setMultisigData] = useState<MultisigData | null>(null);
  const [proposal, setProposal] = useState<any>(null);
  const [decodedTx, setDecodedTx] = useState<DecodedTransaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [approvalCount, setApprovalCount] = useState(0);

  useEffect(() => {
    if (!address || !proposalId) return;
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const [metadata, proposalData] = await Promise.all([
          fetchSignersAndThresholds(address),
          getProposal(address, parseInt(proposalId)),
        ]);
        if (cancelled) return;

        if (metadata) setMultisigData(metadata);

        if (proposalData) {
          setProposal(proposalData);
          setApprovalCount(proposalData.signers?.signedSigners.length ?? 0);

          try {
            const tx = TransactionBuilder.fromXDR(proposalData.xdr, networkPassphrase) as Transaction;
            setDecodedTx({
              source: tx.source,
              operations: tx.operations.map((op: any) => ({ type: op.type, ...op })),
              fee: tx.fee,
              sequenceNumber: tx.sequence,
            });
          } catch {
            toast({
              title: "Error",
              description: "Failed to decode transaction XDR",
              variant: "destructive",
            });
          }
        }
      } catch (error) {
        if (cancelled) return;
        toast({
          title: "Error",
          description: "Failed to load transaction details",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, proposalId, getProposal, fetchSignersAndThresholds, networkPassphrase, toast]);

  const handleApprove = async () => {
    if (!proposal || !address || !proposalId) return;
    setIsApproving(true);
    try {
      await signProposal({
        multisigAddress: address,
        proposalId: parseInt(proposalId),
        signer: walletAddress,
        xdr: proposal.xdr,
      });

      const proposalData = await getProposal(address, parseInt(proposalId));
      if (proposalData) {
        setApprovalCount(proposalData.signers?.signedSigners.length ?? 0);
      }

      toast({ title: "Success", description: "Transaction approved" });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to approve transaction",
        variant: "destructive",
      });
    } finally {
      setIsApproving(false);
    }
  };

  const handleDelete = async () => {
    if (!proposal || !address || !proposalId) return;
    setIsDeleting(true);
    try {
      await deleteProposal(address, parseInt(proposalId));
      toast({ title: "Success", description: "Proposal deleted" });
      navigate(`/multisig/${address}/transactions`);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete proposal",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExecute = async () => {
    if (!proposal || !multisigData || !address || !proposalId) return;
    setIsExecuting(true);
    try {
      const shouldSign = proposal.signers.signedSigners.length < multisigData.threshold;
      await signAndExecuteProposal({
        multisigAddress: address,
        proposalId: parseInt(proposalId),
        signer: walletAddress!,
        xdr: proposal.xdr,
        sign: shouldSign,
      });
      toast({ title: "Success", description: "Transaction executed successfully" });
      navigate(`/multisig/${address}/transactions`);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to execute transaction",
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const formatDate = (timestamp: number) => new Date(timestamp * 1000).toLocaleString();

  const threshold = multisigData?.threshold ?? 0;
  const thresholdReached = approvalCount >= threshold;
  const remaining = Math.max(threshold - approvalCount, 0);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-96" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate(`/multisig/${address}/transactions`)}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Transactions
        </Button>
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-lg text-muted-foreground">Transaction not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => navigate(`/multisig/${address}/transactions`)}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Transactions
        </Button>
        {proposal.executed ? (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Executed
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1">
            <Clock className="w-3 h-3" />
            Pending
          </Badge>
        )}
      </div>

      <div>
        <h1 className="text-3xl font-bold text-foreground mb-1">
          Transaction #{proposalId}
        </h1>
        <p className="text-muted-foreground">
          Created {formatDate(Number(proposal.createdAt))}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Transaction Details</CardTitle>
            <CardDescription>Decoded transaction information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {proposal.description && (
              <Section label="Description">
                <p className="text-sm text-foreground">{proposal.description}</p>
              </Section>
            )}

            {decodedTx && (
              <>
                <Section label="Source Account">
                  <code className="block p-3 bg-muted rounded text-sm font-mono break-all">
                    {decodedTx.source}
                  </code>
                </Section>

                <Section label="Operations">
                  <div className="space-y-2">
                    {decodedTx.operations.map((op, idx) => (
                      <div key={idx} className="p-3 bg-muted rounded-lg">
                        <p className="text-sm font-semibold text-foreground mb-1">{op.type}</p>
                        <pre className="text-xs text-muted-foreground overflow-auto">
                          {JSON.stringify(op, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </Section>

                <div className="grid grid-cols-2 gap-4">
                  <Section label="Fee">
                    <p className="text-sm font-mono text-foreground">{decodedTx.fee} stroops</p>
                  </Section>
                  <Section label="Sequence">
                    <p className="text-sm font-mono text-foreground">{decodedTx.sequenceNumber}</p>
                  </Section>
                </div>
              </>
            )}

            <Section label="Raw XDR">
              <code className="block p-3 bg-muted rounded text-xs font-mono break-all max-h-32 overflow-auto">
                {proposal.xdr}
              </code>
            </Section>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Approval Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Approvals</span>
                  <span className="text-2xl font-bold text-foreground">
                    {approvalCount} / {threshold}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{
                      width: `${threshold ? Math.min((approvalCount / threshold) * 100, 100) : 0}%`,
                    }}
                  />
                </div>
              </div>

              {!proposal.executed && (
                <div className="space-y-2">
                  <Button
                    onClick={handleApprove}
                    disabled={isApproving}
                    className="w-full"
                    variant="outline"
                  >
                    {isApproving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Approving...
                      </>
                    ) : (
                      "Approve Transaction"
                    )}
                  </Button>

                  <Button
                    onClick={handleExecute}
                    disabled={!thresholdReached || isExecuting}
                    className="w-full"
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Executing...
                      </>
                    ) : (
                      "Execute Transaction"
                    )}
                  </Button>

                  {!thresholdReached && (
                    <p className="text-xs text-center text-muted-foreground">
                      {remaining} more approval{remaining === 1 ? "" : "s"} required
                    </p>
                  )}
                </div>
              )}

              {proposal.executed && proposal.executedTxHash && (
                <div className="p-3 bg-success/10 rounded-lg border border-success/20">
                  <p className="text-sm text-success font-semibold mb-1">Executed</p>
                  <code className="text-xs text-muted-foreground break-all">
                    {proposal.executedTxHash}
                  </code>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Signers</CardTitle>
              <CardDescription>{multisigData?.signers.length ?? 0} authorized</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {multisigData?.signers.map((signer, idx) => (
                  <div key={idx} className="p-2 bg-muted rounded text-xs font-mono break-all">
                    {signer}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {!proposal.executed && (
            <Button
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-full"
              variant="destructive"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Proposal"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground mb-2">{label}</h3>
      {children}
    </div>
  );
}
