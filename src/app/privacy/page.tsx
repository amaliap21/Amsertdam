import Link from "next/link";

export const metadata = {
  title: "Privacy Policy, RealTrack",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/sign-up" className="text-sm text-indigo-primary hover:underline">
        &larr; Back to Sign Up
      </Link>
      <h1 className="mt-4 mb-2 text-3xl font-semibold text-black-primary">
        Privacy Policy
      </h1>
      <p className="mb-8 text-sm text-gray-primary">Last updated: 2026-05-20</p>

      <div className="prose prose-sm sm:prose-base max-w-none space-y-6 text-black-primary">
        <section>
          <h2 className="text-xl font-semibold">What we collect</h2>
          <ul className="list-disc pl-6">
            <li>
              <strong>Email address</strong>, used to sign you in and to send
              account-related emails (verification, password reset).
            </li>
            <li>
              <strong>Profile fields you fill in</strong>, name, major,
              semester. Optional.
            </li>
            <li>
              <strong>Study data you create</strong>, courses, tasks,
              flashcards, quizzes, schedules. Stored against your account.
            </li>
            <li>
              <strong>Files you upload to AI features</strong>, PDFs/images
              are processed to generate flashcards or quizzes. They are not
              retained beyond the generation request.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">What we don&apos;t do</h2>
          <ul className="list-disc pl-6">
            <li>We don&apos;t sell your email or personal data.</li>
            <li>
              We don&apos;t share your study data with other users or with
              third parties for advertising.
            </li>
            <li>
              We don&apos;t use your uploaded study materials to train models.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Where your data lives</h2>
          <p>
            Account credentials and study data are stored in Supabase (hosted
            in Singapore). AI generation uses OpenRouter to access multiple
            model providers and may fall back to Anthropic&apos;s Claude API if
            the free-tier models are unavailable. Content sent to these
            providers is governed by their commercial terms (no training on
            customer data).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Payments</h2>
          <p>
            Premium credit purchases are processed by{" "}
            <strong>Midtrans</strong> (PT Midtrans), a licensed Indonesian
            payment gateway. When you pay, your payment details (card number,
            e-wallet, bank account) are entered on Midtrans&apos;s secure
            checkout and handled by Midtrans, <strong>RealTrack never sees or
            stores them</strong>. We only receive a payment confirmation
            containing the order ID, amount, status, and your account reference,
            which we use to add credits to your account. See{" "}
            <Link href="/terms#refunds" className="text-indigo-primary hover:underline">
              Refund Policy
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Your rights</h2>
          <p>
            You can update your profile or change your password from the
            navbar. You can delete any course, task, deck, or quiz from its
            page. To delete your entire account and all associated data,
            contact us through the GitHub repo.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Security</h2>
          <p>
            Passwords are hashed by Supabase (bcrypt). All data access goes
            through user-scoped Row-Level Security policies on the server.
            Communication is HTTPS-only.
          </p>
        </section>

        <p className="text-sm text-gray-primary">
          See also our{" "}
          <Link href="/terms" className="text-indigo-primary hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
