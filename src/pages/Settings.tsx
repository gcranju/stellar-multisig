import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useParams } from "react-router-dom";
import { useEvm } from "@/context/EvmContext";
import { useEffect, useState } from "react";
import { X, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { address } = useParams();
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

      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-1">
          <TabsTrigger value="settings">Multisig Settings</TabsTrigger>
        </TabsList>

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
