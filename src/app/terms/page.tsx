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
            RealTrack is provided &quot;as is&quot; for a hackathon project.
            We can&apos;t guarantee uptime, and AI-generated content may
            occasionally be wrong — always verify against your course
            materials before relying on it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">6. Termination</h2>
          <p>
            You may delete your account at any time. We may close accounts
            that breach these Terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">7. Contact</h2>
          <p>
            Questions about these Terms? See the team contact at the bottom
            of the README in the GitHub repo.
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
