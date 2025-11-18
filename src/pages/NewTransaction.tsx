import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useStellar } from "@/context/StellarContext";
import { Loader2 } from "lucide-react";
import { useParams } from "react-router-dom";

export default function NewContractTransaction() {
  const [destination, setDestination] = useState("");
  const [functions, setFunctions] = useState([]);
  const [selectedFunction, setSelectedFunction] = useState("");
  const [params, setParams] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jsonSchema, setJsonSchema] = useState(null);
  const { toast } = useToast();
  const { address } = useParams();

  const { fetchContractSpec, createProposal } = useStellar();

  const isValidContractId = (id) => {
    return id.startsWith("C") && id.length === 56;
  };

  const loadContractSpec = async (contractId) => {
    setIsLoading(true);
    try {
      const { jsonSchema: schema } = await fetchContractSpec(contractId);
      
      if (!schema || !schema.definitions) {
        toast({
          title: "No Schema Found",
          description: "Could not retrieve contract schema",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      setJsonSchema(schema);

      const functionList = Object.keys(schema.definitions)
        .filter(key => {
          const def = schema.definitions[key];
          return def.properties && def.properties.args;
        })
        .map(funcName => {
          const funcDef = schema.definitions[funcName];
          const argsProps = funcDef.properties.args.properties || {};
          const required = funcDef.properties.args.required || [];
          
          return {
            name: funcName,
            params: Object.keys(argsProps).map(paramName => ({
              name: paramName,
              schema: argsProps[paramName],
              required: required.includes(paramName)
            }))
          };
        });

      setFunctions(functionList);
      
      toast({
        title: "Contract Loaded",
        description: `Found ${functionList.length} functions`,
      });
    } catch (error) {
      console.error("Error fetching contract spec:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch contract specification",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDestinationChange = (e) => {
    const value = e.target.value;
    setDestination(value);
    
    if (isValidContractId(value)) {
      loadContractSpec(value);
    } else {
      if (functions.length > 0) {
        setFunctions([]);
        setSelectedFunction("");
        setParams({});
        setJsonSchema(null);
      }
    }
  };

  const handleFunctionChange = (funcName) => {
    setSelectedFunction(funcName);
    const func = functions.find((f) => f.name === funcName);
    setParams(func ? func.params.reduce((acc, p) => ({ ...acc, [p.name]: "" }), {}) : {});
  };

  const getInputPlaceholder = (paramSchema) => {
    const ref = paramSchema["$ref"];
    if (ref) {
      if (ref.includes("Address")) return "Enter Stellar address (G... or C...)";
      if (ref.includes("U32")) return "Enter unsigned 32-bit integer (0-4294967295)";
      if (ref.includes("U64")) return "Enter unsigned 64-bit integer";
      if (ref.includes("U128")) return "Enter unsigned 128-bit integer";
      if (ref.includes("U256")) return "Enter unsigned 256-bit integer";
      if (ref.includes("DataUrl")) return "Enter hex bytes (e.g., 0x1234abcd or 1234abcd)";
    }
    if (paramSchema.type === "integer") return "Enter integer value";
    if (paramSchema.type === "string") return "Enter string value";
    if (paramSchema.type === "array") return "Enter array (JSON format)";
    return "Enter value";
  };

  const hexToBase64 = (hexString) => {
    const cleanHex = hexString.startsWith("0x") ? hexString.slice(2) : hexString;
    
    if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
      throw new Error("Invalid hex string");
    }
    
    const paddedHex = cleanHex.length % 2 === 0 ? cleanHex : "0" + cleanHex;
    
    const bytes = new Uint8Array(paddedHex.length / 2);
    for (let i = 0; i < paddedHex.length; i += 2) {
      bytes[i / 2] = parseInt(paddedHex.substr(i, 2), 16);
    }
    
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const getInputType = (paramSchema) => {
    const ref = paramSchema["$ref"];
    if (ref && (ref.includes("U32") || ref.includes("I32"))) return "number";
    if (paramSchema.type === "integer") return "number";
    return "text";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!destination || !selectedFunction) {
      toast({
        title: "Error",
        description: "Please fill in required fields",
        variant: "destructive",
      });
      return;
    }

    const func = functions.find(f => f.name === selectedFunction);
    const missingParams = func.params
      .filter(p => p.required && !params[p.name])
      .map(p => p.name);

    if (missingParams.length > 0) {
      toast({
        title: "Missing Required Parameters",
        description: `Please fill in: ${missingParams.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const processedParams = { ...params };
      func.params.forEach(param => {
        const ref = param.schema["$ref"];
        if (ref && ref.includes("DataUrl") && processedParams[param.name]) {
          processedParams[param.name] = hexToBase64(processedParams[param.name]);
        }
      });

      const result = await createProposal({
        contractId: destination,
        functionName: selectedFunction,
        args: processedParams,
        schema: jsonSchema,
        source: address
      });

      console.log("Transaction XDR:", result.xdr);

      toast({
        title: "Proposal XDR Generated",
        description: `Ready to call ${selectedFunction} on ${destination}`,
      });

      // Reset
      setDestination("");
      setSelectedFunction("");
      setParams({});
      setFunctions([]);
      setJsonSchema(null);
    } catch (error) {
      console.error("Error creating proposal:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate transaction XDR",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Smart Contract Transaction</CardTitle>
          <CardDescription>Create a new invocation for a Soroban smart contract.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Contract Address *</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Stellar contract ID (C...)"
                  value={destination}
                  onChange={handleDestinationChange}
                  className="font-mono flex-1"
                  disabled={isLoading || isSubmitting}
                />
                {isLoading && <Loader2 className="h-4 w-4 animate-spin self-center" />}
              </div>
            </div>

            {functions.length > 0 && (
              <>
                <div className="space-y-2">
                  <Label>Contract Function *</Label>
                  <Select value={selectedFunction} onValueChange={handleFunctionChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select function" />
                    </SelectTrigger>
                    <SelectContent>
                      {functions.map((f) => (
                        <SelectItem key={f.name} value={f.name}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedFunction &&
                  functions
                    .find((f) => f.name === selectedFunction)
                    ?.params.map((param) => (
                      <div key={param.name} className="space-y-2">
                        <Label>
                          {param.name}
                          {param.required && <span className="text-red-500 ml-1">*</span>}
                        </Label>
                        <Input
                          type={getInputType(param.schema)}
                          placeholder={getInputPlaceholder(param.schema)}
                          value={params[param.name] || ""}
                          onChange={(e) =>
                            setParams({ ...params, [param.name]: e.target.value })
                          }
                          className="font-mono text-sm"
                          disabled={isSubmitting}
                        />
                      </div>
                    ))}
              </>
            )}

            <Button onClick={handleSubmit} className="w-full" disabled={isLoading || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Proposal...
                </>
              ) : isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading Contract...
                </>
              ) : (
                "Create Proposal"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}