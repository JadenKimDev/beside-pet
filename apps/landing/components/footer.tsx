import Image from "next/image";
import Link from "next/link";
import { BUY_ME_A_COFFEE_URL, COMPANY_NAME, FOOTER_LINKS, SITE_NAME } from "@/lib/constants";

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 mt-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <Link href="/" className="flex items-center gap-2 mb-3 group">
              <Image
                src="/images/app-icon.png"
                alt="Beside Pet"
                width={28}
                height={28}
                className="transition-transform duration-300 group-hover:scale-110"
              />
              <span className="font-serif text-lg font-bold text-primary-700">{SITE_NAME}</span>
            </Link>
            <p className="text-sm text-gray-500 leading-relaxed">
              AI-powered emotional support for those navigating pet loss and senior pet care.
            </p>
          </div>

          {/* Navigation links — matches header sections */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Navigate</h3>
            <ul className="space-y-2">
              {FOOTER_LINKS.navigate.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-500 hover:text-primary-600 transition-colors duration-300 hover-underline-reveal"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support links */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Support</h3>
            <ul className="space-y-2">
              {FOOTER_LINKS.support.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-500 hover:text-primary-600 transition-colors duration-300 hover-underline-reveal"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal links */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Legal</h3>
            <ul className="space-y-2">
              {FOOTER_LINKS.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-500 hover:text-primary-600 transition-colors duration-300 hover-underline-reveal"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.
          </p>
          <a
            href={BUY_ME_A_COFFEE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary-600 transition-all duration-300 hover:-translate-y-0.5"
          >
            <span>☕</span>
            <span>Buy us a coffee</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
