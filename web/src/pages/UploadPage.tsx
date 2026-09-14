import { useEffect, useState, type DragEvent } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useFamilyStudents } from "../hooks/useFamilyStudents";
import { AppShell } from "../components/AppShell";
import { parseCurriculumMarkdown, type ParsedWeek } from "../lib/parseCurriculumMarkdown";
import { inferKidKey, type PlacementKidKey } from "../lib/placementTestItems";

const QUARTERS: { value: string; label: string }[] = [
  { value: "q1", label: "Q1 — Fall" },
  { value: "q2", label: "Q2 — Winter" },
  { value: "q3", label: "Q3 — Spring" },
  { value: "q4", label: "Q4 — Summer" },
];

const DOC_CATEGORIES: { value: string; label: string }[] = [
  { value: "curriculum_file", label: "Curriculum file" },
  { value: "extracurricular_record", label: "Extracurricular / completion record" },
  { value: "photo", label: "Photo" },
  { value: "other", label: "Other" },
];

interface KidUploadState {
  fileName: string;
  weeks: ParsedWeek[];
  publishing: boolean;
  published: boolean;
  error: string | null;
}

interface UploadRecord {
  id: string;
  fileName: string;
  fileUrl: string;
  category: string;
  uploadedAt: Timestamp;
}

function dropZoneProps(onFile: (file: File) => void) {
  return {
    onDragOver: (e: DragEvent) => e.preventDefault(),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
  };
}

export function UploadPage() {
  const { profile } = useAuth();
  const { students, loading: loadingStudents } = useFamilyStudents();

  const [quarter, setQuarter] = useState("q2");
  const [kidUploads, setKidUploads] = useState<Record<string, KidUploadState>>({});

  const [docCategory, setDocCategory] = useState(DOC_CATEGORIES[0].value);
  const [docUploading, setDocUploading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [existingUploads, setExistingUploads] = useState<UploadRecord[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(true);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      setLoadingUploads(true);
      const q = query(
        collection(db, "uploads"),
        where("familyId", "==", profile.familyId),
        orderBy("uploadedAt", "desc")
      );
      const snap = await getDocs(q);
      setExistingUploads(
        snap.docs.map((d) => ({
          id: d.id,
          fileName: d.data().fileName,
          fileUrl: d.data().fileUrl,
          category: d.data().category,
          uploadedAt: d.data().uploadedAt,
        }))
      );
      setLoadingUploads(false);
    })();
  }, [profile]);

  async function handleCurriculumFile(uid: string, file: File) {
    const text = await file.text();
    const weeks = parseCurriculumMarkdown(text);
    setKidUploads((current) => ({
      ...current,
      [uid]: {
        fileName: file.name,
        weeks,
        publishing: false,
        published: false,
        error: weeks.length === 0 ? "Couldn't find any \"## Week N\" sections in this file." : null,
      },
    }));
  }

  async function publishCurriculum(uid: string, kidKey: PlacementKidKey) {
    const state = kidUploads[uid];
    if (!profile || !state || state.weeks.length === 0) return;
    setKidUploads((current) => ({ ...current, [uid]: { ...state, publishing: true, error: null } }));
    try {
      await setDoc(doc(db, "curriculumContent", `${profile.familyId}_${kidKey}_${quarter}`), {
        familyId: profile.familyId,
        kidKey,
        quarter,
        weeks: state.weeks,
        sourceFileName: state.fileName,
        uploadedBy: profile.displayName,
        uploadedAt: Timestamp.now(),
      });
      setKidUploads((current) => ({
        ...current,
        [uid]: { ...state, publishing: false, published: true },
      }));
    } catch {
      setKidUploads((current) => ({
        ...current,
        [uid]: { ...state, publishing: false, error: "Couldn't save that. Try again." },
      }));
    }
  }

  async function handleDocUpload(file: File) {
    if (!profile) return;
    setDocUploading(true);
    setDocError(null);
    try {
      const path = `uploads/${profile.familyId}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const fileUrl = await getDownloadURL(storageRef);
      const uploadedAt = Timestamp.now();
      await addDoc(collection(db, "uploads"), {
        familyId: profile.familyId,
        uploadedBy: profile.displayName,
        fileName: file.name,
        fileUrl,
        uploadedAt,
        category: docCategory,
      });
      setExistingUploads((current) => [
        { id: crypto.randomUUID(), fileName: file.name, fileUrl, category: docCategory, uploadedAt },
        ...current,
      ]);
    } catch {
      setDocError("Couldn't upload that file. Try again.");
    } finally {
      setDocUploading(false);
    }
  }

  const eligibleKids = students.filter((s) => inferKidKey(s.displayName) !== null);

  return (
    <AppShell>
      <div className="max-w-2xl space-y-8">
        <div>
          <h1 className="brand-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Upload
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Add a new quarter's curriculum or file away any family school document — no code changes
            or deploys needed for either.
          </p>
        </div>

        {/* --- New quarter curriculum --- */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            📚 Upload new quarter curriculum
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Drop in each kid's curriculum file below (the same format as the Q1 files — weekly
            sections with a subject table). It's read right here in your browser, you'll see a quick
            preview of what was found, and publishing makes it live immediately for day-plan
            generation.
          </p>

          <label className="block text-sm space-y-1 max-w-xs">
            <span style={{ color: "var(--text-secondary)" }}>Quarter</span>
            <select
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--surface-1)" }}
            >
              {QUARTERS.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </select>
          </label>

          {!loadingStudents && eligibleKids.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              No matching student accounts found (expected Millaray, Makaio, or Maizley).
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {eligibleKids.map((s) => {
              const kidKey = inferKidKey(s.displayName) as PlacementKidKey;
              const state = kidUploads[s.uid];
              return (
                <div
                  key={s.uid}
                  className="rounded-lg border p-3 space-y-2 shadow-sm"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
                >
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {s.displayName}
                  </p>

                  <label
                    htmlFor={`curriculum-file-${s.uid}`}
                    {...dropZoneProps((file) => handleCurriculumFile(s.uid, file))}
                    className="block rounded-md border-2 border-dashed px-3 py-4 text-center text-xs cursor-pointer"
                    style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                  >
                    Drag a file here, or tap to choose
                    <input
                      id={`curriculum-file-${s.uid}`}
                      type="file"
                      accept=".md,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleCurriculumFile(s.uid, file);
                        e.target.value = "";
                      }}
                    />
                  </label>

                  {state && (
                    <div className="text-xs space-y-1">
                      <p style={{ color: "var(--text-muted)" }}>{state.fileName}</p>
                      {state.error && <p style={{ color: "var(--status-critical)" }}>{state.error}</p>}
                      {state.weeks.length > 0 && (
                        <>
                          <p style={{ color: "var(--text-secondary)" }}>
                            Found {state.weeks.length} week{state.weeks.length === 1 ? "" : "s"}:
                          </p>
                          <ul style={{ color: "var(--text-muted)" }}>
                            {state.weeks.map((w) => (
                              <li key={w.week}>
                                Wk {w.week} — {w.title}
                              </li>
                            ))}
                          </ul>
                          <button
                            onClick={() => publishCurriculum(s.uid, kidKey)}
                            disabled={state.publishing}
                            className="w-full rounded-md px-2 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                            style={{ background: "var(--series-1)" }}
                          >
                            {state.publishing
                              ? "Publishing..."
                              : state.published
                                ? "Published — re-publish"
                                : `Publish for ${QUARTERS.find((q) => q.value === quarter)?.label}`}
                          </button>
                          {state.published && (
                            <p style={{ color: "var(--status-good)" }}>● Live — day plans will use this now.</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* --- Family documents --- */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            📎 Family documents
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Anything else worth keeping in one place — completed extracurricular records, photos,
            whatever else. Just files, not parsed into anything.
          </p>

          <label className="block text-sm space-y-1 max-w-xs">
            <span style={{ color: "var(--text-secondary)" }}>Category</span>
            <select
              value={docCategory}
              onChange={(e) => setDocCategory(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--surface-1)" }}
            >
              {DOC_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label
            htmlFor="doc-file"
            {...dropZoneProps((file) => handleDocUpload(file))}
            className="block rounded-md border-2 border-dashed px-3 py-6 text-center text-sm cursor-pointer max-w-md"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            {docUploading ? "Uploading..." : "Drag a file here, or tap to choose"}
            <input
              id="doc-file"
              type="file"
              className="hidden"
              disabled={docUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleDocUpload(file);
                e.target.value = "";
              }}
            />
          </label>
          {docError && (
            <p className="text-sm" style={{ color: "var(--status-critical)" }}>
              {docError}
            </p>
          )}

          <div>
            <h3 className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>
              Already uploaded
            </h3>
            {loadingUploads && (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Loading...
              </p>
            )}
            {!loadingUploads && existingUploads.length === 0 && (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Nothing uploaded yet.
              </p>
            )}
            {!loadingUploads && existingUploads.length > 0 && (
              <ul className="space-y-1.5">
                {existingUploads.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm shadow-sm"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
                  >
                    <a
                      href={u.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--series-1)" }}
                      className="truncate"
                    >
                      {u.fileName}
                    </a>
                    <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
                      {DOC_CATEGORIES.find((c) => c.value === u.category)?.label ?? u.category}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
