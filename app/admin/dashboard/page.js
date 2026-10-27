"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const statusFilters = ["All", "PENDING_REVIEW", "FLAGGED", "APPROVED"];

const statusStyles = {
  PENDING_REVIEW: "border-emerald-200 bg-emerald-50 text-emerald-900",
  FLAGGED: "border-emerald-200 bg-emerald-50 text-emerald-900",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

function SummaryCard({ label, value, detail, icon }) {
  return (
    <article className="flex items-start justify-between gap-4 border border-gray-200 bg-white p-6">
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-600">{label}</p>
        <p className="text-3xl font-semibold tracking-tight text-gray-900">
          {value}
        </p>
        <p className="text-sm text-gray-600">{detail}</p>
      </div>
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center border border-gray-200 bg-gray-50 text-gray-700"
      >
        {icon}
      </span>
    </article>
  );
}

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap border px-2.5 py-1 text-xs font-medium ${statusStyles[status] ?? "border-gray-200 bg-gray-50 text-gray-800"}`}
    >
      {status}
    </span>
  );
}

export default function AdminDashboardPage() {
  const [applications, setApplications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadApplications() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch("/api/admin/applications", {
          signal: controller.signal,
          cache: "no-store",
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Unable to load applications.");
        }
        if (!Array.isArray(result.applications)) {
          throw new Error("The applications response was invalid.");
        }

        setApplications(result.applications);
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          setError(loadError.message || "Unable to load applications.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    loadApplications();
    return () => controller.abort();
  }, [reloadKey]);

  const filteredApplications = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return applications.filter((application) => {
      const matchesStatus =
        activeFilter === "All" || application.status === activeFilter;
      const matchesSearch =
        !query ||
        application.institutionName.toLowerCase().includes(query) ||
        application.id.toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [activeFilter, applications, searchQuery]);

  const pendingCount = applications.filter(
    (application) => application.status === "PENDING_REVIEW",
  ).length;
  const flaggedCount = applications.filter(
    (application) => application.status === "FLAGGED",
  ).length;
  const approvedCount = applications.filter(
    (application) => application.status === "APPROVED",
  ).length;

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col justify-between gap-5 border-b border-gray-200 pb-6 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-600">
              AICTE <span className="px-1 text-gray-400">/</span> Admin
              Dashboard
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
              Master Review Queue
            </h1>
            <p className="text-sm text-gray-600">
              Review institution applications and automated audit outcomes.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full bg-emerald-700"
            />
            Review queue active
          </span>
        </header>

        <section
          aria-label="Application summary"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <SummaryCard
            label="Total Applications"
            value={isLoading || error ? "—" : applications.length}
            detail="Applications in the queue"
            icon={
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className="h-5 w-5"
              >
                <path
                  d="M7 3.75h7l4.25 4.25v12.25H7A2.25 2.25 0 0 1 4.75 18V6A2.25 2.25 0 0 1 7 3.75Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M14 4v4h4M8.5 12h6M8.5 15.5h6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            }
          />
          <SummaryCard
            label="Pending Audit"
            value={isLoading || error ? "—" : pendingCount}
            detail="Awaiting admin review"
            icon={
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className="h-5 w-5"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="8.25"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M12 7.5v5l3 1.75"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />
          <SummaryCard
            label="Flagged Deficiencies"
            value={isLoading || error ? "—" : flaggedCount}
            detail="Require deficiency follow-up"
            icon={
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className="h-5 w-5"
              >
                <path
                  d="M12 3.75 21 19.5H3L12 3.75Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 9v4.5m0 3h.01"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            }
          />
          <SummaryCard
            label="Approved Institutions"
            value={isLoading || error ? "—" : approvedCount}
            detail="Applications approved"
            icon={
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className="h-5 w-5"
              >
                <path
                  d="m5 12.5 4.25 4.25L19 7"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />
        </section>

        <section
          aria-labelledby="applications-heading"
          className="space-y-5 border border-gray-200 bg-white p-6"
        >
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2
                id="applications-heading"
                className="text-lg font-semibold text-gray-900"
              >
                Applications
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Search and filter submitted institution dossiers.
              </p>
            </div>
            <label className="relative block w-full lg:max-w-sm">
              <span className="sr-only">
                Search by institution name or ID
              </span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500"
              >
                <circle
                  cx="10.75"
                  cy="10.75"
                  r="6.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="m16 16 4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search institution or ID"
                className="w-full border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
              />
            </label>
          </div>

          <div
            aria-label="Filter applications by status"
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {statusFilters.map((filter) => {
              const isActive = activeFilter === filter;

              return (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveFilter(filter)}
                  className={`whitespace-nowrap border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 ${
                    isActive
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {filter}
                </button>
              );
            })}
          </div>

          <div className="overflow-x-auto border border-gray-200">
            <table className="min-w-[1050px] w-full border-collapse text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Institution ID &amp; Name
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Sponsoring Trust
                  </th>
                  <th scope="col" className="px-4 py-3">
                    State / District
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Program &amp; Intake
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredApplications.map((application) => (
                  <tr key={application.id} className="align-top">
                    <td className="px-4 py-4">
                      <p className="font-medium text-gray-900">
                        {application.institutionName}
                      </p>
                      <p className="mt-1 text-xs text-gray-600">
                        {application.id}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-gray-700">
                      {application.trustName}
                    </td>
                    <td className="px-4 py-4 text-gray-700">
                      <p>{application.state}</p>
                      <p className="mt-1 text-xs text-gray-600">
                        {application.district}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-gray-700">
                      <p>{application.program}</p>
                      <p className="mt-1 text-xs text-gray-600">
                        Intake: {application.intake}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={application.status} />
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/admin/audit/${application.id}`}
                        className="inline-flex whitespace-nowrap border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                      >
                        Review Audit Dossier
                      </Link>
                    </td>
                  </tr>
                ))}
                {!isLoading && !error && filteredApplications.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-sm text-gray-600"
                    >
                      No applications match your search and filter.
                    </td>
                  </tr>
                ) : null}
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-sm text-gray-600"
                    >
                      Loading applications…
                    </td>
                  </tr>
                ) : null}
                {error ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center">
                      <p role="alert" className="text-sm text-gray-800">
                        {error}
                      </p>
                      <button
                        type="button"
                        onClick={() => setReloadKey((key) => key + 1)}
                        className="mt-3 border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                      >
                        Try again
                      </button>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p aria-live="polite" className="text-sm text-gray-600">
            {isLoading || error
              ? ""
              : `Showing ${filteredApplications.length} of ${applications.length} applications`}
          </p>
        </section>
      </div>
    </main>
  );
}
