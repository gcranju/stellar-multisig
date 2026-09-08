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
import { ErrorPanel } from "@/components/ErrorPanel";
import { describeError, TransactionPendingError, type FriendlyError } from "@/lib/errors";
import { chainContext } from "@/lib/network";

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
  const {
    networkPassphrase,
    signAndExecuteProposal,
    signProposal,
    fetchSignersAndThresholds,
    confirmPendingExecution,
  } = useStellar();
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
  const [error, setError] = useState<FriendlyError | null>(null);
  // Hash of a submitted transaction the RPC had not confirmed before we stopped polling.
  const [pendingHash, setPendingHash] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  /** Network + explorer rows attached to every error this page reports. */
  const errorContext = () => ({
    ...chainContext(networkPassphrase),
    account: address,
  });

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
          } catch (err) {
            console.error("Error decoding transaction XDR:", err);
            setError({
              title: "Could not decode XDR",
              message: "The stored envelope could not be parsed, so the operation summary is unavailable.",
              hint: "The proposal itself is unaffected - it can still be signed and executed.",
              severity: "warning",
            });
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Error loading transaction details:", err);
        setError(describeError(err, { ...chainContext(networkPassphrase), account: address }));
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
    setError(null);
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
    } catch (err) {
      console.error("Error approving transaction:", err);
      setError(describeError(err, errorContext()));
    } finally {
      setIsApproving(false);
    }
  };

  const handleDelete = async () => {
    if (!proposal || !address || !proposalId) return;
    setError(null);
    setIsDeleting(true);
    try {
      await deleteProposal(address, parseInt(proposalId));
      toast({ title: "Success", description: "Proposal deleted" });
      navigate(`/multisig/${address}/transactions`);
    } catch (err) {
      console.error("Error deleting proposal:", err);
      setError(describeError(err, errorContext()));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExecute = async () => {
    if (!proposal || !multisigData || !address || !proposalId) return;
    setIsExecuting(true);
    setError(null);
    setPendingHash(null);
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
    } catch (err) {
      console.error("Error executing proposal:", err);
      // Submitted but unconfirmed: keep the hash so the user can re-check
      // instead of re-signing a transaction that may already have landed.
      if (err instanceof TransactionPendingError) {
        setPendingHash(err.hash);
      }
      setError(describeError(err, errorContext()));
    } finally {
      setIsExecuting(false);
    }
  };

  /** Re-check a transaction whose confirmation we stopped waiting for. */
  const handleCheckPending = async () => {
    if (!pendingHash || !address || !proposalId) return;
    setIsChecking(true);
    try {
      const outcome = await confirmPendingExecution({
        multisigAddress: address,
        proposalId: parseInt(proposalId),
        hash: pendingHash,
      });

      if (outcome === "SUCCESS") {
        setError(null);
        setPendingHash(null);
        toast({ title: "Confirmed", description: "The transaction was included and is now marked executed" });
        navigate(`/multisig/${address}/transactions`);
      } else if (outcome === "FAILED") {
        setPendingHash(null);
        setError({
          title: "Transaction failed",
          message: "The transaction was included in a ledger but the contract call failed.",
          hint: "Nothing changed on-chain. Review the arguments and create a new proposal.",
        });
      } else {
        toast({
          title: "Still pending",
          description: "The RPC has no final status yet. Try again in a few seconds.",
        });
      }
    } catch (err) {
      console.error("Error checking transaction status:", err);
      setError(describeError(err, errorContext()));
    } finally {
      setIsChecking(false);
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
        {error ? (
          <ErrorPanel error={error} onDismiss={() => setError(null)} />
        ) : (
          <Card>
            <CardContent className="text-center py-12">
              <p className="text-lg text-muted-foreground">Transaction not found</p>
            </CardContent>
          </Card>
        )}
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

                  {pendingHash && (
                    <Button
                      onClick={handleCheckPending}
                      disabled={isChecking}
                      className="w-full"
                      variant="secondary"
                    >
                      {isChecking ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        "Check status"
                      )}
                    </Button>
                  )}

                  <Button
                    onClick={handleExecute}
                    disabled={!thresholdReached || isExecuting || !!pendingHash}
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

                  <ErrorPanel error={error} onDismiss={() => setError(null)} />

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
