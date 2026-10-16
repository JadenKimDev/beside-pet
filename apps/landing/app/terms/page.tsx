import type { Metadata } from "next";
import { COMPANY_EMAIL, COMPANY_NAME, SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `Terms of Service for Beside Pet by ${COMPANY_NAME}.`,
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-400 mb-10">Last updated: February 24, 2026</p>

      <div className="prose max-w-none">
        <p>
          Welcome to Beside Pet (&quot;Beside,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). These Terms of
          Service (&quot;Terms&quot;) govern your access to and use of the Beside Pet mobile application and website at{" "}
          <a href={SITE_URL}>{SITE_URL}</a> (collectively, the &quot;Service&quot;), operated by {COMPANY_NAME}.
        </p>

        <p>
          By accessing or using the Service, you agree to be bound by these Terms. If you do not agree to these Terms,
          please do not use the Service.
        </p>

        <h2>1. Description of Service</h2>
        <p>
          Beside Pet provides AI-powered emotional support for individuals experiencing pet loss or caring for
          senior/aging pets. The Service includes an AI chat companion, memory space features, and informational
          resources.
        </p>

        <h2>2. Important Disclaimers</h2>

        <h3>Not a Substitute for Professional Help</h3>
        <p>
          <strong>Beside Pet is NOT a medical, veterinary, or mental health service.</strong> The AI companion is
          designed to provide emotional support and companionship only. It does not provide:
        </p>
        <ul>
          <li>Medical or veterinary diagnoses, advice, or treatment</li>
          <li>Mental health counseling, therapy, or psychological treatment</li>
          <li>Crisis intervention services</li>
        </ul>
        <p>
          If you are in crisis or experiencing thoughts of self-harm, please contact the 988 Suicide &amp; Crisis
          Lifeline (call or text 988) or the Crisis Text Line (text HOME to 741741) immediately.
        </p>

        <h3>AI Limitations</h3>
        <p>
          The AI companion may occasionally provide inaccurate, incomplete, or inappropriate responses. We continuously
          work to improve the Service, but we cannot guarantee the accuracy or appropriateness of all AI outputs.
        </p>

        <h2>3. Eligibility</h2>
        <p>
          You must be at least 13 years of age to use the Service. If you are between 13 and 18 years of age, you must
          have the consent of a parent or legal guardian. By using the Service, you represent that you meet these
          requirements.
        </p>

        <h2>4. Account Registration</h2>
        <p>
          To access certain features, you may need to create an account. You are responsible for maintaining the
          confidentiality of your account credentials and for all activities that occur under your account.
        </p>

        <h2>5. User Conduct</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any unlawful purpose or in violation of any applicable law</li>
          <li>Attempt to reverse-engineer, decompile, or hack the Service</li>
          <li>Use the Service to generate harmful, abusive, or inappropriate content</li>
          <li>Impersonate any person or entity</li>
          <li>Interfere with or disrupt the Service or servers connected to the Service</li>
        </ul>

        <h2>6. Subscription and Payments</h2>
        <p>
          Beside Pet offers both free and paid subscription plans. Paid subscriptions are billed through the Apple App
          Store or Google Play Store. By subscribing, you agree to the pricing and payment terms presented at the time
          of purchase.
        </p>
        <p>
          Subscription renewals are automatic unless cancelled at least 24 hours before the end of the current billing
          period. You may manage or cancel your subscription through your device&apos;s app store settings.
        </p>

        <h2>7. Intellectual Property</h2>
        <p>
          All content, features, and functionality of the Service — including text, graphics, logos, and software — are
          the property of {COMPANY_NAME} and are protected by copyright, trademark, and other intellectual property
          laws.
        </p>
        <p>
          Content you create within the Service (such as letters, photos, and messages) remains your property. By
          uploading content, you grant us a limited license to store, process, and display it as necessary to provide
          the Service.
        </p>

        <h2>8. Privacy</h2>
        <p>
          Your privacy is important to us. Please review our <a href="/privacy">Privacy Policy</a> to understand how we
          collect, use, and protect your information.
        </p>

        <h2>9. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, {COMPANY_NAME} SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
          SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR GOODWILL,
          ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE.
        </p>
        <p>
          IN NO EVENT SHALL OUR TOTAL LIABILITY EXCEED THE AMOUNT YOU HAVE PAID US IN THE TWELVE (12) MONTHS PRECEDING
          THE CLAIM.
        </p>

        <h2>10. Indemnification</h2>
        <p>
          You agree to indemnify and hold harmless {COMPANY_NAME}, its officers, directors, and employees from any
          claims, damages, or expenses arising from your use of the Service or violation of these Terms.
        </p>

        <h2>11. Termination</h2>
        <p>
          We may terminate or suspend your access to the Service at any time, without prior notice, for conduct that we
          believe violates these Terms or is harmful to the Service or other users. You may also delete your account at
          any time through the app settings.
        </p>

        <h2>12. Changes to Terms</h2>
        <p>
          We may update these Terms from time to time. We will notify you of material changes by posting the updated
          Terms on the Service with a new &quot;Last updated&quot; date. Your continued use of the Service after changes
          constitutes acceptance of the updated Terms.
        </p>

        <h2>13. Governing Law</h2>
        <p>
          These Terms shall be governed by and construed in accordance with the laws of the State of Wyoming, without
          regard to its conflict of law provisions. Any disputes arising from these Terms shall be resolved in the
          courts of the State of Wyoming.
        </p>

        <h2>14. Contact Us</h2>
        <p>
          If you have questions about these Terms, please contact us at{" "}
          <a href={`mailto:${COMPANY_EMAIL}`}>{COMPANY_EMAIL}</a>.
        </p>

        <hr />
        <p className="text-sm text-gray-400">{COMPANY_NAME} &middot; Sheridan, Wyoming, USA</p>
      </div>
    </div>
  );
}
