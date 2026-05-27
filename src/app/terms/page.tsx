import Link from "next/link";

export const metadata = {
  title: "Terms of Service — RealTrack",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/sign-up" className="text-sm text-indigo-primary hover:underline">
        &larr; Back to Sign Up
      </Link>
      <h1 className="mt-4 mb-2 text-3xl font-semibold text-black-primary">
        Terms of Service
      </h1>
      <p className="mb-8 text-sm text-gray-primary">Last updated: 2026-05-20</p>

      <div className="prose prose-sm sm:prose-base max-w-none space-y-6 text-black-primary">
        <section>
          <h2 className="text-xl font-semibold">1. Who we are</h2>
          <p>
            RealTrack is a student wellbeing and study-planning tool built by
            students at ITB for the HackAstone hackathon. By creating an
            account you agree to these Terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">2. Your account</h2>
          <p>
            You provide an email address and password (or sign in with Google).
            You&apos;re responsible for keeping your password safe and for
            anything done with your account. If you suspect unauthorized
            access, change your password via &quot;Forgot password&quot; on
            the sign-in page.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">3. What you can store</h2>
          <p>
            You may add your own courses, tasks, flashcards, and quizzes. Don&apos;t
            upload content you don&apos;t have the right to share, and don&apos;t
            use the AI features to generate harmful or illegal content.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">4. Acceptable use</h2>
          <p>
            Don&apos;t attempt to bypass security, scrape other users&apos;
            data, abuse the AI endpoints, or impersonate others. We may
            suspend accounts that violate these rules.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">5. Service availability</h2>
          <p>
            RealTrack is provided &quot;as is&quot;. We can&apos;t guarantee
            uptime, and AI-generated content may occasionally be wrong —
            always verify against your course materials before relying on it.
          </p>
        </section>

        {/* ── Commerce / digital-goods terms (Midtrans Template #3) ── */}
        <section id="payments">
          <h2 className="text-xl font-semibold">6. Premium credits &amp; payments</h2>
          <p>
            RealTrack offers an optional paid tier. You may purchase
            <strong> Premium Credits</strong>, a digital good that lets you run
            answer analyses using a higher-quality AI model (Claude). One credit
            equals one premium analysis. Credits are added to your account
            automatically once payment is confirmed.
          </p>
          <p className="mt-2">
            Payments are processed by <strong>Midtrans</strong> (PT Midtrans), a
            licensed Indonesian payment gateway, which supports QRIS, e-wallets,
            virtual accounts, and cards. RealTrack does not store your card or
            banking details — they are handled entirely by Midtrans. Prices are
            shown in Indonesian Rupiah (IDR) and are inclusive of applicable
            fees unless stated otherwise.
          </p>
        </section>

        <section id="pricing">
          <h2 className="text-xl font-semibold">7. Pricing changes</h2>
          <p>
            We may change credit pack prices or contents at any time. Any change
            applies only to purchases made after the change; credits you have
            already bought keep their original value. If a price is displayed in
            error, we reserve the right to refuse or cancel the affected order
            and refund any amount charged.
          </p>
        </section>

        <section id="refunds">
          <h2 className="text-xl font-semibold">8. Refund policy</h2>
          <p>
            Premium Credits are a digital good delivered to your account
            immediately after payment. Because of this:
          </p>
          <ul className="mt-2 list-disc pl-6">
            <li>
              <strong>Unused credits</strong> may be refunded within{" "}
              <strong>7 days</strong> of purchase if you have not used any
              credit from that pack. Refunds are issued to the original payment
              method via Midtrans.
            </li>
            <li>
              <strong>Used or partially used</strong> packs are non-refundable,
              since the digital service has already been delivered.
            </li>
            <li>
              If you were charged but credits did not appear in your account,
              contact us — we will investigate and either grant the credits or
              issue a full refund.
            </li>
          </ul>
          <p className="mt-2">
            To request a refund, contact us (see section 11) with your account
            email and the Midtrans order ID from your payment receipt.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">9. Service availability of paid features</h2>
          <p>
            We rely on third-party AI providers for premium analysis. If a
            premium analysis fails for a technical reason, the credit is
            automatically refunded to your balance and you are not charged for
            that attempt. We are not liable for the accuracy of AI-generated
            feedback; it is a study aid, not authoritative grading.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">10. Termination</h2>
          <p>
            You may delete your account at any time. We may close accounts that
            breach these Terms. If we close your account for a breach, unused
            paid credits may be forfeited; if we close it for any other reason,
            we will refund the value of unused credits where reasonably
            possible.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">11. Governing law &amp; contact</h2>
          <p>
            These Terms are governed by the laws of the Republic of Indonesia.
            Questions, refund requests, or complaints about payments or privacy:
            contact us via the team email listed in the project README, or reply
            to your payment receipt email.
          </p>
        </section>

        <p className="text-sm text-gray-primary">
          See also our{" "}
          <Link href="/privacy" className="text-indigo-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
