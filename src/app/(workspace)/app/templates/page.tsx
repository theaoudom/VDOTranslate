import type { Metadata } from "next";
import { LayoutTemplate } from "lucide-react";
import { ComingSoon } from "@/presentation/samesay/app/ComingSoon";

export const metadata: Metadata = { title: "Templates" };

export default function TemplatesPage() {
  return <ComingSoon title="Templates" icon={<LayoutTemplate />} text="Design it once with images, text and video clips. Use it on every video you translate." />;
}
