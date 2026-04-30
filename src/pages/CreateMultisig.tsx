import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, PlusCircle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/context/WalletContext";
import { useEvm } from "@/context/EvmContext";
import { Horizon, Keypair, TransactionBuilder, BASE_FEE, Operation } from "stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { useNavigate } from "react-router-dom";

export default function CreateMultisig() {
  const [name, setName] = useState("");
  const [signers, setSigners] = useState<string[]>([""]);
  const [threshold, setThreshold] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { walletAddress: userPublicKey, networkPassphrase } = useWallet();
  const { createMultisig } = useEvm();
  const navigate = useNavigate();


  const addSigner = () => {
    setSigners([...signers, ""]);
  };

  const removeSigner = (index: number) => {
    if (signers.length > 1) {
      const newSigners = signers.filter((_, i) => i !== index);
      setSigners(newSigners);
      if (threshold > newSigners.length) {
        setThreshold(newSigners.length);
      }
    }
  };

  const updateSigner = (index: number, value: string) => {
    const newSigners = [...signers];
    newSigners[index] = value;
    setSigners(newSigners);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Please provide a name for the multisig account",
        variant: "destructive",
      });
      return;
    }

    const validSigners = signers.filter((s) => s.trim() !== "");

    if (validSigners.length < 1) {
      toast({
        title: "Error",
        description: "Please add at least one signer",
        variant: "destructive",
      });
      return;
    }

    if (threshold < 1 || threshold > validSigners.length) {
      toast({
        title: "Error",
        description: "Threshold must be between 1 and number of signers",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const horizonUrl = import.meta.env.VITE_HORIZON_URL;
      const server = new Horizon.Server(horizonUrl);

      const multisigKeypair = Keypair.random();
      const multisigPublicKey = multisigKeypair.publicKey();
      const userAccount = await server.loadAccount(userPublicKey);

      const fundTx = new TransactionBuilder(userAccount, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation(
          Operation.createAccount({
            destination: multisigPublicKey,
            startingBalance: (1.5 + 0.5 * validSigners.length).toString(),
          })
        )
        .setTimeout(180)
        .build();

      const signedFundXDR = await signTransaction(fundTx.toXDR(), {
        networkPassphrase,
      }).then((signedXDR) => signedXDR.signedTxXdr);

      await server.submitTransaction(
        TransactionBuilder.fromXDR(signedFundXDR, networkPassphrase),
      );

      const multisigAccount = await server.loadAccount(multisigPublicKey);

      let multisigConfigTx = new TransactionBuilder(multisigAccount, {
        fee: BASE_FEE,
        networkPassphrase,
      });

      validSigners.forEach((signer) => {
        multisigConfigTx = multisigConfigTx.addOperation(
          Operation.setOptions({ signer: { ed25519PublicKey: signer, weight: 1 } }),
        );
      });

      multisigConfigTx = multisigConfigTx.addOperation(
        Operation.setOptions({
          masterWeight: 0,
          lowThreshold: threshold,
          medThreshold: threshold,
          highThreshold: threshold,
        }),
      );

      const txToSubmit = multisigConfigTx.setTimeout(180).build();
      txToSubmit.sign(multisigKeypair);

      await server.submitTransaction(txToSubmit);
      await createMultisig(multisigPublicKey, name, validSigners, threshold);

      toast({
        title: "Multisig Account Created",
        description: `${name}: ${multisigPublicKey}`,
      });
      navigate(`/multisig/${multisigPublicKey}`);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create multisig",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-1">Create Multisig Account</h1>
        <p className="text-muted-foreground">Set up a new multisignature account on Stellar</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Multisig Configuration</CardTitle>
          <CardDescription>
            Add signers and set the required threshold for transaction approval
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Account Name</Label>
              <Input
                id="name"
                placeholder="e.g., Treasury Account, Team Wallet"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-sm text-muted-foreground">
                A friendly name to identify this multisig account
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Signers</Label>
                <Button
                  type="button"
                  onClick={addSigner}
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  disabled={isSubmitting}
                >
                  <PlusCircle className="w-4 h-4" />
                  Add Signer
                </Button>
              </div>

              {signers.map((signer, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="Stellar public key (G...)"
                    value={signer}
                    onChange={(e) => updateSigner(index, e.target.value)}
                    className="font-mono flex-1"
                    disabled={isSubmitting}
                  />
                  {signers.length > 1 && (
                    <Button
                      type="button"
                      onClick={() => removeSigner(index)}
                      size="icon"
                      variant="outline"
                      disabled={isSubmitting}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="threshold">Signature Threshold</Label>
              <div className="flex items-center gap-4">
                <Input
                  id="threshold"
                  type="number"
                  min={1}
                  max={signers.length}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-32"
                  disabled={isSubmitting}
                />
                <p className="text-sm text-muted-foreground">
                  out of {signers.length} signer{signers.length !== 1 ? "s" : ""} required
                </p>
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Multisig Account"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}