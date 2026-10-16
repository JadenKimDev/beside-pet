export const SITE_NAME = "Beside Pet";
export const SITE_DESCRIPTION =
  "AI-powered emotional support for pet loss and senior pet caregivers. Available 24/7, because grief doesn't keep office hours.";
export const SITE_URL = "https://besidepet.com";
export const COMPANY_NAME = "Beside Labs LLC";
export const COMPANY_EMAIL = "support@besidepet.com";

export const SECTIONS = [
  { id: "home", label: "Home" },
  { id: "features", label: "Features" },
  { id: "blog", label: "Blog" },
  { id: "emergency", label: "Emergency" },
  { id: "organizations", label: "Organizations" },
  { id: "about", label: "About" },
] as const;

export const FOOTER_LINKS = {
  navigate: [
    { href: "/", label: "Home" },
    { href: "/#features", label: "Features" },
    { href: "/#blog", label: "Blog" },
    { href: "/#emergency", label: "Emergency" },
    { href: "/#organizations", label: "Organizations" },
    { href: "/#about", label: "About" },
  ],
  support: [
    { href: "/pricing", label: "Pricing" },
    { href: "/faq", label: "FAQ" },
    { href: "/resources", label: "Resources" },
    { href: `mailto:${COMPANY_EMAIL}`, label: "Contact Us" },
  ],
  legal: [
    { href: "/terms", label: "Terms" },
    { href: "/privacy", label: "Privacy" },
  ],
} as const;

export const EMERGENCY_CONTACTS = [
  {
    name: "988 Suicide & Crisis Lifeline",
    number: "988",
    description: "Call or text 988, available 24/7",
    url: "https://988lifeline.org",
  },
  {
    name: "Crisis Text Line",
    number: "741741",
    description: "Text HOME to 741741",
    url: "https://www.crisistextline.org",
  },
  {
    name: "ASPCA Animal Poison Control",
    number: "(888) 426-4435",
    description: "24/7 emergency hotline for animal poisoning",
    url: "https://www.aspca.org/pet-care/animal-poison-control",
  },
] as const;

export const BLOG_CATEGORIES = ["Retired K9 Stories", "Pet Loss & Grief", "Senior Pet Care", "Community"] as const;

export const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/besidepet";
export const PROJECT_K9_HERO_URL = "https://projectk9hero.org";
