import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useStellar } from "@/context/StellarContext";
import { Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorPanel } from "@/components/ErrorPanel";
import { cn } from "@/lib/utils";
import { describeError, type FriendlyError } from "@/lib/errors";
import { chainContext } from "@/lib/network";

export default function NewContractTransaction() {
  const [destination, setDestination] = useState("");
  const [functions, setFunctions] = useState([]);
  const [selectedFunction, setSelectedFunction] = useState("");
  const [params, setParams] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jsonSchema, setJsonSchema] = useState(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const { toast } = useToast();
  const { address } = useParams();
  const navigate = useNavigate();
  

  const { fetchContractSpec, createProposal, networkPassphrase } = useStellar();

  /** Network + explorer rows attached to every error this page reports. */
  const errorContext = () => ({
    ...chainContext(networkPassphrase),
    contractId: destination || undefined,
    functionName: selectedFunction || undefined,
  });

  const isValidContractId = (id) => {
    return id.startsWith("C") && id.length === 56;
  };

  const loadContractSpec = async (contractId) => {
    setIsLoading(true);
    setError(null);
    try {
      const { jsonSchema: schema } = await fetchContractSpec(contractId);
      
      if (!schema || !schema.definitions) {
        setError({
          title: "No interface found",
          message: "This contract did not expose a spec, so its functions cannot be listed.",
          hint: "Contracts built without an embedded spec must be invoked with a hand-built XDR.",
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
    } catch (err) {
      console.error("Error fetching contract spec:", err);
      setError(describeError(err, errorContext()));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDestinationChange = (e) => {
    const value = e.target.value;
    setDestination(value);
    
    setError(null);

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
    setError(null);
    const func = functions.find((f) => f.name === funcName);
    setParams(
      func
        ? func.params.reduce(
            (acc, p) => ({ ...acc, [p.name]: isBoolParam(p.schema) ? false : "" }),
            {}
          )
        : {}
    );
  };

  const isBoolParam = (paramSchema) => {
    const ref = paramSchema["$ref"];
    if (ref && /\/Bool$/i.test(ref)) return true;
    return paramSchema.type === "boolean";
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

  const getInputType = (paramSchema) => {
    const ref = paramSchema["$ref"];
    if (ref && (ref.includes("U32") || ref.includes("I32"))) return "number";
    if (paramSchema.type === "integer") return "number";
    return "text";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError(null);

    if (!destination || !selectedFunction) {
      setError({
        title: "Incomplete proposal",
        message: "Choose a contract and a function before creating a proposal.",
      });
      return;
    }

    const func = functions.find(f => f.name === selectedFunction);
    const missingParams = func.params
      .filter(p => p.required && !isBoolParam(p.schema) && !params[p.name])
      .map(p => p.name);

    if (missingParams.length > 0) {
      setError({
        title: "Missing required arguments",
        message:
          missingParams.length === 1
            ? `"${missingParams[0]}" needs a value.`
            : `These arguments need values: ${missingParams.join(", ")}.`,
        field: missingParams[0],
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const processedParams = { ...params };
      func.params.forEach(param => {
        const ref = param.schema["$ref"];
        if (ref && ref.includes("DataUrl") && processedParams[param.name]) {
          processedParams[param.name] = processedParams[param.name].startsWith("0x")
            ? processedParams[param.name].slice(2)
            : processedParams[param.name];
        }
      });

      await createProposal({
        contractId: destination,
        functionName: selectedFunction,
        args: processedParams,
        schema: jsonSchema,
        source: address
      });

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
      navigate(`/multisig/${address}/transactions`);
    } catch (err) {
      console.error("Error creating proposal:", err);
      setError(describeError(err, errorContext()));
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
                        {isBoolParam(param.schema) ? (
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={params[param.name] === true}
                              onCheckedChange={(checked) =>
                                setParams({ ...params, [param.name]: checked })
                              }
                              disabled={isSubmitting}
                            />
                            <span className="font-mono text-sm text-muted-foreground">
                              {params[param.name] === true ? "true" : "false"}
                            </span>
                          </div>
                        ) : (
                          <Input
                            type={getInputType(param.schema)}
                            placeholder={getInputPlaceholder(param.schema)}
                            value={params[param.name] || ""}
                            onChange={(e) => {
                              if (error?.field === param.name) setError(null);
                              setParams({ ...params, [param.name]: e.target.value });
                            }}
                            aria-invalid={error?.field === param.name}
                            className={cn(
                              "font-mono text-sm",
                              error?.field === param.name &&
                                "border-destructive focus-visible:ring-destructive"
                            )}
                            disabled={isSubmitting}
                          />
                        )}
                      </div>
                    ))}
              </>
            )}

            <ErrorPanel error={error} onDismiss={() => setError(null)} />

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