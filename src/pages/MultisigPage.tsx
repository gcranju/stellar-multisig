import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useParams } from "react-router-dom";
import { useWallet } from "@/context/WalletContext";
import { useEvm } from "@/context/EvmContext";
import { useEffect, useState } from "react";
import { Shield, Users, Clock, CheckCircle2, ArrowRight, X, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const mockQueueTransactions = [
  {
    id: "1",
    destination: "GCDNW7...EXAMPLE",
    amount: "100.00",
    signatures: 1,
    required: 2,
    status: "pending",
    created: "2 hours ago",
  },
];

const mockHistoryTransactions = [
  {
    id: "2",
    destination: "GCBXYZ...EXAMPLE",
    amount: "50.50",
    signatures: 2,
    required: 2,
    status: "executed",
    created: "1 day ago",
  },
];

export default function MultisigPage() {
  const { address } = useParams();
  const { walletAddress } = useWallet();
  const { getMultisig } = useEvm();
  const { toast } = useToast();
  const [multisigData, setMultisigData] = useState<any>(null);
  const [signers, setSigners] = useState<string[]>([]);
  const [newSigner, setNewSigner] = useState("");
  const [threshold, setThreshold] = useState(2);

  useEffect(() => {
    if (address) {
      getMultisig(address).then((metadata) => {
        if (metadata) {
          setMultisigData(metadata);
          setSigners(metadata.signers);
          setThreshold(metadata.threshold);
        }
      });
    }
  }, [address]);

  const addSigner = () => {
    if (!newSigner.trim()) return;
    if (signers.includes(newSigner)) {
      toast({
        title: "Duplicate Signer",
        description: "This address is already a signer",
        variant: "destructive",
      });
      return;
    }
    setSigners([...signers, newSigner]);
    setNewSigner("");
  };

  const removeSigner = (signer: string) => {
    if (signers.length <= 1) {
      toast({
        title: "Cannot Remove",
        description: "At least one signer is required",
        variant: "destructive",
      });
      return;
    }
    setSigners(signers.filter((s) => s !== signer));
    if (threshold > signers.length - 1) {
      setThreshold(signers.length - 1);
    }
  };

  const handleSaveChanges = () => {
    if (threshold < 1 || threshold > signers.length) {
      toast({
        title: "Invalid Threshold",
        description: `Threshold must be between 1 and ${signers.length}`,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Settings Updated",
      description: "Multisig configuration has been updated successfully",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-2">
          {multisigData?.name || "Multisig Account"}
        </h1>
        <p className="text-muted-foreground font-mono text-sm">{address}</p>
      </div>

      <Tabs defaultValue="home" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="home">Home</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="home" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="shadow-md hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Threshold</CardTitle>
                <CardDescription>Required signatures</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">
                  {multisigData?.threshold || 0}
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-md hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-accent" />
                </div>
                <CardTitle>Signers</CardTitle>
                <CardDescription>Total signers</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">
                  {multisigData?.signers.length || 0}
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-md hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center mb-4">
                  <Clock className="w-6 h-6 text-success" />
                </div>
                <CardTitle>Pending</CardTitle>
                <CardDescription>Awaiting signatures</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">0</p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Current Signers</CardTitle>
              <CardDescription>Addresses authorized to sign transactions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {multisigData?.signers.map((signer: string) => (
                  <div
                    key={signer}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <code className="text-sm font-mono">{signer}</code>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="mt-6">
          <Tabs defaultValue="queue" className="w-full">
            <TabsList>
              <TabsTrigger value="queue">Queue</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="queue" className="space-y-4 mt-6">
              {mockQueueTransactions.length === 0 ? (
                <Card className="shadow-md">
                  <CardContent className="text-center py-12 text-muted-foreground">
                    <Clock className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg mb-2">No pending transactions</p>
                    <p className="text-sm">All transactions have been executed</p>
                  </CardContent>
                </Card>
              ) : (
                mockQueueTransactions.map((tx) => (
                  <Card key={tx.id} className="shadow-md hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <CardTitle className="text-xl">Payment Transaction</CardTitle>
                            <Badge variant="secondary">Awaiting Signatures</Badge>
                          </div>
                          <CardDescription>{tx.created}</CardDescription>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-foreground">{tx.amount} XLM</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">To:</span>
                          <code className="px-2 py-1 bg-muted rounded text-foreground font-mono">
                            {tx.destination}
                          </code>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-warning" />
                            <div>
                              <p className="font-semibold text-sm">
                                {tx.signatures} of {tx.required} signatures collected
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {tx.required - tx.signatures} more signature needed
                              </p>
                            </div>
                          </div>
                          <Button variant="outline" className="gap-2">
                            Sign
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
              {mockHistoryTransactions.length === 0 ? (
                <Card className="shadow-md">
                  <CardContent className="text-center py-12 text-muted-foreground">
                    <CheckCircle2 className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg mb-2">No transaction history</p>
                    <p className="text-sm">Executed transactions will appear here</p>
                  </CardContent>
                </Card>
              ) : (
                mockHistoryTransactions.map((tx) => (
                  <Card key={tx.id} className="shadow-md">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <CardTitle className="text-xl">Payment Transaction</CardTitle>
                            <Badge variant="default">Executed</Badge>
                          </div>
                          <CardDescription>{tx.created}</CardDescription>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-foreground">{tx.amount} XLM</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">To:</span>
                        <code className="px-2 py-1 bg-muted rounded text-foreground font-mono">
                          {tx.destination}
                        </code>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6 mt-6">
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Current Signers</CardTitle>
              <CardDescription>Manage addresses authorized to sign transactions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {signers.map((signer) => (
                  <div
                    key={signer}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <code className="text-sm font-mono flex-1 mr-4">{signer}</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSigner(signer)}
                      className="hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-4">
                <Input
                  placeholder="Enter Stellar address (G...)"
                  value={newSigner}
                  onChange={(e) => setNewSigner(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={addSigner} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Signature Threshold</CardTitle>
              <CardDescription>
                Minimum number of signatures required to execute a transaction
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="threshold">Required Signatures</Label>
                <Input
                  id="threshold"
                  type="number"
                  min={1}
                  max={signers.length}
                  value={threshold}
                  onChange={(e) => setThreshold(parseInt(e.target.value))}
                />
                <p className="text-sm text-muted-foreground">
                  Must be between 1 and {signers.length} (total signers)
                </p>
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSaveChanges} size="lg" className="w-full">
            Save Changes
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
