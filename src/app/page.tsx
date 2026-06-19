import Dashboard from "@/components/Dashboard";
import analysisJson from "../../public/data/analysis.json";
import backtestJson from "../../public/data/backtest.json";
import timelineJson from "../../public/data/timeline.json";
import healthJson from "../../public/data/preset-health.json";
import bottomJson from "../../public/data/bottom.json";
import fusionHealthJson from "../../public/data/fusion-health.json";
import type { Analysis, Backtest, BottomAnalysis, FusionHealthFile, PresetHealthFile, Timeline } from "@/lib/types";

export default function Home() {
  const analysis = analysisJson as unknown as Analysis;
  const backtest = backtestJson as unknown as Backtest;
  const timeline = timelineJson as unknown as Timeline;
  const health = healthJson as unknown as PresetHealthFile;
  const bottom = bottomJson as unknown as BottomAnalysis;
  const fusionHealth = fusionHealthJson as unknown as FusionHealthFile;
  return (
    <Dashboard analysis={analysis} backtest={backtest} timeline={timeline} health={health} bottom={bottom} fusionHealth={fusionHealth} />
  );
}
