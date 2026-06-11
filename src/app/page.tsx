import Dashboard from "@/components/Dashboard";
import analysisJson from "../../public/data/analysis.json";
import backtestJson from "../../public/data/backtest.json";
import type { Analysis, Backtest } from "@/lib/types";

export default function Home() {
  const analysis = analysisJson as unknown as Analysis;
  const backtest = backtestJson as unknown as Backtest;
  return <Dashboard analysis={analysis} backtest={backtest} />;
}
