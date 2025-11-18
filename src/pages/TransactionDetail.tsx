import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useParams, useNavigate } from "react-router-dom";
import { useEvm } from "@/context/EvmContext";
import { useStellar } from "@/context/StellarContext";
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

export default function TransactionDetail() {
  const { address, proposalId } = useParams();
  const navigate = useNavigate();
  const { getMultisig, getProposal } = useEvm();
  const { server, networkPassphrase } = useStellar();
  const { toast } = useToast();
  const [multisigData, setMultisigData] = useState<any>(null);
  const [proposal, setProposal] = useState<any>(null);
  const [decodedTx, setDecodedTx] = useState<DecodedTransaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [approvalCount, setApprovalCount] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      if (!address || !proposalId) return;
      
      setIsLoading(true);
      try {
        // Fetch multisig metadata
        const metadata = await getMultisig(address);
        if (metadata) {
          setMultisigData(metadata);
        }

        // Fetch proposal
        const proposalData = await getProposal(address, parseInt(proposalId));
        if (proposalData) {
          setProposal(proposalData);
          
          // Decode XDR
          try {
            const tx = TransactionBuilder.fromXDR(proposalData.xdr, networkPassphrase) as Transaction;
            
            setDecodedTx({
              source: tx.source,
              operations: tx.operations.map((op: any) => ({
                type: op.type,
                ...op,
              })),
              fee: tx.fee,
              sequenceNumber: tx.sequence,
            });
          } catch (error) {
            console.error("Error decoding XDR:", error);
            toast({
              title: "Error",
              description: "Failed to decode transaction XDR",
              variant: "destructive",
            });
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        toast({
          title: "Error",
          description: "Failed to load transaction details",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [address, proposalId]);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      // TODO: Implement approval logic
      // This would involve signing the transaction and submitting to contract
      toast({
        title: "Success",
        description: "Transaction approved",
      });
      setApprovalCount(prev => prev + 1);
    } catch (error) {
      console.error("Error approving:", error);
      toast({
        title: "Error",
        description: "Failed to approve transaction",
        variant: "destructive",
      });
    } finally {
      setIsApproving(false);
    }
  };

  const handleExecute = async () => {
    if (!proposal || !multisigData) return;
    
    setIsExecuting(true);
    try {
      // TODO: Implement execution logic
      // This would submit the transaction to Stellar network
      toast({
        title: "Success",
        description: "Transaction executed successfully",
      });
      navigate(`/multisig/${address}/transactions`);
    } catch (error) {
      console.error("Error executing:", error);
      toast({
        title: "Error",
        description: "Failed to execute transaction",
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  const thresholdReached = approvalCount >= (multisigData?.threshold || 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="space-y-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate(`/multisig/${address}/transactions`)}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Transactions
        </Button>
        <Card className="shadow-md">
          <CardContent className="text-center py-12">
            <p className="text-lg text-muted-foreground">Transaction not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button 
          variant="ghost" 
          onClick={() => navigate(`/multisig/${address}/transactions`)}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Transactions
        </Button>
        <div className="flex items-center gap-2">
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
      </div>

      <div>
        <h1 className="text-4xl font-bold text-foreground mb-2">
          Transaction #{proposalId}
        </h1>
        <p className="text-muted-foreground">
          Created {formatDate(Number(proposal.createdAt.toString()))}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-md">
          <CardHeader>
            <CardTitle>Transaction Details</CardTitle>
            <CardDescription>Decoded transaction information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {proposal.description && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">Description</h3>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-foreground">{proposal.description}</p>
                </div>
              </div>
            )}

            {decodedTx && (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">Source Account</h3>
                  <code className="block p-3 bg-muted rounded text-sm font-mono break-all">
                    {decodedTx.source}
                  </code>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">Operations</h3>
                  <div className="space-y-2">
                    {decodedTx.operations.map((op, idx) => (
                      <div key={idx} className="p-3 bg-muted rounded-lg">
                        <p className="text-sm font-semibold text-foreground mb-1">
                          {op.type}
                        </p>
                        <pre className="text-xs text-muted-foreground overflow-auto">
                          {JSON.stringify(op, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">Fee</h3>
                    <p className="text-sm font-mono text-foreground">{decodedTx.fee} stroops</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">Sequence</h3>
                    <p className="text-sm font-mono text-foreground">{decodedTx.sequenceNumber}</p>
                  </div>
                </div>
              </>
            )}

            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Raw XDR</h3>
              <code className="block p-3 bg-muted rounded text-xs font-mono break-all max-h-32 overflow-auto">
                {proposal.xdr}
              </code>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Approval Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Threshold</span>
                  <span className="text-2xl font-bold text-foreground">
                    {approvalCount} / {multisigData?.threshold}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ 
                      width: `${Math.min((approvalCount / (multisigData?.threshold || 1)) * 100, 100)}%` 
                    }}
                  />
                </div>
              </div>

              {!proposal.executed && (
                <div className="space-y-2">
                  <Button 
                    onClick={handleApprove}
                    disabled={isApproving || proposal.executed}
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
                    disabled={!thresholdReached || isExecuting || proposal.executed}
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
                      Need {multisigData?.threshold - approvalCount} more approval(s)
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

          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Signers</CardTitle>
              <CardDescription>{multisigData?.signers.length || 0} authorized</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {multisigData?.signers.map((signer: string, idx: number) => (
                  <div key={idx} className="p-2 bg-muted rounded text-xs font-mono break-all">
                    {signer}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
