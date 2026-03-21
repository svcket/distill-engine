"use client"

import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface PricingCardProps {
  title: string;
  price: string;
  description: string;
  features: string[];
  highlight?: boolean;
  highlightLabel?: string;
  buttonVariant?: "default" | "outline";
}

export function PricingCard({
  title,
  price,
  description,
  features,
  highlight = false,
  buttonVariant = "outline",
}: PricingCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between p-8 space-y-6 transition-all rounded-2xl border border-border/40 bg-card/40",
        highlight ? "ring-2 ring-brand/50 bg-secondary/20 shadow-xl shadow-brand/5 scale-[1.02] z-10" : "hover:bg-card/60 shadow-sm"
      )}
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <h2 className="font-bold text-lg tracking-tight">{title}</h2>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold font-serif tracking-tight">{price.split(' ')[0]}</span>
            <span className="text-muted-foreground text-sm font-medium">{price.split(' ').slice(1).join(' ')}</span>
          </div>
          <p className="text-muted-foreground text-[13px] leading-relaxed line-clamp-2">{description}</p>
        </div>

        <Button asChild className="w-full rounded-xl h-11 font-bold text-sm shadow-sm" variant={buttonVariant}>
          <Link href="/checkout">Get Started</Link>
        </Button>
      </div>

      {highlight && (
        <div className="pt-2 border-t border-border/40">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Everything in Free, plus:</div>
        </div>
      )}

      <ul className={`${highlight ? "mt-4" : "border-t border-border/40 pt-4"} list-outside space-y-3 text-[13px]`}>
        {features.map((item, index) => (
          <li key={index} className="flex items-start gap-2.5">
            <div className="w-4 h-4 rounded-full bg-brand/10 flex items-center justify-center mt-0.5 shrink-0">
                <Check className="size-3 text-brand" />
            </div>
            <span className="text-muted-foreground/90 leading-tight">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
