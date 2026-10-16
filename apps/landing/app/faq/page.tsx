import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY_EMAIL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Frequently asked questions about Beside Pet — AI-powered emotional support for pet loss and senior pet caregivers.",
};

// ── FAQ Data (mirrors Flutter FaqConstants) ──────────

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqSection {
  title: string;
  items: FaqItem[];
}

const FAQ_SECTIONS: FaqSection[] = [
  {
    title: "General",
    items: [
      {
        question: "What is BesidePet?",
        answer:
          "BesidePet is an AI-powered emotional support app designed for people experiencing pet loss or caring for aging pets. It provides 24/7 compassionate conversations to help you through difficult times.",
      },
      {
        question: "Is this a replacement for professional help?",
        answer:
          "No. BesidePet is an emotional support tool — not a substitute for professional therapy, clinical treatment, or veterinary advice. It offers a safe space to express your feelings and find comfort. If you are in crisis, please contact the 988 Suicide & Crisis Lifeline (call or text 988) or the Crisis Text Line (text HOME to 741741).",
      },
      {
        question: "Who is this app for?",
        answer:
          "BesidePet is for anyone grieving the loss of a pet, preparing for end-of-life care, or working professionally with animals (e.g., veterinarians, shelter workers, K-9 handlers). You must be at least 13 years old to use the app.",
      },
      {
        question: "Is the service available 24/7?",
        answer: "Yes! Because BesidePet is powered by AI, you can start a conversation at any time — day or night.",
      },
    ],
  },
  {
    title: "Pricing & Plans",
    items: [
      {
        question: "Can I try Beside Pet before subscribing?",
        answer:
          "Yes! Every new user gets 3 free sessions at Premium level — including AI comfort letters, emotion reports, and anniversary reminders. No credit card required.",
      },
      {
        question: "What's the difference between Basic and Premium?",
        answer:
          "The AI support quality is exactly the same on both plans. The difference is in what you get after each session: Basic includes session notes, while Premium also adds AI comfort letters, emotion reports, and anniversary reminders. Premium also offers 30 turns per session (vs. 20 for Basic) and unlimited sessions.",
      },
      {
        question: "What are single-use passes?",
        answer:
          "Single-use passes let you pay for one session at a time — $1.99 (Basic) or $2.99 (Premium). Great for occasional use, but if you use the app regularly, a weekly or monthly subscription saves you significantly.",
      },
      {
        question: "How does billing work?",
        answer:
          "Subscriptions are billed through the App Store (iOS) or Google Play Store (Android). You can choose weekly, monthly, or yearly billing. Yearly plans save you up to 37% compared to monthly pricing.",
      },
      {
        question: "Can I upgrade or downgrade my plan?",
        answer:
          "You can upgrade from Basic to Premium at any time. When you upgrade, you'll only pay the prorated difference for the remainder of your current billing period. Downgrading is handled through cancellation — your access continues until the end of your billing period.",
      },
      {
        question: "How do I cancel my subscription?",
        answer:
          "You can cancel anytime through your App Store or Google Play subscription settings. You'll continue to have access until the end of your current billing period. No cancellation fees.",
      },
    ],
  },
  {
    title: "Account",
    items: [
      {
        question: "How do I delete my account?",
        answer:
          "Go to More > Delete Account. This will permanently remove your profile, conversation history, and all associated data after a 30-day retention period. This action cannot be undone.",
      },
    ],
  },
  {
    title: "AI Companion",
    items: [
      {
        question: "How does the AI companion work?",
        answer:
          "You have a text-based conversation with our AI companion, which is designed to provide compassionate, empathetic emotional support for pet loss and aging-pet concerns. Each conversation adapts to your feelings and personal story.",
      },
      {
        question: "Is my conversation private?",
        answer:
          "Yes. Your conversations are encrypted and stored securely. We do not share your personal data or conversation content with third parties. Please see our Privacy Policy for full details.",
      },
      {
        question: "What if I am in crisis?",
        answer:
          "If you are experiencing an emotional crisis or feel you need immediate help, please reach out to professional services: 988 Suicide & Crisis Lifeline (call or text 988), Crisis Text Line (text HOME to 741741), or ASPCA Animal Poison Control at (888) 426-4435. Our AI also watches for signs of distress and will provide these resources automatically when needed.",
      },
      {
        question: "Are my conversations saved?",
        answer:
          "Yes. Your conversation history is saved so the AI can provide continuity across conversations. You can view past session notes and AI letters in your Memory Space. If you delete your account, all conversation data will be permanently removed.",
      },
    ],
  },
  {
    title: "Technical",
    items: [
      {
        question: "The app is not loading. What should I do?",
        answer:
          "Try these steps: (1) Check your internet connection. (2) Close and reopen the app. (3) Update the app to the latest version. (4) Restart your device. If the problem persists, please contact us through More > Report & Feedback in the app.",
      },
      {
        question: "The chat is not responding.",
        answer:
          'This may be due to a temporary server issue. Please wait a few moments and try again. If the problem continues, use "Report & Feedback" in the app and select "Bug Report" to let us know.',
      },
      {
        question: "How can I contact support?",
        answer:
          "You can reach us through the in-app Report & Feedback feature (More > Report & Feedback) or by emailing support@besidepet.com. We aim to respond within 24-48 hours.",
      },
    ],
  },
];

// ── Page Component ──────────────────────────────────

export default function FaqPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Frequently Asked Questions</h1>
      <p className="text-gray-500 mb-12 max-w-2xl">
        Find answers to common questions about BesidePet, your AI companion for navigating pet loss and senior pet care.
      </p>

      {/* FAQ Sections */}
      <div className="space-y-10">
        {FAQ_SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="font-serif text-xl font-bold text-gray-900 mb-4">{section.title}</h2>
            <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-100 overflow-hidden">
              {section.items.map((item) => (
                <details key={item.question} className="group">
                  <summary className="flex items-center justify-between cursor-pointer px-5 py-4 text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors">
                    <span>{item.question}</span>
                    <svg
                      aria-hidden="true"
                      className="w-4 h-4 text-gray-400 shrink-0 ml-4 transition-transform duration-200 group-open:rotate-180"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed">{item.answer}</div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Contact CTA */}
      <div className="mt-14 bg-primary-50 border border-primary-100 rounded-xl p-6 text-center">
        <h3 className="font-serif text-lg font-bold text-gray-900 mb-2">Still have questions?</h3>
        <p className="text-sm text-gray-600 mb-4">
          We&apos;re here to help. Reach out and we&apos;ll get back to you within 24-48 hours.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href={`mailto:${COMPANY_EMAIL}`}
            className="inline-flex items-center gap-2 bg-primary-600 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            <span>✉️</span>
            {COMPANY_EMAIL}
          </a>
          <Link
            href="/resources"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium hover-underline-reveal"
          >
            View resources &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
