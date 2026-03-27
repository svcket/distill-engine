"use client"

import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBeta } from "@/context/BetaContext";

interface PricingCardProps {
  title: string;
  price: string;
  description: string;
  features: string[];
  highlight?: boolean;
  highlightLabel?: string;
  buttonVariant?: "default" | "outline";
  href?: string;
  onClick?: () => void;
  savings?: string;
  isCurrentPlan?: boolean;
}

export function PricingCard({
  title,
  price,
  description,
  features,
  highlight = false,
  buttonVariant = "outline",
  href = "/checkout",
  onClick,
  savings,
  isCurrentPlan = false,
}: PricingCardProps) {
  const { isBetaActive, isBetaEnrolled } = useBeta();
  const isPro = title === "Pro";
  
  const buttonText = (() => {
    if (isCurrentPlan) return "Current Plan";

    if (isBetaActive && isPro) {
      return isBetaEnrolled ? "Beta Access Active" : "Join Beta (Free Access)";
    }
    
    // If user is Pro/Beta, the Free plan is implicitly active/included
    if (!isPro && isBetaEnrolled) return "Included in Pro";

    if (onClick) {
      return isPro ? "Upgrade Now" : "Get Started";
    }
    return "Get Started";
  })();

  const isButtonDisabled = isCurrentPlan || (isBetaActive && isPro && isBetaEnrolled) || (!isPro && isBetaEnrolled);

  return (
    <div
      className={cn(
        "flex flex-col justify-between p-4 space-y-6 transition-all duration-300 rounded-xl border bg-card/40 relative group h-full",
        highlight 
          ? "border-brand/40 ring-1 ring-brand/20 bg-secondary/10 shadow-2xl shadow-brand/5" 
          : "border-border/40 hover:border-border/80 hover:bg-card/60 shadow-sm"
      )}
    >
      <div className="space-y-6 text-center sm:text-left">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-xl tracking-tight font-serif">{title}</h2>
            {savings && (
              <span className="bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                {savings}
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-center sm:justify-start gap-1">
            <span className="text-5xl font-bold font-serif tracking-tighter text-foreground">
              {price.split(' ')[0]}
            </span>
            <span className="text-muted-foreground text-sm font-medium tracking-tight">
              {price.split(' ').slice(1).join(' ')}
            </span>
          </div>
          <p className="text-muted-foreground/80 text-[13px] leading-snug line-clamp-2 min-h-[2.5rem] max-w-[280px] mx-auto sm:mx-0">
            {description}
          </p>
        </div>

        <Button 
          asChild={!onClick && !!href} 
          disabled={isButtonDisabled}
          className={cn(
            "w-full rounded-2xl h-12 font-bold text-sm tracking-tight transition-all duration-300",
            highlight && !isButtonDisabled
              ? "bg-brand text-white hover:bg-brand/90 shadow-lg shadow-brand/20 hover:scale-[1.02]" 
              : isButtonDisabled 
                ? "bg-muted text-muted-foreground border-border"
                : "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200",
            isButtonDisabled && "opacity-80 cursor-default hover:scale-100"
          )} 
          variant={buttonVariant}
          onClick={isButtonDisabled ? undefined : onClick}
        >
          {onClick || !href ? (
            <span>{buttonText}</span>
          ) : (
            <Link href={href}>{buttonText}</Link>
          )}
        </Button>
      </div>

      <div className="space-y-6">
        <ul className="space-y-4 text-[13px]">
          {features.map((item, index) => (
            <li key={index} className="flex items-start gap-3 group/item">
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center mt-0.5 shrink-0 transition-colors",
                highlight ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground"
              )}>
                  <Check className="size-3.5" />
              </div>
              <span className="text-foreground/80 group-hover/item:text-foreground transition-colors leading-snug font-medium">
                {item}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
