import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-white px-6 py-12">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <p className="text-sm font-semibold tracking-widest text-indigo-primary">
          404
        </p>
        <h1 className="text-3xl font-semibold text-black-primary">
          Page not found
        </h1>
        <p className="text-sm text-gray-primary">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-full bg-indigo-primary px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
