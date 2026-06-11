import Dashboard from "@/components/Dashboard";
import analysisJson from "../../public/data/analysis.json";
import backtestJson from "../../public/data/backtest.json";
import timelineJson from "../../public/data/timeline.json";
import healthJson from "../../public/data/preset-health.json";
import type { Analysis, Backtest, PresetHealthFile, Timeline } from "@/lib/types";

export default function Home() {
  const analysis = analysisJson as unknown as Analysis;
  const backtest = backtestJson as unknown as Backtest;
  const timeline = timelineJson as unknown as Timeline;
  const health = healthJson as unknown as PresetHealthFile;
  return (
    <Dashboard analysis={analysis} backtest={backtest} timeline={timeline} health={health} />
  );
}
