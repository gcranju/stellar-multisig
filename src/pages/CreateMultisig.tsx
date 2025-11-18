import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/context/WalletContext";
import { useEvm } from "@/context/EvmContext";
import { Networks, Horizon, Keypair, TransactionBuilder, BASE_FEE, Operation } from "stellar-sdk";
import {
  signTransaction,
} from "@stellar/freighter-api";

export default function CreateMultisig() {
  const [name, setName] = useState("");
  const [signers, setSigners] = useState<string[]>([""]);
  const [threshold, setThreshold] = useState(1);
  const { toast } = useToast();
  const { walletAddress: userPublicKey, network } = useWallet();
  const { createMultisig } = useEvm();


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

    try {
      console.log(network);
      const isTestnet = network == "TESTNET";
      const networkPassphrase = isTestnet
        ? Networks.TESTNET
        : Networks.PUBLIC;
      const horizonUrl = import.meta.env.VITE_HORIZON_URL;

      const server = new Horizon.Server(horizonUrl);

      // 1. Generate new multisig account keypair
      const multisigKeypair = Keypair.random();
      const multisigPublicKey = multisigKeypair.publicKey();
      console.log("Multisig Public Key:", multisigPublicKey, multisigKeypair.secret());
      // 2. Load user's Freighter wallet public key
      const userAccount = await server.loadAccount(userPublicKey);
      console.log("User Public Key:", userPublicKey);
      // 3. Create funding transaction
      const fundTx = new TransactionBuilder(userAccount, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation(
          Operation.createAccount({
            destination: multisigPublicKey,
            startingBalance: (1.5 + 0.5 * validSigners.length).toString(), // Minimum 1 XLM, plus safety buffer
          })
        )
        .setTimeout(180)
        .build();

      // 4. Ask user to sign the funding transaction via Freighter
      const signedFundXDR = await signTransaction(
        fundTx.toXDR(),{ networkPassphrase }
      ).then((signedXDR) => signedXDR.signedTxXdr,
      );
      
      console.log("Signed Funding XDR:", signedFundXDR);
      await server.submitTransaction(TransactionBuilder.fromXDR(signedFundXDR, networkPassphrase));

        // 5. Load newly created multisig account
        const multisigAccount = await server.loadAccount(multisigPublicKey);

        // 6. Build multisig configuration transaction
        let multisigConfigTx = new TransactionBuilder(multisigAccount, {
          fee: BASE_FEE,
          networkPassphrase,
        });

        validSigners.forEach((signer) => {
          multisigConfigTx = multisigConfigTx.addOperation(
            Operation.setOptions({
              signer: { ed25519PublicKey: signer, weight: 1 },
            })
          );
        });

        multisigConfigTx = multisigConfigTx.addOperation(
          Operation.setOptions({
            masterWeight: 0,
            lowThreshold: threshold,
            medThreshold: threshold,
            highThreshold: threshold,
          })
        );

        const txToSubmit = multisigConfigTx.setTimeout(180).build();

        // 6. Sign transaction with the multisig account (required to create multisig)
        txToSubmit.sign(multisigKeypair);

        console.log("Multisig Config TX XDR:", txToSubmit.toXDR());

        // 7. Submit transaction
      try {
        const result = await server.submitTransaction(txToSubmit);
        console.log("Transaction successful:", result);
        try {
          await createMultisig(
            multisigPublicKey,
            name,
            validSigners,
            threshold
          );
        } catch (error) {
          
        }
      } catch (error: any) {
        console.error("Transaction failed:", error.response?.data || error);
      }

        // 8. Notify user
        toast({
          title: "Multisig Account Created",
          description: `${name}: ${multisigPublicKey} with threshold ${threshold}`,
        });

        console.log("Multisig Public Key:", multisigPublicKey);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create multisig",
        variant: "destructive",
      });
    }
  };


  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-2">Create Multisig Account</h1>
        <p className="text-muted-foreground">Set up a new multisignature account on Stellar</p>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Multisig Configuration</CardTitle>
          <CardDescription>
            Add signers and set the required threshold for transaction approval
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-base font-semibold">
                Account Name
              </Label>
              <Input
                id="name"
                placeholder="e.g., Treasury Account, Team Wallet"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                A friendly name to identify this multisig account
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Signers</Label>
                <Button type="button" onClick={addSigner} size="sm" variant="outline" className="gap-2">
                  <PlusCircle className="w-4 h-4" />
                  Add Signer
                </Button>
              </div>

              {signers.map((signer, index) => (
                <div key={index} className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      placeholder="Stellar public key (G...)"
                      value={signer}
                      onChange={(e) => updateSigner(index, e.target.value)}
                      className="font-mono"
                    />
                  </div>
                  {signers.length > 1 && (
                    <Button
                      type="button"
                      onClick={() => removeSigner(index)}
                      size="icon"
                      variant="outline"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="threshold" className="text-base font-semibold">
                Signature Threshold
              </Label>
              <div className="flex items-center gap-4">
                <Input
                  id="threshold"
                  type="number"
                  min={1}
                  max={signers.length}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-32"
                />
                <p className="text-sm text-muted-foreground">
                  out of {signers.length} signer{signers.length !== 1 ? "s" : ""} required
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                The minimum number of signatures required to execute a transaction
              </p>
            </div>

            <div className="pt-4">
              <Button type="submit" size="lg" className="w-full">
                Create Multisig Account
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}