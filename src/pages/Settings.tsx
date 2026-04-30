import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useParams } from "react-router-dom";
import { useStellar } from "@/context/StellarContext";
import { useEffect, useState } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MultisigData {
  signers: string[];
  threshold: number;
}

export default function Settings() {
  const { address } = useParams();
  const { fetchSignersAndThresholds, createProposalToUpdateSigners } = useStellar();
  const { toast } = useToast();

  const [multisigData, setMultisigData] = useState<MultisigData | null>(null);
  const [signers, setSigners] = useState<string[]>([]);
  const [newSigner, setNewSigner] = useState("");
  const [threshold, setThreshold] = useState(2);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setIsLoading(true);

    fetchSignersAndThresholds(address)
      .then((metadata) => {
        if (cancelled || !metadata) return;
        const list = Array.from(metadata.signers);
        setMultisigData({ signers: list, threshold: metadata.threshold });
        setSigners(list);
        setThreshold(metadata.threshold);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, fetchSignersAndThresholds]);

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
    const next = signers.filter((s) => s !== signer);
    setSigners(next);
    if (threshold > next.length) setThreshold(next.length);
  };

  const handleSaveChanges = async () => {
    if (!multisigData || !address) return;

    const originalSigners = multisigData.signers;
    const hasSignerChanges =
      JSON.stringify([...signers].sort()) !== JSON.stringify([...originalSigners].sort());
    const hasThresholdChange = threshold !== multisigData.threshold;

    if (!hasSignerChanges && !hasThresholdChange) {
      toast({
        title: "No Changes Detected",
        description: "Nothing to update",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      await createProposalToUpdateSigners({
        source: address,
        oldSigners: originalSigners,
        newSigners: signers,
        threshold: hasThresholdChange ? threshold : 0,
      });

      toast({
        title: "Signers Updated",
        description: "A proposal to update signers was created successfully",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Operation failed",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-1">Multisig Settings</h1>
        <p className="text-muted-foreground font-mono text-sm break-all">{address}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Signers</CardTitle>
          <CardDescription>Manage addresses authorized to sign transactions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {signers.map((signer) => (
                <div
                  key={signer}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <code className="text-sm font-mono flex-1 mr-4 break-all">{signer}</code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSigner(signer)}
                    className="hover:bg-destructive hover:text-destructive-foreground shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Input
              placeholder="Enter Stellar address (G...)"
              value={newSigner}
              onChange={(e) => setNewSigner(e.target.value)}
              className="flex-1 font-mono"
              disabled={isLoading}
            />
            <Button onClick={addSigner} className="gap-2" disabled={isLoading}>
              <Plus className="w-4 h-4" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Signature Threshold</CardTitle>
          <CardDescription>
            Minimum number of signatures required to execute a transaction
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="threshold">Required Signatures</Label>
          <Input
            id="threshold"
            type="number"
            min={1}
            max={signers.length}
            value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value) || 1)}
            disabled={isLoading}
          />
          <p className="text-sm text-muted-foreground">
            Must be between 1 and {signers.length} (total signers)
          </p>
        </CardContent>
      </Card>

      <Button
        onClick={handleSaveChanges}
        size="lg"
        className="w-full"
        disabled={isLoading || isSaving}
      >
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          "Save Changes"
        )}
      </Button>
    </div>
  );
}
