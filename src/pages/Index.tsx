import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useEvm } from "@/context/EvmContext";
import { useEffect, useState } from "react";
import { PlusCircle, Shield, Users, Wallet } from "lucide-react";

interface MultisigAccount {
  address: string;
  name: string;
  threshold: number;
  signers: string[];
}

const Index = () => {
  const navigate = useNavigate();
  const { contract } = useEvm();
  const [multisigs, setMultisigs] = useState<MultisigAccount[]>([]);

  useEffect(() => {
    // In a real app, you'd fetch all multisigs from the contract
    // For now, we'll show a placeholder
    const loadMultisigs = async () => {
      // TODO: Implement fetching all multisigs from contract
      // This would require adding a method to get all multisigs
      setMultisigs([]);
    };
    
    if (contract) {
      loadMultisigs();
    }
  }, [contract]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground mb-2">Dashboard</h1>
          <p className="text-muted-foreground">Manage your multisig accounts</p>
        </div>
        <Button 
          onClick={() => navigate("/create-multisig")} 
          size="lg"
          className="gap-2"
        >
          <PlusCircle className="w-5 h-5" />
          Create New Multisig
        </Button>
      </div>

      {multisigs.length === 0 ? (
        <Card className="shadow-md">
          <CardContent className="text-center py-16">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mx-auto mb-6">
              <Wallet className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-2">No Multisig Accounts Yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Create your first multisig account to get started with secure multi-signature transactions
            </p>
            <Button 
              onClick={() => navigate("/create-multisig")}
              size="lg"
              className="gap-2"
            >
              <PlusCircle className="w-5 h-5" />
              Create Your First Multisig
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {multisigs.map((multisig) => (
            <Card 
              key={multisig.address}
              className="shadow-md hover:shadow-lg transition-all cursor-pointer"
              onClick={() => navigate(`/multisig/${multisig.address}`)}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-primary" />
                  {multisig.name}
                </CardTitle>
                <CardDescription className="font-mono text-xs truncate">
                  {multisig.address}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    <span className="text-sm text-muted-foreground">Threshold</span>
                  </div>
                  <span className="font-bold text-foreground">{multisig.threshold}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-accent" />
                    <span className="text-sm text-muted-foreground">Signers</span>
                  </div>
                  <span className="font-bold text-foreground">{multisig.signers.length}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Index;
