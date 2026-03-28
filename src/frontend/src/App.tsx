import {
  AlertTriangle,
  DollarSign,
  Percent,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";

type AssetType = "stocks" | "forex" | "crypto" | "futures";
type Direction = "long" | "short";
type FuturesUnitType = "point" | "tick";

interface AssetConfig {
  label: string;
  unit: string;
  priceDp: number;
  sizeDp: number;
}

const ASSET_CONFIG: Record<AssetType, AssetConfig> = {
  stocks: { label: "Stocks", unit: "Shares", priceDp: 2, sizeDp: 2 },
  forex: { label: "Forex", unit: "Lots", priceDp: 5, sizeDp: 0 },
  crypto: { label: "Crypto", unit: "Units", priceDp: 6, sizeDp: 6 },
  futures: { label: "Futures", unit: "Contracts", priceDp: 2, sizeDp: 0 },
};

interface Bracket {
  id: string;
  tpPrice: string;
}

interface BracketResult {
  id: string;
  tpPrice: number | null;
  tpDistance: number | null;
  rrRatio: number | null;
  profit: number | null;
  sizeLabel: string;
}

interface CalcResult {
  dollarRisk: number | null;
  positionSize: number | null;
  cryptoContracts: number | null;
  perBracketSize: number | null;
  brackets: BracketResult[];
  totalProfit: number | null;
}

function calculate(
  capital: string,
  riskPercent: string,
  entryPrice: string,
  stopLoss: string,
  _direction: Direction,
  brackets: Bracket[],
  cfg: AssetConfig,
  assetType: AssetType,
  pipValuePerLot: string,
  _futuresUnitType: FuturesUnitType,
  futuresUnitValue: string,
  contractSize: string,
): CalcResult {
  const cap = Number.parseFloat(capital);
  const risk = Number.parseFloat(riskPercent);
  const entry = Number.parseFloat(entryPrice);
  const sl = Number.parseFloat(stopLoss);

  const dollarRisk =
    !Number.isNaN(cap) && !Number.isNaN(risk) ? cap * (risk / 100) : null;
  const stopDistance =
    !Number.isNaN(entry) && !Number.isNaN(sl) ? Math.abs(entry - sl) : null;

  let positionSize: number | null = null;
  let cryptoContracts: number | null = null;

  if (dollarRisk !== null && stopDistance !== null && stopDistance > 0) {
    if (assetType === "stocks") {
      positionSize = dollarRisk / stopDistance;
    } else if (assetType === "crypto") {
      positionSize = dollarRisk / stopDistance;
      const cs = Number.parseFloat(contractSize);
      if (!Number.isNaN(cs) && cs > 0) {
        cryptoContracts = positionSize / cs;
      }
    } else if (assetType === "forex") {
      const pipValue = Number.parseFloat(pipValuePerLot);
      if (!Number.isNaN(pipValue) && pipValue > 0) {
        const stopDistancePips = stopDistance * 10000;
        positionSize = Math.floor(dollarRisk / (stopDistancePips * pipValue));
      }
    } else if (assetType === "futures") {
      const unitVal = Number.parseFloat(futuresUnitValue);
      if (!Number.isNaN(unitVal) && unitVal > 0) {
        positionSize = Math.floor(dollarRisk / (stopDistance * unitVal));
      }
    }
  }

  const isWholeNumber = assetType === "forex" || assetType === "futures";
  const perBracketSize =
    positionSize !== null
      ? isWholeNumber
        ? Math.floor(positionSize / brackets.length)
        : positionSize / brackets.length
      : null;

  const bracketResults: BracketResult[] = brackets.map((b) => {
    const tp = Number.parseFloat(b.tpPrice);
    const tpPrice = !Number.isNaN(tp) ? tp : null;
    const tpDistance =
      tpPrice !== null && !Number.isNaN(entry)
        ? Math.abs(tpPrice - entry)
        : null;
    const rrRatio =
      tpDistance !== null && stopDistance !== null && stopDistance > 0
        ? tpDistance / stopDistance
        : null;

    let profit: number | null = null;
    if (perBracketSize !== null && tpDistance !== null) {
      if (assetType === "forex") {
        const pipValue = Number.parseFloat(pipValuePerLot);
        if (!Number.isNaN(pipValue) && pipValue > 0) {
          const tpDistancePips = tpDistance * 10000;
          profit = perBracketSize * tpDistancePips * pipValue;
        }
      } else if (assetType === "futures") {
        const unitVal = Number.parseFloat(futuresUnitValue);
        if (!Number.isNaN(unitVal) && unitVal > 0) {
          profit = perBracketSize * tpDistance * unitVal;
        }
      } else {
        profit = perBracketSize * tpDistance;
      }
    }

    const sizeLabel =
      perBracketSize !== null
        ? `${perBracketSize.toFixed(cfg.sizeDp)} ${cfg.unit}`
        : "—";
    return { id: b.id, tpPrice, tpDistance, rrRatio, profit, sizeLabel };
  });

  const filledProfits = bracketResults
    .map((b) => b.profit)
    .filter((p): p is number => p !== null);
  const totalProfit =
    filledProfits.length > 0 ? filledProfits.reduce((a, b) => a + b, 0) : null;

  return {
    dollarRisk,
    positionSize,
    cryptoContracts,
    perBracketSize,
    brackets: bracketResults,
    totalProfit,
  };
}

function getValidationErrors(
  entry: string,
  stopLoss: string,
  brackets: Bracket[],
  direction: Direction,
  _touchedEntry: boolean,
  touchedSL: boolean,
  touchedTP: Record<string, boolean>,
): string[] {
  const errors: string[] = [];
  const entryVal = Number.parseFloat(entry);
  const slVal = Number.parseFloat(stopLoss);
  const entryValid = !Number.isNaN(entryVal);
  const slValid = !Number.isNaN(slVal);

  if (touchedSL && entryValid && slValid) {
    if (direction === "long" && slVal >= entryVal) {
      errors.push("Stop Loss must be below Entry Price for Long trades.");
    } else if (direction === "short" && slVal <= entryVal) {
      errors.push("Stop Loss must be above Entry Price for Short trades.");
    }
  }

  brackets.forEach((b, i) => {
    if (!touchedTP[b.id]) return;
    const tpVal = Number.parseFloat(b.tpPrice);
    if (Number.isNaN(tpVal) || !entryValid) return;
    if (direction === "long" && tpVal <= entryVal) {
      errors.push(
        `Bracket ${i + 1}: Take Profit must be above Entry Price for Long trades.`,
      );
    } else if (direction === "short" && tpVal >= entryVal) {
      errors.push(
        `Bracket ${i + 1}: Take Profit must be below Entry Price for Short trades.`,
      );
    }
  });

  return errors;
}

function fmt(value: number | null, dp: number, prefix = ""): string {
  if (value === null) return "—";
  return (
    prefix +
    value.toLocaleString("en-US", {
      minimumFractionDigits: dp,
      maximumFractionDigits: dp,
    })
  );
}

function fmtContracts(value: number | null): string {
  if (value === null) return "—";
  const rounded2 = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded2)) {
    return rounded2.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return rounded2.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

let bracketCounter = 2;
function newBracketId() {
  return `b${bracketCounter++}`;
}

function NavBar() {
  return (
    <header
      className="sticky top-0 z-50 w-full border-b border-border"
      style={{ background: "oklch(0.12 0.012 240)" }}
    >
      <div className="mx-auto max-w-xl px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{
              background: "oklch(0.75 0.13 195 / 0.15)",
              border: "1px solid oklch(0.75 0.13 195 / 0.5)",
            }}
          >
            <TrendingUp
              className="w-4 h-4"
              style={{ color: "oklch(0.75 0.13 195)" }}
            />
          </div>
          <span
            className="font-bold text-base tracking-widest"
            style={{ color: "oklch(0.93 0.010 240)" }}
          >
            TRADESIZE
          </span>
        </div>
        <nav>
          <span
            className="text-sm font-semibold pb-1 tracking-wide"
            style={{
              color: "oklch(0.75 0.13 195)",
              borderBottom: "2px solid oklch(0.75 0.13 195)",
              textShadow: "0 0 10px oklch(0.75 0.13 195 / 0.6)",
            }}
          >
            Sizer
          </span>
        </nav>
      </div>
    </header>
  );
}

interface LabeledInputProps {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  prefix?: React.ReactNode;
  hint?: string;
  "data-ocid"?: string;
}

function LabeledInput({
  label,
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  prefix,
  hint,
  "data-ocid": ocid,
}: LabeledInputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-medium tracking-wider uppercase"
        style={{ color: "oklch(0.72 0.020 240)" }}
      >
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium"
            style={{ color: "oklch(0.72 0.020 240)" }}
          >
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          data-ocid={ocid}
          className="w-full rounded-lg border py-3 pr-4 text-base font-semibold transition-all outline-none focus:ring-2"
          style={{
            background: "oklch(0.13 0.015 240)",
            borderColor: "oklch(0.28 0.020 240)",
            color: "oklch(0.93 0.010 240)",
            paddingLeft: prefix ? "2.25rem" : "0.75rem",
            fontSize: "16px",
          }}
        />
      </div>
      {hint && (
        <p className="text-xs" style={{ color: "oklch(0.55 0.020 240)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export default function App() {
  const [assetType, setAssetType] = useState<AssetType>("stocks");
  const [direction, setDirection] = useState<Direction>("long");
  const [capital, setCapital] = useState("");
  const [riskPercent, setRiskPercent] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [brackets, setBrackets] = useState<Bracket[]>([
    { id: "b1", tpPrice: "" },
  ]);
  const [pipValuePerLot, setPipValuePerLot] = useState("");
  const [futuresUnitType, setFuturesUnitType] =
    useState<FuturesUnitType>("point");
  const [futuresUnitValue, setFuturesUnitValue] = useState("");
  const [contractSize, setContractSize] = useState("1");

  // Blur-triggered touched state for validation
  const [touchedEntry, setTouchedEntry] = useState(false);
  const [touchedSL, setTouchedSL] = useState(false);
  const [touchedTP, setTouchedTP] = useState<Record<string, boolean>>({});

  const cfg = ASSET_CONFIG[assetType];

  const validationErrors = useMemo(
    () =>
      getValidationErrors(
        entryPrice,
        stopLoss,
        brackets,
        direction,
        touchedEntry,
        touchedSL,
        touchedTP,
      ),
    [
      entryPrice,
      stopLoss,
      brackets,
      direction,
      touchedEntry,
      touchedSL,
      touchedTP,
    ],
  );

  const hasErrors = validationErrors.length > 0;

  const result = useMemo(
    () =>
      hasErrors
        ? {
            dollarRisk: null,
            positionSize: null,
            cryptoContracts: null,
            perBracketSize: null,
            brackets: brackets.map((b) => ({
              id: b.id,
              tpPrice: null,
              tpDistance: null,
              rrRatio: null,
              profit: null,
              sizeLabel: "N/A",
            })),
            totalProfit: null,
          }
        : calculate(
            capital,
            riskPercent,
            entryPrice,
            stopLoss,
            direction,
            brackets,
            cfg,
            assetType,
            pipValuePerLot,
            futuresUnitType,
            futuresUnitValue,
            contractSize,
          ),
    [
      hasErrors,
      capital,
      riskPercent,
      entryPrice,
      stopLoss,
      direction,
      brackets,
      cfg,
      assetType,
      pipValuePerLot,
      futuresUnitType,
      futuresUnitValue,
      contractSize,
    ],
  );

  function addBracket() {
    if (brackets.length >= 6) return;
    setBrackets((prev) => [...prev, { id: newBracketId(), tpPrice: "" }]);
  }

  function removeBracket(id: string) {
    setBrackets((prev) => prev.filter((b) => b.id !== id));
    setTouchedTP((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function updateBracketTp(id: string, value: string) {
    setBrackets((prev) =>
      prev.map((b) => (b.id === id ? { ...b, tpPrice: value } : b)),
    );
  }

  function touchBracketTP(id: string) {
    setTouchedTP((prev) => ({ ...prev, [id]: true }));
  }

  const bracketPct = Math.round(100 / brackets.length);

  const naDisplay = "N/A";

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />

      <main className="flex-1 mx-auto w-full max-w-xl px-4 py-6 flex flex-col gap-5">
        {/* Asset Type Selector */}
        <section aria-label="Asset Type" className="animate-fade-in">
          <p
            className="text-xs font-medium tracking-wider uppercase mb-2"
            style={{ color: "oklch(0.72 0.020 240)" }}
          >
            Asset Type
          </p>
          <div
            className="flex rounded-xl p-1 gap-1"
            style={{
              background: "oklch(0.13 0.015 240)",
              border: "1px solid oklch(0.28 0.020 240)",
            }}
          >
            {(["stocks", "forex", "crypto", "futures"] as AssetType[]).map(
              (t) => (
                <button
                  type="button"
                  key={t}
                  data-ocid={`asset.${t}.tab`}
                  onClick={() => setAssetType(t)}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background:
                      assetType === t ? "oklch(0.18 0.020 240)" : "transparent",
                    color:
                      assetType === t
                        ? "oklch(0.75 0.13 195)"
                        : "oklch(0.72 0.020 240)",
                    boxShadow:
                      assetType === t
                        ? "0 0 12px oklch(0.75 0.13 195 / 0.25), inset 0 0 0 1px oklch(0.75 0.13 195 / 0.5)"
                        : "none",
                  }}
                >
                  {ASSET_CONFIG[t].label}
                </button>
              ),
            )}
          </div>
        </section>

        {/* Asset-specific extra inputs */}
        <AnimatePresence>
          {assetType === "crypto" && (
            <motion.section
              key="crypto-inputs"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              aria-label="Crypto Settings"
              className="rounded-xl p-4 flex flex-col gap-4"
              style={{
                background: "oklch(0.15 0.015 240)",
                border: "1px solid oklch(0.28 0.020 240)",
                boxShadow: "0 4px 24px oklch(0 0 0 / 0.40)",
                overflow: "hidden",
              }}
            >
              <p
                className="text-xs font-bold tracking-wider uppercase"
                style={{ color: "oklch(0.75 0.13 195)" }}
              >
                Crypto Settings
              </p>
              <LabeledInput
                id="input-contract-size"
                label="Contract Size (units per contract)"
                value={contractSize}
                onChange={setContractSize}
                placeholder="1"
                hint="1 = spot / BTC; 0.01 = Coinbase BTC perp"
                data-ocid="crypto.contract_size.input"
              />
            </motion.section>
          )}

          {assetType === "forex" && (
            <motion.section
              key="forex-inputs"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              aria-label="Forex Settings"
              className="rounded-xl p-4 flex flex-col gap-4"
              style={{
                background: "oklch(0.15 0.015 240)",
                border: "1px solid oklch(0.28 0.020 240)",
                boxShadow: "0 4px 24px oklch(0 0 0 / 0.40)",
                overflow: "hidden",
              }}
            >
              <p
                className="text-xs font-bold tracking-wider uppercase"
                style={{ color: "oklch(0.75 0.13 195)" }}
              >
                Forex Settings
              </p>
              <LabeledInput
                id="input-pip-value"
                label="Pip Value Per Lot"
                value={pipValuePerLot}
                onChange={setPipValuePerLot}
                placeholder="10"
                prefix={<DollarSign className="w-3.5 h-3.5" />}
                data-ocid="forex.pip_value.input"
              />
            </motion.section>
          )}

          {assetType === "futures" && (
            <motion.section
              key="futures-inputs"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              aria-label="Futures Settings"
              className="rounded-xl p-4 flex flex-col gap-4"
              style={{
                background: "oklch(0.15 0.015 240)",
                border: "1px solid oklch(0.28 0.020 240)",
                boxShadow: "0 4px 24px oklch(0 0 0 / 0.40)",
                overflow: "hidden",
              }}
            >
              <p
                className="text-xs font-bold tracking-wider uppercase"
                style={{ color: "oklch(0.75 0.13 195)" }}
              >
                Futures Settings
              </p>
              <div>
                <p
                  className="text-xs font-medium tracking-wider uppercase mb-2"
                  style={{ color: "oklch(0.72 0.020 240)" }}
                >
                  Unit Type
                </p>
                <div
                  className="flex rounded-xl p-1 gap-1"
                  style={{
                    background: "oklch(0.13 0.015 240)",
                    border: "1px solid oklch(0.28 0.020 240)",
                  }}
                >
                  {(["point", "tick"] as FuturesUnitType[]).map((u) => (
                    <button
                      type="button"
                      key={u}
                      data-ocid={`futures.${u}.toggle`}
                      onClick={() => setFuturesUnitType(u)}
                      className="flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-all"
                      style={{
                        background:
                          futuresUnitType === u
                            ? "oklch(0.18 0.020 240)"
                            : "transparent",
                        color:
                          futuresUnitType === u
                            ? "oklch(0.75 0.13 195)"
                            : "oklch(0.72 0.020 240)",
                        boxShadow:
                          futuresUnitType === u
                            ? "0 0 12px oklch(0.75 0.13 195 / 0.25), inset 0 0 0 1px oklch(0.75 0.13 195 / 0.5)"
                            : "none",
                      }}
                    >
                      {u.charAt(0).toUpperCase() + u.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <LabeledInput
                id="input-futures-unit-value"
                label={`$ per ${futuresUnitType.charAt(0).toUpperCase() + futuresUnitType.slice(1)}`}
                value={futuresUnitValue}
                onChange={setFuturesUnitValue}
                placeholder="5"
                prefix={<DollarSign className="w-3.5 h-3.5" />}
                data-ocid="futures.unit_value.input"
              />
            </motion.section>
          )}
        </AnimatePresence>

        {/* Direction Toggle */}
        <section aria-label="Trade Direction" className="animate-fade-in">
          <p
            className="text-xs font-medium tracking-wider uppercase mb-2"
            style={{ color: "oklch(0.72 0.020 240)" }}
          >
            Direction
          </p>
          <div
            className="flex rounded-xl p-1 gap-1"
            style={{
              background: "oklch(0.13 0.015 240)",
              border: "1px solid oklch(0.28 0.020 240)",
            }}
          >
            <button
              type="button"
              data-ocid="direction.long.toggle"
              onClick={() => setDirection("long")}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold tracking-widest flex items-center justify-center gap-2 transition-all"
              style={{
                background:
                  direction === "long"
                    ? "oklch(0.18 0.020 240)"
                    : "transparent",
                color:
                  direction === "long"
                    ? "oklch(0.70 0.15 55)"
                    : "oklch(0.72 0.020 240)",
                boxShadow:
                  direction === "long"
                    ? "0 0 16px oklch(0.70 0.15 55 / 0.3), inset 0 0 0 1px oklch(0.70 0.15 55 / 0.5)"
                    : "none",
              }}
            >
              <TrendingUp className="w-4 h-4" />
              LONG
            </button>
            <button
              type="button"
              data-ocid="direction.short.toggle"
              onClick={() => setDirection("short")}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold tracking-widest flex items-center justify-center gap-2 transition-all"
              style={{
                background:
                  direction === "short"
                    ? "oklch(0.18 0.020 240)"
                    : "transparent",
                color:
                  direction === "short"
                    ? "oklch(0.75 0.13 195)"
                    : "oklch(0.72 0.020 240)",
                boxShadow:
                  direction === "short"
                    ? "0 0 16px oklch(0.75 0.13 195 / 0.3), inset 0 0 0 1px oklch(0.75 0.13 195 / 0.5)"
                    : "none",
              }}
            >
              <TrendingDown className="w-4 h-4" />
              SHORT
            </button>
          </div>
        </section>

        {/* Inputs */}
        <section
          className="rounded-xl p-4 flex flex-col gap-4 animate-fade-in"
          style={{
            background: "oklch(0.15 0.015 240)",
            border: "1px solid oklch(0.28 0.020 240)",
            boxShadow: "0 4px 24px oklch(0 0 0 / 0.40)",
          }}
        >
          <LabeledInput
            id="input-capital"
            label="Account Capital"
            value={capital}
            onChange={setCapital}
            placeholder="100000"
            prefix={<DollarSign className="w-3.5 h-3.5" />}
            data-ocid="capital.input"
          />
          <LabeledInput
            id="input-risk"
            label="Risk Per Trade"
            value={riskPercent}
            onChange={setRiskPercent}
            placeholder="1"
            prefix={<Percent className="w-3.5 h-3.5" />}
            data-ocid="risk.input"
          />
          <LabeledInput
            id="input-entry"
            label="Entry Price"
            value={entryPrice}
            onChange={setEntryPrice}
            onBlur={() => setTouchedEntry(true)}
            placeholder={assetType === "crypto" ? "0.000000" : "0.00"}
            data-ocid="entry.input"
          />
          <LabeledInput
            id="input-stoploss"
            label="Stop Loss Price"
            value={stopLoss}
            onChange={setStopLoss}
            onBlur={() => setTouchedSL(true)}
            placeholder={assetType === "crypto" ? "0.000000" : "0.00"}
            data-ocid="stoploss.input"
          />
        </section>

        {/* Brackets */}
        <section
          className="rounded-xl p-4 flex flex-col gap-3 animate-fade-in"
          style={{
            background: "oklch(0.15 0.015 240)",
            border: "1px solid oklch(0.28 0.020 240)",
            boxShadow: "0 4px 24px oklch(0 0 0 / 0.40)",
          }}
        >
          <div className="flex items-center justify-between">
            <h2
              className="text-sm font-bold tracking-wider uppercase"
              style={{ color: "oklch(0.93 0.010 240)" }}
            >
              Take Profit Brackets
            </h2>
            <button
              type="button"
              data-ocid="bracket.add_button"
              onClick={addBracket}
              disabled={brackets.length >= 6}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
              style={{
                background: "oklch(0.75 0.13 195 / 0.12)",
                color: "oklch(0.75 0.13 195)",
                border: "1px solid oklch(0.75 0.13 195 / 0.35)",
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Bracket
            </button>
          </div>

          <AnimatePresence>
            {brackets.map((b, i) => {
              const br = result.brackets.find((r) => r.id === b.id);
              const tpInputId = `tp-${b.id}`;
              return (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-xl p-3 flex flex-col gap-2"
                  style={{
                    background: "oklch(0.12 0.012 240)",
                    boxShadow: "inset 0 0 0 1px oklch(0.75 0.13 195 / 0.2)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs font-semibold"
                      style={{ color: "oklch(0.75 0.13 195)" }}
                    >
                      Bracket {i + 1} — {bracketPct}% of position
                    </span>
                    {brackets.length > 1 && (
                      <button
                        type="button"
                        data-ocid={`bracket.delete_button.${i + 1}`}
                        onClick={() => removeBracket(b.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all"
                        style={{
                          color: "oklch(0.60 0.18 25)",
                          background: "oklch(0.60 0.18 25 / 0.10)",
                          border: "1px solid oklch(0.60 0.18 25 / 0.3)",
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label
                        htmlFor={tpInputId}
                        className="text-xs font-medium tracking-wider uppercase mb-1.5 block"
                        style={{ color: "oklch(0.72 0.020 240)" }}
                      >
                        TP Price
                      </label>
                      <input
                        id={tpInputId}
                        type="text"
                        inputMode="decimal"
                        value={b.tpPrice}
                        onChange={(e) => updateBracketTp(b.id, e.target.value)}
                        onBlur={() => touchBracketTP(b.id)}
                        placeholder={
                          assetType === "crypto" ? "0.000000" : "0.00"
                        }
                        data-ocid={`bracket.input.${i + 1}`}
                        className="w-full rounded-lg border py-2.5 px-3 text-sm font-semibold transition-all outline-none focus:ring-2"
                        style={{
                          background: "oklch(0.10 0.012 240)",
                          borderColor: "oklch(0.28 0.020 240)",
                          color: "oklch(0.93 0.010 240)",
                          fontSize: "16px",
                        }}
                      />
                    </div>
                    {br && (
                      <div className="flex flex-col items-end gap-0.5 pb-1">
                        <span
                          className="text-xs"
                          style={{ color: "oklch(0.72 0.020 240)" }}
                        >
                          R:R
                        </span>
                        <span
                          className="text-sm font-bold"
                          style={{
                            color:
                              br.rrRatio !== null
                                ? "oklch(0.93 0.010 240)"
                                : "oklch(0.50 0.010 240)",
                          }}
                        >
                          {br.rrRatio !== null
                            ? `${br.rrRatio.toFixed(2)}R`
                            : "—"}
                        </span>
                      </div>
                    )}
                  </div>
                  {br && (
                    <div
                      className="flex justify-between items-center pt-1"
                      style={{ borderTop: "1px solid oklch(0.28 0.020 240)" }}
                    >
                      <span
                        className="text-xs"
                        style={{ color: "oklch(0.72 0.020 240)" }}
                      >
                        Size: {br.sizeLabel}
                      </span>
                      <span
                        className="text-sm font-bold"
                        style={{
                          color:
                            br.profit !== null
                              ? "oklch(0.75 0.17 155)"
                              : "oklch(0.50 0.010 240)",
                        }}
                      >
                        {br.profit !== null
                          ? `+${fmt(br.profit, 2, "$")}`
                          : "—"}
                      </span>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </section>

        {/* Validation Summary */}
        <AnimatePresence>
          {hasErrors && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="rounded-xl p-4 flex flex-col gap-2"
              style={{
                background: "oklch(0.14 0.025 25)",
                border: "1px solid oklch(0.60 0.18 25 / 0.5)",
                boxShadow: "0 4px 24px oklch(0.60 0.18 25 / 0.10)",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: "oklch(0.72 0.18 40)" }}
                />
                <span
                  className="text-xs font-bold tracking-wider uppercase"
                  style={{ color: "oklch(0.72 0.18 40)" }}
                >
                  Invalid Trade Setup
                </span>
              </div>
              {validationErrors.map((err) => (
                <p
                  key={err}
                  className="text-sm font-medium"
                  style={{ color: "oklch(0.85 0.10 25)" }}
                >
                  • {err}
                </p>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results Panel */}
        <motion.section
          layout
          className="rounded-xl p-5 flex flex-col gap-4 animate-fade-in"
          style={{
            background:
              "linear-gradient(145deg, oklch(0.16 0.040 230), oklch(0.13 0.030 240))",
            border: `1px solid ${
              hasErrors
                ? "oklch(0.60 0.18 25 / 0.25)"
                : "oklch(0.75 0.13 195 / 0.25)"
            }`,
            boxShadow:
              "0 4px 32px oklch(0.75 0.13 195 / 0.08), 0 4px 24px oklch(0 0 0 / 0.40)",
          }}
        >
          <h2
            className="text-sm font-bold tracking-wider uppercase"
            style={{
              color: hasErrors ? "oklch(0.60 0.18 25)" : "oklch(0.75 0.13 195)",
            }}
          >
            Results
          </h2>

          {assetType === "crypto" ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <span
                  className="text-xs font-medium tracking-wide uppercase"
                  style={{ color: "oklch(0.72 0.020 240)" }}
                >
                  Dollar Risk
                </span>
                <span
                  className="text-xl font-bold leading-tight"
                  style={{
                    color: hasErrors
                      ? "oklch(0.55 0.10 25)"
                      : result.dollarRisk !== null
                        ? "oklch(0.93 0.010 240)"
                        : "oklch(0.50 0.010 240)",
                  }}
                  data-ocid="result.dollar_risk.panel"
                >
                  {hasErrors ? naDisplay : fmt(result.dollarRisk, 2, "$")}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span
                  className="text-xs font-medium tracking-wide uppercase"
                  style={{ color: "oklch(0.72 0.020 240)" }}
                >
                  Position Size
                </span>
                <span
                  className="text-xl font-bold leading-tight"
                  style={{
                    color: hasErrors
                      ? "oklch(0.55 0.10 25)"
                      : result.positionSize !== null
                        ? "oklch(0.93 0.010 240)"
                        : "oklch(0.50 0.010 240)",
                  }}
                  data-ocid="result.position_size.panel"
                >
                  {hasErrors
                    ? naDisplay
                    : result.positionSize !== null
                      ? result.positionSize.toLocaleString("en-US", {
                          minimumFractionDigits: 6,
                          maximumFractionDigits: 6,
                        })
                      : "—"}
                </span>
                {!hasErrors && result.positionSize !== null && (
                  <span
                    className="text-xs"
                    style={{ color: "oklch(0.72 0.020 240)" }}
                  >
                    Units
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span
                  className="text-xs font-medium tracking-wide uppercase"
                  style={{ color: "oklch(0.72 0.020 240)" }}
                >
                  Contracts
                </span>
                <span
                  className="text-xl font-bold leading-tight"
                  style={{
                    color: hasErrors
                      ? "oklch(0.55 0.10 25)"
                      : result.cryptoContracts !== null
                        ? "oklch(0.93 0.010 240)"
                        : "oklch(0.50 0.010 240)",
                  }}
                  data-ocid="result.crypto_contracts.panel"
                >
                  {hasErrors ? naDisplay : fmtContracts(result.cryptoContracts)}
                </span>
                {!hasErrors && result.cryptoContracts !== null && (
                  <span
                    className="text-xs"
                    style={{ color: "oklch(0.72 0.020 240)" }}
                  >
                    Contracts
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <span
                  className="text-xs font-medium tracking-wide uppercase"
                  style={{ color: "oklch(0.72 0.020 240)" }}
                >
                  Dollar Risk
                </span>
                <span
                  className="text-xl font-bold leading-tight"
                  style={{
                    color: hasErrors
                      ? "oklch(0.55 0.10 25)"
                      : result.dollarRisk !== null
                        ? "oklch(0.93 0.010 240)"
                        : "oklch(0.50 0.010 240)",
                  }}
                  data-ocid="result.dollar_risk.panel"
                >
                  {hasErrors ? naDisplay : fmt(result.dollarRisk, 2, "$")}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span
                  className="text-xs font-medium tracking-wide uppercase"
                  style={{ color: "oklch(0.72 0.020 240)" }}
                >
                  Position Size
                </span>
                <span
                  className="text-xl font-bold leading-tight"
                  style={{
                    color: hasErrors
                      ? "oklch(0.55 0.10 25)"
                      : result.positionSize !== null
                        ? "oklch(0.93 0.010 240)"
                        : "oklch(0.50 0.010 240)",
                  }}
                  data-ocid="result.position_size.panel"
                >
                  {hasErrors
                    ? naDisplay
                    : result.positionSize !== null
                      ? result.positionSize.toLocaleString("en-US", {
                          maximumFractionDigits: cfg.sizeDp,
                        })
                      : "—"}
                </span>
                {!hasErrors && result.positionSize !== null && (
                  <span
                    className="text-xs"
                    style={{ color: "oklch(0.72 0.020 240)" }}
                  >
                    {cfg.unit}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span
                  className="text-xs font-medium tracking-wide uppercase"
                  style={{ color: "oklch(0.72 0.020 240)" }}
                >
                  Per Bracket
                </span>
                <span
                  className="text-xl font-bold leading-tight"
                  style={{
                    color: hasErrors
                      ? "oklch(0.55 0.10 25)"
                      : result.perBracketSize !== null
                        ? "oklch(0.93 0.010 240)"
                        : "oklch(0.50 0.010 240)",
                  }}
                  data-ocid="result.per_bracket.panel"
                >
                  {hasErrors
                    ? naDisplay
                    : result.perBracketSize !== null
                      ? result.perBracketSize.toLocaleString("en-US", {
                          maximumFractionDigits: cfg.sizeDp,
                        })
                      : "—"}
                </span>
                {!hasErrors && result.perBracketSize !== null && (
                  <span
                    className="text-xs"
                    style={{ color: "oklch(0.72 0.020 240)" }}
                  >
                    {cfg.unit}
                  </span>
                )}
              </div>
            </div>
          )}

          <div
            className="rounded-xl p-4 flex items-center justify-between"
            style={{
              background: "oklch(0.10 0.012 240)",
              border: `1px solid ${
                hasErrors
                  ? "oklch(0.60 0.18 25 / 0.2)"
                  : "oklch(0.75 0.17 155 / 0.3)"
              }`,
            }}
          >
            <div>
              <p
                className="text-xs font-medium tracking-wider uppercase mb-0.5"
                style={{ color: "oklch(0.72 0.020 240)" }}
              >
                Total Potential Profit
              </p>
              <p
                className="text-2xl font-bold"
                style={{
                  color: hasErrors
                    ? "oklch(0.55 0.10 25)"
                    : result.totalProfit !== null
                      ? "oklch(0.75 0.17 155)"
                      : "oklch(0.50 0.010 240)",
                }}
                data-ocid="result.total_profit.panel"
              >
                {hasErrors
                  ? naDisplay
                  : result.totalProfit !== null
                    ? `+${fmt(result.totalProfit, 2, "$")}`
                    : "—"}
              </p>
            </div>
            {!hasErrors &&
              result.totalProfit !== null &&
              result.dollarRisk !== null &&
              result.dollarRisk > 0 && (
                <div className="flex flex-col items-end">
                  <p
                    className="text-xs font-medium tracking-wider uppercase"
                    style={{ color: "oklch(0.72 0.020 240)" }}
                  >
                    Overall R:R
                  </p>
                  <p
                    className="text-xl font-bold"
                    style={{ color: "oklch(0.75 0.17 155)" }}
                  >
                    {(result.totalProfit / result.dollarRisk).toFixed(2)}R
                  </p>
                </div>
              )}
          </div>
        </motion.section>
      </main>

      <footer
        className="text-center py-5 text-xs"
        style={{
          color: "oklch(0.50 0.010 240)",
          borderTop: "1px solid oklch(0.28 0.020 240)",
        }}
      >
        © {new Date().getFullYear()}. Built with ♥ using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
          style={{ color: "oklch(0.75 0.13 195)" }}
        >
          caffeine.ai
        </a>
      </footer>
    </div>
  );
}
