"use client";

import Link from "next/link";
import { useState } from "react";

function RuleToggle({ id, label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div>
        <label htmlFor={id} className="block text-sm font-semibold text-gray-900">
          {label}
        </label>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">
          {description}
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
          checked
            ? "border-emerald-700 bg-emerald-700"
            : "border-gray-300 bg-gray-100"
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-4 w-4 transform bg-white transition-transform ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

export default function RulesConfigurationPage() {
  const [landArea, setLandArea] = useState("5.0");
  const [facultyRatio, setFacultyRatio] = useState("1:20");
  const [allowExpiredNocGracePeriod, setAllowExpiredNocGracePeriod] =
    useState(false);
  const [strictForensicsEnforcement, setStrictForensicsEnforcement] =
    useState(true);
  const [showSavedMessage, setShowSavedMessage] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();
    setShowSavedMessage(true);
  }

  function handleRuleChange(updateRule) {
    updateRule();
    setShowSavedMessage(false);
  }

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-5xl px-4 pb-12 pt-8 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Link
              href="/admin/dashboard"
              className="transition-colors hover:text-gray-900"
            >
              Admin Dashboard
            </Link>
            <span aria-hidden="true" className="text-gray-400">
              /
            </span>
            <span aria-current="page" className="text-gray-900">
              Compliance Rules
            </span>
          </div>
        </nav>

        <header className="mb-8 border border-gray-200 bg-white p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
            AICTE Administration
          </p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
                Regulatory Rulebook
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                Configure the thresholds and automated checks applied during
                Step 6 compliance review.
              </p>
            </div>
            <span className="inline-flex w-fit items-center border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900">
              Step 6 · Compliance
            </span>
          </div>
        </header>

        <form onSubmit={handleSubmit}>
          <section
            aria-labelledby="thresholds-heading"
            className="border border-gray-200 bg-white"
          >
            <div className="border-b border-gray-200 px-5 py-5 sm:px-6">
              <h2
                id="thresholds-heading"
                className="text-lg font-semibold text-gray-900"
              >
                Rules configuration
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Values are used to evaluate institution applications.
              </p>
            </div>

            <div className="divide-y divide-gray-200">
              <div className="grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center sm:px-6">
                <div>
                  <label
                    htmlFor="minimum-land-area"
                    className="block text-sm font-semibold text-gray-900"
                  >
                    Minimum Land Area Required
                  </label>
                  <p className="mt-1 text-sm leading-6 text-gray-600">
                    Minimum contiguous land area required for an institution.
                  </p>
                </div>
                <div className="relative">
                  <input
                    id="minimum-land-area"
                    name="minimumLandArea"
                    type="number"
                    min="0"
                    step="0.1"
                    required
                    value={landArea}
                    onChange={(event) =>
                      handleRuleChange(() => setLandArea(event.target.value))
                    }
                    className="w-full border border-gray-300 bg-white px-3 py-2.5 pr-16 text-sm text-gray-900 outline-none transition-colors focus:border-emerald-700"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-500">
                    acres
                  </span>
                </div>
              </div>

              <div className="grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center sm:px-6">
                <div>
                  <label
                    htmlFor="faculty-ratio"
                    className="block text-sm font-semibold text-gray-900"
                  >
                    Faculty-to-Student Ratio Threshold
                  </label>
                  <p className="mt-1 text-sm leading-6 text-gray-600">
                    Maximum students per faculty member for compliance.
                  </p>
                </div>
                <input
                  id="faculty-ratio"
                  name="facultyRatio"
                  type="text"
                  inputMode="text"
                  required
                  pattern="[0-9]+:[0-9]+"
                  title="Enter the ratio in the format 1:20"
                  value={facultyRatio}
                  onChange={(event) =>
                    handleRuleChange(() =>
                      setFacultyRatio(event.target.value),
                    )
                  }
                  className="w-full border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-emerald-700"
                />
              </div>

              <div className="px-5 py-5 sm:px-6">
                <RuleToggle
                  id="expired-noc-grace-period"
                  label="Allow Expired NOC Grace Period"
                  description="Allow applications to proceed when an NOC has expired within the configured grace period."
                  checked={allowExpiredNocGracePeriod}
                  onChange={(checked) =>
                    handleRuleChange(() =>
                      setAllowExpiredNocGracePeriod(checked),
                    )
                  }
                />
              </div>

              <div className="px-5 py-5 sm:px-6">
                <RuleToggle
                  id="strict-forensics-enforcement"
                  label="Strict Forensics Enforcement"
                  description="Automatically flag any image-tampered PDF found during document forensics."
                  checked={strictForensicsEnforcement}
                  onChange={(checked) =>
                    handleRuleChange(() =>
                      setStrictForensicsEnforcement(checked),
                    )
                  }
                />
              </div>
            </div>
          </section>

          <div className="mt-6 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-gray-500">
              Changes apply to Step 6 compliance checks.
            </p>
            <button
              type="submit"
              className="inline-flex items-center justify-center border border-emerald-700 bg-emerald-50 px-5 py-2.5 text-sm font-semibold text-emerald-900 transition-colors hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              Save Compliance Rules
            </button>
          </div>
        </form>
      </div>

      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-5 right-5 z-10"
      >
        {showSavedMessage && (
          <div className="flex items-center gap-3 border border-emerald-200 bg-white px-4 py-3 text-sm text-gray-900">
            <span
              aria-hidden="true"
              className="flex h-5 w-5 items-center justify-center border border-emerald-300 text-xs font-semibold text-emerald-800"
            >
              ✓
            </span>
            Compliance rules saved successfully.
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setShowSavedMessage(false)}
              className="ml-2 text-gray-500 hover:text-gray-900"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
