"use client";

import { useRef, useState } from "react";

const emptyValues = {
  sponsoringBodyType: "",
  sponsoringBodyName: "",
  registrationNumber: "",
  registrationDate: "",
  chairmanName: "",
  chairmanMobile: "",
  chairmanEmail: "",
  institutionName: "",
  institutionCategory: "",
  state: "",
  district: "",
  campusAddress: "",
  pincode: "",
  railwayStation: "",
  railwayDistance: "",
  landArea: "",
  landOwnershipType: "",
  surveyNumbers: "",
  builtUpArea: "",
  buildingPlanAuthority: "",
  programLevel: "",
  courseName: "",
  sanctionedIntake: "",
  facultyCount: "",
  trustPan: "",
  bankName: "",
  bankAccountNumber: "",
  ifscCode: "",
  corpusFundAmount: "",
};

const initialValues = {
  sponsoringBodyType: "Public Trust",
  sponsoringBodyName: "Demo Public Charitable Trust",
  registrationNumber: "DEMO/2020/001",
  registrationDate: "2020-01-15",
  chairmanName: "Demo Applicant",
  chairmanMobile: "0000000000",
  chairmanEmail: "demo@example.com",
  institutionName: "Demo Institute of Technology",
  institutionCategory: "Co-Education",
  state: "Maharashtra",
  district: "Pune",
  campusAddress: "Demo Campus, Sample Road, Pune, Maharashtra",
  pincode: "000000",
  railwayStation: "Pune Junction",
  railwayDistance: "5",
  landArea: "5",
  landOwnershipType: "Ownership / Sale Deed",
  surveyNumbers: "DEMO-001",
  builtUpArea: "10000",
  buildingPlanAuthority: "Demo Municipal Authority",
  programLevel: "Under Graduate (B.Tech)",
  courseName: "Computer Science and Engineering",
  sanctionedIntake: "60",
  facultyCount: "8",
  trustPan: "DEMOT0000A",
  bankName: "Demo Bank",
  bankAccountNumber: "000000000000",
  ifscCode: "DEMO0000000",
  corpusFundAmount: "10000000",
};

const documentFields = [
  { id: "trustDeed", label: "Trust Registration Deed (PDF)" },
  { id: "landDeed", label: "Land Ownership / Sale Deed (PDF)" },
  { id: "buildingPlan", label: "Approved Building Plan (PDF)" },
  {
    id: "fireSafetyNoc",
    label: "Fire Safety No Objection Certificate (NOC) (PDF)",
  },
];

const inputClassName =
  "mt-2 w-full border border-gray-300 bg-white px-3 py-2.5 text-gray-900 placeholder:text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900";

function Field({ id, label, type = "text", required = false, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-900">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required={required}
        className={inputClassName}
        {...props}
      />
    </div>
  );
}

function SelectField({
  id,
  label,
  options,
  required = false,
  value,
  onChange,
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-900">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <select
        id={id}
        name={id}
        required={required}
        value={value}
        onChange={onChange}
        className={inputClassName}
      >
        <option value="" disabled>
          Select an option
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function Section({ number, title, description, children }) {
  return (
    <section className="space-y-6 border-t border-gray-300 pt-6">
      <div className="space-y-1 border border-gray-200 bg-emerald-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-900">
          Section {number}
        </p>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default function NewInstitutionApplicationPage() {
  const formRef = useRef(null);
  const [values, setValues] = useState(initialValues);
  const [files, setFiles] = useState({
    trustDeed: null,
    landDeed: null,
    buildingPlan: null,
    fireSafetyNoc: null,
  });
  const [fileErrors, setFileErrors] = useState({});
  const [formMessage, setFormMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  function updateValue(event) {
    const { name, value } = event.target;
    setValues((currentValues) => ({ ...currentValues, [name]: value }));
    setFormMessage("");
  }

  function updateFile(event) {
    const { name, files: selectedFiles, value } = event.target;
    const file = selectedFiles?.[0] ?? null;

    if (file && !file.name.toLowerCase().endsWith(".pdf")) {
      setFiles((currentFiles) => ({ ...currentFiles, [name]: null }));
      setFileErrors((currentErrors) => ({
        ...currentErrors,
        [name]: "Choose a PDF file.",
      }));
      event.target.value = "";
      setFormMessage("");
      return;
    }

    setFiles((currentFiles) => ({ ...currentFiles, [name]: file }));
    setFileErrors((currentErrors) => ({ ...currentErrors, [name]: "" }));
    setFormMessage("");
    if (!value) {
      setFiles((currentFiles) => ({ ...currentFiles, [name]: null }));
    }
  }

  function clearForm() {
    formRef.current?.reset();
    setValues(emptyValues);
    setFiles({
      trustDeed: null,
      landDeed: null,
      buildingPlan: null,
      fireSafetyNoc: null,
    });
    setFileErrors({});
    setFormMessage("");
    setHasSubmitted(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting || hasSubmitted) return;

    const missingDocument = documentFields.find(({ id }) => !files[id]);
    if (missingDocument) {
      setFormMessage(`Upload the required file: ${missingDocument.label}.`);
      return;
    }

    setIsSubmitting(true);
    setFormMessage("Submitting your application...");

    try {
      const response = await fetch("/api/submit-application", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to submit the application.");
      }

      setHasSubmitted(true);
      setFormMessage(
        `${result.message} Reference ID: ${result.institution_id}`,
      );
    } catch (error) {
      console.error("Application submission failed:", error);
      setFormMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit the application. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <header className="space-y-2 border-b border-gray-300 pb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-900">
            All India Council for Technical Education
          </p>
          <h1 className="text-2xl font-bold sm:text-3xl">
            New Institution AICTE Recognition Application Form
          </h1>
          <p className="text-sm leading-6 text-gray-600">
            Complete each section and attach the required PDF documents for
            verification.
          </p>
          <p className="text-sm text-gray-900">* Required fields</p>
          <p className="text-sm text-amber-800">
            Demo values are prefilled. Replace them with accurate information
            before submitting; required PDF documents are not prefilled.
          </p>
        </header>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
          <Section
            number="1"
            title="Trust / Society / Company Identification"
            description="Enter the legal identity and primary contact details of the sponsoring body."
          >
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              <SelectField
                id="sponsoringBodyType"
                label="Sponsoring Body Type"
                value={values.sponsoringBodyType}
                onChange={updateValue}
                options={[
                  "Public Trust",
                  "Registered Society",
                  "Section 8 Company",
                ]}
                required
              />
              <Field
                id="sponsoringBodyName"
                label="Name of Trust/Society/Company"
                value={values.sponsoringBodyName}
                onChange={updateValue}
                required
              />
              <Field
                id="registrationNumber"
                label="Registration Number"
                value={values.registrationNumber}
                onChange={updateValue}
                required
              />
              <Field
                id="registrationDate"
                label="Registration Date"
                type="date"
                value={values.registrationDate}
                onChange={updateValue}
                required
              />
              <Field
                id="chairmanName"
                label="Chairman/President Name"
                value={values.chairmanName}
                onChange={updateValue}
                required
              />
              <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:col-span-2 sm:grid-cols-2">
                <Field
                  id="chairmanMobile"
                  label="Chairman Mobile"
                  type="tel"
                  value={values.chairmanMobile}
                  onChange={updateValue}
                  required
                />
                <Field
                  id="chairmanEmail"
                  label="Chairman Email"
                  type="email"
                  value={values.chairmanEmail}
                  onChange={updateValue}
                  required
                />
              </div>
            </div>
          </Section>

          <Section
            number="2"
            title="Proposed Institution & Location Details"
            description="Provide the proposed institution name and campus location."
          >
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field
                  id="institutionName"
                  label="Proposed Institution Name"
                  value={values.institutionName}
                  onChange={updateValue}
                  required
                />
              </div>
              <SelectField
                id="institutionCategory"
                label="Category of Institution"
                value={values.institutionCategory}
                onChange={updateValue}
                options={["Co-Education", "Women Only"]}
                required
              />
              <Field
                id="state"
                label="State"
                value={values.state}
                onChange={updateValue}
                required
              />
              <Field
                id="district"
                label="District"
                value={values.district}
                onChange={updateValue}
                required
              />
              <Field
                id="pincode"
                label="Pincode"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={values.pincode}
                onChange={updateValue}
                required
              />
              <div className="sm:col-span-2">
                <label
                  htmlFor="campusAddress"
                  className="block text-sm font-medium text-gray-900"
                >
                  Full Campus Address
                  <span aria-hidden="true"> *</span>
                </label>
                <textarea
                  id="campusAddress"
                  name="campusAddress"
                  rows={3}
                  value={values.campusAddress}
                  onChange={updateValue}
                  required
                  className={inputClassName}
                />
              </div>
              <Field
                id="railwayStation"
                label="Nearest Railway Station"
                value={values.railwayStation}
                onChange={updateValue}
                required
              />
              <Field
                id="railwayDistance"
                label="Distance (km)"
                type="number"
                min="0"
                step="0.1"
                value={values.railwayDistance}
                onChange={updateValue}
                required
              />
            </div>
          </Section>

          <Section
            number="3"
            title="Land & Infrastructure Metrics"
            description="Record land ownership and proposed campus construction details."
          >
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                id="landArea"
                label="Total Land Area (in Acres)"
                type="number"
                min="0"
                step="0.01"
                value={values.landArea}
                onChange={updateValue}
                required
              />
              <SelectField
                id="landOwnershipType"
                label="Land Ownership Type"
                value={values.landOwnershipType}
                onChange={updateValue}
                options={[
                  "Ownership / Sale Deed",
                  "Government Allotment",
                  "Registered Lease",
                ]}
                required
              />
              <Field
                id="surveyNumbers"
                label="Survey / Khata / Plot Numbers"
                value={values.surveyNumbers}
                onChange={updateValue}
                required
              />
              <Field
                id="builtUpArea"
                label="Total Instructional Built-Up Area (sq. meters)"
                type="number"
                min="0"
                step="0.01"
                value={values.builtUpArea}
                onChange={updateValue}
                required
              />
              <Field
                id="buildingPlanAuthority"
                label="Building Plan Approval Authority"
                value={values.buildingPlanAuthority}
                onChange={updateValue}
                required
              />
            </div>
          </Section>

          <Section
            number="4"
            title="Proposed Academic Program & Seat Intake"
            description="Specify the requested academic program and capacity."
          >
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <SelectField
                id="programLevel"
                label="Program Level"
                value={values.programLevel}
                onChange={updateValue}
                options={[
                  "Under Graduate (B.Tech)",
                  "Post Graduate (MBA/MCA)",
                  "Diploma",
                ]}
                required
              />
              <Field
                id="courseName"
                label="Course / Specialization Name"
                placeholder="e.g., Computer Science and Engineering"
                value={values.courseName}
                onChange={updateValue}
                required
              />
              <Field
                id="sanctionedIntake"
                label="Requested Sanctioned Intake"
                type="number"
                min="1"
                step="1"
                placeholder="e.g., 60 or 120"
                value={values.sanctionedIntake}
                onChange={updateValue}
                required
              />
              <Field
                id="facultyCount"
                label="Proposed Faculty Count"
                type="number"
                min="0"
                step="1"
                placeholder="e.g., 8"
                value={values.facultyCount}
                onChange={updateValue}
                required
              />
            </div>
          </Section>

          <Section
            number="5"
            title="Financial & Statutory Information"
            description="Provide the sponsoring body’s tax and financial details."
          >
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              <Field
                id="trustPan"
                label="Trust PAN Number"
                value={values.trustPan}
                onChange={updateValue}
                required
              />
              <Field
                id="bankName"
                label="Trust Bank Name"
                value={values.bankName}
                onChange={updateValue}
                required
              />
              <Field
                id="bankAccountNumber"
                label="Trust Bank Account Number"
                value={values.bankAccountNumber}
                onChange={updateValue}
                required
              />
              <Field
                id="ifscCode"
                label="IFSC Code"
                value={values.ifscCode}
                onChange={updateValue}
                required
              />
              <Field
                id="corpusFundAmount"
                label="Pledged Reserve / Corpus Fund Amount (INR)"
                type="number"
                min="0"
                step="0.01"
                value={values.corpusFundAmount}
                onChange={updateValue}
                required
              />
            </div>
          </Section>

          <Section
            number="6"
            title="Mandatory Document Bundle Uploads"
            description="Attach one PDF for each required supporting document."
          >
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              {documentFields.map(({ id, label }) => (
                <div key={id}>
                  <label
                    htmlFor={id}
                    className="block text-sm font-medium text-gray-900"
                  >
                    {label}
                    <span aria-hidden="true"> *</span>
                  </label>
                  <input
                    id={id}
                    name={id}
                    type="file"
                    accept=".pdf,application/pdf"
                    required
                    onChange={updateFile}
                    aria-describedby={`${id}-help`}
                    className={`${inputClassName} file:mr-3 file:border-0 file:bg-white file:text-sm file:font-medium file:text-gray-900`}
                  />
                  <p id={`${id}-help`} className="mt-1 text-sm text-gray-600">
                    PDF files only
                  </p>
                  {fileErrors[id] ? (
                    <p className="mt-1 text-sm text-gray-900" role="alert">
                      {fileErrors[id]}
                    </p>
                  ) : null}
                  {files[id] ? (
                    <p className="mt-1 text-sm text-gray-600">
                      Selected: {files[id].name}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </Section>

          <div className="space-y-4 border-t border-gray-300 pt-6">
            {formMessage ? (
              <p className="text-sm text-gray-900" role="status">
                {formMessage}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={clearForm}
                disabled={isSubmitting}
                className="border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
              >
                Clear Form
              </button>
              <button
                type="submit"
                disabled={isSubmitting || hasSubmitted}
                className="border border-emerald-300 bg-emerald-100 px-5 py-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
              >
                {isSubmitting
                  ? "Submitting Application..."
                  : hasSubmitted
                    ? "Application Submitted"
                    : "Submit Application for AICTE Verification"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
