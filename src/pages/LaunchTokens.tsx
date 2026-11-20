import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Rocket, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useEvm } from "@/context/EvmContext";
import {
  useStellar,
  MAX_LAUNCH_TOKENS,
  type LaunchToken,
  type LaunchTokenStatus,
} from "@/context/StellarContext";
import { ErrorPanel } from "@/components/ErrorPanel";
import { describeError, type FriendlyError } from "@/lib/errors";
import { chainContext } from "@/lib/network";

type Row = { code: string; amount: string; recipient: string };

const emptyRow = (): Row => ({ code: "", amount: "", recipient: "" });

const ASSET_CODE = /^[A-Za-z0-9]{1,12}$/;
const AMOUNT = /^(?!0+(\.0+)?$)\d+(\.\d{1,7})?$/;
const ACCOUNT = /^G[A-Z2-7]{55}$/;

export default function LaunchTokens() {
  const { address } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { inspectLaunchTokens, deployAssetContract, createProposalToLaunchTokens, networkPassphrase } =
    useStellar();
  const { getMultisig } = useEvm();

  // The registry rejects proposals for accounts it has no record of.
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null);
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    getMultisig(address).then((metadata) => {
      if (!cancelled) setIsRegistered(!!metadata);
    });
    return () => {
      cancelled = true;
    };
  }, [address, getMultisig]);

  const [defaultRecipient, setDefaultRecipient] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [bulk, setBulk] = useState("");
  const [statuses, setStatuses] = useState<LaunchTokenStatus[] | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [deploying, setDeploying] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);

  /** Rows with the default recipient filled in; blank rows are ignored. */
  const tokens: LaunchToken[] = useMemo(
    () =>
      rows
        .filter((r) => r.code.trim() || r.amount.trim())
        .map((r) => ({
          code: r.code.trim(),
          amount: r.amount.trim(),
          recipient: (r.recipient.trim() || defaultRecipient.trim()),
        })),
    [rows, defaultRecipient],
  );

  const updateRow = (index: number, patch: Partial<Row>) => {
    setStatuses(null);
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeRow = (index: number) => {
    setStatuses(null);
    setRows((prev) => (prev.length === 1 ? [emptyRow()] : prev.filter((_, i) => i !== index)));
  };

  /** Parse "CODE AMOUNT [RECIPIENT]" lines (spaces, commas or tabs) into rows. */
  const applyBulk = () => {
    const parsed = bulk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [code = "", amount = "", recipient = ""] = line.split(/[\s,]+/);
        return { code, amount, recipient };
      });
    if (parsed.length === 0) return;

    setStatuses(null);
    setRows((prev) => [...prev.filter((r) => r.code.trim() || r.amount.trim()), ...parsed]);
    setBulk("");
  };

  /** Returns a FriendlyError for the first invalid row, or null. */
  const validate = (): FriendlyError | null => {
    if (tokens.length === 0) {
      return { title: "Nothing to launch", message: "Add at least one token with a code and an amount." };
    }
    if (tokens.length > MAX_LAUNCH_TOKENS) {
      return {
        title: "Too many tokens",
        message: `One launch holds at most ${MAX_LAUNCH_TOKENS} tokens (one payment each).`,
        hint: "Split the list into several launches.",
      };
    }

    const seen = new Set<string>();
    for (const t of tokens) {
      if (!ASSET_CODE.test(t.code)) {
        return {
          title: "Invalid asset code",
          message: `"${t.code}" is not a valid Stellar asset code.`,
          hint: "Use 1-12 letters or digits.",
        };
      }
      if (!AMOUNT.test(t.amount)) {
        return {
          title: "Invalid amount",
          message: `${t.code}: "${t.amount}" is not a valid amount.`,
          hint: "Enter a positive number with at most 7 decimals, e.g. 55 or 18536.5.",
        };
      }
      if (!ACCOUNT.test(t.recipient)) {
        return {
          title: "Missing recipient",
          message: `${t.code} has no valid recipient account.`,
          hint: "Set a default recipient, or give this row its own G... address.",
        };
      }
      if (t.recipient === address) {
        return {
          title: "Recipient is the issuer",
          message: `${t.code} is being sent to the issuer itself, which does not mint anything.`,
          hint: "Send the supply to a distribution account that trusts the asset.",
        };
      }
      const key = `${t.code}:${t.recipient}`;
      if (seen.has(key)) {
        return {
          title: "Duplicate token",
          message: `${t.code} is listed twice for the same recipient.`,
          hint: "Combine the amounts into one row.",
        };
      }
      seen.add(key);
    }
    return null;
  };

  const handleCheck = async () => {
    if (!address) return;
    const invalid = validate();
    setError(invalid);
    if (invalid) return;

    setIsChecking(true);
    try {
      setStatuses(await inspectLaunchTokens(address, tokens));
    } catch (err) {
      console.error("Error checking launch readiness:", err);
      setError(describeError(err, { ...chainContext(networkPassphrase), account: address }));
    } finally {
      setIsChecking(false);
    }
  };

  const handleDeploy = async (codes: string[]) => {
    if (!address) return;
    setError(null);
    for (const code of codes) {
      setDeploying(code);
      try {
        await deployAssetContract(code, address);
        toast({ title: "Asset contract deployed", description: `${code}:${address.slice(0, 4)}…${address.slice(-4)}` });
      } catch (err) {
        console.error(`Error deploying ${code} SAC:`, err);
        setError(describeError(err, { ...chainContext(networkPassphrase), account: address }));
        break;
      }
    }
    setDeploying(null);
    await handleCheck();
  };

  const handleSubmit = async () => {
    if (!address) return;
    const invalid = validate();
    setError(invalid);
    if (invalid) return;

    setIsSubmitting(true);
    try {
      await createProposalToLaunchTokens({ source: address, tokens });
      toast({
        title: "Launch proposal created",
        description: `${tokens.length} token${tokens.length === 1 ? "" : "s"}: ${tokens.map((t) => t.code).join(", ")}`,
      });
      navigate(`/multisig/${address}/transactions`);
    } catch (err) {
      console.error("Error creating launch proposal:", err);
      setError(describeError(err, { ...chainContext(networkPassphrase), account: address }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const missingTrustlines = statuses?.filter((s) => s.recipientHasTrustline !== true) ?? [];
  const missingSacs = statuses?.filter((s) => !s.sacDeployed).map((s) => s.code) ?? [];
  const alreadyIssued = statuses?.filter((s) => Number(s.issuedSupply) > 0) ?? [];
  const canPropose =
    !!statuses && isRegistered === true && missingTrustlines.length === 0 && !isSubmitting && !deploying;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-1">Launch Tokens</h1>
        <p className="text-muted-foreground">
          Mint one or more assets issued by this account in a single proposal. Each token becomes a payment from the
          issuer, which creates that supply in the recipient's account.
        </p>
      </div>

      {isRegistered === false && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-foreground">This account is not registered in the app yet.</p>
          <p className="text-muted-foreground mt-1">
            Launch proposals are stored in the registry, which only accepts registered accounts.{" "}
            <Link to={`/multisig/${address}`} className="underline underline-offset-2 text-foreground">
              Register it from the account page
            </Link>
            , then come back.
          </p>
        </div>
      )}

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Tokens</CardTitle>
          <CardDescription>
            Assets are issued as <span className="font-mono">CODE:{address ? `${address.slice(0, 4)}…${address.slice(-4)}` : "issuer"}</span>.
            Up to {MAX_LAUNCH_TOKENS} per launch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="default-recipient">Default recipient</Label>
            <Input
              id="default-recipient"
              placeholder="Distribution account (G...) that trusts every asset"
              value={defaultRecipient}
              onChange={(e) => {
                setStatuses(null);
                setDefaultRecipient(e.target.value);
              }}
              className="font-mono text-sm"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[8rem_9rem_1fr_2.5rem] gap-2 text-xs font-medium text-muted-foreground">
              <span>Code</span>
              <span>Amount</span>
              <span>Recipient (optional)</span>
              <span />
            </div>
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-[8rem_9rem_1fr_2.5rem] gap-2">
                <Input
                  placeholder="COST"
                  value={row.code}
                  onChange={(e) => updateRow(i, { code: e.target.value.toUpperCase() })}
                  className="font-mono text-sm"
                  aria-label={`Asset code, row ${i + 1}`}
                  disabled={isSubmitting}
                />
                <Input
                  placeholder="55"
                  inputMode="decimal"
                  value={row.amount}
                  onChange={(e) => updateRow(i, { amount: e.target.value })}
                  className="font-mono text-sm"
                  aria-label={`Amount, row ${i + 1}`}
                  disabled={isSubmitting}
                />
                <Input
                  placeholder="Default recipient"
                  value={row.recipient}
                  onChange={(e) => updateRow(i, { recipient: e.target.value })}
                  className="font-mono text-sm"
                  aria-label={`Recipient, row ${i + 1}`}
                  disabled={isSubmitting}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(i)}
                  aria-label={`Remove row ${i + 1}`}
                  disabled={isSubmitting}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setRows((prev) => [...prev, emptyRow()])}
              disabled={isSubmitting || rows.length >= MAX_LAUNCH_TOKENS}
            >
              <Plus className="w-4 h-4" />
              Add token
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk">Paste a list</Label>
            <Textarea
              id="bulk"
              placeholder={"One per line: CODE AMOUNT [RECIPIENT]\nAMC 18536\nCOST 55"}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              className="font-mono text-sm min-h-24"
              disabled={isSubmitting}
            />
            <Button variant="outline" size="sm" onClick={applyBulk} disabled={!bulk.trim() || isSubmitting}>
              Add to list
            </Button>
          </div>

          <ErrorPanel error={error} onDismiss={() => setError(null)} />

          <Button onClick={handleCheck} variant="secondary" className="w-full" disabled={isChecking || isSubmitting}>
            {isChecking ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              "Check readiness"
            )}
          </Button>
        </CardContent>
      </Card>

      {statuses && (
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Readiness</CardTitle>
            <CardDescription>
              Every recipient must trust its asset, or the whole launch fails. The asset contract (SAC) is not needed
              to mint, but it is needed before the token can move through Soroban, such as the asset manager.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Trustline</TableHead>
                  <TableHead>Asset contract</TableHead>
                  <TableHead className="text-right">Already issued</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statuses.map((s, i) => (
                  <TableRow key={`${s.code}-${i}`}>
                    <TableCell className="font-mono">{s.code}</TableCell>
                    <TableCell className="text-right font-mono">{tokens[i]?.amount}</TableCell>
                    <TableCell>
                      {s.recipientHasTrustline === true ? (
                        <Badge variant="secondary">OK</Badge>
                      ) : s.recipientHasTrustline === null ? (
                        <Badge variant="destructive">No account</Badge>
                      ) : (
                        <Badge variant="destructive">Missing</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.sacDeployed ? (
                        <Badge variant="secondary">Deployed</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeploy([s.code])}
                          disabled={!!deploying || isSubmitting}
                        >
                          {deploying === s.code ? <Loader2 className="h-3 w-3 animate-spin" /> : "Deploy"}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">{s.issuedSupply}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {missingTrustlines.length > 0 && (
              <ErrorPanel
                error={{
                  title: "Missing trustlines",
                  message: `The recipient does not trust ${missingTrustlines.map((s) => s.code).join(", ")}.`,
                  hint: "Add the trustlines from the recipient account (change_trust to CODE:issuer), then check again.",
                }}
              />
            )}

            {alreadyIssued.length > 0 && (
              <ErrorPanel
                error={{
                  title: "Already issued",
                  severity: "warning",
                  message: `${alreadyIssued.map((s) => s.code).join(", ")} already ha${alreadyIssued.length === 1 ? "s" : "ve"} supply. Launching adds to it.`,
                }}
              />
            )}

            {missingSacs.length > 1 && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleDeploy(missingSacs)}
                disabled={!!deploying || isSubmitting}
              >
                {deploying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deploying {deploying}...
                  </>
                ) : (
                  `Deploy all ${missingSacs.length} missing asset contracts`
                )}
              </Button>
            )}

            <Button onClick={handleSubmit} className="w-full gap-2" disabled={!canPropose}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating Proposal...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  Create launch proposal ({tokens.length} token{tokens.length === 1 ? "" : "s"})
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
