import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, PlusCircle, Shield } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { useEvm } from "@/context/EvmContext";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

interface MultisigMetadata {
  address: string;
  name: string;
  signers: string[];
  threshold: number;
}

export function MultisigDropdown() {
  const navigate = useNavigate();
  const { address } = useParams();
  const { walletAddress, signerAccounts } = useWallet();
  const { getMultisig } = useEvm();
  const [multisigMetadata, setMultisigMetadata] = useState<MultisigMetadata[]>([]);

  useEffect(() => {
    if (walletAddress) {
      setMultisigMetadata([]);
      for (const account of signerAccounts) {
        getMultisig(account).then((metadata) => {
          if (metadata) {
            setMultisigMetadata((prev) => [
              ...prev,
              {
                address: account,
                name: metadata.name,
                signers: metadata.signers,
                threshold: metadata.threshold,
              },
            ]);
          } else {
            setMultisigMetadata((prev) => [
              ...prev,
              {
                address: account,
                name: "",
                signers: [],
                threshold: 0,
              },
            ]);
          }
        });
      }
    }
  }, [walletAddress, signerAccounts]);

  const currentMultisig = multisigMetadata.find(m => m.address === address);
  const displayName = currentMultisig?.name || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Select Multisig");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 font-semibold text-lg">
          <Shield className="w-5 h-5 text-primary" />
          {displayName}
          <ChevronDown className="w-4 h-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 bg-card border border-border z-50">
        {multisigMetadata.length > 0 ? (
          <>
            {multisigMetadata.map((multisig) => (
              <DropdownMenuItem
                key={multisig.address}
                onClick={() => navigate(`/multisig/${multisig.address}`)}
                className="cursor-pointer focus:bg-accent focus:text-accent-foreground"
              >
                <div className="flex flex-col gap-1 w-full">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{multisig.name || "Unnamed"}</span>
                    <span className="text-xs text-muted-foreground">
                      {multisig.threshold}/{multisig.signers.length}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    {multisig.address.slice(0, 8)}...{multisig.address.slice(-8)}
                  </span>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        ) : (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No multisig accounts
          </div>
        )}
        <DropdownMenuItem
          onClick={() => navigate("/create-multisig")}
          className="cursor-pointer focus:bg-accent focus:text-accent-foreground font-medium"
        >
          <PlusCircle className="w-4 h-4 mr-2" />
          Create New Multisig
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
