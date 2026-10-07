import type { Metadata } from "next";
import { Scissors } from "lucide-react";
import { ComingSoon } from "@/presentation/samesay/app/ComingSoon";

export const metadata: Metadata = { title: "Auto-split" };

export default function SplitPage() {
  return <ComingSoon title="Auto-split" icon={<Scissors />} text="Cut one long video into parts for social media." />;
}
