"use client";

import Link from "next/link";
import { useState } from "react";
import { COMPANY_EMAIL } from "@/lib/constants";

// ── Plan Data ────────────────────────────────────────

interface PlanFeature {
  text: string;
  included: boolean;
  locked?: boolean; // shows 🔒 icon for Premium upsell
}

interface Plan {
  code: string;
  name: string;
  description: string;
  singleUsePrice: number | null; // in cents
  weeklyPrice: number | null; // in cents
  monthlyPrice: number; // in cents
  yearlyPrice: number; // in cents
  sessionLimit: string;
  turnsPerSession: string;
  features: PlanFeature[];
  recommended?: boolean;
  cta: string;
}

const PLANS: Plan[] = [
  {
    code: "free",
    name: "Free",
    description: "3 sessions at Premium level. Experience everything Beside Pet offers.",
    singleUsePrice: null,
    weeklyPrice: null,
    monthlyPrice: 0,
    yearlyPrice: 0,
    sessionLimit: "3 sessions total",
    turnsPerSession: "30 turns / session",
    features: [
      { text: "Same quality AI support", included: true },
      { text: "Crisis detection & resources", included: true },
      { text: "Emotion tracking", included: true },
      { text: "Session notes", included: true },
      { text: "AI comfort letters", included: true },
      { text: "Emotion reports", included: true },
      { text: "Anniversary reminders", included: true },
    ],
    cta: "Get Started Free",
  },
  {
    code: "basic",
    name: "Basic",
    description: "For ongoing support through your grief journey.",
    singleUsePrice: 199, // $1.99
    weeklyPrice: 399, // $3.99/week
    monthlyPrice: 799,
    yearlyPrice: 5999,
    sessionLimit: "30 sessions / month",
    turnsPerSession: "20 turns / session",
    features: [
      { text: "Same quality AI support", included: true },
      { text: "Crisis detection & resources", included: true },
      { text: "Emotion tracking", included: true },
      { text: "Session notes", included: true },
      { text: "AI comfort letters", included: false, locked: true },
      { text: "Emotion reports", included: false, locked: true },
      { text: "Anniversary reminders", included: false, locked: true },
    ],
    cta: "Choose Basic",
  },
  {
    code: "premium",
    name: "Premium",
    description: "The full healing experience — unlimited sessions with all features.",
    singleUsePrice: 299, // $2.99
    weeklyPrice: 599, // $5.99/week
    monthlyPrice: 1299,
    yearlyPrice: 9999,
    sessionLimit: "Unlimited sessions",
    turnsPerSession: "30 turns / session",
    features: [
      { text: "Same quality AI support", included: true },
      { text: "Crisis detection & resources", included: true },
      { text: "Emotion tracking", included: true },
      { text: "Session notes", included: true },
      { text: "AI comfort letters", included: true },
      { text: "Emotion reports", included: true },
      { text: "Anniversary reminders", included: true },
    ],
    recommended: true,
    cta: "Choose Premium",
  },
];

// ── Helpers ──────────────────────────────────────────

function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatPriceWhole(cents: number): string {
  if (cents === 0) return "$0";
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function yearlySavingsPercent(monthly: number, yearly: number): number {
  if (monthly === 0) return 0;
  const monthlyTotal = monthly * 12;
  return Math.round(((monthlyTotal - yearly) / monthlyTotal) * 100);
}

// ── Page Component ───────────────────────────────────

type BillingCycle = "single" | "weekly" | "monthly" | "yearly";

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");

  return (
    <div className="py-16 sm:py-20">
      {/* Hero */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-14">
        <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
          Simple, Transparent Pricing
        </h1>
        <p className="text-gray-500 text-lg max-w-2xl mx-auto">
          Compassionate AI support for a fraction of the cost of traditional grief support. Choose the plan that fits
          your needs.
        </p>
        <p className="text-primary-600 text-sm font-medium mt-3">
          Start with 3 free sessions at Premium level — no credit card required.
        </p>
      </div>

      {/* Billing Toggle */}
      <div className="flex items-center justify-center gap-2 mb-12 flex-wrap">
        {(
          [
            { key: "single", label: "Single Use" },
            { key: "weekly", label: "Weekly" },
            { key: "monthly", label: "Monthly" },
            { key: "yearly", label: "Yearly", badge: "Save up to 37%" },
          ] as const
        ).map((option) => (
          <button
            type="button"
            key={option.key}
            onClick={() => setBillingCycle(option.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
              billingCycle === option.key
                ? "bg-primary-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {option.label}
            {"badge" in option && option.badge && <span className="ml-1.5 text-xs opacity-80">{option.badge}</span>}
          </button>
        ))}
      </div>

      {/* Plan Cards (Basic & Premium only) */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-3xl mx-auto">
          {PLANS.filter((plan) => plan.code !== "free").map((plan) => {
            const priceMap: Record<BillingCycle, number | null> = {
              single: plan.singleUsePrice,
              weekly: plan.weeklyPrice,
              monthly: plan.monthlyPrice,
              yearly: plan.yearlyPrice,
            };
            const price = priceMap[billingCycle] ?? 0;
            const isFree = plan.code === "free";
            const savings = yearlySavingsPercent(plan.monthlyPrice, plan.yearlyPrice);

            const periodLabel: Record<BillingCycle, string> = {
              single: "/ session",
              weekly: "/ wk",
              monthly: "/ mo",
              yearly: "/ yr",
            };

            return (
              <div
                key={plan.code}
                className={`relative bg-white border rounded-xl p-6 flex flex-col transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${
                  plan.recommended ? "border-primary-300 ring-1 ring-primary-200" : "border-gray-100"
                }`}
              >
                {/* Recommended Badge */}
                {plan.recommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                      Best Value
                    </span>
                  </div>
                )}

                {/* Free Plan: Premium Level Badge */}
                {isFree && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-amber-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                      Premium Level
                    </span>
                  </div>
                )}

                {/* Plan Header */}
                <div className="mb-6">
                  <h3 className="font-serif text-xl font-bold text-gray-900 mb-1">{plan.name}</h3>
                  <p className="text-sm text-gray-500">{plan.description}</p>
                </div>

                {/* Price */}
                <div className="mb-6">
                  {isFree ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-gray-900">Free</span>
                    </div>
                  ) : price !== null ? (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-gray-900">{formatPriceWhole(price)}</span>
                        <span className="text-sm text-gray-500">{periodLabel[billingCycle]}</span>
                      </div>
                      {billingCycle === "yearly" && savings > 0 && (
                        <p className="text-xs text-primary-600 font-medium mt-1">Save {savings}% vs monthly</p>
                      )}
                      {billingCycle === "yearly" && price > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatPrice(Math.round(price / 12))}/mo billed annually
                        </p>
                      )}
                      {billingCycle === "weekly" && price > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          ~{formatPrice(Math.round((price * 52) / 12))}/mo equivalent
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg text-gray-400">N/A for this cycle</span>
                    </div>
                  )}
                </div>

                {/* Session & Turn Limits */}
                <div className="bg-gray-50 rounded-lg px-3 py-2 mb-6 space-y-1">
                  <p className="text-sm font-medium text-gray-700">{plan.sessionLimit}</p>
                  <p className="text-xs text-gray-500">{plan.turnsPerSession}</p>
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature.text} className="flex items-start gap-2.5">
                      {feature.included ? (
                        <svg
                          aria-hidden="true"
                          className="w-4 h-4 text-primary-600 mt-0.5 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : feature.locked ? (
                        <svg
                          aria-hidden="true"
                          className="w-4 h-4 text-amber-400 mt-0.5 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                          />
                        </svg>
                      ) : (
                        <svg
                          aria-hidden="true"
                          className="w-4 h-4 text-gray-300 mt-0.5 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                      <span
                        className={`text-sm ${
                          feature.included ? "text-gray-700" : feature.locked ? "text-amber-600" : "text-gray-400"
                        }`}
                      >
                        {feature.text}
                        {feature.locked && <span className="text-xs ml-1">Premium</span>}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <button
                  type="button"
                  className={`w-full py-2.5 rounded-full text-sm font-medium transition-all duration-300 ${
                    plan.recommended
                      ? "bg-primary-600 text-white hover:bg-primary-700 shadow-sm"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            );
          })}
        </div>

        {/* Free Trial Card — spans full grid width */}
        <div className="max-w-3xl mx-auto mt-6 lg:mt-8">
          <div className="relative bg-gradient-to-r from-amber-50 to-primary-50 border border-amber-200 rounded-xl p-6 sm:p-8">
            <div className="absolute -top-3 left-6">
              <span className="bg-amber-500 text-white text-xs font-medium px-3 py-1 rounded-full">Premium Level</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="font-serif text-xl font-bold text-gray-900 mb-1">Start Free</h3>
                <p className="text-sm text-gray-600">
                  3 sessions with all Premium features — AI comfort letters, emotion reports, and 30 turns per session.
                  No credit card required.
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 bg-amber-500 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-amber-600 transition-colors shadow-sm"
              >
                Get Started Free
              </button>
            </div>
          </div>
        </div>

        {/* Download CTA */}
        <div className="text-center mt-8">
          <p className="text-sm text-gray-400">Available on iOS and Android. Download the app to get started.</p>
        </div>
      </div>

      {/* Comparison with Traditional Support */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 mt-20">
        <div className="bg-primary-50 border border-primary-100 rounded-xl p-6 sm:p-8">
          <h2 className="font-serif text-2xl font-bold text-gray-900 mb-2 text-center">Why Beside Pet?</h2>
          <p className="text-sm text-gray-600 text-center mb-8">
            Professional pet loss support typically costs $100 - $150 per session. Beside Pet offers compassionate
            support at a fraction of the cost.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-3xl font-bold text-primary-700 mb-1">24/7</p>
              <p className="text-sm text-gray-600">Available anytime</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary-700 mb-1">
                $7.99
                <span className="text-base font-normal text-gray-500">/mo</span>
              </p>
              <p className="text-sm text-gray-600">Starting price</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-primary-700 mb-1">No waitlist</p>
              <p className="text-sm text-gray-600">Start immediately</p>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ & Contact CTA */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 mt-14">
        <div className="text-center space-y-3">
          <Link
            href="/faq"
            className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium hover-underline-reveal"
          >
            Pricing FAQ &rarr;
          </Link>
          <p className="text-sm text-gray-400">
            or contact us at{" "}
            <a
              href={`mailto:${COMPANY_EMAIL}`}
              className="text-primary-600 hover:text-primary-700 hover-underline-reveal"
            >
              {COMPANY_EMAIL}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
