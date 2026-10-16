import type { Metadata } from "next";
import { COMPANY_EMAIL, COMPANY_NAME, SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `Privacy Policy for Beside Pet by ${COMPANY_NAME}. COPPA and CCPA compliant.`,
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-400 mb-10">Last updated: February 24, 2026</p>

      <div className="prose max-w-none">
        <p>
          {COMPANY_NAME} (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the Beside Pet mobile application
          and website at <a href={SITE_URL}>{SITE_URL}</a> (the &quot;Service&quot;). This Privacy Policy describes how
          we collect, use, and protect your personal information.
        </p>

        <h2>1. Information We Collect</h2>

        <h3>Information You Provide</h3>
        <ul>
          <li>
            <strong>Account Information:</strong> Email address, display name, and authentication credentials when you
            create an account.
          </li>
          <li>
            <strong>Pet Information:</strong> Your pet&apos;s name, species, breed, age, and your relationship with
            them, provided during onboarding.
          </li>
          <li>
            <strong>Conversation Data:</strong> Messages you send to the AI companion during support sessions.
          </li>
          <li>
            <strong>User Content:</strong> Photos, letters, and other content you upload to your memory space.
          </li>
        </ul>

        <h3>Information Collected Automatically</h3>
        <ul>
          <li>
            <strong>Usage Data:</strong> Session frequency, feature usage patterns, and app interactions.
          </li>
          <li>
            <strong>Device Information:</strong> Device type, operating system, and app version.
          </li>
        </ul>

        <h3>Information We Do NOT Collect</h3>
        <ul>
          <li>We do not collect precise geolocation data.</li>
          <li>We do not sell, rent, or trade your personal information to third parties.</li>
          <li>We do not use your conversation data to train AI models or for advertising purposes.</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <p>We use the information we collect to:</p>
        <ul>
          <li>Provide and improve the Service</li>
          <li>Personalize your AI companion experience based on your pet&apos;s information</li>
          <li>Generate session notes and comfort letters after sessions</li>
          <li>Detect and respond to crisis situations (safety purposes)</li>
          <li>Communicate service updates and important notices</li>
          <li>Maintain security and prevent fraud</li>
        </ul>

        <h2>3. Data Storage and Security</h2>
        <p>
          Your data is stored securely on servers located in the United States. We use industry-standard security
          measures, including:
        </p>
        <ul>
          <li>Encrypted data transmission (TLS/SSL)</li>
          <li>Encrypted data storage at rest</li>
          <li>Access controls and authentication</li>
          <li>Regular security audits</li>
        </ul>
        <p>
          While we take reasonable measures to protect your data, no method of electronic storage is 100% secure. We
          cannot guarantee absolute security.
        </p>

        <h2>4. Data Sharing</h2>
        <p>We may share your information only in the following circumstances:</p>
        <ul>
          <li>
            <strong>Service Providers:</strong> With trusted third-party providers who help us operate the Service
            (e.g., cloud hosting, AI processing), bound by confidentiality agreements.
          </li>
          <li>
            <strong>Legal Requirements:</strong> When required by law, legal process, or government request.
          </li>
          <li>
            <strong>Safety:</strong> When we believe disclosure is necessary to protect the safety of our users or the
            public.
          </li>
        </ul>

        <h2>5. Children&apos;s Privacy (COPPA Compliance)</h2>
        <p>
          The Service is not directed to children under the age of 13. We do not knowingly collect personal information
          from children under 13. If we discover that we have inadvertently collected information from a child under 13,
          we will promptly delete it.
        </p>
        <p>
          If you are a parent or guardian and believe your child has provided us with personal information, please
          contact us at <a href={`mailto:${COMPANY_EMAIL}`}>{COMPANY_EMAIL}</a>.
        </p>

        <h2>6. California Privacy Rights (CCPA)</h2>
        <p>
          If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):
        </p>
        <ul>
          <li>
            <strong>Right to Know:</strong> You may request information about the personal data we have collected about
            you.
          </li>
          <li>
            <strong>Right to Delete:</strong> You may request the deletion of your personal data.
          </li>
          <li>
            <strong>Right to Opt-Out:</strong> You may opt out of the sale of your personal data. Note: We do not sell
            personal data.
          </li>
          <li>
            <strong>Non-Discrimination:</strong> We will not discriminate against you for exercising your CCPA rights.
          </li>
        </ul>
        <p>
          To exercise your rights, please contact us at <a href={`mailto:${COMPANY_EMAIL}`}>{COMPANY_EMAIL}</a>.
        </p>

        <h2>7. Data Retention</h2>
        <p>
          We retain your personal data for as long as your account is active or as needed to provide the Service. You
          may delete your account at any time through the app settings, which will initiate the deletion of your
          personal data within 30 days.
        </p>
        <p>
          We may retain certain information as required by law or for legitimate business purposes (e.g., fraud
          prevention, legal compliance).
        </p>

        <h2>8. Your Choices</h2>
        <ul>
          <li>
            <strong>Account Deletion:</strong> You can delete your account and all associated data through the app
            settings.
          </li>
          <li>
            <strong>Communication Preferences:</strong> You can opt out of non-essential communications at any time.
          </li>
          <li>
            <strong>Data Export:</strong> You may request a copy of your data by contacting us.
          </li>
        </ul>

        <h2>9. Third-Party Services</h2>
        <p>
          The Service may contain links to third-party websites or services. We are not responsible for the privacy
          practices of these third parties. We encourage you to review their privacy policies.
        </p>

        <h2>10. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of material changes by posting the
          updated policy on the Service with a new &quot;Last updated&quot; date. Your continued use of the Service
          after changes constitutes acceptance of the updated policy.
        </p>

        <h2>11. Contact Us</h2>
        <p>If you have questions or concerns about this Privacy Policy or our data practices, please contact us at:</p>
        <p>
          {COMPANY_NAME}
          <br />
          Email: <a href={`mailto:${COMPANY_EMAIL}`}>{COMPANY_EMAIL}</a>
        </p>

        <hr />
        <p className="text-sm text-gray-400">{COMPANY_NAME} &middot; Sheridan, Wyoming, USA</p>
      </div>
    </div>
  );
}
