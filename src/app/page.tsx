import Dashboard from "@/components/Dashboard";
import analysisJson from "../../public/data/analysis.json";
import backtestJson from "../../public/data/backtest.json";
import timelineJson from "../../public/data/timeline.json";
import type { Analysis, Backtest, Timeline } from "@/lib/types";

export default function Home() {
  const analysis = analysisJson as unknown as Analysis;
  const backtest = backtestJson as unknown as Backtest;
  const timeline = timelineJson as unknown as Timeline;
  return <Dashboard analysis={analysis} backtest={backtest} timeline={timeline} />;
}
