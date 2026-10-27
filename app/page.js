import Link from "next/link";

const destinations = [
  {
    eyebrow: "For institutions",
    title: "Start an application",
    description:
      "Submit a new institution application and provide the details and documents needed for review.",
    href: "/institution/apply-new",
    action: "Go to application",
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        className="h-6 w-6"
      >
        <path
          d="M7 3.75h7l4.25 4.25v12.25H7A2.25 2.25 0 0 1 4.75 18V6A2.25 2.25 0 0 1 7 3.75Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M14 4v4h4m-9.5 4h6m-6 3.5h6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    eyebrow: "For administrators",
    title: "Review applications",
    description:
      "Open the master review queue to inspect submitted applications and their audit results.",
    href: "/admin/dashboard",
    action: "Open admin dashboard",
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        className="h-6 w-6"
      >
        <circle
          cx="9"
          cy="8"
          r="3.25"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M3.75 19v-1.25A4.75 4.75 0 0 1 8.5 13h1a4.75 4.75 0 0 1 4.75 4.75V19h-10.5Zm12-10.75a3.25 3.25 0 0 1 0 6.5m1.75-1.25A4.75 4.75 0 0 1 20.25 18v1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center bg-emerald-800 text-sm font-semibold text-white"
          >
            A
          </span>
          <div>
            <p className="font-semibold tracking-tight">AICTE</p>
            <p className="text-xs text-gray-600">
              Institution Application & Review Portal
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <section
          aria-labelledby="welcome-heading"
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">
            Welcome
          </p>
          <h1
            id="welcome-heading"
            className="mt-4 text-4xl font-semibold tracking-tight text-gray-950 sm:text-5xl"
          >
            Where would you like to go?
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-gray-600 sm:text-lg">
            Choose the portal that matches your role to continue.
          </p>
        </section>

        <section
          aria-label="Portal options"
          className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-2"
        >
          {destinations.map((destination) => (
            <Link
              key={destination.href}
              href={destination.href}
              className="group flex min-h-64 flex-col border border-gray-200 bg-white p-7 shadow-sm transition hover:border-emerald-700 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800 sm:p-9"
            >
              <span className="flex h-12 w-12 items-center justify-center border border-emerald-200 bg-emerald-50 text-emerald-900">
                {destination.icon}
              </span>
              <p className="mt-6 text-sm font-medium text-emerald-800">
                {destination.eyebrow}
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">
                {destination.title}
              </h2>
              <p className="mt-3 flex-1 text-sm leading-6 text-gray-600">
                {destination.description}
              </p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">
                {destination.action}
                <span
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
